// supabase/functions/_shared/rascunhoReserva.ts
//
// Reservas PREPARADAS pela IA (issue #254). Depois de uma mensagem do cliente,
// espera ele terminar de escrever, lê o fim da conversa e, se ele já mandou o
// que basta (data + endereço ou ponto), grava/atualiza um rascunho em
// reservation_drafts. A equipe lança com um toque na aba Atendimento (o app
// calcula preço e vaga como sempre). NADA é reservado aqui. Melhor esforço:
// erro aqui nunca pode derrubar o atendimento. Regras puras em rascunhoPuro.ts.

import {
  areaDoDesembarque,
  calendarioParaOPrompt,
  converterMensagensDoChatwoot,
  converterObservacoes,
  diaCivil,
  existeTextoNovoDoCliente,
  formatarHistorico,
  type MensagemDaConversa,
} from "./agentePuro.ts";
import { chatwootClient } from "./chatwootClient.ts";
import {
  FERRAMENTA_PEDIDOS,
  instrucoesDaLeitura,
  mensagensRecentesDoCliente,
  type PedidoExtraido,
  pareceTerPedido,
  validarPedidoExtraido,
} from "./rascunhoPuro.ts";
import { supabaseAdmin } from "./supabaseAdmin.ts";
import { normalizarTelefone } from "./telefone.ts";
import { whatsappService } from "./whatsappService.ts";

const MODELO = Deno.env.get("BOT_RASCUNHO_MODELO") ?? "claude-haiku-5-5";
const ESPERA_MS = Number(Deno.env.get("BOT_RASCUNHO_ESPERA_MS") ?? "20000");

