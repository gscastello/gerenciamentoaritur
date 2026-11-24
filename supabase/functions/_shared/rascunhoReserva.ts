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
  bairroComoNaTabela,
  bairroDaTabela,
  bairroParecido,
  calendarioParaOPrompt,
  converterMensagensDoChatwoot,
  converterObservacoes,
  diaCivil,
  existeTextoNovoDoCliente,
  somarDias,
  formatarHistorico,
  type MensagemDaConversa,
  bairroEscritoNoEndereco,
  bairroPelosLugares,
  type LugarDeSaoLuis,
} from "./agentePuro.ts";
import { chatwootClient } from "./chatwootClient.ts";
import { mensagensComTranscricoesDoBot } from "./transcricao.ts";
import {
  type AtualizacaoLida,
  FERRAMENTA_ATUALIZACAO,
  instrucoesDaAtualizacao,
  type ItemAConfirmar,
  pendenciasAtuais,
  planejarAtualizacao,
  avisoDaCidadePelaBase,
  avisoDoAgendado,
  notaDoAgendadoQueNaoLancou,
  assinaturaDaLeitura,
  duvidasDoPassageiro,
  naoPerguntarPorAudioNaoLido,
  leituraDaMaioria,
  falhaDoServicoDaIa,
  avisoDosLugares,
  cidadeDaVolta,
  cidadePelaBase,
  type CostumeDoSentido,
  ehMarcaDeAgendado,
  FERRAMENTA_PEDIDOS,
  partesDaLeitura,
  sistemaComCache,
  mensagensRecentesDoCliente,
  type PedidoExtraido,
  pareceTerPedido,
  validarPedidoExtraido,
  sentidoPeloHabito,
  AVISO_DIA_DA_EQUIPE,
  AVISO_DIA_ILEGIVEL_PELO_AGENDADO,
  diaDitoPelaEquipe,
  ehMensagemIlegivel,
  localDeOutros,
  agendadoPrecisaReler,
  cidadeEscritaPeloCliente,
  perguntaAoCliente,
  proximaViagemPeloLugar,
  viagemDeHojeJaSaiu,
  viagemDeHojePeloAgendado,
  cidadeDaVoltaPelasPistas,
  cidadeDoCaminhoNoTexto,
  juntarPedidosDaMesmaViagem,
  inicioDoPedidoAtual,
  rascunhosDoAgendado,
  deveRelerAgendado,
  deveLerDeNovoNoFim,
  codigoDaRecusa,
  enderecoSemMarcaDeBairro,
  notasSemReservaSemEndereco,
  sentidoPeloLugarDoEmbarque,
  idaPeloEmbarqueEmSaoLuis,
  outroPodeSerBusca,
  bairroTemProva,
  bairroForaDoNomeComposto,
} from "./rascunhoPuro.ts";
import { horarioDoEmbarque, mensagemDeConfirmacao, type ReservaParaConfirmar } from "./confirmacaoAoCliente.ts";
import { aplicarDadosDaMarca, dadosDaMarca } from "./marcaDaEquipe.ts";
import {
  conferenciaFinal,
  conferirPeloCliente,
  datasEscritas,
  desembarqueEraEmbarque,
  semSugestoesRecusadas,
  sugestoesRecusadas,
  datasConfirmadas,
  datasSemPedido,
  pedeDeOndeDeixou,
  sentidoEscrito,
  embarqueNoInteriorEscrito,
  quantidadeIncerta,
  viagemDeOndeDeixou,
  segundaViagemEhAOutra,
  origemDoPedido,
  pedidosPelaOrigem,
  outraViagemDoPar,
  pedidosPeloSentidoDoDia,
  bairroEscrito,
  cidadeDoEnderecoEscrito,
  voltaPeloEnderecoDoInterior,
  sentidoDoDiaEscrito,
  pediuDeNovo,
  pontoEscrito,
  falasDoDia,
  semPedidosPassados,
  cidadeNaRespostaDoEndereco,
  diasSoPerguntados,
} from "./pedidoDoCliente.ts";
import { normalizarTexto, semLogradouros } from "./grafia.ts";
import { completarLugares } from "./lugaresDoPedido.ts";
import { lugaresContraOSentido, paradaDoInterior } from "./ladoDaRota.ts";
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
    // 6 páginas: o pedido atual inteiro e as conversas anteriores (onde o cliente costuma embarcar) — issue #303
    // com o que o bot transcreveu dos áudios que o Chatwoot não transcreveu (issue #482)
    const brutas = await mensagensComTranscricoesDoBot(await chatwootClient.listarMensagens(chatwootConversationId, 6));
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

/** Locais de desembarque reconhecidos só em código (`areaDoDesembarque`), fora das instruções do leitor. */
const AREAS_FORA_DO_TEXTO = new Set(["palmeiral", "povoado_sozinho"]);

async function contexto() {
  const [ida, volta, { data: areas }, { data: bairros }, { data: locais }] = await Promise.all([
    whatsappService.listRoutePoints("ida"),
    whatsappService.listRoutePoints("volta"),
    supabaseAdmin.from("dropoff_areas").select("direction, code, label").eq("active", true).is("deleted_at", null),
    supabaseAdmin.from("neighborhood_pricing").select("neighborhood").order("neighborhood"),
    // locais da BR em "Outros" (Estiva, Pedrinhas, Oleama…): não buscamos em casa ali (issue #418)
    supabaseAdmin.from("boarding_spot_prices").select("local"),
  ]);
  const ativos = (l: Bloco[] | null) => (l ?? []).filter((p) => p.active !== false);
  const pontos = { ida: ativos(ida).map((p) => String(p.code)), volta: ativos(volta).map((p) => String(p.code)) };
  const listaPontos = [
    ...ativos(ida).map((p) => `- ida: ${p.code} = ${p.name}`),
    ...ativos(volta).map((p) => `- volta: ${p.code} = ${p.name}`),
  ].join("\n");
  const porSentido = (d: string) => (areas ?? []).filter((a: Bloco) => a.direction === d) as { code: string; label: string }[];
  // esta lista entra nas instruções do leitor: mudá-la muda TODAS as leituras (issue #512)
  const noTexto = (d: string) => porSentido(d).filter((a) => !AREAS_FORA_DO_TEXTO.has(a.code));
  const desembarques = ["ida", "volta"].map((d) => `- ${d}: ${noTexto(d).map((a) => a.label).join(", ")}`).join("\n");
  return {
    pontos,
    pontosCompletos: { ida: ativos(ida), volta: ativos(volta) },
    listaPontos,
    desembarques,
    bairrosSaoLuis: (bairros ?? []).map((b: Bloco) => b.neighborhood).join(", "),
    bairrosTabela: (bairros ?? []) as { neighborhood: string }[],
    locaisDeOutros: ((locais ?? []) as Bloco[]).map((l) => String(l.local)),
    areaDe: (t: string, d: "ida" | "volta") => areaDoDesembarque(t, porSentido(d)),
  };
}

const MOTIVO_NAO_CONFIRMADO =
  "a leitura final do Agendado não confirmou esta viagem (veio de uma leitura anterior): confira se o cliente pediu";

/** Modelo para reler o que o rápido não entendeu (issue #301). */
const MODELO_CAPAZ = Deno.env.get("BOT_RASCUNHO_MODELO_CAPAZ") ?? "claude-sonnet-5-5";

/** Instruções da leitura: a parte fixa (guardada no cache) e a variável (issue #488). */
type Instrucoes = { fixa: string; variavel: string };

async function lerPedidos(
  system: Instrucoes,
  conversa: string,
  modelo = MODELO,
): Promise<{ pedidos: PedidoExtraido[]; uso?: Bloco }> {
  // os modelos 5.5 maiores não aceitam ferramenta forçada: pede pelo texto (tool_choice auto)
  const forcado = modelo === MODELO;
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("Falta ANTHROPIC_API_KEY nos secrets da função.");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: modelo,
      max_tokens: forcado ? 2000 : 6000, // até 4 pedidos com trecho e dúvida: 800 cortava (conversa com 2 passageiros)
      // a parte fixa vai na frente, guardada por 1 h; o que muda por conversa vem depois (issue #488)
      system: sistemaComCache(
        system.fixa,
        forcado
          ? system.variavel
          : `${system.variavel}\n\nResponda SEMPRE chamando a ferramenta ${FERRAMENTA_PEDIDOS.name} (lista vazia se não houver pedido).`,
      ),
      tools: [FERRAMENTA_PEDIDOS],
      tool_choice: forcado ? { type: "tool", name: FERRAMENTA_PEDIDOS.name } : { type: "auto" },
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
  // até 4: ida e volta de duas pessoas (cortar em 2 perdia passageiro)
  return { pedidos: pedidos.slice(0, 4), uso };
}

const somar = (usos: (Bloco | undefined)[], campo: string) => usos.reduce((t, u) => t + Number(u?.[campo] ?? 0), 0);
const somarUso = (usos: (Bloco | undefined)[]): Bloco => ({
  input_tokens: somar(usos, "input_tokens"),
  output_tokens: somar(usos, "output_tokens"),
  // cache (issue #488): o lido sai a 10% do preço (5% nos 5.5 maiores); o gravado, a 2x (TTL de 1 h)
  cache_read_input_tokens: somar(usos, "cache_read_input_tokens"),
  cache_creation_input_tokens: somar(usos, "cache_creation_input_tokens"),
});

/**
 * Leitura com consenso (issue #465): duas leituras em paralelo; se concordam no que decide a
 * reserva (tipo, dia, sentido, quantidade, ponto), vale. Se discordam, uma terceira e vale a
 * maioria. Sem maioria, fica a primeira e o Agendado relê com o modelo capaz (`divergente`).
 * Só na leitura rápida: a releitura com o modelo capaz é uma só.
 */
async function lerPedidosComConsenso(
  system: Instrucoes,
  conversa: string,
  modelo?: string,
): Promise<{ pedidos: PedidoExtraido[]; uso?: Bloco; divergente: boolean }> {
  if (modelo && modelo !== MODELO) return { ...(await lerPedidos(system, conversa, modelo)), divergente: false };
  const [a, b] = await Promise.all([lerPedidos(system, conversa), lerPedidos(system, conversa)]);
  if (assinaturaDaLeitura(a.pedidos) === assinaturaDaLeitura(b.pedidos)) {
    return { pedidos: a.pedidos, uso: somarUso([a.uso, b.uso]), divergente: false };
  }
  const c = await lerPedidos(system, conversa);
  const leituras = [a, b, c];
  const i = leituraDaMaioria(leituras.map((l) => l.pedidos));
  const uso = somarUso(leituras.map((l) => l.uso));
  evento("bot_leituras_divergentes", { maioria: i !== null });
  if (i !== null) return { pedidos: leituras[i].pedidos, uso, divergente: false };
  return { pedidos: a.pedidos, uso, divergente: true };
}

/**
 * Avaliação sem gastar API (issue #494): o mesmo texto (modelo, instruções, ferramenta e conversa) já
 * lido devolve a leitura guardada. Mudou uma palavra das instruções, lê de novo. Só na simulação da
 * avaliação: o Agendado de verdade sempre lê.
 */
async function lerComMemoria(system: Instrucoes, conversa: string, modelo?: string): ReturnType<typeof lerPedidosComConsenso> {
  const partes = [modelo ?? MODELO, JSON.stringify(FERRAMENTA_PEDIDOS), system.fixa, system.variavel, conversa];
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(partes)));
  const chave = [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const { data } = await supabaseAdmin.from("bot_leituras_memo").select("pedidos, divergente").eq("chave", chave).maybeSingle();
  if (data) return { pedidos: data.pedidos as PedidoExtraido[], divergente: data.divergente === true };
  const lido = await lerPedidosComConsenso(system, conversa, modelo);
  // guarda antes das regras do código, que mudam os pedidos no lugar
  await supabaseAdmin.from("bot_leituras_memo").upsert({ chave, pedidos: structuredClone(lido.pedidos), divergente: lido.divergente });
  return lido;
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
      : s?.dropoff_location
      // "embarque varia" (issue #328): não presuma o embarque; o desembarque é o de sempre
      ? `- ${rotulo}: embarque varia (use o que ele disser; não presuma) → desce em ${s.dropoff_location}`
      : "";
  return [linha("Ida", c.ida), linha("Volta", c.volta)].filter(Boolean).join("\n");
}

