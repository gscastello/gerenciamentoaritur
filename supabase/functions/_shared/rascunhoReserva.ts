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
  somarDias,
  formatarHistorico,
  type MensagemDaConversa,
  bairroEscritoNoEndereco,
} from "./agentePuro.ts";
import { chatwootClient } from "./chatwootClient.ts";
import {
  type AtualizacaoLida,
  FERRAMENTA_ATUALIZACAO,
  instrucoesDaAtualizacao,
  type ItemAConfirmar,
  pendenciasAtuais,
  planejarAtualizacao,
  avisoDaCidadePelaBase,
  avisoDoAgendado,
  avisoDosLugares,
  cidadeDaVolta,
  cidadePelaBase,
  type CostumeDoSentido,
  ehMarcaDeAgendado,
  FERRAMENTA_PEDIDOS,
  instrucoesDaLeitura,
  mensagensRecentesDoCliente,
  type PedidoExtraido,
  pareceTerPedido,
  validarPedidoExtraido,
  agendadoPrecisaReler,
  cidadeEscritaPeloCliente,
  perguntaAoCliente,
  proximaViagemPeloLugar,
  viagemDeHojeJaSaiu,
  cidadeDaVoltaPelasPistas,
  cidadeDoCaminhoNoTexto,
  deveRelerAgendado,
  deveLerDeNovoNoFim,
} from "./rascunhoPuro.ts";
import { mensagemDeConfirmacao, type ReservaParaConfirmar } from "./confirmacaoAoCliente.ts";
import {
  conferenciaFinal,
  conferirPeloCliente,
  datasEscritas,
  desembarqueEraEmbarque,
  semSugestoesRecusadas,
  sugestoesRecusadas,
  datasConfirmadas,
  datasSemPedido,
} from "./pedidoDoCliente.ts";
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
    const brutas = await chatwootClient.listarMensagens(chatwootConversationId, 6);
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

/** Modelo para reler o que o rápido não entendeu (issue #301). */
const MODELO_CAPAZ = Deno.env.get("BOT_RASCUNHO_MODELO_CAPAZ") ?? "claude-sonnet-5-5";

