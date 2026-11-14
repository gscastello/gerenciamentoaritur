// supabase/functions/avaliar-bot/index.ts
//
// Avaliação do bot com casos reais (issue #419). Para cada caso de `bot_casos` ainda não avaliado
// na rodada, faz a MESMA leitura do "Agendado ☑️" como a conversa estava no momento da marca, sem
// gravar nada (simularAgendado), e compara com as viagens que ficaram (avaliacaoPura.compararCaso).
// Grava em `bot_avaliacoes`. Chamada com a chave da rotina do revisor (x-rotina), como o revisor;
// responde na hora e avalia em segundo plano (alguns casos por chamada).
// Deploy: verify_jwt = false (a autenticação é a chave da rotina).

import { compararCaso, type ViagemDoCaso } from "../_shared/avaliacaoPura.ts";
import { simularAgendado } from "../_shared/rascunhoReserva.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function evento(nome: string, dados: Record<string, unknown>) {
  console.log(JSON.stringify({ evento: nome, ...dados }));
}

// deno-lint-ignore no-explicit-any
type Linha = Record<string, any>;

async function avaliarCaso(caso: Linha, rodada: string, versao: string | null) {
  try {
    const r = await simularAgendado({
      conversationId: caso.conversation_id,
      chatwootConversationId: Number(caso.chatwoot_conversation_id),
      mensagemId: Number(caso.mensagem_id),
      telefone: String(caso.telefone),
      marcaEm: String(caso.marca_em),
    });
    const planejadas = r.planejadas.map((p: Linha) => ({
      trip_date: p.trip_date,
      direction: p.direction,
      route_point_code: p.route_point_code,
      quantity: p.quantity,
      pickup_neighborhood: p.pickup_neighborhood,
      type: p.type,
      pickup_detail: p.pickup_detail,
      dropoff_location: p.dropoff_location,
      pendencia: p.pendencia ?? null,
      notes: p.notes ?? null,
    }));
    const cmp = compararCaso((caso.esperado ?? []) as ViagemDoCaso[], planejadas, {
      motivos: r.motivos,
      pendenteOk: caso.pendente_ok === true,
    });
    await supabaseAdmin.from("bot_avaliacoes").insert({
      rodada,
      caso_id: caso.id,
      resultado: cmp.resultado,
      diferencas: cmp.diferencas,
      lido: { planejadas, motivos: r.motivos, dias_sem_pedido: r.diasSemPedido },
      releu: r.releu,
      tokens: r.tokens,
      versao,
    });
    return cmp.resultado;
  } catch (err) {
    await supabaseAdmin.from("bot_avaliacoes").insert({
      rodada,
      caso_id: caso.id,
      resultado: "erro",
      diferencas: [String(err).slice(0, 300)],
      versao,
    });
    return "erro";
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Método não permitido.", { status: 405 });
  const chave = req.headers.get("x-rotina") ?? "";
  const { data: autorizada } = await supabaseAdmin.rpc("fn_rotina_autorizada", { p_nome: "revisor", p_token: chave });
  if (!chave || autorizada !== true) return json({ success: false, message: "Não autorizado." }, 401);

  const corpo = await req.json().catch(() => ({}));
  const rodada = String(corpo?.rodada ?? "").trim();
  if (!rodada) return json({ success: false, message: "Informe a rodada." }, 400);
  const limite = Math.min(Math.max(Number(corpo?.limite) || 6, 1), 15);
  const versao = typeof corpo?.versao === "string" ? corpo.versao : null;

  const { data: feitos } = await supabaseAdmin.from("bot_avaliacoes").select("caso_id").eq("rodada", rodada);
  const jaFeitos = new Set(((feitos ?? []) as Linha[]).map((f) => f.caso_id));
  let q = supabaseAdmin.from("bot_casos").select("*").eq("ativo", true).order("marca_em", { ascending: true });
  if (Array.isArray(corpo?.casos) && corpo.casos.length) q = q.in("id", corpo.casos);
  const { data: casos } = await q.limit(1000);
  const fila = ((casos ?? []) as Linha[]).filter((c) => !jaFeitos.has(c.id)).slice(0, limite);

  const trabalho = (async () => {
    const resultados: string[] = [];
    for (const caso of fila) resultados.push(await avaliarCaso(caso, rodada, versao));
    evento("avaliacao_rodada", { rodada, avaliados: fila.length, resultados });
  })().catch((err) => evento("bot_erro", { etapa: "avaliacao", erro: String(err).slice(0, 300) }));

  // deno-lint-ignore no-explicit-any
  const runtime = (globalThis as any).EdgeRuntime;
  if (runtime?.waitUntil) {
    runtime.waitUntil(trabalho);
    return json({ success: true, rodada, na_fila: fila.length, faltam: Math.max(0, ((casos ?? []).length - jaFeitos.size) - fila.length) }, 202);
  }
  await trabalho;
  return json({ success: true, rodada, avaliados: fila.length });
});