/** Viagens do passageiro de 60 dias para trás até 60 à frente (sem as canceladas) — para o hábito (issue #416). */
async function viagensRecentes(customerId: string): Promise<{ data: string; direcao: string; desembarque: string | null }[]> {
  const hoje = diaCivil(new Date());
  const { data } = await supabaseAdmin
    .from("reservations")
    .select("status, dropoff_location, trips!inner(trip_date, direction)")
    .eq("customer_id", customerId)
    .is("deleted_at", null)
    .neq("status", "cancelada")
    .gte("trips.trip_date", somarDias(hoje, -60))
    .lte("trips.trip_date", somarDias(hoje, 60));
  return ((data ?? []) as Bloco[]).map((r) => ({
    data: String(r.trips.trip_date),
    direcao: String(r.trips.direction),
    desembarque: r.dropoff_location ?? null,
  }));
}

/** Viagens (data|sentido) em que o cliente já tem reserva ativa. */
async function viagensJaReservadas(customerId: string | null, hoje: string, antesDe?: string): Promise<Set<string>> {
  if (!customerId) return new Set();
  let q = supabaseAdmin
    .from("reservations")
    .select("status, trips!inner(trip_date, direction)")
    .eq("customer_id", customerId)
    .is("deleted_at", null)
    .gte("trips.trip_date", hoje);
  // avaliação (#419): o que existia antes da marca, com o status de então (cancelada depois ainda contava)
  q = antesDe ? q.lt("created_at", antesDe).or(`status.neq.cancelada,cancelled_at.gte.${antesDe}`) : q.neq("status", "cancelada");
  const { data } = await q;
  return new Set((data ?? []).map((r: Bloco) => `${r.trips.trip_date}|${r.trips.direction}`));
}

/**
 * "Gostaria de agendar de novo!" (issue #419): a reserva que o passageiro cancelou nos últimos 7
 * dias, como pedido — mesmo sentido, embarque e desembarque; o dia é o escrito/confirmado agora ou,
 * se ainda não passou, o da cancelada. Na avaliação, só o que já estava cancelado antes da marca.
 */
async function pedidoDaReservaCancelada(
  customerId: string | null,
  hoje: string,
  dia: string | null,
  antesDe?: string,
): Promise<PedidoExtraido | null> {
  if (!customerId) return null;
  const desde = new Date((antesDe ? Date.parse(antesDe) : Date.now()) - 7 * 24 * 3600 * 1000).toISOString();
  let q = supabaseAdmin
    .from("reservations")
    .select("type, quantity, pickup_neighborhood, pickup_detail, dropoff_location, cancelled_at, route_points(code), trips!inner(trip_date, direction)")
    .eq("customer_id", customerId)
    .eq("status", "cancelada")
    .is("deleted_at", null)
    .gte("cancelled_at", desde)
    .order("cancelled_at", { ascending: false })
    .limit(1);
  if (antesDe) q = q.lt("cancelled_at", antesDe);
  const { data } = await q;
  const r = (data ?? [])[0] as Bloco | undefined;
  if (!r) return null;
  const data_ = dia ?? (r.trips.trip_date >= hoje ? r.trips.trip_date : null);
  const volta = r.trips.direction === "volta";
  return {
    tipo: r.type ?? "passagem",
    data: data_,
    direcao: r.trips.direction,
    ponto: volta ? null : (r.route_points?.code ?? null),
    cidade_dita: volta ? (r.route_points?.code ?? null) : null,
    bairro: r.pickup_neighborhood ?? null,
    endereco: r.pickup_detail ?? null,
    desembarque: r.dropoff_location ?? null,
    quantidade: r.quantity ?? 1,
    duvida: "Refeita da reserva que o passageiro cancelou (\"agendar de novo\"): confira.",
  };
}

/** O que a equipe ensinou sobre o passageiro (customers.bot_instructions, issue #328). */
async function instrucoesDaEquipe(customerId: string): Promise<string> {
  const { data } = await supabaseAdmin.from("customers").select("bot_instructions").eq("id", customerId).maybeSingle();
  return String(data?.bot_instructions ?? "").trim();
}