function evento(nome: string, dados: Record<string, unknown>) {
  console.log(JSON.stringify({ evento: nome, ...dados }));
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

// biome-ignore lint/suspicious/noExplicitAny: resposta externa da API
type Bloco = Record<string, any>;

async function lerConversa(chatwootConversationId: number, mensagemId: number) {
  try {
    const brutas = await chatwootClient.listarMensagens(chatwootConversationId, 2);
    return { mensagens: converterMensagensDoChatwoot(brutas), cedeu: existeTextoNovoDoCliente(brutas, mensagemId) };
  } catch {
    const { data } = await supabaseAdmin
      .from("bot_observations")
      .select("author, content, created_at, chatwoot_message_id")
      .eq("chatwoot_conversation_id", chatwootConversationId)
      .in("author", ["cliente", "equipe"])
      .order("created_at", { ascending: false })
      .limit(40);
    const mensagens = converterObservacoes(data ?? []);
    return { mensagens, cedeu: mensagens.some((m) => m.quem === "cliente" && (m.id ?? 0) > mensagemId) };
  }
}

async function contexto() {
  const [ida, volta, { data: areas }] = await Promise.all([
    whatsappService.listRoutePoints("ida"),
    whatsappService.listRoutePoints("volta"),
    supabaseAdmin.from("dropoff_areas").select("direction, code, label").eq("active", true).is("deleted_at", null),
  ]);
  const ativos = (l: Bloco[] | null) => (l ?? []).filter((p) => p.active !== false);
  const pontos = { ida: ativos(ida).map((p) => String(p.code)), volta: ativos(volta).map((p) => String(p.code)) };
  const listaPontos = [
    ...ativos(ida).map((p) => `- ida: ${p.code} = ${p.name}`),
    ...ativos(volta).map((p) => `- volta: ${p.code} = ${p.name}`),
  ].join("\n");
  const porSentido = (d: string) => (areas ?? []).filter((a: Bloco) => a.direction === d) as { code: string; label: string }[];
  const desembarques = ["ida", "volta"].map((d) => `- ${d}: ${porSentido(d).map((a) => a.label).join(", ")}`).join("\n");
  return { pontos, listaPontos, desembarques, areaDe: (t: string, d: "ida" | "volta") => areaDoDesembarque(t, porSentido(d)) };
}

async function lerPedidos(system: string, conversa: string): Promise<{ pedidos: PedidoExtraido[]; uso?: Bloco }> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("Falta ANTHROPIC_API_KEY nos secrets da função.");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODELO,
      max_tokens: 800,
      system,
      tools: [FERRAMENTA_PEDIDOS],
      tool_choice: { type: "tool", name: FERRAMENTA_PEDIDOS.name },
      messages: [{ role: "user", content: `CONVERSA (mais recentes por último):\n${conversa}` }],
    }),
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) throw new Error(`Falha ao ler o pedido: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const corpo = await res.json();
  if (corpo.stop_reason === "max_tokens") throw new Error("Leitura do pedido cortada (max_tokens).");
  const uso = corpo.usage;
  const bloco = (corpo.content ?? []).find((b: Bloco) => b.type === "tool_use" && b.name === FERRAMENTA_PEDIDOS.name);
  const pedidos = Array.isArray(bloco?.input?.pedidos) ? (bloco.input.pedidos as PedidoExtraido[]) : [];
  return { pedidos: pedidos.slice(0, 2), uso };
}

/** Viagens (data|sentido) em que o cliente já tem reserva ativa. */
async function viagensJaReservadas(customerId: string | null, hoje: string): Promise<Set<string>> {
  if (!customerId) return new Set();
  const { data } = await supabaseAdmin
    .from("reservations")
    .select("status, trips!inner(trip_date, direction)")
    .eq("customer_id", customerId)
    .is("deleted_at", null)
    .neq("status", "cancelada")
    .gte("trips.trip_date", hoje);
  return new Set((data ?? []).map((r: Bloco) => `${r.trips.trip_date}|${r.trips.direction}`));
}

export async function prepararRascunhoDeReserva(entrada: {
  conversationId: string;
  chatwootConversationId: number;
  mensagemId: number;
  telefone: string;
}) {
  const conversa = entrada.chatwootConversationId;
  try {
    // 1) o cliente costuma mandar o pedido picado: espera e deixa a mensagem mais nova cuidar
    await dormir(ESPERA_MS);
    const { mensagens, cedeu } = await lerConversa(conversa, entrada.mensagemId);
    if (cedeu) return;

    const agora = new Date();
    const doCliente = mensagensRecentesDoCliente(mensagens, agora);
    if (!pareceTerPedido(doCliente.map((m) => m.texto))) return;

    const hoje = diaCivil(agora);
    const ctx = await contexto();
    const recentes = mensagens.filter((m: MensagemDaConversa) => new Date(m.em).getTime() >= agora.getTime() - 72 * 3600 * 1000);
    const system = instrucoesDaLeitura({
      calendario: calendarioParaOPrompt(agora),
      pontos: ctx.listaPontos,
      desembarques: ctx.desembarques,
    });
    const { pedidos, uso } = await lerPedidos(system, formatarHistorico(recentes, 30, 500));

    const cliente = await whatsappService.identifyCustomer(entrada.telefone);
    const jaReservadas = await viagensJaReservadas(cliente?.id ?? null, hoje);
    const telefone = normalizarTelefone(entrada.telefone);

    let gravados = 0;
    const motivos: string[] = [];
    for (const p of pedidos) {
      const v = validarPedidoExtraido(p, { hoje, pontos: ctx.pontos, areaDoDesembarque: ctx.areaDe });
      if (!v.ok) {
        motivos.push(v.motivo);
        continue;
      }
      const r = v.rascunho;
      if (jaReservadas.has(`${r.trip_date}|${r.direction}`)) {
        motivos.push("ja_reservado");
        continue;
      }
      const linha = {
        ...r,
        // nome: o do cadastro; senão o que o CLIENTE escreveu (nunca o perfil do WhatsApp)
        customer_name: cliente?.name ?? r.customer_name,
        conversation_id: entrada.conversationId,
        chatwoot_conversation_id: conversa,
        customer_id: cliente?.id ?? null,
        phone: telefone || null,
        source_message_id: entrada.mensagemId,
      };
      // um rascunho aberto por conversa e sentido: o cliente corrigiu a data? atualiza o mesmo
      const { data: aberto } = await supabaseAdmin
        .from("reservation_drafts")
        .select("id")
        .eq("conversation_id", entrada.conversationId)
        .eq("direction", r.direction)
        .eq("status", "pronta")
        .maybeSingle();
      const { error } = aberto
        ? await supabaseAdmin.from("reservation_drafts").update(linha).eq("id", aberto.id)
        : await supabaseAdmin.from("reservation_drafts").insert(linha);
      if (error) {
        motivos.push("erro_gravar");
        evento("bot_aviso", { aviso: "rascunho_nao_gravado", conversa, erro: error.message.slice(0, 200) });
      } else gravados++;
    }
    evento("bot_rascunho_preparado", {
      conversa,
      pedidos: pedidos.length,
      gravados,
      motivos,
      entrada: uso?.input_tokens ?? null,
      saida: uso?.output_tokens ?? null,
    });
  } catch (err) {
    evento("bot_aviso", { aviso: "rascunho_falhou", conversa, erro: String(err).slice(0, 300) });
  }
}
