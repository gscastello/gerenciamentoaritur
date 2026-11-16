// supabase/functions/avisar-passageiros/index.ts
//
// "Avisar passageiros" da Agenda (issue #432): manda a cada passageiro escolhido o aviso que a
// equipe conferiu na tela (horário do ponto dele etc.). Só admin/atendente, e só com o toque em
// "Enviar" no app. Dentro das 24 h da última mensagem do cliente vai o texto; fora, o modelo
// aprovado pela Meta (settings.aviso_modelo); sem modelo ou sem conversa, fica marcado para a
// equipe avisar pelo celular. Tudo registrado em avisos_passageiros.
//
// Deploy: verify_jwt = false (o app manda o JWT e a função confere; a rotina usa x-rotina).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { comoEnviar, itensValidos, modelosDosAvisos, textoDoModelo, tipoValido } from "../_shared/avisoPuro.ts";
import { chatwootClient } from "../_shared/chatwootClient.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { variantesTelefone } from "../_shared/telefone.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const PAPEIS = ["admin", "atendente"];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const evento = (nome: string, dados: Record<string, unknown>) => console.log(JSON.stringify({ evento: nome, ...dados }));

// deno-lint-ignore no-explicit-any
type Linha = Record<string, any>;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ success: false, message: "Método não permitido." }, 405);

  // quem pede: alguém da equipe logado no app, ou a rotina do servidor a pedido do dono (chave da
  // rotina do revisor, como o avaliar-bot) — nesse caso `por` diz quem pediu
  // deno-lint-ignore no-explicit-any
  let db: any;
  let userId: string | null = null;
  const chave = req.headers.get("x-rotina") ?? "";
  const corpoBruto = await req.text();
  // deno-lint-ignore no-explicit-any
  let corpo: any = {};
  try {
    corpo = corpoBruto ? JSON.parse(corpoBruto) : {};
  } catch {
    return json({ success: false, message: "Pedido inválido." }, 400);
  }
  if (chave) {
    const { data: autorizada } = await supabaseAdmin.rpc("fn_rotina_autorizada", { p_nome: "revisor", p_token: chave });
    if (autorizada !== true) return json({ success: false, message: "Não autorizado." }, 401);
    db = supabaseAdmin;
    userId = /^[0-9a-f-]{36}$/i.test(String(corpo?.por ?? "")) ? String(corpo.por) : null;
  } else {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ success: false, message: "Sem autenticação." }, 401);
    db = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData } = await db.auth.getUser();
    userId = userData?.user?.id ?? null;
    if (!userId) return json({ success: false, message: "Sessão inválida." }, 401);
    const { data: perfil } = await db.from("users").select("role").eq("id", userId).maybeSingle();
    if (!PAPEIS.includes(String(perfil?.role ?? ""))) {
      return json({ success: false, message: "Avisar passageiros é para admin e atendente." }, 403);
    }
  }

  const itens = itensValidos(corpo?.itens);
  // horario (lembrete), confirmacao ("você confirma?") ou em_rota ("a Volta saiu") — issue #434
  const tipo = tipoValido(corpo?.tipo);
  if (!itens.length) return json({ success: false, message: "Escolha ao menos um passageiro." }, 400);

  // as reservas, lidas com as permissões de quem pediu (RLS)
  const { data: reservas } = await db
    .from("v_reservations_flat")
    .select("id, telefone, data, direcao, status, customer_id")
    .in("id", itens.map((i) => i.reservation_id));
  const porId = new Map(((reservas ?? []) as Linha[]).map((r) => [r.id, r]));
  const { data: cfgs } = await supabaseAdmin.from("settings").select("key, value").in("key", ["aviso_modelos", "aviso_modelo"]);
  const cfg = (k: string) => ((cfgs ?? []) as Linha[]).find((c) => c.key === k)?.value ?? null;
  const modelo = modelosDosAvisos(cfg("aviso_modelos"), cfg("aviso_modelo"))[tipo];
  const agora = new Date();

  const resultados: { reservation_id: string; status: string; erro?: string }[] = [];
  for (const item of itens) {
    const r = porId.get(item.reservation_id);
    if (!r || r.status === "cancelada") {
      resultados.push({ reservation_id: item.reservation_id, status: "falhou", erro: "reserva não encontrada" });
      continue;
    }
    const variantes = variantesTelefone(String(r.telefone ?? ""));
    const { data: conversa } = variantes.length
      ? await supabaseAdmin
        .from("whatsapp_conversations")
        .select("id, chatwoot_conversation_id, last_inbound_at")
        .overlaps("telefone_variantes", variantes)
        .is("deleted_at", null)
        .not("chatwoot_conversation_id", "is", null)
        .order("last_inbound_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle()
      : { data: null };
    const como = comoEnviar({
      temConversa: !!conversa?.chatwoot_conversation_id,
      ultimaDoClienteEm: conversa?.last_inbound_at ?? null,
      agora,
      modelo,
      item,
      tipo,
    });
    let status = como.modo === "nenhum" ? como.status : "enviado";
    let erro: string | null = null;
    let texto = item.texto;
    try {
      if (como.modo === "texto") {
        await chatwootClient.postMessage(Number(conversa!.chatwoot_conversation_id), texto);
      } else if (como.modo === "modelo") {
        texto = textoDoModelo(como.corpo, tipo);
        await chatwootClient.postTemplate(Number(conversa!.chatwoot_conversation_id), texto, modelo!, como.corpo);
      }
    } catch (e) {
      status = "falhou";
      erro = String(e).slice(0, 300);
    }
    await supabaseAdmin.from("avisos_passageiros").insert({
      tipo,
      reservation_id: r.id,
      customer_id: r.customer_id ?? null,
      trip_date: r.data,
      direction: r.direcao,
      texto,
      modo: como.modo === "nenhum" ? null : como.modo,
      status,
      erro,
      enviado_por: userId,
    });
    resultados.push({ reservation_id: r.id, status, ...(erro ? { erro } : {}) });
  }
  const conta = (s: string) => resultados.filter((x) => x.status === s).length;
  evento("aviso_passageiros", {
    enviados: conta("enviado"),
    fora_da_janela: conta("fora_da_janela"),
    sem_conversa: conta("sem_conversa"),
    falhas: conta("falhou"),
    tipo,
    com_modelo: !!modelo,
  });
  return json({ success: true, resultados });
});