async function lerPedidos(
  system: string,
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
      system: forcado ? system : `${system}\n\nResponda SEMPRE chamando a ferramenta ${FERRAMENTA_PEDIDOS.name} (lista vazia se não houver pedido).`,
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
async function lerEGravar(
  entrada: Entrada,
  mensagens: MensagemDaConversa[],
  opcoes: { confirmadoPelaEquipe: boolean; modelo?: string },
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
  const instrucoesDoCliente = cliente ? await instrucoesDaEquipe(cliente.id) : "";
  const system = instrucoesDaLeitura({
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
  const { pedidos, uso } = await lerPedidos(system, conversa, opcoes.modelo);
  // tudo o que o CLIENTE escreveu no pedido atual (para conferir a cidade da Volta que ele disse)
  const doCliente = recentes.filter((m) => m.quem === "cliente");
  const textosDoCliente = doCliente.map((m) => m.texto);
  const mensagensDoCliente = doCliente.map((m) => ({ texto: m.texto, em: m.em }));
  // cliente e equipe na ordem: a resposta do cliente vale para o que a equipe perguntou (issue #320)
  const falasDoPedido = recentes
    .filter((m) => m.quem === "cliente" || m.quem === "equipe")
    .map((m) => ({ quem: m.quem, texto: m.texto, em: m.em }));
  const recusadas = sugestoesRecusadas(falasDoPedido);
  // "A ida é sábado, certo?" → "Isso": vale como dito pelo cliente (issue #335)
  const confirmadas = datasConfirmadas(falasDoPedido);

  const jaReservadas = await viagensJaReservadas(cliente?.id ?? null, hoje);
  const telefone = normalizarTelefone(entrada.telefone);

  const gravados: string[] = [];
  const motivos: string[] = [];
  /** rascunhos que o "Agendado ☑️" não lança sozinho, com o motivo (issues #272 e #286) */
  const incertos = new Map<string, { motivo: string; codigo: string }>();
  /** o que fica faltando confirmar em cada rascunho lançado pelo Agendado (vai para a reserva) */
  const aConfirmar = new Map<string, ItemAConfirmar[]>();
  /** pedidos em que só o cliente sabe se é a Volta de hoje ou a Ida de amanhã (issue #314) */
  const qualViagem = new Set<PedidoExtraido>();
  for (const p of pedidos) {
    // confere cada informação da reserva no que o CLIENTE escreveu: completa o que ficou vazio,
    // avisa o que não bate (issue #303)
    const conferido = conferirPeloCliente(p, mensagensDoCliente, {
      hoje,
      pontosIda: ctx.pontos.ida,
      bairros: ctx.bairrosTabela,
      pedidosLidos: pedidos.length,
    });
    Object.assign(p, conferido.pedido);
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
      costume,
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
    // já tem reserva no mesmo sentido na véspera: quase sempre é o "amanhã" de ontem relido hoje (issue #286)
    if (reservadasDoDono.has(`${somarDias(r.trip_date, -1)}|${r.direction}`)) {
      if (!opcoes.confirmadoPelaEquipe) {
        motivos.push("ja_viajou_na_vespera");
        continue;
      }
      r.notes = [r.notes, "Já tem reserva no mesmo sentido na véspera: confira se não é repetida."].filter(Boolean).join(" ").slice(0, 300);
      pendencia = { motivo: "o cliente já tem reserva no mesmo sentido na véspera (confira se não é repetida)", codigo: "vespera" };
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
    // o que foi lido contradiz o que o cliente escreveu: o Agendado não lança errado (issue #303)
    if (opcoes.confirmadoPelaEquipe && avisosDoCliente.length) {
      pendencia ??= { motivo: `o que foi lido não bate com o que o cliente escreveu: ${avisosDoCliente.join("; ")}`, codigo: "conferir" };
    }
    // ÚLTIMA trava, com a reserva pronta: as regras acima (dia, cidade, costume) não podem
    // desfazer o que o cliente escreveu sem ninguém ver (issue #309)
    const naoBate = conferenciaFinal(r, mensagensDoCliente, {
      hoje,
      pedidosLidos: pedidos.length,
      cidadeEscrita: cidadeEscritaPeloCliente(textosDoCliente),
      datasConfirmadas: confirmadas,
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
    // um rascunho aberto por conversa, sentido e passageiro: o cliente corrigiu a data? atualiza o mesmo.
    // Duas pessoas na mesma viagem (a cliente e o contato que ela mandou) são dois rascunhos (dono, 10/11).
    let busca = supabaseAdmin
      .from("reservation_drafts")
      .select("id")
      .eq("conversation_id", entrada.conversationId)
      .eq("direction", r.direction)
      .eq("status", "pronta");
    busca = linha.phone ? busca.eq("phone", linha.phone) : busca.is("phone", null);
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
  const diasSemPedido = datasSemPedido(
    [...datasEscritas(mensagensDoCliente), ...confirmadas],
    pedidos.map((p) => p.data),
    [...jaReservadas].map((k) => k.split("|")[0]),
    hoje,
  );
  if (diasSemPedido.length) evento("bot_dia_sem_pedido", { conversa: entrada.chatwootConversationId, dias: diasSemPedido });
  return { pedidos, gravados, motivos, incertos, aConfirmar, uso, ctx, cliente, hoje, diasSemPedido };
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
      await avisarAgendadoQueFalhou(entrada, avisoDoAgendado({ lancadas: 0, pedidos: lidos, motivos: motivosLidos, pendentes: [] }));
      return;
    }

    const { data: bot } = await supabaseAdmin.from("users").select("id").eq("name", "Bot WhatsApp").maybeSingle();
    for (const d of prontos as Bloco[]) {
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
        pendentes.push(res?.code ?? res?.status ?? "recusada");
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
    { pendentes, nome: nomeDoCliente },
  );
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
      if (pergunta) {
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
      },
    });
    if (error) throw error;
    evento("bot_agendado_avisado", { conversa: entrada.chatwootConversationId, assunto: aviso.assunto });
  } catch (err) {
    evento("bot_aviso", { aviso: "agendado_nao_avisado", conversa: entrada.chatwootConversationId, erro: String(err).slice(0, 200) });
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
