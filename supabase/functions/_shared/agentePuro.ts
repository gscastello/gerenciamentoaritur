// supabase/functions/_shared/agentePuro.ts
//
// Regras PURAS do atendente de IA (sem Deno.env, sem rede): histórico da
// conversa em texto, silêncio depois que a equipe responde, validação do pedido
// de reserva, valor total e as travas contra invenção. A parte com I/O fica em
// agente.ts / agenteFerramentas.ts.

import { numerosNaoFundamentados } from "./botGuard.ts";

export type MensagemDaConversa = {
  /** id da mensagem no Chatwoot, quando se sabe */
  id?: number;
  quem: "cliente" | "equipe" | "bot";
  texto: string;
  /** ISO 8601 */
  em: string;
};

/** Mensagem como o Chatwoot devolve (só o que importa aqui). */
export type MensagemBruta = {
  id: number;
  content?: string | null;
  /** 0 = recebida, 1 = enviada, 2 = atividade, 3 = modelo */
  message_type: number;
  private?: boolean;
  /** segundos desde 1970 */
  created_at: number;
  sender?: { type?: string };
  attachments?: unknown[];
};

/** No modo sombra o rascunho do bot fica numa nota privada com este começo. */
export const PREFIXO_DO_RASCUNHO = "🤖 [SOMBRA] Resposta que o bot enviaria:";

/**
 * Chatwoot → conversa que o modelo lê. Ignora atividades e notas privadas, EXCETO
 * o rascunho do bot no modo sombra (vira fala do bot, para ele não se repetir).
 */
export function converterMensagensDoChatwoot(brutas: MensagemBruta[]): MensagemDaConversa[] {
  const saida: MensagemDaConversa[] = [];
  for (const b of brutas) {
    if (b.message_type !== 0 && b.message_type !== 1) continue;
    const conteudo = String(b.content ?? "").trim();
    let quem: MensagemDaConversa["quem"];
    let texto = conteudo;
    if (b.private) {
      if (!conteudo.startsWith(PREFIXO_DO_RASCUNHO)) continue;
      quem = "bot";
      texto = conteudo.slice(PREFIXO_DO_RASCUNHO.length).trim();
    } else if (b.message_type === 0) {
      quem = "cliente";
    } else {
      quem = b.sender?.type === "agent_bot" ? "bot" : "equipe";
    }
    if (!texto && (b.attachments?.length ?? 0) === 0) continue;
    saida.push({ id: b.id, quem, texto, em: new Date(b.created_at * 1000).toISOString() });
  }
  return saida;
}

/** Chegou mensagem de TEXTO do cliente depois desta? Então a mais nova é quem responde. */
export function existeTextoNovoDoCliente(brutas: MensagemBruta[], idAtual: number): boolean {
  return brutas.some(
    (b) => b.id > idAtual && b.message_type === 0 && !b.private && String(b.content ?? "").trim().length > 0,
  );
}

export const FUSO = "America/Fortaleza";
export const MAX_PASSAGENS_POR_PEDIDO = 10;
export const SILENCIO_APOS_EQUIPE_MIN = 10;

const ROTULO: Record<MensagemDaConversa["quem"], string> = {
  cliente: "CLIENTE",
  equipe: "ATENDENTE (humano da equipe)",
  bot: "VOCÊ (atendente virtual)",
};

const fmtDiaHora = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO,
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const fmtDia = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Dia civil (YYYY-MM-DD) de um instante, no fuso da operação. */
export function diaCivil(instante: Date): string {
  return fmtDia.format(instante);
}

/** "terça-feira, 03/11/2026" a partir de um YYYY-MM-DD. */
export function diaPorExtenso(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d, 12));
  const semana = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "long" }).format(dt);
  return `${semana}, ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${a}`;
}

/** Soma dias a um YYYY-MM-DD (calendário, sem fuso). */
export function somarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d, 12));
  dt.setUTCDate(dt.getUTCDate() + dias);
  return dt.toISOString().slice(0, 10);
}

