// supabase/functions/_shared/agentePuro.ts
//
// Regras PURAS do atendente de IA (sem Deno.env, sem rede): histórico da
// conversa em texto, silêncio depois que a equipe responde, validação do pedido
// de reserva, valor total e as travas contra invenção. A parte com I/O fica em
// agente.ts / agenteFerramentas.ts.

import { numerosNaoFundamentados } from "./botGuard.ts";
import { nomeParecidoNoTexto } from "./grafia.ts";
import { textoComContatos } from "./chatwootPayload.ts";

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

/** Teste do dono (nota "#testar", issue #278): a resposta fica numa nota com este começo e não entra no histórico. */
export const PREFIXO_DO_TESTE = "🧪 [TESTE] Resposta que o bot daria:";

/**
 * Chatwoot → conversa que o modelo lê. Ignora atividades e notas privadas, EXCETO
 * o rascunho do bot no modo sombra (vira fala do bot, para ele não se repetir).
 */
export function converterMensagensDoChatwoot(brutas: MensagemBruta[]): MensagemDaConversa[] {
  const saida: MensagemDaConversa[] = [];
  for (const b of brutas) {
    if (b.message_type !== 0 && b.message_type !== 1) continue;
    // card de contato (issue #268) entra como texto: é o número do passageiro
    const conteudo = textoComContatos(String(b.content ?? ""), b.attachments) ?? "";
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
  formaPagamento: "dinheiro" | "pix" | "cartao";
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
  if (pagamento !== "dinheiro" && pagamento !== "pix" && pagamento !== "cartao") {
    erros.push("forma_pagamento deve ser dinheiro, pix ou cartao");
  }
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
      formaPagamento: pagamento as PedidoValidado["formaPagamento"],
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

export type BlocoDoSistema = { type: "text"; text: string; cache_control?: { type: "ephemeral" } };

/**
 * Instruções do modelo com cache de prompt. O cache só reaproveita um início idêntico,
 * byte a byte (ferramentas + bloco estável). O que muda a cada minuto ou por cliente vai
 * no bloco variável, depois do ponto de cache; antes dele, nada seria reaproveitado.
 */
export function blocosDoSistema(estavel: string[], variavel: string[]): BlocoDoSistema[] {
  const juntar = (partes: string[]) => partes.filter(Boolean).join("\n\n");
  const blocos: BlocoDoSistema[] = [{ type: "text", text: juntar(estavel), cache_control: { type: "ephemeral" } }];
  const resto = juntar(variavel);
  if (resto) blocos.push({ type: "text", text: resto });
  return blocos;
}

export type UsoDoModelo = { entrada: number; saida: number; cacheEscrita: number; cacheLeitura: number };
export const USO_ZERADO: UsoDoModelo = { entrada: 0, saida: 0, cacheEscrita: 0, cacheLeitura: 0 };

/** Acumula o `usage` da API. `entrada` é só o que não veio do cache: cada tipo tem seu preço. */
export function somarUso(
  total: UsoDoModelo,
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  } | null,
): UsoDoModelo {
  return {
    entrada: total.entrada + Number(usage?.input_tokens ?? 0),
    saida: total.saida + Number(usage?.output_tokens ?? 0),
    cacheEscrita: total.cacheEscrita + Number(usage?.cache_creation_input_tokens ?? 0),
    cacheLeitura: total.cacheLeitura + Number(usage?.cache_read_input_tokens ?? 0),
  };
}

const citaLugar = (texto: string | null | undefined, lugar: string) => {
  const t = normalizar(texto ?? "");
  const l = normalizar(lugar);
  if (!t || !l) return false;
  // "Miranda do Norte" cita Miranda; e "Matões" cita o trecho cadastrado como "Matões do Norte"
  return ` ${t} `.includes(` ${l} `) || (t.length >= 4 && ` ${l} `.includes(` ${t} `));
};

export type Trecho = { origem: string; destino: string; price: number | string };

/**
 * O trecho da tabela que liga onde o cliente sobe a onde ele desce, nos dois sentidos.
 * Com mais de um candidato, vence o mais específico.
 */
export function trechoDoPedido(
  embarques: (string | null | undefined)[],
  desembarque: string | null | undefined,
  trechos: Trecho[],
): Trecho | null {
  const sobe = (lugar: string) => embarques.some((e) => citaLugar(e, lugar));
  let melhor: Trecho | null = null;
  for (const t of trechos) {
    const liga =
      (sobe(t.origem) && citaLugar(desembarque, t.destino)) || (sobe(t.destino) && citaLugar(desembarque, t.origem));
    if (liga && (!melhor || t.origem.length + t.destino.length > melhor.origem.length + melhor.destino.length)) {
      melhor = t;
    }
  }
  return melhor;
}

/** O bairro da tabela citado no texto ("Cohatrac Condomínio X" é Cohatrac); o nome mais longo vence. */
export function bairroDaTabela<T extends { neighborhood: string }>(
  texto: string | null | undefined,
  tabela: T[],
): T | null {
  const t = ` ${normalizar(texto ?? "")} `;
  let melhor: T | null = null;
  for (const b of tabela) {
    const nome = normalizar(b.neighborhood);
    if (nome && t.includes(` ${nome} `) && (!melhor || nome.length > normalizar(melhor.neighborhood).length)) melhor = b;
  }
  return melhor;
}

export type PontoDoCronograma = { lugar: string; apelidos?: string[]; de: string; ate?: string };
export type Cronograma = { ida: PontoDoCronograma[]; volta: PontoDoCronograma[] };

/** Horários da rota passados pelo dono (2026-11-09). `de` é o começo da janela; `ate`, quando ele disse. */
export const CRONOGRAMA_PADRAO: Cronograma = {
  ida: [
    { lugar: "Busca em casa (bairros de São Luís)", apelidos: ["busca", "buscar em casa", "em casa"], de: "05:00" },
    { lugar: "Rodoviária", de: "05:40" },
    { lugar: "Posto Carone", apelidos: ["postocarone", "carone"], de: "05:40" },
    { lugar: "Retorno", apelidos: ["retorno das vans"], de: "06:00" },
    { lugar: "BR", apelidos: ["br 135"], de: "06:30" },
    { lugar: "Bacabeira", de: "07:00" },
    { lugar: "Santa Rita", de: "07:00" },
    { lugar: "Entroncamento", de: "07:30" },
    { lugar: "Miranda do Norte", apelidos: ["miranda"], de: "08:00" },
    { lugar: "Matões do Norte", apelidos: ["matoes"], de: "08:30" },
    { lugar: "Cantanhede (chegada)", apelidos: ["cantanhede"], de: "09:00" },
  ],
  volta: [
    { lugar: "Pirapemas", de: "12:00" },
    { lugar: "Cantanhede", de: "13:00" },
    { lugar: "Campestre", de: "13:00" },
    { lugar: "Matões do Norte", apelidos: ["matoes"], de: "14:00" },
    { lugar: "Miranda do Norte", apelidos: ["miranda"], de: "14:00" },
    { lugar: "Entroncamento", de: "15:00" },
    { lugar: "Bacabeira", de: "15:30", ate: "16:00" },
    { lugar: "São Luís (chegada)", apelidos: ["sao luis"], de: "16:30", ate: "17:00" },
  ],
};

const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const minutos = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const hhmmDe = (min: number) => {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

function pontosValidos(lista: unknown): PontoDoCronograma[] | null {
  if (!Array.isArray(lista) || lista.length === 0) return null;
  const ok = lista.every(
    (p) =>
      typeof p?.lugar === "string" &&
      p.lugar.trim().length >= 2 &&
      RE_HORA.test(String(p?.de ?? "")) &&
      (p.ate === undefined || RE_HORA.test(String(p.ate))),
  );
  return ok ? (lista as PontoDoCronograma[]) : null;
}

/** O cronograma salvo em settings, se estiver bem formado; senão o padrão. */
export function cronogramaValido(salvo: unknown): Cronograma {
  const s = salvo as { ida?: unknown; volta?: unknown } | null;
  return {
    ida: pontosValidos(s?.ida) ?? CRONOGRAMA_PADRAO.ida,
    volta: pontosValidos(s?.volta) ?? CRONOGRAMA_PADRAO.volta,
  };
}

/** Na segunda-feira a ida sai mais cedo em todos os pontos; a volta não muda. */
function pontosDoDia(c: Cronograma, direcao: "ida" | "volta", data: string, ajusteSegundaHoras: number) {
  const [a, m, d] = data.split("-").map(Number);
  const segunda = new Date(Date.UTC(a, m - 1, d, 12)).getUTCDay() === 1;
  const atraso = direcao === "ida" && segunda ? -ajusteSegundaHoras * 60 : 0;
  return c[direcao].map((p) => ({
    ...p,
    de: hhmmDe(minutos(p.de) + atraso),
    ate: p.ate ? hhmmDe(minutos(p.ate) + atraso) : undefined,
  }));
}

/** O ponto do cronograma citado no primeiro texto que bater (endereço antes do ponto de embarque). */
export function lugarNoCronograma(
  pontos: PontoDoCronograma[],
  textos: (string | null | undefined)[],
): PontoDoCronograma | null {
  for (const texto of textos) {
    const t = ` ${normalizar(texto ?? "")} `;
    if (!t.trim()) continue;
    const achado = pontos.find((p) =>
      [p.lugar, ...(p.apelidos ?? [])].some((n) => {
        const nome = normalizar(n);
        return nome && t.includes(` ${nome} `);
      }),
    );
    if (achado) return achado;
  }
  return null;
}

/** Folga depois do fim da janela antes de dizer que já devíamos ter passado. */
const FOLGA_MIN = 30;

export type SituacaoDaViagem =
  | "programada"
  | "ainda_nao_saiu"
  | "em_rota_a_caminho"
  | "em_rota_passando"
  | "passou_do_previsto"
  | "viagem_encerrada";

/**
 * Andamento da viagem só pela ESTIMATIVA do cronograma (pedido do dono): a janela do
 * lugar do cliente e, pelo relógio de São Luís, se ainda não saímos, se já estamos em
 * rota a caminho, passando por lá agora, ou se já passou do previsto. Nunca diz onde a
 * van está.
 */
export function andamentoPeloHorario({
  cronograma,
  direcao,
  data,
  agora,
  textos,
  ajusteSegundaHoras = 0,
}: {
  cronograma: Cronograma;
  direcao: "ida" | "volta";
  data: string;
  agora: Date;
  textos: (string | null | undefined)[];
  ajusteSegundaHoras?: number;
}) {
  const pontos = pontosDoDia(cronograma, direcao, data, ajusteSegundaHoras);
  const inicio = pontos[0].de;
  const ultimo = pontos[pontos.length - 1];
  const chegada = { de: ultimo.de, ate: ultimo.ate ?? ultimo.de };
  const ponto = lugarNoCronograma(pontos, textos);
  const janela = ponto
    ? {
        de: ponto.de,
        ate: ponto.ate ?? pontos.find((p) => minutos(p.de) > minutos(ponto.de))?.de ?? hhmmDe(minutos(ponto.de) + 60),
      }
    : null;

  const hoje = diaCivil(agora);
  const agoraMin = minutos(
    new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(agora),
  );
  let situacao: SituacaoDaViagem;
  if (data > hoje) situacao = "programada";
  else if (data < hoje || agoraMin > minutos(chegada.ate) + 60) situacao = "viagem_encerrada";
  else if (agoraMin < minutos(inicio)) situacao = "ainda_nao_saiu";
  else if (!janela) situacao = agoraMin <= minutos(chegada.ate) ? "em_rota_a_caminho" : "viagem_encerrada";
  else if (agoraMin < minutos(janela.de)) situacao = "em_rota_a_caminho";
  else if (agoraMin <= minutos(janela.ate) + FOLGA_MIN) situacao = "em_rota_passando";
  else situacao = "passou_do_previsto";

  return {
    direcao,
    data,
    agora: hhmmDe(agoraMin),
    lugar: ponto?.lugar ?? null,
    janela,
    inicio_da_viagem: inicio,
    chegada_prevista: chegada,
    situacao,
    horarios: pontos.map((p) => `${p.lugar}: ${p.ate ? `${p.de} às ${p.ate}` : `a partir de ${p.de}`}`),
  };
}

/** O cronograma em texto, para as INFORMAÇÕES do prompt (e para a trava de números). */
export function cronogramaParaTexto(c: Cronograma, ajusteSegundaHoras = 0): string {
  const linha = (p: PontoDoCronograma) => `${p.lugar} ${p.ate ? `de ${p.de} às ${p.ate}` : `a partir de ${p.de}`}`;
  const partes = [
    "HORÁRIOS PREVISTOS EM CADA LUGAR (cronograma do dono; é estimativa, vale sobre o horário do ponto):",
    `- Ida (sai de São Luís): ${c.ida.map(linha).join("; ")}.`,
    `- Volta (para São Luís): ${c.volta.map(linha).join("; ")}.`,
  ];
  if (ajusteSegundaHoras > 0) {
    partes.push(`- Na segunda-feira a ida sai ${ajusteSegundaHoras} hora(s) mais cedo em todos os pontos; a volta não muda.`);
  }
  return partes.join("\n");
}

export type LocalDeOutros = { local: string; price: number | string };

/**
 * Preço próprio de um local da categoria Outros (issue #263): o embarque DENTRO do
 * aeroporto custa diferente. Compara palavras inteiras, sem acento; o nome mais longo
 * vence. Texto que fala em "retorno" NUNCA conta: "retorno do aeroporto" é o ponto
 * Retorno, não o aeroporto (regra do dono). Sem correspondência, null (vale o preço do ponto).
 */
export function precoDoLocalDeOutros(texto: string | null | undefined, locais: LocalDeOutros[]): number | null {
  const t = ` ${normalizar(texto ?? "")} `;
  if (!t.trim() || t.includes(" retorno ")) return null;
  let melhor: LocalDeOutros | null = null;
  for (const l of locais) {
    const nome = normalizar(l.local);
    if (nome && t.includes(` ${nome} `) && (!melhor || nome.length > normalizar(melhor.local).length)) melhor = l;
  }
  const preco = melhor ? Number(melhor.price) : Number.NaN;
  return Number.isFinite(preco) && preco > 0 ? preco : null;
}

/**
 * Memória de endereços (issue #270): o condomínio/residencial que o cliente citou
 * ("Residencial Colinas, bloco 3") e o bairro onde ele fica. Compara palavras
 * inteiras, sem acento; o apelido mais longo vence. Confirmados vêm antes.
 */
export function bairroPorApelido(
  texto: string | null | undefined,
  apelidos: { apelido: string; bairro: string; confirmado?: boolean | null }[],
): string | null {
  const t = ` ${normalizar(texto ?? "")} `;
  if (!t.trim()) return null;
  let melhor: { bairro: string; tamanho: number; confirmado: boolean } | null = null;
  for (const a of apelidos) {
    const nome = normalizar(a.apelido);
    if (!nome || !t.includes(` ${nome} `)) continue;
    const confirmado = a.confirmado === true;
    if (
      !melhor ||
      (confirmado && !melhor.confirmado) ||
      (confirmado === melhor.confirmado && nome.length > melhor.tamanho)
    ) {
      melhor = { bairro: a.bairro, tamanho: nome.length, confirmado };
    }
  }
  return melhor?.bairro ?? null;
}

/**
 * Bairro da tabela citado com erro de escrita ("cohatrc", "bequimao", "turuu"), quando
 * bairroDaTabela não acha o nome exato (issue #276). Dois bairros igualmente parecidos = null.
 */
export function bairroParecido<T extends { neighborhood: string }>(
  texto: string | null | undefined,
  tabela: T[],
): { bairro: T; escrito: string } | null {
  if (bairroDaTabela(texto, tabela)) return null;
  const achado = nomeParecidoNoTexto(texto, tabela, (b) => b.neighborhood);
  return achado && achado.erros > 0 ? { bairro: achado.item, escrito: achado.escrito } : null;
}

// ---------------------------------------------------------------------------
// Lugares de São Luís → bairro (issue #297)
// ---------------------------------------------------------------------------

export type LugarDeSaoLuis = {
  bairro: string;
  lugar: string;
  tipo: string;
  ocorrencias: number;
  confirmado: boolean;
  fonte: string;
};

/**
 * Qual bairro os lugares citados indicam (fn_bairro_pelo_endereco)? Confirmado pela
 * equipe vence; senão, o bairro com mais evidência, se for pelo menos o dobro do
 * segundo (empate ou dúvida não chuta). Devolve também o lugar que decidiu.
 */
export function bairroPelosLugares(
  lugares: LugarDeSaoLuis[],
): { bairro: string; lugar: string; vezes: number; confirmado: boolean } | null {
  if (!lugares.length) return null;
  const confirmados = [...new Set(lugares.filter((l) => l.confirmado).map((l) => l.bairro))];
  if (confirmados.length === 1) {
    const l = lugares.find((x) => x.confirmado && x.bairro === confirmados[0])!;
    return { bairro: l.bairro, lugar: l.lugar, vezes: l.ocorrencias, confirmado: true };
  }
  if (confirmados.length > 1) return null;
  const porBairro = new Map<string, { vezes: number; lugar: string }>();
  for (const l of lugares) {
    const atual = porBairro.get(l.bairro) ?? { vezes: 0, lugar: l.lugar };
    porBairro.set(l.bairro, { vezes: atual.vezes + Math.max(l.ocorrencias, 0), lugar: atual.lugar });
  }
  const ordem = [...porBairro.entries()].sort((a, b) => b[1].vezes - a[1].vezes);
  const [primeiro, segundo] = ordem;
  if (!primeiro || primeiro[1].vezes < 1) return null;
  if (segundo && primeiro[1].vezes < 2 * segundo[1].vezes) return null;
  return { bairro: primeiro[0], lugar: primeiro[1].lugar, vezes: primeiro[1].vezes, confirmado: false };
}

/**
 * O leitor pôs um bairro, mas o endereço escrito pelo cliente cita OUTRO bairro da
 * tabela (ex.: "Condomínio Belleville, Estrada da Maioba" lido como "Alto do Turu").
 * Vale o bairro escrito no endereço, a não ser que o cliente tenha dito o outro.
 */
export function bairroEscritoNoEndereco<T extends { neighborhood: string }>(
  escolhido: string | null | undefined,
  endereco: string | null | undefined,
  palavrasDoCliente: string | null | undefined,
  tabela: T[],
): T | null {
  const citado = bairroDaTabela(endereco, tabela);
  if (!citado) return null;
  if (escolhido && normalizar(escolhido) === normalizar(citado.neighborhood)) return null;
  // "Rua do Turu" cita "Turu" sem ser no Turu: nome de uma palavra só não troca o bairro já escolhido
  if (escolhido && normalizar(citado.neighborhood).split(" ").length < 2) return null;
  const disse = ` ${normalizar(palavrasDoCliente ?? "")} `;
  if (escolhido && disse.includes(` ${normalizar(escolhido)} `)) return null;
  return citado;
}

/**
 * Trecho com cidade intermediária (issue #326, dono 11/11): R$ 50 ou mais é reserva normal;
 * abaixo disso só pede confirmação em dia cheio — para não faltar lugar a quem vai até São
 * Luís (R$ 60). "Dia cheio" = sobram menos de `vagasMinimas` depois desta reserva.
 */
export const REGRA_DO_TRECHO_PADRAO = { valorMinimo: 50, vagasMinimas: 10 };

export function trechoPrecisaDeConfirmacao(p: {
  preco: number | null | undefined;
  vagasDepois: number | null | undefined;
  valorMinimo?: number;
  vagasMinimas?: number;
}): { pendente: boolean; motivo: string | null } {
  const valorMinimo = p.valorMinimo ?? REGRA_DO_TRECHO_PADRAO.valorMinimo;
  const vagasMinimas = p.vagasMinimas ?? REGRA_DO_TRECHO_PADRAO.vagasMinimas;
  if (p.preco == null || !Number.isFinite(Number(p.preco))) {
    return { pendente: true, motivo: "Trecho de cidade intermediária sem valor na tabela — a equipe confirma." };
  }
  if (Number(p.preco) >= valorMinimo) return { pendente: false, motivo: null };
  if (p.vagasDepois != null && p.vagasDepois >= vagasMinimas) return { pendente: false, motivo: null };
  const sobram = p.vagasDepois == null ? "vagas não conferidas" : `${Math.max(0, p.vagasDepois)} vaga(s) sobrando`;
  return {
    pendente: true,
    motivo: `Trecho curto (R$ ${Number(p.preco)}, abaixo de R$ ${valorMinimo}) em dia cheio (${sobram}): a equipe confirma para não faltar lugar a quem vai até São Luís.`,
  };
}

/** Lê settings.intermediate_review ({ valor_minimo, vagas_minimas }); faltando, a regra padrão. */
export function regraDoTrecho(valor: unknown): { valorMinimo: number; vagasMinimas: number } {
  const v = (valor ?? {}) as Record<string, unknown>;
  const num = (x: unknown, padrao: number) => (Number.isFinite(Number(x)) && Number(x) >= 0 ? Number(x) : padrao);
  return {
    valorMinimo: num(v.valor_minimo, REGRA_DO_TRECHO_PADRAO.valorMinimo),
    vagasMinimas: num(v.vagas_minimas, REGRA_DO_TRECHO_PADRAO.vagasMinimas),
  };
}

/**
 * Preço do bairro da tabela (issue #330): cadastrado sem preço (o dono preenche depois)
 * NUNCA vira R$ 0 — vai como BAIRRO_SEM_PRECO, e o bot não diz valor.
 */
export function precoDoBairroCadastrado(
  b: { neighborhood: string; price: number | string | null | undefined },
): { ok: true; preco: number } | { ok: false; erro: { codigo: string; erro: string } } {
  const preco = b.price == null || b.price === "" ? Number.NaN : Number(b.price);
  if (!(preco > 0)) {
    return {
      ok: false,
      erro: {
        codigo: "BAIRRO_SEM_PRECO",
        erro: `O bairro "${b.neighborhood}" está cadastrado, mas ainda sem preço. Não diga valor: a equipe confirma.`,
      },
    };
  }
  return { ok: true, preco };
}
