// supabase/functions/sentinela-pedidos/index.ts
//
// Sentinela de pedido sem reserva (issue #461). Chamada pelo pg_cron de 10 em 10 minutos com a
// chave da rotina do revisor (x-rotina). Para cada conversa candidata (fn_conversas_para_sentinela:
// pedido de vaga nas últimas 72 h, parada há 30 min, sem reserva lançada depois do pedido e sem
// pendência aberta), simula o Agendado SEM GRAVAR NADA. Viagem pedida de hoje a 3 dias, que não
// saiu e sem reserva → pendência "Pedido sem reserva" + nota privada no Chatwoot (só a equipe vê).
// Nada vai ao cliente. `{"simular": true}` mostra o que faria, sem avisar ninguém.
//
// Deploy: verify_jwt = false (a autenticação é a chave da rotina).

import { diaCivil } from "../_shared/agentePuro.ts";
import { chatwootClient } from "../_shared/chatwootClient.ts";
import { simularAgendado } from "../_shared/rascunhoReserva.ts";
import { notaDaSentinela, pedidoEncerrado, pedidosSemReserva, resumoDosPedidos, type ViagemLida } from "../_shared/sentinelaPura.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const evento = (nome: string, dados: Record<string, unknown>) => console.log(JSON.stringify({ evento: nome, ...dados }));
const fmtHora = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Fortaleza", hour: "2-digit", minute: "2-digit", hour12: false });

// deno-lint-ignore no-explicit-any
type Linha = Record<string, any>;

async function verificar(c: Linha, simular: boolean) {
  const agora = new Date();
  const hoje = diaCivil(agora);
  const horaAgora = fmtHora.format(agora);
  let resultado = "ok";
  let detalhe: Record<string, unknown> = {};
  try {
    const lido = await simularAgendado({
      conversationId: c.conversation_id,
      chatwootConversationId: Number(c.chatwoot_conversation_id),
      mensagemId: Number(c.ultima_msg_id),
      telefone: String(c.telefone ?? ""),
      marcaEm: agora.toISOString(),
    });
    const pedidos = pedidosSemReserva((lido.planejadas ?? []) as ViagemLida[], { hoje, horaAgora });
    if (pedidos.length) {
      const { data: falas } = await supabaseAdmin
        .from("bot_observations")
        .select("author, content, created_at")
        .eq("conversation_id", c.conversation_id)
        .in("author", ["cliente", "equipe"])
        .gte("created_at", new Date(agora.getTime() - 72 * 3600 * 1000).toISOString())
        .order("created_at");
      const encerrado = pedidoEncerrado(((falas ?? []) as Linha[]).map((f) => ({ quem: f.author, texto: f.content, em: f.created_at })));
      if (encerrado) {
        resultado = "encerrado";
        detalhe = { motivo: encerrado };
      } else {
        resultado = "pedido_sem_reserva";
        detalhe = { pedidos, resumo: resumoDosPedidos(pedidos, hoje) };
        if (!simular) {
          const { data: conv } = await supabaseAdmin.from("whatsapp_conversations").select("customer_id").eq("id", c.conversation_id).maybeSingle();
          const { error } = await supabaseAdmin.rpc("rpc_open_support_ticket", {
            p_subject: "Pedido sem reserva",
            p_detail: `O cliente pediu ${resumoDosPedidos(pedidos, hoje)} e ainda não está na Agenda. Confira a conversa e lance pela Agenda (ou responda se não houver vaga).`,
            p_phone: c.telefone ?? null,
            p_customer_id: conv?.customer_id ?? null,
            p_source: "whatsapp",
            p_meta: { conversation_id: c.conversation_id, chatwoot_conversation_id: Number(c.chatwoot_conversation_id), sentinela: true, pedidos },
          });
          if (error) throw error;
          await chatwootClient
            .postMessage(Number(c.chatwoot_conversation_id), notaDaSentinela(pedidos, hoje), { private: true })
            .catch((err) => evento("bot_aviso", { aviso: "nota_da_sentinela", conversa: c.chatwoot_conversation_id, erro: String(err).slice(0, 200) }));
        }
      }
    } else {
      detalhe = { motivos: lido.motivos ?? [] };
    }
  } catch (err) {
    // não grava a assinatura: tenta de novo na próxima rodada
    evento("bot_erro", { etapa: "sentinela", conversa: c.chatwoot_conversation_id, erro: String(err).slice(0, 300) });
    return { conversa: c.chatwoot_conversation_id, resultado: "erro" };
  }
  if (!simular) {
    await supabaseAdmin.from("sentinela_pedidos").upsert({
      conversation_id: c.conversation_id,
      assinatura: c.assinatura,
      resultado,
      detalhe,
      verificado_em: new Date().toISOString(),
    });
  }
  evento("sentinela_conversa", { conversa: c.chatwoot_conversation_id, resultado, simular });
  return { conversa: c.chatwoot_conversation_id, resultado, ...detalhe };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ success: false, message: "Método não permitido." }, 405);
  const chave = req.headers.get("x-rotina") ?? "";
  if (!chave) return json({ success: false, message: "Não autorizado." }, 401);
  const { data: autorizada } = await supabaseAdmin.rpc("fn_rotina_autorizada", { p_nome: "revisor", p_token: chave });
  if (autorizada !== true) return json({ success: false, message: "Não autorizado." }, 401);

  const corpo = await req.json().catch(() => ({}));
  const simular = corpo?.simular === true;
  const limite = Math.min(Math.max(Number(corpo?.limite) || 6, 1), 20);
  const { data: candidatas, error } = await supabaseAdmin.rpc("fn_conversas_para_sentinela", { p_limite: limite });
  if (error) return json({ success: false, message: error.message }, 500);

  const trabalho = (async () => {
    const out = [];
    for (const c of (candidatas ?? []) as Linha[]) out.push(await verificar(c, simular));
    return out;
  })();
  if (simular) return json({ success: true, simular, resultados: await trabalho });
  // deno-lint-ignore no-explicit-any
  const runtime = (globalThis as any).EdgeRuntime;
  if (runtime?.waitUntil) {
    runtime.waitUntil(trabalho);
    return json({ success: true, candidatas: (candidatas ?? []).length }, 202);
  }
  return json({ success: true, resultados: await trabalho });
});