/** Linhas de "quando é hoje" para o prompt: hoje, amanhã e os próximos 6 dias. */
export function calendarioParaOPrompt(agora: Date): string {
  const hoje = diaCivil(agora);
  const hora = new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(agora);
  const linhas = [`Agora são ${hora} de ${diaPorExtenso(hoje)} (horário de São Luís).`];
  for (let i = 1; i <= 7; i++) {
    const dia = somarDias(hoje, i);
    linhas.push(`${i === 1 ? "Amanhã" : `Daqui a ${i} dias`}: ${diaPorExtenso(dia)} (${dia})`);
  }
  return linhas.join("\n");
}

/** Conversa em texto corrido para o modelo: mais recentes por último, com dia e hora. */
export function formatarHistorico(mensagens: MensagemDaConversa[], max = 40, maxCharsPorMensagem = 700): string {
  const ordenadas = [...mensagens].sort((a, b) => a.em.localeCompare(b.em)).slice(-max);
  return ordenadas
    .map((m) => {
      const quando = fmtDiaHora.format(new Date(m.em)).replace(",", "");
      const texto = m.texto.replace(/\s+/g, " ").trim().slice(0, maxCharsPorMensagem);
      return `[${quando}] ${ROTULO[m.quem]}: ${texto || "[anexo sem texto]"}`;
    })
    .join("\n");
}

/** A equipe respondeu há pouco? Então o bot não atropela (silêncio de 10 min). */
export function equipeRespondeuRecentemente(
  mensagens: MensagemDaConversa[],
  agora: Date,
  minutos = SILENCIO_APOS_EQUIPE_MIN,
): boolean {
  const limite = agora.getTime() - minutos * 60 * 1000;
  return mensagens.some((m) => m.quem === "equipe" && new Date(m.em).getTime() >= limite);
}

/** O bot só responde quando a última palavra foi do cliente. */
export function ultimaFoiDoCliente(mensagens: MensagemDaConversa[]): boolean {
  if (mensagens.length === 0) return false;
  const ultima = [...mensagens].sort((a, b) => a.em.localeCompare(b.em)).at(-1);
  return ultima?.quem === "cliente";
}

export type PedidoDeReserva = {
  data?: unknown;
  direcao?: unknown;
  ponto?: unknown;
  quantidade?: unknown;
  nome_cliente?: unknown;
  bairro?: unknown;
  endereco_embarque?: unknown;
  desembarque?: unknown;
  forma_pagamento?: unknown;
  cliente_confirmou?: unknown;
};

export type PedidoValidado = {
  data: string;
  direcao: "ida" | "volta";
  ponto: string;
  quantidade: number;
  nomeCliente: string | null;
  bairro: string | null;
  enderecoEmbarque: string | null;
  desembarque: string;
  formaPagamento: "dinheiro" | "pix";
};

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
const texto = (v: unknown) => String(v ?? "").trim();

/** Confere o pedido antes de qualquer gravação: o que faltar volta como erro para o modelo perguntar. */
export function validarPedidoDeReserva(
  p: PedidoDeReserva,
  hoje: string,
): { ok: true; pedido: PedidoValidado } | { ok: false; erros: string[] } {
  const erros: string[] = [];
  const data = texto(p.data);
  if (!RE_DATA.test(data)) erros.push("data inválida (use AAAA-MM-DD)");
  else if (data < hoje) erros.push("a data já passou");
  const direcao = texto(p.direcao).toLowerCase();
  if (direcao !== "ida" && direcao !== "volta") erros.push("direcao deve ser ida ou volta");
  const ponto = texto(p.ponto);
  if (!ponto) erros.push("falta o ponto de embarque");
  const quantidade = Number(p.quantidade);
  if (!Number.isInteger(quantidade) || quantidade < 1) erros.push("quantidade deve ser um inteiro de 1 em diante");
  else if (quantidade > MAX_PASSAGENS_POR_PEDIDO) {
    erros.push(`mais de ${MAX_PASSAGENS_POR_PEDIDO} passagens num pedido só a equipe resolve (chame o atendente)`);
  }
  const desembarque = texto(p.desembarque);
  if (desembarque.length < 2) erros.push("falta o local de desembarque");
  const pagamento = texto(p.forma_pagamento || "dinheiro").toLowerCase();
  if (pagamento !== "dinheiro" && pagamento !== "pix") erros.push("forma_pagamento deve ser dinheiro ou pix");
  const nome = texto(p.nome_cliente);
  if (nome && nome.length < 3) erros.push("nome do cliente curto demais");
  if (p.cliente_confirmou !== true) erros.push("o cliente ainda não confirmou o resumo do pedido");
  if (erros.length > 0) return { ok: false, erros };
  return {
    ok: true,
    pedido: {
      data,
      direcao: direcao as "ida" | "volta",
      ponto,
      quantidade,
      nomeCliente: nome || null,
      bairro: texto(p.bairro) || null,
      enderecoEmbarque: texto(p.endereco_embarque) || null,
      desembarque,
      formaPagamento: pagamento as "dinheiro" | "pix",
    },
  };
}

