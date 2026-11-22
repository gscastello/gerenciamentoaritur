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
import { anexosComTranscricao, audiosSemTexto, textoComContatos } from "../_shared/chatwootPayload.ts";
import { transcreverAudiosAntigos } from "../_shared/transcricao.ts";
import { simularAgendado } from "../_shared/rascunhoReserva.ts";
import {
  clienteConcretizou,
  notaDaSentinela,
  pedidoDeReservaSemDia,
  pedidoEncerrado,
  pedidosSemReserva,
  resumoDosPedidos,
  type ViagemLida,
} from "../_shared/sentinelaPura.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const evento = (nome: string, dados: Record<string, unknown>) => console.log(JSON.stringify({ evento: nome, ...dados }));
const fmtHora = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Fortaleza", hour: "2-digit", minute: "2-digit", hour12: false });

// deno-lint-ignore no-explicit-any
type Linha = Record<string, any>;

async function verificar(c: Linha, simular: boolean, quando?: Date) {
  // `quando`: simular como se fosse num momento passado (validar com casos reais)
  const agora = quando ?? new Date();
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
    const motivos: string[] = lido.motivos ?? [];
    const { data: brutas } = await supabaseAdmin
      .from("bot_observations")
      .select("author, content, created_at")
      .eq("conversation_id", c.conversation_id)
      .in("author", ["cliente", "equipe"])
      .gte("created_at", new Date(agora.getTime() - 72 * 3600 * 1000).toISOString())
      .lte("created_at", agora.toISOString())
      .order("created_at");
    const falas = ((brutas ?? []) as Linha[]).map((f) => ({ quem: f.author, texto: f.content, em: f.created_at }));
    // pediu para reservar com todas as letras, mas a leitura não achou o dia ou o sentido
    const semDia = !pedidos.length && motivos.some((m) => m === "sem_data" || m === "sem_sentido") ? pedidoDeReservaSemDia(falas) : null;
    if ((pedidos.length || semDia) && !clienteConcretizou(falas)) {
      // só perguntou ("tem vaga amanhã? qual o valor?"): não é pedido de reserva (issue #467)
      resultado = "so_pergunta";
      detalhe = { pedidos };
    } else if (pedidos.length || semDia) {
      const encerrado = pedidoEncerrado(falas);
      if (encerrado) {
        resultado = "encerrado";
        detalhe = { motivo: encerrado };
      } else {
        resultado = pedidos.length ? "pedido_sem_reserva" : "pedido_sem_dia";
        const resumo = pedidos.length ? resumoDosPedidos(pedidos, hoje) : `uma viagem sem o dia (ou o sentido) claro: "${semDia}"`;
        detalhe = { pedidos, resumo };
        if (!simular) {
          const { data: conv } = await supabaseAdmin.from("whatsapp_conversations").select("customer_id").eq("id", c.conversation_id).maybeSingle();
          const { error } = await supabaseAdmin.rpc("rpc_open_support_ticket", {
            p_subject: "Pedido sem reserva",
            p_detail: `O cliente pediu ${resumo} e ainda não está na Agenda. Confira a conversa e lance pela Agenda (ou responda se não houver vaga).`,
            p_phone: c.telefone ?? null,
            p_customer_id: conv?.customer_id ?? null,
            p_source: "whatsapp",
            p_meta: { conversation_id: c.conversation_id, chatwoot_conversation_id: Number(c.chatwoot_conversation_id), sentinela: true, pedidos },
          });
          if (error) throw error;
          await chatwootClient
            .postMessage(Number(c.chatwoot_conversation_id), notaDaSentinela(pedidos, hoje, semDia), { private: true })
            .catch((err) => evento("bot_aviso", { aviso: "nota_da_sentinela", conversa: c.chatwoot_conversation_id, erro: String(err).slice(0, 200) }));
        }
      }
    } else {
      detalhe = { motivos };
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
  // áudios antigos sem texto de uma conversa: o bot transcreve agora (issue #482)
  if (Number(corpo?.transcrever)) {
    const feitas = await transcreverAudiosAntigos(
      Number(corpo.transcrever),
      (cw) => chatwootClient.listarMensagens(cw, 6),
      textoComContatos,
      audiosSemTexto,
      anexosComTranscricao,
    );
    return json({ success: true, transcritas: feitas });
  }
  const simular = corpo?.simular === true;
  // validação com um caso real: {"simular": true, "conversa": 722, "em": "2026-11-17T15:00:00Z"}
  if (simular && Number(corpo?.conversa) && !Number.isNaN(Date.parse(String(corpo?.em ?? "")))) {
    const em = new Date(String(corpo.em));
    const { data: w } = await supabaseAdmin
      .from("whatsapp_conversations")
      .select("id, chatwoot_conversation_id, phone")
      .eq("chatwoot_conversation_id", Number(corpo.conversa))
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    if (!w) return json({ success: false, message: "Conversa não encontrada." }, 404);
    const { data: ultima } = await supabaseAdmin
      .from("bot_observations")
      .select("chatwoot_message_id")
      .eq("conversation_id", w.id)
      .eq("author", "cliente")
      .lte("created_at", em.toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const c = { conversation_id: w.id, chatwoot_conversation_id: w.chatwoot_conversation_id, telefone: w.phone, ultima_msg_id: ultima?.chatwoot_message_id ?? 0, assinatura: "teste" };
    return json({ success: true, simular, resultados: [await verificar(c, true, em)] });
  }
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