/** Cidade de cada reserva anterior do cliente: Volta pelo ponto, Ida pelo destino (issue #324). */
async function cidadesDoHistorico(customerId: string | null): Promise<string[]> {
  if (!customerId) return [];
  const { data } = await supabaseAdmin
    .from("reservations")
    .select("dropoff_area, route_points(code), trips!inner(direction)")
    .eq("customer_id", customerId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(60);
  const out: string[] = [];
  for (const r of (data ?? []) as Bloco[]) {
    const cidade = r.trips?.direction === "volta" ? r.route_points?.code : r.dropoff_area;
    if (cidade === "pirapemas" || cidade === "cantanhede") out.push(cidade);
  }
  return out;
}

/** O que o cliente escreveu em TODAS as conversas guardadas (não só as 72 h do pedido) — issue #324. */
async function textosAntigosDoCliente(conversationId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("whatsapp_messages")
    .select("content")
    .eq("conversation_id", conversationId)
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(300);
  return ((data ?? []) as Bloco[]).map((m) => String(m.content?.content ?? "")).filter(Boolean);
}

/**
 * Lê a conversa e grava/atualiza os rascunhos. Devolve o que foi lido para quem
 * chamou (o Agendado ☑️ lança em seguida).
 */
/**
 * Simulação para a avaliação com casos reais (issue #419): lê a conversa como ela estava no momento
 * da marca (`agora`), conta como "já reservado" só o que existia ANTES da marca e não grava nada —
 * devolve as reservas que o Agendado lançaria em `planejadas`.
 */
export type SimulacaoDaLeitura = { agora: Date; reservasAntesDe: string; /** usa a leitura guardada (avaliação) */ memoria?: boolean };

/** settings.monday_adjustment (a Ida da segunda sai mais cedo), lido uma vez por chamada. */
let ajusteEmCache: { active?: boolean; hours?: number } | null | undefined;
async function ajusteDaSegunda() {
  if (ajusteEmCache !== undefined) return ajusteEmCache;
  const { data } = await supabaseAdmin.from("settings").select("value").eq("key", "monday_adjustment").maybeSingle();
  ajusteEmCache = (data?.value ?? null) as { active?: boolean; hours?: number } | null;
  return ajusteEmCache;
}

async function lerEGravar(
  entrada: Entrada,
  mensagens: MensagemDaConversa[],
  opcoes: { confirmadoPelaEquipe: boolean; modelo?: string; simular?: SimulacaoDaLeitura },
) {
  const simular = opcoes.simular ?? null;
  const planejadas: (Bloco & { pendencia: { motivo: string; codigo: string } | null; a_confirmar: ItemAConfirmar[] })[] = [];
  const agora = simular?.agora ?? new Date();
  const hoje = diaCivil(agora);
  const horaAgora = fmtHoraSaoLuis.format(agora);
  const ctx = await contexto();
  // o pedido atual: as últimas 72 h, a partir do "Agendado ☑️" anterior que já fechou o
  // pedido de antes (issue #387 — o pedido antigo não pode virar reserva de novo)
  const disparoEm = mensagens.find((m) => m.id === entrada.mensagemId)?.em ?? null;
  const corte = inicioDoPedidoAtual(mensagens, disparoEm);
  const limite = Math.max(agora.getTime() - 72 * 3600 * 1000, corte ? Date.parse(corte) + 1 : 0);
  // pedido de um dia que já passou é histórico, não o pedido atual (issue #419)
  const separadas = semPedidosPassados(mensagens.filter((m) => new Date(m.em).getTime() >= limite), hoje, entrada.mensagemId);
  if (separadas.passadas.length) evento("bot_pedido_passado_no_historico", { conversa: entrada.chatwootConversationId, mensagens: separadas.passadas.length });
  const recentes = separadas.atuais;
  // conversas anteriores: só para saber onde o cliente costuma embarcar e descer (issue #266)
  const anteriores = [...mensagens.filter((m) => new Date(m.em).getTime() < limite), ...separadas.passadas]
    .filter((m) => m.quem !== "bot")
    .sort((a, b) => Date.parse(a.em) - Date.parse(b.em));

  const cliente = await whatsappService.identifyCustomer(entrada.telefone);
  const costume = cliente ? await costumeDoCliente(cliente.id) : null;
  const viagensDoPassageiro = costume && cliente ? await viagensRecentes(cliente.id) : [];
  const instrucoesDoCliente = cliente ? await instrucoesDaEquipe(cliente.id) : "";
  const system = partesDaLeitura({
    calendario: calendarioParaOPrompt(agora),
    pontos: ctx.listaPontos,
    desembarques: ctx.desembarques,
    confirmadoPelaEquipe: opcoes.confirmadoPelaEquipe,
    costume: costume ? textoDoCostume(costume) : undefined,
    instrucoesDoCliente: instrucoesDoCliente || undefined,
    bairrosSaoLuis: ctx.bairrosSaoLuis,
  });
  const conversa = anteriores.length
    ? `CONVERSAS ANTERIORES (só para saber onde ele costuma embarcar e descer; não são o pedido atual):\n${formatarHistorico(anteriores, 40, 300)}\n\nPEDIDO ATUAL (últimos dias):\n${formatarHistorico(recentes, 60, 2000)}`
    : formatarHistorico(recentes, 60, 2000); // até 60 mensagens de até 2.000 letras (listas grandes inteiras) — issue #303
  const lidos = simular?.memoria ? await lerComMemoria(system, conversa, opcoes.modelo) : await lerPedidosComConsenso(system, conversa, opcoes.modelo);
  const uso = lidos.uso;
  // mesma viagem do mesmo passageiro = uma reserva só, somando as passagens (issue #345)
  const lidosJuntos = juntarPedidosDaMesmaViagem(lidos.pedidos);
  // tudo o que o CLIENTE escreveu no pedido atual (para conferir a cidade da Volta que ele disse)
  const doCliente = recentes.filter((m) => m.quem === "cliente");
  const textosDoCliente = doCliente.map((m) => m.texto);
  const falasDoTrecho = recentes.filter((m) => m.quem === "cliente" || m.quem === "equipe").map((m) => ({ quem: m.quem, texto: m.texto, em: m.em }));
  // "agendar de novo" sem pedido lido: refaz a reserva que ele cancelou (issue #419)
  let juntos = lidosJuntos;
  if (!juntos.length && pediuDeNovo(textosDoCliente)) {
    const falasDoDia = recentes.filter((m) => m.quem === "cliente" || m.quem === "equipe").map((m) => ({ quem: m.quem, texto: m.texto, em: m.em }));
    const dias = [...new Set([...datasEscritas(doCliente.map((m) => ({ texto: m.texto, em: m.em }))), ...datasConfirmadas(falasDoDia)])].filter((d) => d >= hoje);
    const refeito = await pedidoDaReservaCancelada(cliente?.id ?? null, hoje, dias.length === 1 ? dias[0] : null, simular?.reservasAntesDe);
    if (refeito) {
      juntos = [refeito];
      evento("bot_pedido_de_novo", { conversa: entrada.chatwootConversationId });
    }
  }
  // a ORIGEM decide: saindo de Pirapemas/Cantanhede é Volta, de São Luís é Ida (dono, 14/11 — #407) —
  // só a dita no pedido DAQUELE dia (a de ontem era de outra viagem — issue #419)
  const diaDoPedido = juntos.length === 1 ? juntos[0].data : null;
  const origem = origemDoPedido(falasDoDia(falasDoTrecho, diaDoPedido));
  const pelaOrigem = pedidosPelaOrigem(juntos, origem);
  if (pelaOrigem !== juntos) evento("bot_sentido_pela_origem", { conversa: entrada.chatwootConversationId, sentido: origem?.sentido ?? null });
  const mensagensDoCliente = doCliente.map((m) => ({ texto: m.texto, em: m.em }));
  // "segunda pra ir e terça pra volta" com só uma viagem lida: monta a outra (issue #415)
  // "Volta na terça de Cantanhede pro X": o sentido escrito para aquele dia vale para a viagem daquele dia
  const peloDia = pedidosPeloSentidoDoDia(pelaOrigem, mensagensDoCliente);
  if (peloDia !== pelaOrigem) evento("bot_sentido_do_dia", { conversa: entrada.chatwootConversationId });
  const comOPar = outraViagemDoPar(peloDia, mensagensDoCliente, hoje);
  // "uma de ida e outra de volta" com as duas lidas no mesmo sentido: a outra viagem (issues #401 e
  // #419) — depois das regras do dia, que não sabem do par (formulário colado duas vezes)
  const pares = segundaViagemEhAOutra(comOPar, textosDoCliente, falasDoTrecho);
  if (pares !== comOPar) evento("bot_segunda_viagem_virada", { conversa: entrada.chatwootConversationId });
  // Volta que embarca num lugar de São Luís (trecho da BR: Pedrinhas, Estiva…) é a Ida (issue #419)
  // "vou esperar na entrada da Vila Itamar" (BR de São Luís) numa Volta: o embarque é esse local (issue #419)
  const comEspera = pares.map((p) => {
    if (p.direcao !== "volta" || localDeOutros([p.endereco], ctx.locaisDeOutros)) return p;
    const doDia = falasDoDia(mensagensDoCliente, p.data)
      .map((m) => m.texto)
      .filter((t) => / (esperar|espero|aguardo|aguardar|estarei|vou estar|embarcar|embarco|me pega|pegar) /.test(` ${normalizarTexto(t)} `));
    const local = localDeOutros(doDia.map((t) => semLogradouros(t)), ctx.locaisDeOutros);
    return local ? { ...p, endereco: local } : p;
  });
  const naBr = idaPeloEmbarqueEmSaoLuis(comEspera, ctx.locaisDeOutros, (data) => sentidoDoDiaEscrito(mensagensDoCliente, data));
  if (naBr !== comEspera) evento("bot_volta_na_br_e_ida", { conversa: entrada.chatwootConversationId });
  // "Agendado ☑️ seg Ida Estiva 2P": o que a EQUIPE escreveu na marca vence a leitura (issue #420)
  const marca = opcoes.confirmadoPelaEquipe ? mensagens.find((m) => m.id === entrada.mensagemId) : undefined;
  const dadosMarca = marca
    ? dadosDaMarca(marca.texto, marca.em, { pontosIda: ctx.pontos.ida, bairros: ctx.bairrosTabela, locaisDeOutros: ctx.locaisDeOutros })
    : {};
  const pedidos = aplicarDadosDaMarca(naBr, dadosMarca);
  if (pedidos !== naBr) evento("bot_dados_da_marca", { conversa: entrada.chatwootConversationId, campos: Object.keys(dadosMarca) });
  if (comOPar !== peloDia) evento("bot_outra_viagem_do_par", { conversa: entrada.chatwootConversationId });
  // cliente e equipe na ordem: a resposta do cliente vale para o que a equipe perguntou (issue #320)
  const falasDoPedido = recentes
    .filter((m) => m.quem === "cliente" || m.quem === "equipe")
    .map((m) => ({ quem: m.quem, texto: m.texto, em: m.em }));
  const cidadeDoEndereco = cidadeNaRespostaDoEndereco(falasDoPedido);
  const recusadas = sugestoesRecusadas(falasDoPedido);
  // "A ida é sábado, certo?" → "Isso": vale como dito pelo cliente (issue #335)
  const confirmadas = [...datasConfirmadas(falasDoPedido), ...(dadosMarca.data ? [dadosMarca.data] : [])];

  const jaReservadas = await viagensJaReservadas(cliente?.id ?? null, hoje, simular?.reservasAntesDe);
  const telefone = normalizarTelefone(entrada.telefone);

  const gravados: string[] = [];
  const motivos: string[] = [];
  /** rascunhos que o "Agendado ☑️" não lança sozinho, com o motivo (issues #272 e #286) */
  const incertos = new Map<string, { motivo: string; codigo: string }>();
  /** o que fica faltando confirmar em cada rascunho lançado pelo Agendado (vai para a reserva) */
  const aConfirmar = new Map<string, ItemAConfirmar[]>();
  /** pedidos em que só o cliente sabe se é a Volta de hoje ou a Ida de amanhã (issue #314) */
  const qualViagem = new Set<PedidoExtraido>();
  /** endereço conhecido em Pirapemas/Cantanhede e algo de São Luís também: Ida ou Volta? (issue #419) */
  const ondeEmbarca = new Set<PedidoExtraido>();
  // tudo o que cliente e equipe escreveram (pedido atual e conversas anteriores): prova do bairro
  const textosDaConversa = mensagens.filter((m) => m.quem !== "bot").map((m) => m.texto);
  const formularioDaEquipe = recentes.some((m) => m.quem === "equipe" && /onde voc[eê] vai ficar/i.test(m.texto));
  // o trecho dito decide o sentido só quando há UMA viagem (várias: vale a do dia — issue #419)
  const origemUnica = pedidos.length === 1 ? origem : null;
  // NINGUÉM escreveu o dia (cliente, equipe, marca): a leitura não chuta "amanhã" — fica sem dia e o
  // bot pergunta ao passageiro (issue #419: "guarde uma vaga pra mim" lido como amanhã; era segunda)
  // os dias que a EQUIPE escreveu no pedido atual (sem a própria marca)
  const datasDaEquipe = datasEscritas(
    recentes.filter((m) => m.quem === "equipe" && m.id !== entrada.mensagemId).map((m) => ({ texto: m.texto, em: m.em })),
  );
  const algumDiaEscrito = datasEscritas(mensagensDoCliente).length > 0 || confirmadas.length > 0 || datasDaEquipe.length > 0;
  // o sentido ESCRITO na conversa (não o lido pelo modelo): só ele deixa o Agendado escolher o dia (issue #452)
  const sentidoComprovado =
    dadosMarca.direcao ??
    origemUnica?.sentido ??
    sentidoEscrito(textosDoCliente) ??
    (pontoEscrito(textosDoCliente, ctx.pontos.ida) ? "ida" : null) ??
    // "Cantanhede rua do cajueiro…": o endereço de onde ele sai no interior (issue #504)
    (embarqueNoInteriorEscrito(textosDoCliente) ? "volta" : null);
  // o dia veio da regra "Agendado no dia, antes da viagem sair": a equipe viu a conversa inteira no WhatsApp
  let diaPeloAgendado = false;
  for (const p of pedidos) {
    // confere cada informação da reserva no que o CLIENTE escreveu: completa o que ficou vazio,
    // avisa o que não bate (issue #303)
    const conferido = conferirPeloCliente(p, mensagensDoCliente, {
      hoje,
      pontosIda: ctx.pontos.ida,
      bairros: ctx.bairrosTabela,
      pedidosLidos: pedidos.length,
      origem: origemUnica,
      sentidoDaEquipe: dadosMarca.direcao ?? null,
    });
    Object.assign(p, conferido.pedido);
    if (!algumDiaEscrito && (p.tipo ?? "passagem") !== "encomenda") {
      // "Tem vaga de Cantanhede pra São Luís?" de manhã + "Agendado ☑️" antes da viagem sair = a de hoje (issue #452)
      const proxima = viagemDeHojePeloAgendado(p, {
        agendado: opcoes.confirmadoPelaEquipe,
        hoje,
        horaAgora,
        pontos: ctx.pontos,
        mensagensDoCliente,
        sentidoEscrito: sentidoComprovado,
      });
      if (proxima) {
        if (p.data !== proxima) {
          p.duvida = [p.duvida, `Ninguém escreveu o dia; a equipe marcou o Agendado no dia do pedido: considerei a viagem de hoje, que ainda não tinha saído.`]
            .filter(Boolean)
            .join(" ");
        }
        evento("bot_dia_pelo_agendado", { conversa: entrada.chatwootConversationId, lido: p.data ?? null });
        p.data = proxima;
        diaPeloAgendado = true;
      } else if (p.data) {
        evento("bot_dia_nao_escrito", { conversa: entrada.chatwootConversationId, lido: p.data });
        p.data = null;
      }
    }
    // "mesmo endereço que me deixou hoje": a viagem é no sentido contrário da última (issue #494)
    if (
      (p.tipo ?? "passagem") !== "encomenda" &&
      pedidos.length === 1 &&
      cliente &&
      !origemUnica &&
      !dadosMarca.direcao &&
      !sentidoEscrito(textosDoCliente) &&
      pedeDeOndeDeixou(textosDoCliente)
    ) {
      const de = viagemDeOndeDeixou(textosDoCliente, await viagensRecentes(cliente.id), hoje);
      if (de) {
        if (de.direcao === "volta" && p.direcao !== "volta") {
          p.endereco = p.endereco || p.bairro || null;
          p.bairro = null;
          p.ponto = null;
        }
        p.direcao = de.direcao;
        if (de.cidade) p.cidade_dita = de.cidade;
        p.duvida = [p.duvida, `Embarca onde desceu na última viagem (${de.ultima}): ${de.direcao === "volta" ? "Volta" : "Ida"}. Confira.`].filter(Boolean).join(" ");
        evento("bot_de_onde_deixou", { conversa: entrada.chatwootConversationId, direcao: de.direcao });
      }
    }
    // busca em casa num endereço de Pirapemas/Cantanhede não existe: é a Volta saindo de lá (issue #419)
    if (
      (p.tipo ?? "passagem") !== "encomenda" &&
      p.direcao === "ida" &&
      (!p.ponto || p.ponto === "busca") &&
      !origemUnica &&
      !dadosMarca.direcao
    ) {
      const escrita = pedidos.length === 1 && sentidoEscrito(textosDoCliente) !== "ida" ? cidadeDoEnderecoEscrito(textosDoCliente) : null;
      if (escrita) {
        Object.assign(p, voltaPeloEnderecoDoInterior(p, escrita, `O cliente escreveu o endereço em ${escrita.cidade === "pirapemas" ? "Pirapemas" : "Cantanhede"}`));
        evento("bot_volta_pelo_endereco", { conversa: entrada.chatwootConversationId, fonte: "escrito" });
      } else if (p.endereco && !paradaDoInterior(p.endereco)) {
        // (o nome da cidade no embarque lido costuma ser o DESTINO colado pela leitura: a regra do
        // endereço escrito pelo próprio cliente, acima, é que decide esse caso — issue #426)
        const lugares = await lugaresNasCidades(p.endereco);
        const { data: deSaoLuis } = await supabaseAdmin.rpc("fn_bairro_pelo_endereco", { p_texto: String(p.endereco).slice(0, 300) });
        const decisao = sentidoPeloLugarDoEmbarque({
          lugares,
          bairroDeSaoLuisEscrito: !!bairroEscrito(textosDoCliente, ctx.bairrosTabela),
          lugarDeSaoLuis: !!bairroPelosLugares((deSaoLuis ?? []) as LugarDeSaoLuis[]),
          sentidoEscrito: pedidos.length === 1 ? sentidoEscrito(textosDoCliente) : null,
        });
        if (decisao === "duvida") {
          ondeEmbarca.add(p);
        } else if (decisao) {
          Object.assign(
            p,
            voltaPeloEnderecoDoInterior(
              p,
              { cidade: decisao.cidade, linha: p.endereco },
              `${decisao.nome} só aparece em ${decisao.cidade === "pirapemas" ? "Pirapemas" : "Cantanhede"} (${decisao.reservas} reservas)`,
            ),
          );
        }
        if (decisao) evento("bot_volta_pelo_endereco", { conversa: entrada.chatwootConversationId, fonte: "lugares", decisao: decisao === "duvida" ? "duvida" : "volta" });
      }
    }
    // respondeu o formulário da equipe ("Local de Embarque… Buscar em casa?" / "Onde você vai ficar?
    // (Cidade, Rua…)") com "Buscar em casa" e a leitura deu Volta sem o trecho escrito: a cidade pode
    // ser onde ele vai FICAR — só o passageiro sabe (issue #419)
    if (
      (p.tipo ?? "passagem") !== "encomenda" &&
      p.direcao === "volta" &&
      !origemUnica &&
      !dadosMarca.direcao &&
      !sentidoEscrito(textosDoCliente) &&
      formularioDaEquipe &&
      pontoEscrito(textosDoCliente, ["busca"]) === "busca"
    ) {
      ondeEmbarca.add(p);
      evento("bot_formulario_ambiguo", { conversa: entrada.chatwootConversationId });
    }
    const avisosDoCliente = conferido.avisos;
    // "Na usina, certo?" → "Não": a sugestão da equipe sai do embarque (issue #320)
    if (p.endereco && recusadas.length) {
      const limpo = semSugestoesRecusadas(p.endereco, recusadas);
      if (limpo.tirou.length) {
        p.endereco = limpo.texto || null;
        p.duvida = [p.duvida, `O cliente disse não para "${limpo.tirou.join(", ")}": tirei do embarque.`].filter(Boolean).join(" ");
      }
    }
    // o "desembarque" lido era a resposta à pergunta "te buscamos aonde?": é embarque (issue #320)
    if (p.desembarque && desembarqueEraEmbarque(p.desembarque, falasDoPedido)) {
      p.duvida = [p.duvida, `"${p.desembarque}" respondia onde buscar: é embarque, não desembarque.`].filter(Boolean).join(" ");
      p.endereco = [p.endereco, p.desembarque].filter(Boolean).join(" — ");
      p.desembarque = null;
      evento("bot_resposta_era_embarque", { conversa: entrada.chatwootConversationId });
    }
    // embarque e desembarque escritos na conversa que a leitura deixou vazios ou copiou (issue #523)
    const lugares523 = completarLugares(p, falasDoPedido, {
      pontos: ctx.pontos,
      bairros: ctx.bairrosTabela.map((b) => b.neighborhood),
      sentidos: pedidos.map((x) => x.direcao ?? null),
      temCostume: !!costume?.volta?.route_point_code,
    });
    if (lugares523.length) {
      p.duvida = [...lugares523, p.duvida].filter(Boolean).join(" ");
      evento("bot_lugar_completado", { conversa: entrada.chatwootConversationId, quantos: lugares523.length });
    }
    if (conferido.completados.length || avisosDoCliente.length) {
      evento("bot_pedido_conferido", {
        conversa: entrada.chatwootConversationId,
        completados: conferido.completados.length,
        avisos: avisosDoCliente.length,
      });
    }
    // a Ida de hoje já saiu e a Volta ainda sai: o embarque dito é de Pirapemas/Cantanhede? Então é a
    // Volta de hoje, não a Ida de amanhã (issue #314). Nome que também é bairro de São Luís: pergunta.
    if (
      (p.tipo ?? "passagem") !== "encomenda" &&
      p.data === hoje &&
      (p.direcao === "ida" || (!p.direcao && ctx.pontos.ida.includes(String(p.ponto ?? "").toLowerCase()))) &&
      viagemDeHojeJaSaiu("ida", horaAgora) &&
      !viagemDeHojeJaSaiu("volta", horaAgora) &&
      !cidadeDaVolta(p.cidade_dita)
    ) {
      const onde = [p.endereco, p.bairro].filter(Boolean).join(", ");
      const lugares = onde ? await lugaresNasCidades(onde) : [];
      const decisao = proximaViagemPeloLugar({
        lugares,
        bairroDeSaoLuis: !!bairroDaTabela(p.bairro || p.endereco, ctx.bairrosTabela),
        costumeVolta: !!costume?.volta?.route_point_code,
      });
      if (decisao === "volta") {
        p.direcao = "volta";
        p.ponto = null;
        p.endereco = p.endereco || p.bairro || null;
        p.bairro = null;
        p.duvida = [p.duvida, `A Ida de hoje já tinha saído e ${lugares[0].nome} é de Pirapemas/Cantanhede: é a Volta de hoje.`]
          .filter(Boolean)
          .join(" ");
      } else if (decisao === "qual_viagem") {
        qualViagem.add(p);
      }
      if (decisao) evento("bot_proxima_viagem_pelo_lugar", { conversa: entrada.chatwootConversationId, decisao });
    }
    // a cidade que o cliente escreveu ao responder onde buscar vence a lida (issue #514)
    if (
      cidadeDoEndereco && pedidos.length === 1 && !dadosMarca.cidade && (p.tipo ?? "passagem") !== "encomenda" &&
      p.direcao === "volta" && cidadeDaVolta(p.cidade_dita) !== cidadeDoEndereco
    ) {
      evento("bot_cidade_do_endereco", { conversa: entrada.chatwootConversationId, lida: p.cidade_dita ?? null, cidade: cidadeDoEndereco });
      p.cidade_dita = cidadeDoEndereco;
      p.ponto = null;
    }
    // a cidade escrita pelo PRÓPRIO cliente vale como dita ("de Pirapemas a São Luís"): o leitor às vezes
    // não marca cidade_dita; uma cidade só, com erro de escrita aceito (issue #299)
    if ((p.tipo ?? "passagem") !== "encomenda" && !cidadeDaVolta(p.cidade_dita)) {
      // no trecho copiado ou em QUALQUER mensagem do cliente no pedido (issue #301)
      const escrita = cidadeDaVolta(p.trecho_do_cliente) ?? cidadeEscritaPeloCliente(textosDoCliente);
      const ehVolta = p.direcao === "volta" || ctx.pontos.volta.includes(String(p.ponto ?? "").toLowerCase());
      if (escrita && ehVolta) {
        p.cidade_dita = escrita;
        p.direcao = "volta";
      }
    }
    // Agendado ☑️ numa Volta sem cidade dita: a base de lugares decide se só uma cidade conhece o lugar (issue #286)
    if (opcoes.confirmadoPelaEquipe && (p.tipo ?? "passagem") !== "encomenda" && !cidadeDaVolta(p.cidade_dita)) {
      const direcaoProvavel = p.direcao === "volta" || ctx.pontos.volta.includes(String(p.ponto ?? "").toLowerCase());
      if (direcaoProvavel) {
        const embarque = [p.endereco, p.trecho_do_cliente].filter(Boolean).join(", ");
        const lugares = p.endereco ? await lugaresNasCidades(p.endereco) : [];
        const pelaBase = cidadePelaBase(lugares);
        // senão, TODAS as pistas que o sistema tem: Campestre, base de lugares, reservas e conversas antigas (issue #324)
        const pistas = pelaBase
          ? null
          : cidadeDaVoltaPelasPistas({
            textoDoEmbarque: embarque,
            lugares,
            historico: await cidadesDoHistorico(cliente?.id ?? null),
            textosAntigos: await textosAntigosDoCliente(entrada.conversationId),
          });
        if (pelaBase) {
          p.cidade_dita = pelaBase.cidade;
          p.direcao = "volta";
          p.duvida = [p.duvida, avisoDaCidadePelaBase(pelaBase)].filter(Boolean).join(" ");
        } else if (pistas) {
          p.cidade_dita = pistas.cidade;
          p.direcao = "volta";
          p.duvida = [p.duvida, pistas.aviso].filter(Boolean).join(" ");
          evento("bot_cidade_pelas_pistas", { conversa: entrada.chatwootConversationId, cidade: pistas.cidade });
        } else if (costume?.volta?.route_point_code && ctx.pontos.volta.includes(costume.volta.route_point_code)) {
          // senão, a cidade onde o cliente costuma embarcar (dono, 10/11)
          p.cidade_dita = costume.volta.route_point_code;
          p.direcao = "volta";
          p.duvida = [p.duvida, `Cidade pelo endereço de costume (${costume.volta.route_point_name ?? costume.volta.route_point_code}); o cliente não disse a cidade. Confira.`].filter(Boolean).join(" ");
        }
      }
    }
    const v = validarPedidoExtraido(p, {
      hoje,
      pontos: ctx.pontos,
      areaDoDesembarque: ctx.areaDe,
      horaAgora,
      // o cliente escreveu o dia de hoje: não vira amanhã calado (issue #307)
      hojeDito: datasEscritas(mensagensDoCliente).includes(hoje),
      // "passagem para hoje" sem sentido depois que a viagem saiu = a outra de hoje (issue #387)
      sentidoDito: sentidoEscrito(textosDoCliente),
      costume,
      // passageiro recorrente sem sentido dito: o sentido pelo hábito (issue #416)
      sentidoDoHabito: p.direcao ? null : sentidoPeloHabito(p.data, viagensDoPassageiro, costume),
      agendado: opcoes.confirmadoPelaEquipe,
    });
    if (!v.ok) {
      motivos.push(v.motivo);
      continue;
    }
    const r = v.rascunho;
    let pendencia: { motivo: string; codigo: string } | null = null;
    // busca em casa com o bairro escrito errado ("cohatrc"): o da tabela, com aviso (issue #276)
    const parecido = r.route_point_code === "busca" ? bairroParecido(r.pickup_neighborhood, ctx.bairrosTabela) : null;
    if (parecido) {
      r.notes = [r.notes, `Bairro entendido como ${parecido.bairro.neighborhood} (escrito "${parecido.escrito}"): confira.`]
        .filter(Boolean)
        .join(" ")
        .slice(0, 300);
      r.pickup_neighborhood = parecido.bairro.neighborhood;
    }
    // o endereço do cliente cita outro bairro da tabela que o leitor não usou: vale o escrito (issue #297)
    if (r.route_point_code === "busca") {
      const escrito = bairroEscritoNoEndereco(r.pickup_neighborhood, r.pickup_detail, r.client_excerpt, ctx.bairrosTabela);
      if (escrito) {
        r.notes = [r.notes, `Bairro pelo endereço escrito: ${escrito.neighborhood}${r.pickup_neighborhood ? ` (no lugar de ${r.pickup_neighborhood})` : ""}.`]
          .filter(Boolean)
          .join(" ")
          .slice(0, 300);
        r.pickup_neighborhood = escrito.neighborhood;
      }
    }
    // "Jardim Araçagy, Cohatrac": o bairro é o escrito como pedaço do endereço (issue #426)
    if (r.route_point_code === "busca" && r.pickup_neighborhood) {
      const fora = bairroForaDoNomeComposto(r.pickup_neighborhood, textosDoCliente, ctx.bairrosTabela);
      if (fora) {
        r.notes = [r.notes, `Bairro ${fora.neighborhood} (${r.pickup_neighborhood} era parte do nome do lugar).`].filter(Boolean).join(" ").slice(0, 300);
        r.pickup_neighborhood = fora.neighborhood;
      }
    }
    // bairro sem prova (não escrito, não é o de costume): a leitura chutou — sai e o sistema procura
    // pelo endereço (issue #419: "Condomínio Marsil" lido como Turu)
    if (
      r.route_point_code === "busca" &&
      r.pickup_neighborhood &&
      !bairroTemProva(r.pickup_neighborhood, { textos: textosDaConversa, costume: costume?.ida?.neighborhood ?? null })
    ) {
      evento("bot_bairro_sem_prova", { conversa: entrada.chatwootConversationId, bairro: r.pickup_neighborhood });
      r.notes = [r.notes, `Bairro ${r.pickup_neighborhood} não foi dito na conversa: procurado pelo endereço.`].filter(Boolean).join(" ").slice(0, 300);
      r.pickup_neighborhood = null;
      if (!r.pickup_detail && !v.aConfirmar.includes("endereco")) v.aConfirmar.push("endereco");
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
    // "Cohatrac novo" é o Novo Cohatrac da tabela; o endereço fica como o cliente escreveu (issue #494)
    if (r.route_point_code === "busca" && r.pickup_neighborhood) {
      r.pickup_neighborhood = bairroComoNaTabela(r.pickup_neighborhood, r.pickup_detail, ctx.bairrosTabela) ?? r.pickup_neighborhood;
    }
    // trecho da BR (Estiva, Pedrinhas, Oleama, Maracanã…): a empresa não busca em casa ali — o cliente
    // espera na BR e a van para. Busca em casa num local de "Outros" vira Outros (issue #418)
    if (r.route_point_code === "busca" && ctx.pontos.ida.includes("outro")) {
      const local = localDeOutros([r.pickup_neighborhood, r.pickup_detail], ctx.locaisDeOutros);
      if (local) {
        r.route_point_code = "outro";
        r.pickup_neighborhood = null;
        r.pickup_detail = `${local} (BR)`;
        r.notes = [r.notes, `${local} fica na BR: embarque na BR (Outros), não busca em casa.`].filter(Boolean).join(" ").slice(0, 300);
        const i = v.aConfirmar.indexOf("endereco");
        if (i >= 0) v.aConfirmar.splice(i, 1);
        evento("bot_busca_na_br", { conversa: entrada.chatwootConversationId, local });
      }
    }
    // "vou esperar em frente ao Pátio Norte": lugar da cidade é busca pelo bairro, não Outros (issue #419)
    if (outroPodeSerBusca(r, ctx.locaisDeOutros) && ctx.pontos.ida.includes("busca")) {
      const { data: lugaresSl } = await supabaseAdmin.rpc("fn_bairro_pelo_endereco", { p_texto: String(r.pickup_detail).slice(0, 300) });
      const peloLugar = bairroPelosLugares((lugaresSl ?? []) as LugarDeSaoLuis[]);
      const daTabela = peloLugar ? bairroDaTabela(peloLugar.bairro, ctx.bairrosTabela) : null;
      if (peloLugar && daTabela) {
        r.route_point_code = "busca";
        r.pickup_neighborhood = daTabela.neighborhood;
        r.notes = [r.notes, `${peloLugar.lugar} fica no ${daTabela.neighborhood}: busca pelo bairro, não Outros.`].filter(Boolean).join(" ").slice(0, 300);
        evento("bot_outro_era_busca", { conversa: entrada.chatwootConversationId, bairro: daTabela.neighborhood });
      } else if (pontoEscrito(falasDoDia(mensagensDoCliente, r.trip_date).map((m) => m.texto), ["busca"]) === "busca") {
        // o cliente pediu "buscar em casa": é busca, com o bairro a achar pelo endereço
        r.route_point_code = "busca";
        const deduzido = await resolverBairro(String(r.pickup_detail), entrada.chatwootConversationId);
        r.pickup_neighborhood = deduzido?.bairro ?? null;
        r.notes = [r.notes, "O cliente pediu buscar em casa: busca, não Outros.", deduzido ? avisoDoBairro(String(r.pickup_detail), deduzido) : "Bairro a confirmar."]
          .filter(Boolean)
          .join(" ")
          .slice(0, 300);
        evento("bot_outro_era_busca", { conversa: entrada.chatwootConversationId, bairro: r.pickup_neighborhood });
      }
    }
    // o cliente deu o endereço e o bairro foi achado (tabela, memória, lugares ou internet): a
    // reserva tem endereço e valor; o bairro vai com aviso e na confirmação ao cliente (issue #401)
    if (r.route_point_code === "busca" && bairroDaTabela(r.pickup_neighborhood, ctx.bairrosTabela)) {
      const semMarca = enderecoSemMarcaDeBairro(r.pickup_detail);
      if (semMarca !== r.pickup_detail && semMarca && v.aConfirmar.includes("endereco")) {
        r.pickup_detail = semMarca;
        v.aConfirmar.splice(v.aConfirmar.indexOf("endereco"), 1);
        r.notes = notasSemReservaSemEndereco(r.notes, r.pickup_neighborhood as string);
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
    const reservadasDoDono = outro ? await viagensJaReservadas(dono?.id ?? null, hoje, simular?.reservasAntesDe) : jaReservadas;
    if (reservadasDoDono.has(`${r.trip_date}|${r.direction}`)) {
      motivos.push("ja_reservado");
      continue;
    }
    // já tem reserva no mesmo sentido na véspera: quase sempre é o "amanhã" de ontem relido hoje (issue #286)
    if (reservadasDoDono.has(`${somarDias(r.trip_date, -1)}|${r.direction}`)) {
      if (!opcoes.confirmadoPelaEquipe) {
        motivos.push("ja_viajou_na_vespera");
        continue;
      }
      r.notes = [r.notes, "Já tem reserva no mesmo sentido na véspera: confira se não é repetida."].filter(Boolean).join(" ").slice(0, 300);
      pendencia = { motivo: "o cliente já tem reserva no mesmo sentido na véspera (confira se não é repetida)", codigo: "vespera" };
    }
    if (ondeEmbarca.has(p) && opcoes.confirmadoPelaEquipe) {
      pendencia ??= {
        motivo: "não dá para ter certeza se embarca em São Luís (Ida) ou em Pirapemas/Cantanhede (Volta): perguntei ao passageiro",
        codigo: "onde_embarca",
      };
    }
    if (qualViagem.has(p) && opcoes.confirmadoPelaEquipe) {
      pendencia ??= {
        motivo: "a Ida de hoje já saiu e o endereço existe em São Luís e em Pirapemas/Cantanhede (Volta de hoje ou Ida de amanhã?)",
        codigo: "qual_viagem",
      };
    }
    if (v.cidadeIncerta) {
      pendencia ??= { motivo: "a cidade de embarque (Pirapemas ou Cantanhede) não foi dita na conversa", codigo: "cidade" };
    }
    // o que foi lido contradiz o que o cliente escreveu (issue #303): na 1ª leitura, faz o Agendado reler
    // com o modelo capaz. Na releitura o que sobrou de embarque/bairro vai como "Conferir" na reserva e
    // na confirmação ao cliente; dia, sentido, quantidade e cidade continuam na trava final (issue #401)
    if (opcoes.confirmadoPelaEquipe && avisosDoCliente.length && !opcoes.modelo) {
      pendencia ??= { motivo: `o que foi lido não bate com o que o cliente escreveu: ${avisosDoCliente.join("; ")}`, codigo: "conferir" };
    }
    // o cliente não escreveu o dia e mandou uma mensagem que o bot não lê (editada, enquete…): o dia
    // pode estar nela — não lança na próxima viagem por suposição (issue #417)
    if (
      opcoes.confirmadoPelaEquipe && !datasEscritas(mensagensDoCliente).length && !confirmadas.length &&
      doCliente.some((m) => ehMensagemIlegivel(m.texto))
    ) {
      // a equipe disse UM dia ("só teremos vaga pra amanhã") e marcou depois de ouvir: lança com aviso (issue #478)
      if (diaDitoPelaEquipe(datasDaEquipe, r.trip_date as string | null)) {
        r.notes = [r.notes, AVISO_DIA_DA_EQUIPE].filter(Boolean).join(" ").slice(0, 300);
        evento("bot_dia_da_equipe", { conversa: entrada.chatwootConversationId });
      } else if (diaPeloAgendado && r.trip_date === hoje) {
        // a equipe marcou hoje, antes da viagem sair, depois de ver a mensagem que o bot não lê: a de hoje é a
        // única possível (issue #504, caso 25e85cc1) — lança com aviso para conferir
        r.notes = [r.notes, AVISO_DIA_ILEGIVEL_PELO_AGENDADO].filter(Boolean).join(" ").slice(0, 300);
        evento("bot_dia_ilegivel_pelo_agendado", { conversa: entrada.chatwootConversationId });
      } else {
        pendencia ??= {
          motivo: "o cliente não escreveu o dia e mandou uma mensagem (ou um áudio sem transcrição) que o bot não conseguiu ler: confira o dia no WhatsApp",
          codigo: "dia_ilegivel",
        };
      }
    }
    // O LUGAR DIZ O SENTIDO (dono, 15/11 — issue #426): embarque em São Luís só na Ida, no interior
    // só na Volta; desembarque o contrário. Não combina → não lança calado: pergunta ao passageiro.
    const contraOSentido = lugaresContraOSentido(r, { bairros: ctx.bairrosTabela, locaisDeOutros: ctx.locaisDeOutros });
    if (contraOSentido) {
      evento("bot_lugar_contra_o_sentido", { conversa: entrada.chatwootConversationId, agendado: opcoes.confirmadoPelaEquipe });
      r.notes = [r.notes, `O lugar não combina com o sentido: ${contraOSentido}.`].filter(Boolean).join(" ").slice(0, 300);
      if (opcoes.confirmadoPelaEquipe) pendencia ??= { motivo: contraOSentido, codigo: "onde_embarca" };
    }
    // a quantidade foi falada num áudio, mas veio estragada ("despassar"): não lança com 1 — pergunta (issue #504)
    if (opcoes.confirmadoPelaEquipe && (r.type ?? "passagem") !== "encomenda" && quantidadeIncerta(textosDoCliente)) {
      evento("bot_quantidade_incerta", { conversa: entrada.chatwootConversationId });
      pendencia ??= { motivo: "o cliente falou a quantidade num áudio, mas a transcrição não deixou entender quantas passagens", codigo: "quantidade" };
    }
    // ÚLTIMA trava, com a reserva pronta: as regras acima (dia, cidade, costume) não podem
    // desfazer o que o cliente escreveu sem ninguém ver (issue #309)
    const naoBate = conferenciaFinal(r, mensagensDoCliente, {
      hoje,
      pedidosLidos: pedidos.length,
      cidadeEscrita: dadosMarca.cidade ?? cidadeEscritaPeloCliente(textosDoCliente),
      datasConfirmadas: confirmadas,
      origem: origemUnica,
      sentidoDaEquipe: dadosMarca.direcao ?? null,
    });
    if (naoBate.length) {
      evento("bot_conferencia_final", { conversa: entrada.chatwootConversationId, agendado: opcoes.confirmadoPelaEquipe, nao_bate: naoBate.length });
      r.notes = [r.notes, `Não bate com o cliente: ${naoBate.join("; ")}.`].filter(Boolean).join(" ").slice(0, 300);
      if (opcoes.confirmadoPelaEquipe) {
        pendencia ??= { motivo: `a reserva pronta não bate com o que o cliente escreveu: ${naoBate.join("; ")}`, codigo: "conferir" };
      }
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
    if (simular) {
      // avaliação: guarda o que seria lançado, sem gravar rascunho
      const id = `sim-${planejadas.length + 1}`;
      planejadas.push({ ...linha, id, pendencia, a_confirmar: [...v.aConfirmar] });
      gravados.push(id);
      if (pendencia) incertos.set(id, pendencia);
      continue;
    }
    // um rascunho aberto por conversa, sentido e passageiro: o cliente corrigiu a data? atualiza o mesmo.
    // Duas pessoas na mesma viagem (a cliente e o contato que ela mandou) são dois rascunhos (dono, 10/11).
    let busca = supabaseAdmin
      .from("reservation_drafts")
      .select("id")
      .eq("conversation_id", entrada.conversationId)
      .eq("direction", r.direction)
      .eq("status", "pronta");
    busca = linha.phone ? busca.eq("phone", linha.phone) : busca.is("phone", null);
    // duas viagens no mesmo sentido NESTA leitura (Ida dia 20 e Ida dia 22) são dois rascunhos: a
    // segunda não pode apagar a primeira (issue #401)
    if (gravados.length) busca = busca.not("id", "in", `(${gravados.join(",")})`);
    const { data: aberto } = await busca.order("updated_at", { ascending: false }).limit(1).maybeSingle();
    const { data: salvo, error } = aberto
      ? await supabaseAdmin.from("reservation_drafts").update(linha).eq("id", aberto.id).select("id").single()
      : await supabaseAdmin.from("reservation_drafts").insert(linha).select("id").single();
    if (error) {
      motivos.push("erro_gravar");
      evento("bot_aviso", { aviso: "rascunho_nao_gravado", conversa: entrada.chatwootConversationId, erro: error.message.slice(0, 200) });
    } else {
      gravados.push(salvo.id);
      if (pendencia) incertos.set(salvo.id, pendencia);
      if (v.aConfirmar.length) aConfirmar.set(salvo.id, [...v.aConfirmar]);
    }
  }
  // dia que o cliente pediu e a leitura não trouxe nem já está reservado: pedido de fora (issue #335)
  const soPerguntados = diasSoPerguntados(mensagensDoCliente, pedidos.map((p) => p.data));
  const diasSemPedido = datasSemPedido(
    [...datasEscritas(mensagensDoCliente), ...confirmadas],
    pedidos.map((p) => p.data),
    [...jaReservadas].map((k) => k.split("|")[0]),
    hoje,
  ).filter((d) => !soPerguntados.includes(d));
  if (diasSemPedido.length) evento("bot_dia_sem_pedido", { conversa: entrada.chatwootConversationId, dias: diasSemPedido });
  return { pedidos, gravados, motivos, incertos, aConfirmar, uso, ctx, cliente, hoje, diasSemPedido, planejadas, divergente: lidos.divergente };
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
      cache_lido: r.uso?.cache_read_input_tokens ?? null,
      cache_gravado: r.uso?.cache_creation_input_tokens ?? null,
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
/** Chave idempotente da reserva lançada pelo Agendado: a de quem conversa mantém o formato antigo. */
function chaveDoAgendado(mensagemId: number, direcao: string, telefoneDoRascunho: string | null, telefoneDaConversa: string) {
  const base = `cw-${mensagemId}-agendado-${direcao}`;
  const fone = normalizarTelefone(telefoneDoRascunho ?? "");
  return fone && !variantesTelefone(telefoneDaConversa).includes(fone) ? `${base}-${fone}` : base;
}

export async function lancarPeloAgendado(entrada: Entrada, segundaRodada = false) {
  const conversa = entrada.chatwootConversationId;
  // o cliente pode escrever enquanto esta leitura roda (issue #337): no fim, isso é conferido
  const inicioDaLeitura = new Date().toISOString();
  const lancadas: string[] = [];
  /** criadas AGORA (não as repetidas pela idempotência): vão na confirmação ao cliente (issue #310) */
  const paraConfirmar: ReservaParaConfirmar[] = [];
  let hojeDoAgendado = "";
  let nomeDoCliente: string | null = null;
  const pendentes: string[] = [];
  let lidos = 0;
  let motivosLidos: string[] = [];
  let erro: string | null = null;
  try {
    const { mensagens } = await lerConversa(conversa, Number.MAX_SAFE_INTEGER);
    let lido = await lerEGravar(entrada, mensagens, { confirmadoPelaEquipe: true });
    // ia ficar pendente por falta de leitura? relê com o modelo mais capaz antes de desistir (issue #301)
    if (
      // leituras sem maioria (issue #465): relê com o modelo capaz
      lido.divergente ||
      agendadoPrecisaReler({
        pedidos: lido.pedidos.length,
        motivos: lido.motivos,
        codigosPendentes: [...lido.incertos.values()].map((i) => i.codigo),
        diasSemPedido: lido.diasSemPedido,
      })
    ) {
      evento("bot_agendado_releitura", { conversa, motivos: lido.motivos, pendentes: [...lido.incertos.values()].map((i) => i.codigo) });
      lido = await lerEGravar(entrada, mensagens, { confirmadoPelaEquipe: true, modelo: MODELO_CAPAZ });
    }
    lidos = lido.pedidos.length;
    motivosLidos = lido.motivos;
    // ainda falta um dia que o cliente pediu: não some calado, vira pendência (issue #335)
    if (lido.diasSemPedido.length) pendentes.push("pedido_faltando");
    hojeDoAgendado = lido.hoje;
    nomeDoCliente = lido.cliente?.name ?? null;

    const { data: prontos } = await supabaseAdmin
      .from("reservation_drafts")
      .select("*")
      .eq("conversation_id", entrada.conversationId)
      .eq("status", "pronta")
      .gte("trip_date", lido.hoje);
    if (!prontos?.length) {
      evento("bot_agendado_lancado", { conversa, lancadas: 0, pendentes: ["sem_rascunho"], motivos: lido.motivos });
      // nenhum rascunho (ex.: ninguém escreveu o dia): pergunta ao passageiro o que só ele sabe (issue #457)
      await avisarAgendadoQueFalhou(entrada, avisoDoAgendado({ lancadas: 0, pedidos: lidos, motivos: motivosLidos, pendentes: [] }), {
        pendentes: duvidasDoPassageiro(motivosLidos, []),
        nome: nomeDoCliente,
      });
      return;
    }

    // só o que a leitura FINAL confirmou; o que sobrou de uma leitura anterior vira pendência (issue #387)
    const { lancar, naoConfirmados } = rascunhosDoAgendado(prontos as Bloco[], lido.gravados);
    for (const d of naoConfirmados) {
      await anotarPendencia(d.id, MOTIVO_NAO_CONFIRMADO);
      pendentes.push("nao_confirmado");
    }
    const { data: bot } = await supabaseAdmin.from("users").select("id").eq("name", "Bot WhatsApp").maybeSingle();
    for (const d of lancar) {
      const direcao = d.direction as "ida" | "volta";
      const encomenda = d.type === "encomenda";
      let ponto: Bloco | null = null;
      let preco = 0;
      const pendencia = lido.incertos.get(d.id);
      const falta: ItemAConfirmar[] = [...(lido.aConfirmar.get(d.id) ?? pendenciasAtuais(["endereco", "dia_da_volta"], d.pickup_detail))];
      if (pendencia) {
        await anotarPendencia(d.id, pendencia.motivo);
        pendentes.push(pendencia.codigo);
        continue;
      }
      if (!encomenda) {
        ponto = acharPonto(lido.ctx.pontosCompletos[direcao], d.route_point_code);
        if (!ponto) {
          await anotarPendencia(d.id, "ponto de embarque não reconhecido");
          pendentes.push("ponto");
          continue;
        }
        if (falta.includes("endereco") && direcao === "ida") {
          // Ida sem endereço não tem valor (busca em casa/Outros dependem do local): entra quando o
          // cliente confirmar onde embarca (dono, 10/11). Na Volta o valor é o da cidade.
          preco = 0;
        } else {
          const valor = await valorDoPedido(ponto, {
            bairro: d.pickup_neighborhood,
            endereco: d.pickup_detail,
            // Volta sem desembarque vai para São Luís: embarque numa cidade do caminho pega o trecho (issue #326)
            desembarque: d.dropoff_location ?? (direcao === "volta" && cidadeDoCaminhoNoTexto(d.pickup_detail) ? "São Luís" : ""),
          });
          if (valor.ok) {
            preco = valor.preco;
          } else {
            // o Agendado reserva como está: sem preço na tabela, entra sem valor e fica a confirmar
            preco = 0;
            falta.push("valor");
          }
        }
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
        p_extra_data: { origem: "agendado_equipe", rascunho_id: d.id, ...(falta.length ? { a_confirmar: falta } : {}) },
        // idempotente pela mensagem do Agendado; o 2º passageiro da mesma viagem ganha a própria chave
        p_whatsapp_source_message_id: chaveDoAgendado(entrada.mensagemId, direcao, d.phone, entrada.telefone),
        p_created_by: bot?.id ?? null,
      });
      if (error || !res?.success) {
        const motivo = error?.message ?? res?.message ?? "reserva recusada";
        await anotarPendencia(d.id, motivo);
        pendentes.push(codigoDaRecusa(res?.code, motivo, res?.status));
        continue;
      }
      // o gatilho do banco fecha o rascunho; aqui só conta
      lancadas.push(res.reservation_id);
      if (res.message === "created") {
        const outraPessoa = d.phone && !variantesTelefone(entrada.telefone).includes(normalizarTelefone(d.phone));
        paraConfirmar.push({
          tipo: encomenda ? "encomenda" : "passagem",
          direcao,
          data: d.trip_date,
          pontoCodigo: ponto?.code ?? null,
          // o horário do ponto na data, como na Agenda (issue #432)
          horario: encomenda ? null : horarioDoEmbarque(ponto?.base_time, d.trip_date, direcao, await ajusteDaSegunda()),
          pontoNome: ponto?.name ?? null,
          bairro: d.pickup_neighborhood,
          detalhe: encomenda ? null : d.pickup_detail,
          desembarque: d.dropoff_location,
          quantidade: d.quantity ?? 1,
          aConfirmar: falta,
          passageiro: outraPessoa ? (existente?.name ?? d.customer_name ?? null) : null,
        });
      }
    }
    evento("bot_agendado_lancado", {
      conversa,
      lancadas: lancadas.length,
      pendentes,
      motivos: lido.motivos,
      entrada: lido.uso?.input_tokens ?? null,
      saida: lido.uso?.output_tokens ?? null,
      cache_lido: lido.uso?.cache_read_input_tokens ?? null,
      cache_gravado: lido.uso?.cache_creation_input_tokens ?? null,
    });
  } catch (err) {
    erro = String(err);
    evento("bot_aviso", { aviso: "agendado_falhou", conversa, erro: erro.slice(0, 300) });
  }
  // o cliente confere o que foi reservado (issue #310): é ele quem mais sabe o que pediu
  if (paraConfirmar.length) await confirmarAoCliente(entrada, paraConfirmar, { hoje: hojeDoAgendado, nome: nomeDoCliente });
  // não virou reserva (ou só parte): pendência na aba Pendências + sino, com o motivo (dono, 10/11)
  await avisarAgendadoQueFalhou(
    entrada,
    avisoDoAgendado({ lancadas: lancadas.length, pedidos: lidos, motivos: motivosLidos, pendentes, erro }),
    // sem o dia escrito, quem sabe é o passageiro: pergunta a ele (autorizado pelo dono, 14/11)
    { pendentes: duvidasDoPassageiro(motivosLidos, pendentes), nome: nomeDoCliente },
    !!falhaDoServicoDaIa(erro),
  );
  // a IA recusou ou caiu: a equipe fica sabendo na hora; voltou a ler: o aviso fecha (issue #462)
  await situacaoDaIa(erro);
  // o cliente escreveu DURANTE esta leitura e ficou algo pendente: lê de novo uma vez, agora sem
  // concorrência — o que ele mandou nesses segundos não se perde (issue #337)
  if (!segundaRodada && (pendentes.length > 0 || lidos === 0)) {
    const { count } = await supabaseAdmin
      .from("bot_observations")
      .select("id", { count: "exact", head: true })
      .eq("chatwoot_conversation_id", conversa)
      .eq("author", "cliente")
      .gt("created_at", inicioDaLeitura);
    if (deveLerDeNovoNoFim({ pendentes: pendentes.length, lidos, novasDoCliente: count ?? 0 })) {
      evento("bot_agendado_segunda_rodada", { conversa, pendentes });
      await lancarPeloAgendado(entrada, true);
    }
  }
}

/**
 * Manda ao cliente o resumo do que o Agendado lançou (issue #310). Liga/desliga em
 * `settings.agendado_confirmacao` ({ ativo }), ligado por padrão a pedido do dono.
 * Melhor esforço: falhar aqui nunca desfaz a reserva.
 */
/** Faz ao cliente a pergunta da dúvida pendente ainda não perguntada; devolve o código perguntado. */
async function perguntarAoCliente(
  entrada: Entrada,
  duvidas: { pendentes: string[]; nome: string | null },
  jaPerguntadas: string[],
): Promise<string | null> {
  const pergunta = perguntaAoCliente(duvidas.pendentes, jaPerguntadas, duvidas.nome);
  if (!pergunta) return null;
  // áudio do cliente sem transcrição: a resposta pode estar nele e a equipe já ouviu — não pergunta (issue #480)
  const { data: dele } = await supabaseAdmin
    .from("bot_observations")
    .select("content")
    .eq("chatwoot_conversation_id", entrada.chatwootConversationId)
    .eq("author", "cliente")
    .gte("created_at", new Date(Date.now() - 72 * 3600 * 1000).toISOString());
  if (naoPerguntarPorAudioNaoLido(((dele ?? []) as Bloco[]).map((o) => String(o.content ?? "")))) {
    evento("bot_pergunta_adiada_audio", { conversa: entrada.chatwootConversationId, duvida: pergunta.codigo });
    return null;
  }
  try {
    const { data: cfg } = await supabaseAdmin.from("settings").select("value").eq("key", "agendado_confirmacao").maybeSingle();
    if (cfg?.value?.ativo === false) return null;
    await chatwootClient.postMessage(entrada.chatwootConversationId, pergunta.texto);
    evento("bot_pergunta_ao_cliente", { conversa: entrada.chatwootConversationId, duvida: pergunta.codigo });
    return pergunta.codigo;
  } catch (err) {
    evento("bot_aviso", { aviso: "pergunta_nao_enviada", conversa: entrada.chatwootConversationId, erro: String(err).slice(0, 200) });
    return null;
  }
}

async function confirmarAoCliente(entrada: Entrada, reservas: ReservaParaConfirmar[], ctx: { hoje: string; nome: string | null }) {
  try {
    const { data: cfg } = await supabaseAdmin.from("settings").select("value").eq("key", "agendado_confirmacao").maybeSingle();
    if (cfg?.value?.ativo === false) return;
    const texto = mensagemDeConfirmacao(reservas, { hoje: ctx.hoje || diaCivil(new Date()), nome: ctx.nome });
    if (!texto) return;
    await chatwootClient.postMessage(entrada.chatwootConversationId, texto);
    evento("bot_confirmacao_enviada", { conversa: entrada.chatwootConversationId, reservas: reservas.length });
  } catch (err) {
    evento("bot_aviso", { aviso: "confirmacao_nao_enviada", conversa: entrada.chatwootConversationId, erro: String(err).slice(0, 200) });
  }
}

/**
 * Abre UMA pendência por "Agendado ☑️" (a releitura não repete o aviso) e a resolve sozinha
 * quando a releitura lança tudo. Melhor esforço.
 */
async function avisarAgendadoQueFalhou(
  entrada: Entrada,
  aviso: { assunto: string; detalhe: string } | null,
  duvidas: { pendentes: string[]; nome: string | null } = { pendentes: [], nome: null },
  /** a leitura falhou por erro técnico (serviço da IA): o revisor tenta de novo (issue #462) */
  erroTecnico = false,
) {
  try {
    if (!aviso) {
      // a releitura lançou tudo (o cliente completou depois): a pendência daquele Agendado se resolve sozinha
      await supabaseAdmin
        .from("support_tickets")
        .update({ status: "resolvida", resolved_at: new Date().toISOString() })
        .eq("status", "aberta")
        .eq("meta->>agendado_mensagem_id", String(entrada.mensagemId));
      return;
    }
    const { data: aberta } = await supabaseAdmin
      .from("support_tickets")
      .select("id, meta")
      .eq("status", "aberta")
      .eq("meta->>agendado_mensagem_id", String(entrada.mensagemId))
      .limit(1)
      .maybeSingle();
    // dúvida que só o cliente resolve (qual viagem, cidade): o bot pergunta a ele, uma vez por dúvida;
    // quando ele responde, a releitura do Agendado lança e esta pendência se resolve (issue #314)
    const jaPerguntadas: string[] = Array.isArray(aberta?.meta?.perguntas) ? aberta.meta.perguntas : [];
    const pergunta = await perguntarAoCliente(entrada, duvidas, jaPerguntadas);
    const perguntas = pergunta ? [...jaPerguntadas, pergunta] : jaPerguntadas;
    if (aberta) {
      // a nova tentativa leu a conversa mas ficou pendente por outro motivo: a pendência passa a dizer esse
      if (aberta.meta?.erro_tecnico && !erroTecnico) {
        await supabaseAdmin
          .from("support_tickets")
          .update({ subject: aviso.assunto, detail: aviso.detalhe, meta: { ...aberta.meta, perguntas, erro_tecnico: false } })
          .eq("id", aberta.id);
      } else if (pergunta) {
        await supabaseAdmin.from("support_tickets").update({ meta: { ...aberta.meta, perguntas } }).eq("id", aberta.id);
      }
      return;
    }
    const { data: conv } = await supabaseAdmin
      .from("whatsapp_conversations")
      .select("phone, customer_id")
      .eq("id", entrada.conversationId)
      .maybeSingle();
    const { error } = await supabaseAdmin.rpc("rpc_open_support_ticket", {
      p_subject: aviso.assunto,
      p_detail: aviso.detalhe,
      p_phone: conv?.phone ?? entrada.telefone,
      p_customer_id: conv?.customer_id ?? null,
      p_source: "whatsapp",
      p_meta: {
        conversation_id: entrada.conversationId,
        chatwoot_conversation_id: entrada.chatwootConversationId,
        agendado_mensagem_id: String(entrada.mensagemId),
        perguntas,
        ...(erroTecnico ? { erro_tecnico: true, tentativas: 0 } : {}),
      },
    });
    if (error) throw error;
    evento("bot_agendado_avisado", { conversa: entrada.chatwootConversationId, assunto: aviso.assunto });
    // nota privada na conversa: quem marcou vê na hora que o passageiro ainda não tem lugar (issue #455)
    await chatwootClient
      .postMessage(entrada.chatwootConversationId, notaDoAgendadoQueNaoLancou(aviso), { private: true })
      .catch((err) => evento("bot_aviso", { aviso: "nota_do_agendado", conversa: entrada.chatwootConversationId, erro: String(err).slice(0, 200) }));
  } catch (err) {
    evento("bot_aviso", { aviso: "agendado_nao_avisado", conversa: entrada.chatwootConversationId, erro: String(err).slice(0, 200) });
  }
}

const ASSUNTO_IA_FORA = "IA fora do ar";

/**
 * Aviso único "IA fora do ar" (issue #462): a chave foi recusada ou o serviço caiu. Fecha sozinho
 * na próxima leitura que funcionar. O Agendado que falhou é tentado de novo pelo revisor.
 */
export async function situacaoDaIa(erro: string | null) {
  try {
    const falha = falhaDoServicoDaIa(erro);
    const { data: aberta } = await supabaseAdmin
      .from("support_tickets")
      .select("id")
      .eq("status", "aberta")
      .eq("subject", ASSUNTO_IA_FORA)
      .limit(1)
      .maybeSingle();
    if (!falha) {
      if (aberta && !erro) {
        await supabaseAdmin.from("support_tickets").update({ status: "resolvida", resolved_at: new Date().toISOString() }).eq("id", aberta.id);
        evento("bot_ia_voltou", {});
      }
      return;
    }
    if (aberta) return;
    const { error } = await supabaseAdmin.rpc("rpc_open_support_ticket", {
      p_subject: ASSUNTO_IA_FORA,
      p_detail: falha === "chave"
        ? "A IA recusou a leitura (chave recusada ou sem saldo). O bot tenta de novo os Agendados sozinho; se continuar, confira a chave da Anthropic e o saldo da conta."
        : "O serviço da IA está fora do ar ou sobrecarregado. O bot tenta de novo os Agendados sozinho, de 5 em 5 minutos.",
      p_phone: null,
      p_customer_id: null,
      p_source: "sistema",
      p_meta: { falha, erro: String(erro ?? "").slice(0, 300) },
    });
    if (error) throw error;
    evento("bot_ia_fora_do_ar", { falha });
  } catch (err) {
    evento("bot_aviso", { aviso: "ia_fora_nao_avisado", erro: String(err).slice(0, 200) });
  }
}

/**
 * Agendados que falharam por erro técnico (issue #462): o revisor chama a cada minuto e cada um é
 * tentado de novo de 5 em 5 min, até 5 vezes nas 6 h seguintes. Deu certo, a pendência fecha
 * sozinha (avisarAgendadoQueFalhou com aviso nulo); a reserva é idempotente pela marca.
 */
export async function tentarDeNovoAgendadosQueFalharam(agora = new Date()) {
  const { data: abertas } = await supabaseAdmin
    .from("support_tickets")
    .select("id, meta, created_at")
    .eq("status", "aberta")
    .like("subject", "Agendado ☑️%")
    .eq("meta->>erro_tecnico", "true")
    .gte("created_at", new Date(agora.getTime() - 6 * 3600 * 1000).toISOString())
    .order("created_at")
    .limit(5);
  for (const t of (abertas ?? []) as Bloco[]) {
    const meta = t.meta ?? {};
    const tentativas = Number(meta.tentativas ?? 0);
    const ultima = Date.parse(meta.ultima_tentativa ?? t.created_at);
    if (tentativas >= 5 || agora.getTime() - ultima < 5 * 60 * 1000) continue;
    const mensagemId = Number(meta.agendado_mensagem_id);
    const chatwootConversationId = Number(meta.chatwoot_conversation_id);
    if (!mensagemId || !chatwootConversationId || !meta.conversation_id) continue;
    await supabaseAdmin
      .from("support_tickets")
      .update({ meta: { ...meta, tentativas: tentativas + 1, ultima_tentativa: agora.toISOString() } })
      .eq("id", t.id);
    const { data: conv } = await supabaseAdmin.from("whatsapp_conversations").select("phone").eq("id", meta.conversation_id).maybeSingle();
    evento("bot_agendado_nova_tentativa", { conversa: chatwootConversationId, tentativa: tentativas + 1 });
    await lancarPeloAgendado({ conversationId: meta.conversation_id, chatwootConversationId, mensagemId, telefone: String(conv?.phone ?? "") });
  }
}

/**
 * O cliente completou o pedido logo depois do "Agendado ☑️" (o dia, a quantidade…) e o
 * Agendado não tinha conseguido lançar: tenta de novo (issue #286). Idempotente pela
 * mensagem do Agendado (a reserva nasce com cw-<mensagem>-agendado-<sentido>).
 */
// 4 h: o bot pode ter perguntado ao cliente (issue #314) e a resposta não vem na hora
export async function relerAgendadoPendente(entrada: Omit<Entrada, "mensagemId">, minutos = 240) {
  try {
    const desde = new Date(Date.now() - minutos * 60 * 1000).toISOString();
    const { data: daEquipe } = await supabaseAdmin
      .from("bot_observations")
      .select("chatwoot_message_id, content, created_at")
      .eq("chatwoot_conversation_id", entrada.chatwootConversationId)
      .eq("author", "equipe")
      .gte("created_at", desde)
      .order("created_at", { ascending: false })
      .limit(15);
    const marca = (daEquipe ?? []).find((o: Bloco) => o.chatwoot_message_id && ehMarcaDeAgendado(o.content));
    if (!marca) return;
    const mid = Number(marca.chatwoot_message_id);
    const [{ count: lancadas }, { count: pendentes }, { count: pendencias }] = await Promise.all([
      supabaseAdmin
        .from("reservations")
        .select("id", { count: "exact", head: true })
        .like("whatsapp_source_message_id", `cw-${mid}-agendado-%`),
      supabaseAdmin
        .from("reservation_drafts")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", entrada.conversationId)
        .eq("status", "pronta"),
      supabaseAdmin
        .from("support_tickets")
        .select("id", { count: "exact", head: true })
        .eq("status", "aberta")
        .eq("meta->>agendado_mensagem_id", String(mid)),
    ]);
    // resposta rápida do cliente ("Bgd" 9 s depois) não relê enquanto a 1ª leitura ainda roda: lançava em
    // dobro e mandava duas confirmações (issue #337). Depois, só relê o que ficou pendente.
    const idadeDaMarcaMs = Date.now() - new Date(marca.created_at).getTime();
    if (!deveRelerAgendado({ idadeDaMarcaMs, lancadas: lancadas ?? 0, pendentes: pendentes ?? 0, pendenciaAberta: (pendencias ?? 0) > 0 })) {
      return;
    }
    evento("bot_agendado_relido", { conversa: entrada.chatwootConversationId, lancadas_antes: lancadas ?? 0, pendentes: pendentes ?? 0 });
    await lancarPeloAgendado({ ...entrada, mensagemId: mid });
  } catch (err) {
    evento("bot_aviso", { aviso: "agendado_nao_relido", conversa: entrada.chatwootConversationId, erro: String(err).slice(0, 200) });
  }
}

/**
 * Reserva feita "como está" pelo Agendado ☑️ e o cliente completou depois — o dia da
 * volta (se não for no mesmo dia), o endereço ou a cidade (dono, 10/11). Lê o que ele
 * escreveu depois da reserva e atualiza: muda o dia/ponto, preenche o endereço e o valor
 * (pela tabela, mesma regra do bot). Melhor esforço; nunca derruba o atendimento.
 */
export async function atualizarReservasAConfirmar(entrada: Omit<Entrada, "mensagemId">) {
  const conversa = entrada.chatwootConversationId;
  try {
    const cliente = await whatsappService.identifyCustomer(entrada.telefone);
    if (!cliente) return;
    const hoje = diaCivil(new Date());
    const { data } = await supabaseAdmin
      .from("reservations")
      .select("id, quantity, pickup_detail, pickup_neighborhood, dropoff_location, extra_data, created_at, route_points(code, name), trips!inner(trip_date, direction)")
      .eq("customer_id", cliente.id)
      .is("deleted_at", null)
      .in("status", ["confirmada", "pendente"])
      .gte("trips.trip_date", hoje);
    const abertas: Bloco[] = ((data ?? []) as Bloco[])
      .map((r) => ({ ...r, pendentes: pendenciasAtuais(r.extra_data?.a_confirmar, r.pickup_detail) }))
      .filter((r) => r.pendentes.length && !(r.pendentes.length === 1 && r.pendentes[0] === "valor"));
    if (!abertas.length) return;

    const desde = Math.min(...abertas.map((r) => Date.parse(r.created_at)));
    const { mensagens } = await lerConversa(conversa, Number.MAX_SAFE_INTEGER);
    const depois = mensagens.filter((m) => Date.parse(m.em) > desde);
    if (!depois.some((m) => m.quem === "cliente")) return;

    const rotulo: Record<string, string> = { endereco: "o endereço de embarque", dia_da_volta: "se a volta é mesmo no mesmo dia da ida", valor: "o valor" };
    const lista = abertas
      .map((r, i) => {
        const t = r.trips as Bloco;
        const dia = String(t.trip_date).split("-").reverse().slice(0, 2).join("/");
        return `${i + 1}) ${t.direction === "ida" ? "Ida" : "Volta"} ${dia}, ${r.route_points?.name ?? "local a confirmar"}, embarque: ${r.pickup_detail ?? "-"} — falta confirmar: ${r.pendentes.map((p: string) => rotulo[p] ?? p).join(", ")}`;
      })
      .join("\n");
    const system = instrucoesDaAtualizacao(calendarioParaOPrompt(new Date()), lista);
    const corpo = await chamarFerramenta(system, `CONVERSA DEPOIS DA RESERVA (mais recentes por último):\n${formatarHistorico(depois, 30, 400)}`, FERRAMENTA_ATUALIZACAO);
    const atualizacoes = Array.isArray(corpo?.atualizacoes) ? (corpo.atualizacoes as AtualizacaoLida[]) : [];
    if (!atualizacoes.length) return;

    const ctx = await contexto();
    const { data: bot } = await supabaseAdmin.from("users").select("id").eq("name", "Bot WhatsApp").maybeSingle();
    const feitas: string[] = [];
    for (const a of atualizacoes) {
      const r = abertas[Number(a.reserva) - 1];
      if (!r) continue;
      const t = r.trips as Bloco;
      const direcao = t.direction as "ida" | "volta";
      const plano = planejarAtualizacao(
        { data: t.trip_date, direcao, ponto: r.route_points?.code ?? null, pickupDetail: r.pickup_detail, pendentes: r.pendentes },
        a,
        { hoje, pontos: ctx.pontos },
      );
      if (!plano) continue;
      const pontoFinal = plano.novoPonto ?? r.route_points?.code ?? null;
      if (plano.novaData || plano.novoPonto) {
        const { data: mv, error } = await supabaseAdmin.rpc("rpc_move_reservation", {
          p_reservation_id: r.id,
          p_new_trip_date: plano.novaData ?? t.trip_date,
          p_new_direction: direcao,
          p_new_route_point_code: pontoFinal,
          p_actor: bot?.id ?? null,
        });
        if (error || mv?.success === false) {
          evento("bot_aviso", { aviso: "reserva_nao_movida", conversa, erro: String(error?.message ?? mv?.message).slice(0, 200) });
          continue;
        }
      }
      const detalhes: Record<string, unknown> = {};
      if (plano.pickupDetail !== undefined) detalhes.pickup_detail = plano.pickupDetail;
      if (plano.pickupNeighborhood !== undefined) detalhes.pickup_neighborhood = plano.pickupNeighborhood;
      if (plano.recalcularValor && pontoFinal) {
        const ponto = acharPonto(ctx.pontosCompletos[direcao], pontoFinal);
        const valor = ponto
          ? await valorDoPedido(ponto, {
            bairro: plano.pickupNeighborhood ?? r.pickup_neighborhood,
            endereco: plano.pickupDetail ?? r.pickup_detail,
            desembarque: r.dropoff_location ?? "",
          })
          : null;
        if (valor?.ok) detalhes.unit_price = valor.preco;
        else plano.restante.push("valor");
      }
      const { error: erroEdicao } = await supabaseAdmin.rpc("rpc_edit_reservation", {
        p_reservation_id: r.id,
        p_details: Object.keys(detalhes).length ? detalhes : null,
        p_quantity: null,
        p_contact: null,
        p_move: null,
        p_paid: null,
        p_proof: null,
        p_extra_data: { a_confirmar: [...new Set(plano.restante)] },
        p_status: null,
        p_actor: bot?.id ?? null,
      });
      if (erroEdicao) {
        evento("bot_aviso", { aviso: "reserva_nao_completada", conversa, erro: erroEdicao.message.slice(0, 200) });
        continue;
      }
      feitas.push(plano.novaData ? "dia" : plano.recalcularValor ? "endereco" : "confirmacao");
    }
    if (feitas.length) evento("bot_reserva_completada", { conversa, feitas });
  } catch (err) {
    evento("bot_aviso", { aviso: "reserva_a_confirmar_falhou", conversa, erro: String(err).slice(0, 200) });
  }
}

/** Chama o modelo pequeno obrigando a usar uma ferramenta; devolve o input dela. */
async function chamarFerramenta(system: string, conteudo: string, ferramenta: { name: string }): Promise<Bloco | null> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("Falta ANTHROPIC_API_KEY nos secrets da função.");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODELO,
      max_tokens: 1000,
      system,
      tools: [ferramenta],
      tool_choice: { type: "tool", name: ferramenta.name },
      messages: [{ role: "user", content: conteudo }],
    }),
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) throw new Error(`Falha na leitura: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const corpo = await res.json();
  const bloco = (corpo.content ?? []).find((b: Bloco) => b.type === "tool_use" && b.name === ferramenta.name);
  return bloco?.input ?? null;
}

/**
 * Avaliação com casos reais (issue #419): faz a MESMA leitura do "Agendado ☑️" como a conversa
 * estava no momento da marca, sem gravar nada, inclusive a releitura com o modelo capaz quando o
 * Agendado a faria. Devolve as viagens que seriam lançadas (com a pendência de cada uma).
 */
export async function simularAgendado(c: {
  conversationId: string | null;
  chatwootConversationId: number;
  mensagemId: number;
  telefone: string;
  marcaEm: string;
  modelo?: string;
  /** avaliação: usa a leitura guardada quando o texto é o mesmo (issue #494) */
  memoria?: boolean;
}) {
  // o Agendado lê alguns segundos depois da marca
  const ate = Date.parse(c.marcaEm) + 30_000;
  let mensagens: MensagemDaConversa[];
  try {
    mensagens = converterMensagensDoChatwoot(await mensagensComTranscricoesDoBot(await chatwootClient.listarMensagens(c.chatwootConversationId, 6)));
  } catch {
    const { data } = await supabaseAdmin
      .from("bot_observations")
      .select("author, content, created_at, chatwoot_message_id")
      .eq("chatwoot_conversation_id", c.chatwootConversationId)
      .in("author", ["cliente", "equipe"])
      .order("created_at", { ascending: false })
      .limit(120);
    mensagens = converterObservacoes(data ?? []);
  }
  mensagens = mensagens.filter((m) => Date.parse(m.em) <= ate);
  const entrada: Entrada = {
    conversationId: c.conversationId ?? "",
    chatwootConversationId: c.chatwootConversationId,
    mensagemId: c.mensagemId,
    telefone: c.telefone,
  };
  const simular: SimulacaoDaLeitura = { agora: new Date(ate), reservasAntesDe: c.marcaEm, memoria: c.memoria };
  // c.modelo: avaliar a primeira leitura com outro modelo (issue #421)
  let lido = await lerEGravar(entrada, mensagens, { confirmadoPelaEquipe: true, simular, ...(c.modelo ? { modelo: c.modelo } : {}) });
  let releu = false;
  if (
    lido.divergente ||
    agendadoPrecisaReler({
      pedidos: lido.pedidos.length,
      motivos: lido.motivos,
      codigosPendentes: [...lido.incertos.values()].map((i) => i.codigo),
      diasSemPedido: lido.diasSemPedido,
    })
  ) {
    releu = true;
    lido = await lerEGravar(entrada, mensagens, { confirmadoPelaEquipe: true, modelo: MODELO_CAPAZ, simular });
  }
  return {
    planejadas: lido.planejadas,
    diasSemPedido: lido.diasSemPedido,
    motivos: lido.motivos,
    releu,
    tokens: {
      entrada: lido.uso?.input_tokens ?? 0,
      saida: lido.uso?.output_tokens ?? 0,
      cache_lido: lido.uso?.cache_read_input_tokens ?? 0,
      cache_gravado: lido.uso?.cache_creation_input_tokens ?? 0,
    },
  };
}