/** Total em reais com duas casas (o preço unitário SEMPRE vem do banco). */
export function calcularTotal(precoUnitario: number, quantidade: number): number {
  return Math.round(precoUnitario * quantidade * 100) / 100;
}

const RE_AFIRMA_RESERVA =
  /\b(reserva|reservei|reservad[oa]s?|passagem|passagens|vaga)\b[^.!?\n]{0,60}\b(confirmad[oa]s?|garantid[oa]s?|feit[oa]s?|cancelad[oa]s?|remarcad[oa]s?|registrad[oa]s?)\b|\b(confirmei|garanti|cancelei|remarquei|registrei|fiz)\b[^.!?\n]{0,40}\b(reserva|passagem|passagens|vaga)\b/i;

/** A resposta diz que mexeu numa reserva? Só pode se uma ferramenta de escrita deu certo neste turno. */
export function afirmaTerMexidoEmReserva(textoDaResposta: string): boolean {
  return RE_AFIRMA_RESERVA.test(textoDaResposta);
}

/** Não deixa a resposta citar telefone ou identificador interno. */
export function contemDadoInterno(textoDaResposta: string): boolean {
  return /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i.test(textoDaResposta);
}

const NUMEROS_POR_EXTENSO: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
};

/**
 * "duas passagens" → "2": o cliente escreve por extenso e o atendente responde com
 * dígito; sem isto a trava de números barraria uma resposta correta.
 */
export function numerosPorExtenso(texto: string): string {
  const palavras = texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .split(/[^a-z]+/);
  const achados = new Set<number>();
  for (const w of palavras) if (w in NUMEROS_POR_EXTENSO) achados.add(NUMEROS_POR_EXTENSO[w]);
  return [...achados].join(" ");
}

type ObservacaoDoBanco = { author: string; content: string; created_at: string; chatwoot_message_id: number | null };

/** Plano B do histórico: as observações gravadas pelo próprio bot (cliente, equipe, bot e rascunho). */
export function converterObservacoes(obs: ObservacaoDoBanco[]): MensagemDaConversa[] {
  return obs
    .map((o): MensagemDaConversa | null => {
      const texto = String(o.content ?? "").trim();
      if (!texto) return null;
      const quem = o.author === "cliente" ? "cliente" : o.author === "equipe" ? "equipe" : "bot";
      return { id: o.chatwoot_message_id ?? undefined, quem, texto, em: new Date(o.created_at).toISOString() };
    })
    .filter((m): m is MensagemDaConversa => m !== null)
    .sort((a, b) => a.em.localeCompare(b.em));
}

/**
 * Motivos pelos quais a resposta NÃO pode ser enviada. Vazio = pode enviar.
 * `fontes`: informações da empresa, calendário, o que o cliente escreveu e o resultado
 * das ferramentas — só números dali valem.
 */
