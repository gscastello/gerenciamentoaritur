// supabase/functions/assistente-voz/index.ts
//
// Assistente da equipe pela Siri (issue #290). O atalho do iPhone dita o pedido,
// manda { texto } com a CHAVE PESSOAL da pessoa no cabeçalho Authorization e lê
// em voz alta o campo "fala" da resposta. O campo "continuar" só vem quando é
// para ouvir de novo (pergunta do assistente ou "Confirma?"): no atalho, o "Se"
// usa "tem qualquer valor", que funciona com qualquer tipo de variável do iPhone.
//
// Mesmas regras do assistente do app: só propõe; "sim" grava a proposta
// pendente (10 min), "não" descarta; preço pela tabela, vaga pelo banco,
// autoria = dono da chave, e o que o papel dele não pode ver fica de fora.
//
// Deploy: verify_jwt = false (a autenticação é a chave). Secrets: ANTHROPIC_API_KEY.

import { conversar, executarAcao, gastoDoMes, montarContexto, registrarUso } from "../_shared/assistente.ts";
import { ehConfirmacao, ehRecusa, historicoValido, type MensagemDoChat, paraVoz, sessaoValida } from "../_shared/assistentePuro.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";

const PAPEIS = ["admin", "atendente", "financeiro"];

function evento(nome: string, dados: Record<string, unknown>) {
  console.log(JSON.stringify({ evento: nome, ...dados }));
}

type Resposta = { fala: string; continuar: boolean };

/** O atalho sempre recebe 200 com uma "fala": assim a Siri lê até os erros. */
function falar(fala: string, continuar = false): Resposta {
  return { fala, continuar };
}

/**
 * Formato da resposta. Padrão: JSON { fala, continuar? }. Com ?formato=texto no
 * endereço, só o texto da fala (o atalho fica com 4 ações e o iPhone não confunde
 * o tipo da variável); quando é para ouvir de novo, a fala termina em "?".
 */
function responder(r: Resposta, formato: string | null): Response {
  if (formato === "texto") {
    const fala = r.continuar && !/\?\s*$/.test(r.fala) ? `${r.fala.replace(/[.!]\s*$/, "")}?` : r.fala;
    return new Response(fala, { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  return new Response(JSON.stringify(r.continuar ? { fala: r.fala, continuar: "sim" } : { fala: r.fala }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

async function sha256(texto: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Método não permitido.", { status: 405 });
  return responder(await atender(req), new URL(req.url).searchParams.get("formato"));
});

async function atender(req: Request): Promise<Resposta> {

  const chave = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!/^ari_[0-9a-f]{40}$/.test(chave)) return falar("Chave do atalho inválida. Gere uma nova na aba Assistente do app.");
  const { data: registro } = await supabaseAdmin
    .from("assistente_chaves")
    .select("id, user_id, users(role, name, active)")
    .eq("hash", await sha256(chave))
    .is("revoked_at", null)
    .maybeSingle();
  // biome-ignore lint/suspicious/noExplicitAny: linha com join
  const usuario = (registro as any)?.users;
  const papel = String(usuario?.role ?? "");
  if (!registro || !PAPEIS.includes(papel) || usuario?.active === false) {
    return falar("Essa chave não vale mais. Gere uma nova na aba Assistente do app.");
  }
  const userId = String(registro.user_id);
  supabaseAdmin.from("assistente_chaves").update({ last_used_at: new Date().toISOString() }).eq("id", registro.id).then(() => {});

  // biome-ignore lint/suspicious/noExplicitAny: corpo vindo do atalho
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* corpo vazio */
  }
  const texto = String(body?.texto ?? "").trim().slice(0, 1000);
  if (!texto) return falar("Não ouvi. Pode repetir?", true);

  try {
    const agora = new Date();
    const { data: sessao } = await supabaseAdmin
      .from("assistente_voz_sessao")
      .select("historico, pendentes, updated_at")
      .eq("user_id", userId)
      .maybeSingle();
    const valida = sessaoValida(sessao?.updated_at, agora);
    let historico: MensagemDoChat[] = valida ? historicoValido(sessao?.historico) : [];
    // biome-ignore lint/suspicious/noExplicitAny: propostas guardadas
    const pendentes: any[] = valida && Array.isArray(sessao?.pendentes) ? sessao.pendentes : [];
    const guardar = (h: MensagemDoChat[], p: unknown[]) =>
      supabaseAdmin.from("assistente_voz_sessao").upsert({
        user_id: userId,
        historico: h.slice(-12),
        pendentes: p,
        updated_at: new Date().toISOString(),
      });

    // o banco é lido como servidor; o que o papel não pode ver é barrado no código do assistente
    const ctx = await montarContexto(supabaseAdmin, userId, papel);

    // resposta ao "Confirma?"
    if (pendentes.length && ehConfirmacao(texto)) {
      const resultados = [];
      for (const acao of pendentes) resultados.push(await executarAcao(acao, ctx));
      const fala = resultados.every((r) => r.ok)
        ? `Feito. ${resultados.map((r) => r.mensagem).join(" ")}`
        : `Não consegui gravar: ${resultados.filter((r) => !r.ok).map((r) => r.mensagem).join(" ")}`;
      await guardar([...historico, { papel: "usuario", texto }, { papel: "assistente", texto: fala }], []);
      evento("assistente_voz_acao", { ok: resultados.every((r) => r.ok), quantas: resultados.length });
      return falar(paraVoz(fala));
    }
    if (pendentes.length && ehRecusa(texto)) {
      await guardar([...historico, { papel: "usuario", texto }, { papel: "assistente", texto: "Tudo bem, não gravei nada." }], []);
      return falar("Tudo bem, não gravei nada.");
    }

    const { gasto, teto } = await gastoDoMes();
    if (gasto >= teto) {
      evento("assistente_teto", { gasto, teto, canal: "voz" });
      return falar("O assistente atingiu o teto de gasto do mês. Use o app normalmente.");
    }

    historico = [...historico, { papel: "usuario", texto }];
    const inicio = Date.now();
    const r = await conversar(historico, ctx, { voz: true });
    await registrarUso(userId, r.modelo, r.uso, r.custo);
    let fala = paraVoz(r.texto);
    if (r.acoes.length && !/\?\s*$/.test(fala)) fala = `${fala} Confirma?`;
    const descricoes = r.acoes.map((a) => `[proposta: ${a.descricao}]`).join("\n");
    await guardar([...historico, { papel: "assistente", texto: [r.texto, descricoes].filter(Boolean).join("\n") }], r.acoes);
    evento("assistente_pedido", { papel, canal: "voz", modelo: r.modelo, acoes: r.acoes.length, custo: r.custo, ms: Date.now() - inicio });
    return falar(fala, r.acoes.length > 0 || /\?\s*$/.test(fala));
  } catch (err) {
    evento("bot_erro", { etapa: "assistente_voz", erro: String(err).slice(0, 300) });
    return falar("Não consegui responder agora. Tente de novo em instantes.");
  }
}
