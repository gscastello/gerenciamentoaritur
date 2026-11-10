// supabase/functions/_shared/rascunhoReserva.ts
//
// Reservas PREPARADAS pela IA (issue #254). Depois de uma mensagem do cliente,
// espera ele terminar de escrever, lê o fim da conversa e, se ele já mandou o
// que basta (data + endereço ou ponto), grava/atualiza um rascunho em
// reservation_drafts. A equipe lança com um toque na aba Atendimento (o app
// calcula preço e vaga como sempre).
//
// "Agendado ☑️" (issue #257): quando a EQUIPE confirma na conversa com a marca
// combinada pelo dono, o rascunho é preparado na hora e LANÇADO — a marca da
// equipe é a confirmação manual. Preço pela mesma regra do bot (trecho → ponto
// → bairro); vaga validada pelo banco. Se faltar algo, o rascunho fica na lista
// com o motivo. Melhor esforço: erro aqui nunca derruba o atendimento.

import { acharPonto, lugaresNasCidades, valorDoPedido } from "./agenteFerramentas.ts";
import { avisoDoBairro, resolverBairro } from "./bairroResolver.ts";
import {
  areaDoDesembarque,
  bairroDaTabela,
  bairroParecido,
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
  avisoDosLugares,
  type CostumeDoSentido,
  FERRAMENTA_PEDIDOS,
  instrucoesDaLeitura,
  mensagensRecentesDoCliente,
  type PedidoExtraido,
  pareceTerPedido,
  validarPedidoExtraido,
} from "./rascunhoPuro.ts";
import { supabaseAdmin } from "./supabaseAdmin.ts";
import { normalizarTelefone, variantesTelefone } from "./telefone.ts";
import { whatsappService } from "./whatsappService.ts";

const MODELO = Deno.env.get("BOT_RASCUNHO_MODELO") ?? "claude-haiku-5-5";
const ESPERA_MS = Number(Deno.env.get("BOT_RASCUNHO_ESPERA_MS") ?? "20000");