export function problemasDaResposta(
  texto: string,
  fontes: string[],
  estado: { mexeuEmReserva: boolean; consultouReservas: boolean },
): string[] {
  const problemas: string[] = [];
  const invencionices = numerosNaoFundamentados(texto, fontes);
  if (invencionices.length > 0) {
    problemas.push(
      `Você citou números que não vieram das ferramentas, das informações da empresa nem do cliente: ${invencionices.join(", ")}. Consulte a ferramenta certa (consultar_viagem, listar_pontos_e_precos, calcular_valor, ver_minhas_reservas) e use só os dados dela, ou tire o número.`,
    );
  }
  if (afirmaTerMexidoEmReserva(texto) && !estado.mexeuEmReserva && !estado.consultouReservas) {
    problemas.push(
      "Você afirmou que uma reserva foi confirmada/feita/cancelada/remarcada, mas nenhuma ferramenta de reserva deu certo neste atendimento. Só afirme depois do resultado da ferramenta; se ainda falta confirmação do cliente, peça-a.",
    );
  }
  if (contemDadoInterno(texto)) problemas.push("Não escreva identificadores internos (códigos longos) para o cliente.");
  if (texto.length > 1500) problemas.push("Resposta longa demais para o WhatsApp: resuma em poucas frases.");
  return problemas;
}

const normalizar = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * O texto que o cliente escreveu bate com algum local de desembarque cadastrado?
 * ("Retorno do Aeroporto" → retorno). Compara palavras inteiras, sem acento; o
 * nome mais específico vence. Sem correspondência, devolve null (o texto livre fica).
 */
export function areaDoDesembarque(texto: string, areas: { code: string; label: string }[]): string | null {
  const alvo = ` ${normalizar(texto)} `;
  if (alvo.trim() === "") return null;
  let melhor: { code: string; tamanho: number } | null = null;
  for (const a of areas) {
    for (const candidato of [normalizar(a.label), normalizar(a.code.replace(/_/g, " "))]) {
      if (candidato && alvo.includes(` ${candidato} `) && (!melhor || candidato.length > melhor.tamanho)) {
        melhor = { code: a.code, tamanho: candidato.length };
      }
    }
  }
  return melhor?.code ?? null;
}

/**
 * O cliente deu o nome completo e o cadastro tem só um nome, um apelido ou um
 * "Passageiro (…)" da equipe? Então o cadastro passa a ter o nome completo.
 * Nunca troca um nome por outro diferente.
 */
export function nomeDeveSerCompletado(atual: string | null | undefined, novo: string | null | undefined): boolean {
  const n = normalizar(novo ?? "");
  if (n.split(" ").filter(Boolean).length < 2) return false;
  const a = normalizar(atual ?? "");
  if (!a) return true;
  if (/^passageiro\b/.test(a)) return true;
  if (a === n) return false;
  const pa = a.split(" ");
  const pn = n.split(" ");
  return pn.length > pa.length && pa.every((p) => pn.includes(p));
}

type CostumeDoBanco = {
  fonte?: string;
  vezes?: number | null;
  route_point_code?: string | null;
  route_point_name?: string | null;
  neighborhood?: string | null;
  detail?: string | null;
  dropoff_location?: string | null;
} | null;

function costumeParaOModelo(c: CostumeDoBanco) {
  if (!c?.route_point_code) return null;
  const vezes = Number(c.vezes) || 0;
  return {
    origem:
      c.fonte === "manual"
        ? "fixado pela equipe"
        : vezes > 1
          ? `visto ${vezes} vezes no histórico`
          : "última viagem do cliente",
    ponto: c.route_point_name ?? c.route_point_code,
    codigo_do_ponto: c.route_point_code,
    bairro: c.neighborhood ?? null,
    endereco_de_embarque: c.detail ?? null,
    desembarque: c.dropoff_location ?? null,
  };
}

/**
 * O que a ferramenta endereco_de_costume devolve ao modelo: por sentido o local de
 * costume do cliente (sem NENHUM valor — o preço sai da tabela na hora de gravar) e o
 * sentido que a viagem seguinte provavelmente tem (o oposto da última).
 */
export function costumeParaFerramenta(r: {
  ida?: CostumeDoBanco;
  volta?: CostumeDoBanco;
  sentido_sugerido?: string | null;
}) {
  const ida = costumeParaOModelo(r.ida ?? null);
  const volta = costumeParaOModelo(r.volta ?? null);
  const sugerido = r.sentido_sugerido === "ida" || r.sentido_sugerido === "volta" ? r.sentido_sugerido : null;
  return {
    ok: true,
    cliente_cadastrado: true,
    tem_endereco_de_costume: Boolean(ida || volta),
    sentido_provavel: sugerido,
    ida,
    volta,
  };
}