function evento(nome: string, dados: Record<string, unknown>) {
  console.log(JSON.stringify({ evento: nome, ...dados }));
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

// biome-ignore lint/suspicious/noExplicitAny: resposta externa da API
type Bloco = Record<string, any>;

type Entrada = {
  conversationId: string;
  chatwootConversationId: number;
  /** id da mensagem que disparou (do cliente ou, no Agendado ☑️, da equipe) */
  mensagemId: number;
  telefone: string;
};

async function lerConversa(chatwootConversationId: number, mensagemId: number) {
  try {
    // 4 páginas: além do pedido atual, as conversas anteriores mostram onde o cliente costuma embarcar
    const brutas = await chatwootClient.listarMensagens(chatwootConversationId, 4);
    return { mensagens: converterMensagensDoChatwoot(brutas), cedeu: existeTextoNovoDoCliente(brutas, mensagemId) };
  } catch {
    const { data } = await supabaseAdmin
      .from("bot_observations")
      .select("author, content, created_at, chatwoot_message_id")
      .eq("chatwoot_conversation_id", chatwootConversationId)
      .in("author", ["cliente", "equipe"])
      .order("created_at", { ascending: false })
      .limit(80);
    const mensagens = converterObservacoes(data ?? []);
    return { mensagens, cedeu: mensagens.some((m) => m.quem === "cliente" && (m.id ?? 0) > mensagemId) };
  }
}

async function contexto() {
  const [ida, volta, { data: areas }, { data: bairros }] = await Promise.all([
    whatsappService.listRoutePoints("ida"),
    whatsappService.listRoutePoints("volta"),
    supabaseAdmin.from("dropoff_areas").select("direction, code, label").eq("active", true).is("deleted_at", null),
    supabaseAdmin.from("neighborhood_pricing").select("neighborhood").order("neighborhood"),
  ]);
  const ativos = (l: Bloco[] | null) => (l ?? []).filter((p) => p.active !== false);
  const pontos = { ida: ativos(ida).map((p) => String(p.code)), volta: ativos(volta).map((p) => String(p.code)) };
  const listaPontos = [
    ...ativos(ida).map((p) => `- ida: ${p.code} = ${p.name}`),
    ...ativos(volta).map((p) => `- volta: ${p.code} = ${p.name}`),
  ].join("\n");
  const porSentido = (d: string) => (areas ?? []).filter((a: Bloco) => a.direction === d) as { code: string; label: string }[];
  const desembarques = ["ida", "volta"].map((d) => `- ${d}: ${porSentido(d).map((a) => a.label).join(", ")}`).join("\n");
  return {
    pontos,
    pontosCompletos: { ida: ativos(ida), volta: ativos(volta) },
    listaPontos,
    desembarques,
    bairrosSaoLuis: (bairros ?? []).map((b: Bloco) => b.neighborhood).join(", "),
    bairrosTabela: (bairros ?? []) as { neighborhood: string }[],
    areaDe: (t: string, d: "ida" | "volta") => areaDoDesembarque(t, porSentido(d)),
  };
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

const fmtHoraSaoLuis = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Fortaleza",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

type CostumeDoCliente = { ida: CostumeDoSentido; volta: CostumeDoSentido };

/** Endereço de costume (fixado pela equipe ou o mais frequente no histórico). Melhor esforço. */
async function costumeDoCliente(customerId: string): Promise<CostumeDoCliente | null> {
  const { data, error } = await supabaseAdmin.rpc("rpc_endereco_de_costume", { p_customer_id: customerId });
  if (error || !data?.success) return null;
  if (!data.ida && !data.volta) return null;
  return { ida: data.ida ?? null, volta: data.volta ?? null };
}

function textoDoCostume(c: CostumeDoCliente): string {
  const linha = (rotulo: string, s: CostumeDoSentido) =>
    s?.route_point_code
      ? `- ${rotulo}: ${[s.route_point_name ?? s.route_point_code, s.neighborhood, s.detail].filter(Boolean).join(", ")}${
        s.dropoff_location ? ` → desce em ${s.dropoff_location}` : ""
      }`
      : "";
  return [linha("Ida", c.ida), linha("Volta", c.volta)].filter(Boolean).join("\n");
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

/**
 * Lê a conversa e grava/atualiza os rascunhos. Devolve o que foi lido para quem
 * chamou (o Agendado ☑️ lança em seguida).
 */
async function lerEGravar(
  entrada: Entrada,
  mensagens: MensagemDaConversa[],
  opcoes: { confirmadoPelaEquipe: boolean },
) {
  const agora = new Date();
  const hoje = diaCivil(agora);
  const horaAgora = fmtHoraSaoLuis.format(agora);
  const ctx = await contexto();
  const limite = agora.getTime() - 72 * 3600 * 1000;
  const recentes = mensagens.filter((m) => new Date(m.em).getTime() >= limite);
  // conversas anteriores: só para saber onde o cliente costuma embarcar e descer (issue #266)
  const anteriores = mensagens.filter((m) => new Date(m.em).getTime() < limite && m.quem !== "bot");

  const cliente = await whatsappService.identifyCustomer(entrada.telefone);
  const costume = cliente ? await costumeDoCliente(cliente.id) : null;
  const system = instrucoesDaLeitura({
    calendario: calendarioParaOPrompt(agora),
    pontos: ctx.listaPontos,
    desembarques: ctx.desembarques,
    confirmadoPelaEquipe: opcoes.confirmadoPelaEquipe,
    costume: costume ? textoDoCostume(costume) : undefined,
    bairrosSaoLuis: ctx.bairrosSaoLuis,
  });
  const conversa = anteriores.length
    ? `CONVERSAS ANTERIORES (só para saber onde ele costuma embarcar e descer; não são o pedido atual):\n${formatarHistorico(anteriores, 25, 200)}\n\nPEDIDO ATUAL (últimos dias):\n${formatarHistorico(recentes, 30, 500)}`
    : formatarHistorico(recentes, 30, 500);
  const { pedidos, uso } = await lerPedidos(system, conversa);

  const jaReservadas = await viagensJaReservadas(cliente?.id ?? null, hoje);
  const telefone = normalizarTelefone(entrada.telefone);

  const gravados: string[] = [];
  const motivos: string[] = [];
  /** rascunhos da Volta sem a cidade de embarque dita (issue #272): o "Agendado ☑️" não lança */
  const incertos = new Set<string>();
  for (const p of pedidos) {
    const v = validarPedidoExtraido(p, { hoje, pontos: ctx.pontos, areaDoDesembarque: ctx.areaDe, horaAgora, costume });
    if (!v.ok) {
      motivos.push(v.motivo);
      continue;
    }
    const r = v.rascunho;
    // busca em casa com o bairro escrito errado ("cohatrc"): o da tabela, com aviso (issue #276)
    const parecido = r.route_point_code === "busca" ? bairroParecido(r.pickup_neighborhood, ctx.bairrosTabela) : null;
    if (parecido) {
      r.notes = [r.notes, `Bairro entendido como ${parecido.bairro.neighborhood} (escrito "${parecido.escrito}"): confira.`]
        .filter(Boolean)
        .join(" ")
        .slice(0, 300);
      r.pickup_neighborhood = parecido.bairro.neighborhood;
    }
    // busca em casa com condomínio/residencial fora da tabela: descobre o bairro (issue #270)
    if (r.route_point_code === "busca" && !bairroDaTabela(r.pickup_neighborhood, ctx.bairrosTabela)) {
      const original = [r.pickup_neighborhood, r.pickup_detail].filter(Boolean).join(", ");
      const deduzido = await resolverBairro(original, entrada.chatwootConversationId);
      if (deduzido) {
        r.pickup_detail = original || null;
        r.pickup_neighborhood = deduzido.bairro;
        r.notes = [r.notes, avisoDoBairro(original, deduzido)].filter(Boolean).join(" ").slice(0, 300);
      }
    }
    // Volta: o lugar citado (rua, referência, casa) existe nas duas cidades, ou só na outra? avisa no "Conferir" (issue #274)
    if (r.type === "passagem" && r.direction === "volta" && r.pickup_detail) {
      const aviso = avisoDosLugares(await lugaresNasCidades(r.pickup_detail), v.cidadeIncerta ? null : r.route_point_code);
      if (aviso) r.notes = [r.notes, aviso].filter(Boolean).join(" ").slice(0, 300);
    }
    // marcando para outra pessoa: a reserva é do passageiro (issue #268)
    const outro = v.passageiro && !variantesTelefone(entrada.telefone).includes(v.passageiro.telefone) ? v.passageiro : null;
    const dono = outro ? await whatsappService.identifyCustomer(outro.telefone) : cliente;
    const reservadasDoDono = outro ? await viagensJaReservadas(dono?.id ?? null, hoje) : jaReservadas;
    if (reservadasDoDono.has(`${r.trip_date}|${r.direction}`)) {
      motivos.push("ja_reservado");
      continue;
    }
    const linha = {
      ...r,
      // nome: o do cadastro; senão o que o CLIENTE escreveu (nunca o perfil do WhatsApp)
      customer_name: dono?.name ?? r.customer_name,
      conversation_id: entrada.conversationId,
      chatwoot_conversation_id: entrada.chatwootConversationId,
      customer_id: dono?.id ?? null,
      phone: outro ? outro.telefone : telefone || null,
      notes: outro
        ? [r.notes, `Marcado por outra pessoa (${cliente?.name ?? telefone}).`].filter(Boolean).join(" ").slice(0, 300)
        : r.notes,
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
    const { data: salvo, error } = aberto
      ? await supabaseAdmin.from("reservation_drafts").update(linha).eq("id", aberto.id).select("id").single()
      : await supabaseAdmin.from("reservation_drafts").insert(linha).select("id").single();
    if (error) {
      motivos.push("erro_gravar");
      evento("bot_aviso", { aviso: "rascunho_nao_gravado", conversa: entrada.chatwootConversationId, erro: error.message.slice(0, 200) });
    } else {
      gravados.push(salvo.id);
      if (v.cidadeIncerta) incertos.add(salvo.id);
    }
  }
  return { pedidos, gravados, motivos, incertos, uso, ctx, cliente, hoje };
}

export async function prepararRascunhoDeReserva(entrada: Entrada) {
  const conversa = entrada.chatwootConversationId;
  try {
    // 1) o cliente costuma mandar o pedido picado: espera e deixa a mensagem mais nova cuidar
    await dormir(ESPERA_MS);
    const { mensagens, cedeu } = await lerConversa(conversa, entrada.mensagemId);
    if (cedeu) return;

    // 2) filtro barato: sem data citada pelo cliente, não chama o modelo
    const doCliente = mensagensRecentesDoCliente(mensagens, new Date());
    if (!pareceTerPedido(doCliente.map((m) => m.texto))) return;

    const r = await lerEGravar(entrada, mensagens, { confirmadoPelaEquipe: false });
    evento("bot_rascunho_preparado", {
      conversa,
      pedidos: r.pedidos.length,
      gravados: r.gravados.length,
      motivos: r.motivos,
      entrada: r.uso?.input_tokens ?? null,
      saida: r.uso?.output_tokens ?? null,
    });
  } catch (err) {
    evento("bot_aviso", { aviso: "rascunho_falhou", conversa, erro: String(err).slice(0, 300) });
  }
}

/** Deixa o motivo no rascunho que ficou para a equipe resolver. */
async function anotarPendencia(draftId: string, motivo: string) {
  await supabaseAdmin
    .from("reservation_drafts")
    .update({ notes: `Agendado ☑️ não lançou: ${motivo}`.slice(0, 200) })
    .eq("id", draftId);
}

/**
 * A equipe escreveu "Agendado ☑️": prepara na hora e lança as reservas
 * preparadas desta conversa. Idempotente pela mensagem da equipe.
 */
export async function lancarPeloAgendado(entrada: Entrada) {
  const conversa = entrada.chatwootConversationId;
  const lancadas: string[] = [];
  const pendentes: string[] = [];
  try {
    const { mensagens } = await lerConversa(conversa, Number.MAX_SAFE_INTEGER);
    const lido = await lerEGravar(entrada, mensagens, { confirmadoPelaEquipe: true });

    const { data: prontos } = await supabaseAdmin
      .from("reservation_drafts")
      .select("*")
      .eq("conversation_id", entrada.conversationId)
      .eq("status", "pronta")
      .gte("trip_date", lido.hoje);
    if (!prontos?.length) {
      evento("bot_agendado_lancado", { conversa, lancadas: 0, pendentes: ["sem_rascunho"], motivos: lido.motivos });
      return;
    }

    const { data: bot } = await supabaseAdmin.from("users").select("id").eq("name", "Bot WhatsApp").maybeSingle();
    for (const d of prontos as Bloco[]) {
      const direcao = d.direction as "ida" | "volta";
      const encomenda = d.type === "encomenda";
      let ponto: Bloco | null = null;
      let preco = 0;
      if (lido.incertos.has(d.id)) {
        await anotarPendencia(d.id, "a cidade de embarque (Pirapemas ou Cantanhede) não foi dita na conversa");
        pendentes.push("cidade");
        continue;
      }
      if (!encomenda) {
        ponto = acharPonto(lido.ctx.pontosCompletos[direcao], d.route_point_code);
        if (!ponto) {
          await anotarPendencia(d.id, "ponto de embarque não reconhecido");
          pendentes.push("ponto");
          continue;
        }
        const valor = await valorDoPedido(ponto, {
          bairro: d.pickup_neighborhood,
          endereco: d.pickup_detail,
          desembarque: d.dropoff_location ?? "",
        });
        if (!valor.ok) {
          await anotarPendencia(d.id, String(valor.erro?.erro ?? "sem preço na tabela"));
          pendentes.push(String(valor.erro?.codigo ?? "preco"));
          continue;
        }
        preco = valor.preco;
      }

      // dono da reserva: o do rascunho (o passageiro, se marcaram para outra pessoa — issue #268);
      // cliente já cadastrado reusa o telefone dele (com ou sem o nono dígito)
      const existente = await whatsappService.identifyCustomer(d.phone ?? entrada.telefone);
      const { data: res, error } = await supabaseAdmin.rpc("rpc_create_reservation", {
        p_trip_date: d.trip_date,
        p_direction: direcao,
        p_customer_name: existente?.name ?? d.customer_name ?? "",
        p_customer_phone: existente?.phone ?? d.phone,
        p_type: encomenda ? "encomenda" : "passagem",
        p_route_point_code: ponto?.code ?? null,
        p_quantity: d.quantity ?? 1,
        p_unit_price: preco, // encomenda: nunca tem valor pelo bot
        p_payment_method: "dinheiro",
        p_pickup_neighborhood: d.pickup_neighborhood,
        p_pickup_detail: d.pickup_detail,
        p_dropoff_location: d.dropoff_location,
        p_dropoff_area: d.dropoff_area,
        p_status: "confirmada",
        p_extra_data: { origem: "agendado_equipe", rascunho_id: d.id },
        p_whatsapp_source_message_id: `cw-${entrada.mensagemId}-agendado-${direcao}`,
        p_created_by: bot?.id ?? null,
      });
      if (error || !res?.success) {
        const motivo = error?.message ?? res?.message ?? "reserva recusada";
        await anotarPendencia(d.id, motivo);
        pendentes.push(res?.code ?? res?.status ?? "recusada");
        continue;
      }
      // o gatilho do banco fecha o rascunho; aqui só conta
      lancadas.push(res.reservation_id);
    }
    evento("bot_agendado_lancado", {
      conversa,
      lancadas: lancadas.length,
      pendentes,
      motivos: lido.motivos,
      entrada: lido.uso?.input_tokens ?? null,
      saida: lido.uso?.output_tokens ?? null,
    });
  } catch (err) {
    evento("bot_aviso", { aviso: "agendado_falhou", conversa, erro: String(err).slice(0, 300) });
  }
}
