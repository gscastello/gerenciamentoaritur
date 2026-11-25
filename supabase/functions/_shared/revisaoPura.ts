// supabase/functions/_shared/revisaoPura.ts
//
// Revisor de reservas (issue #339) — regras PURAS, sem rede. O modelo relê a
// conversa e aponta o que parece errado em cada reserva futura; aqui o código decide
// o que pode ser corrigido sozinho, o que vira pendência e o que é descartado:
//   - só corrige sozinho o que tem EVIDÊNCIA LITERAL na conversa (a frase do cliente
//     ou da equipe que prova o erro) e certeza alta, num campo permitido;
//   - o que não tem prova é descartado (o modelo não inventa correção);
//   - tipo (passagem/encomenda), nome e o que tem certeza média/baixa viram pendência;
//   - preço NUNCA vem do modelo: é recalculado pela tabela (precoRevisado);
//   - duplicada na mesma viagem criada pelo bot: cancela a mais nova (fica no histórico).

import { normalizarTexto } from "./grafia.ts";
import { lugaresContraOSentido, REGRA_DO_LUGAR } from "./ladoDaRota.ts";
import { ehMarcaDeAgendado, ehMarcaDeCorrecao, viagemDeHojeJaSaiu } from "./rascunhoPuro.ts";

/** Uma fala da conversa (cliente ou equipe) com a hora em que foi escrita. */
export type FalaDaRevisao = { em: string; texto: string; quem?: "cliente" | "equipe" };

/**
 * A prova pode juntar várias falas ("EQUIPE: Qual dia mesmo da sua viagem? / CLIENTE: Sábado",
 * issue #377): separa nas partes (" / ", quebra de linha, "|", "…") e tira a hora e o rótulo de
 * quem falou. "14/11" (sem espaço) não é separador. Partes com menos de 3 letras são ignoradas.
 */
export function partesDaEvidencia(evidencia: string | null | undefined): string[] {
  return String(evidencia ?? "")
    .split(/\s+\/\s+|\n|\s*\|\s*|…|\.{3}/)
    .map((p) => p.replace(/^\s*(\[[^\]]*\]\s*)?(cliente|equipe|bot)\s*:\s*/i, ""))
    .map((p) => normalizarTexto(p))
    .filter((p) => p.replace(/\s/g, "").length >= 3);
}

/**
 * Quando foi escrita a prova (null se não achou): a fala mais recente que contém a ÚLTIMA parte —
 * numa prova "pergunta / resposta", vale a hora da resposta.
 */
export function horaDaEvidencia(evidencia: string, falas: FalaDaRevisao[]): string | null {
  const e = partesDaEvidencia(evidencia).at(-1);
  if (!e) return null;
  let achada: string | null = null;
  for (const f of falas) if (` ${normalizarTexto(f.texto)} `.includes(e) && (!achada || f.em > achada)) achada = f.em;
  return achada;
}

export type ReservaRevisada = {
  id: string;
  data: string; // AAAA-MM-DD
  direcao: "ida" | "volta";
  trip_id: string;
  ponto: string | null;
  bairro: string | null;
  embarque: string | null;
  desembarque: string | null;
  quantidade: number;
  valor: number | null;
  tipo: "passagem" | "encomenda";
  status: string;
  criada_pelo_bot: boolean;
  criada_em: string;
};

export const CAMPOS_DA_REVISAO = [
  "data",
  "sentido",
  "ponto",
  "bairro",
  "embarque",
  "desembarque",
  "quantidade",
  "tipo",
  "nome",
] as const;
export type CampoDaRevisao = (typeof CAMPOS_DA_REVISAO)[number];

/** Colunas da reserva que correspondem a cada campo da revisão (para ler a auditoria). */
const COLUNAS_DO_CAMPO: Record<string, CampoDaRevisao[]> = {
  trip_id: ["data", "sentido"],
  route_point_id: ["ponto"],
  quantity: ["quantidade"],
  pickup_neighborhood: ["bairro"],
  pickup_detail: ["embarque"],
  street: ["embarque"],
  reference_point: ["embarque"],
  dropoff_location: ["desembarque"],
  dropoff_area: ["desembarque"],
  dropoff_detail: ["desembarque"],
  type: ["tipo"],
};

/** Uma linha de audit_logs de uma reserva. */
export type MudancaAuditada = {
  before_data?: Record<string, unknown> | null;
  after_data?: Record<string, unknown> | null;
  performed_by?: string | null;
  performed_at: string;
};

/**
 * Quando uma PESSOA (equipe ou Assistente — qualquer ator que não seja o bot) mudou
 * cada campo da reserva pela última vez (issue #389). O que a pessoa mudou vence o que
 * o cliente escreveu antes: o revisor não desfaz.
 */
export function camposMudadosPelaEquipe(
  logs: MudancaAuditada[],
  botId: string | null,
): Partial<Record<CampoDaRevisao, string>> {
  const out: Partial<Record<CampoDaRevisao, string>> = {};
  for (const l of logs ?? []) {
    if (!l.performed_by || l.performed_by === botId || !l.before_data || !l.after_data) continue;
    for (const [coluna, campos] of Object.entries(COLUNAS_DO_CAMPO)) {
      if (JSON.stringify(l.before_data[coluna] ?? null) === JSON.stringify(l.after_data[coluna] ?? null)) continue;
      for (const c of campos) if (!out[c] || l.performed_at > (out[c] as string)) out[c] = l.performed_at;
    }
  }
  return out;
}

/** Campos que o revisor corrige sozinho (com evidência e certeza alta). */
const CORRIGE_SOZINHO: CampoDaRevisao[] = ["data", "sentido", "ponto", "bairro", "embarque", "desembarque", "quantidade"];

export type Achado = {
  reserva_id: string;
  campo: CampoDaRevisao;
  valor_atual: string | null;
  valor_correto: string | null;
  evidencia: string;
  quem_errou: "bot" | "cliente" | "equipe" | "desconhecido";
  certeza: "alta" | "media" | "baixa";
  explicacao: string;
};

export type Correcao = {
  reserva_id: string;
  data?: string;
  sentido?: "ida" | "volta";
  ponto?: string;
  bairro?: string | null;
  embarque?: string | null;
  desembarque?: string | null;
  quantidade?: number;
  motivos: string[];
};

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const txt = (v: unknown, max = 200): string | null => {
  const s = typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : typeof v === "number" ? String(v) : "";
  return s ? s : null;
};
const mesmo = (a: unknown, b: unknown) => normalizarTexto(String(a ?? "")) === normalizarTexto(String(b ?? ""));

/**
 * A frase citada está mesmo na conversa (sem acento/caixa/pontuação; pelo menos 3 letras)?
 * Prova com várias falas: TODAS as partes têm de estar na conversa (issue #377).
 */
export function evidenciaNaConversa(evidencia: string | null | undefined, conversa: string): boolean {
  const partes = partesDaEvidencia(evidencia);
  if (partes.length === 0) return false;
  const c = ` ${normalizarTexto(conversa)} `;
  return partes.every((p) => c.includes(p));
}

/** Converte o que o modelo devolveu em achados válidos (descarta o que vier torto). */
export function achadosValidos(bruto: unknown): Achado[] {
  const lista = Array.isArray(bruto) ? bruto : [];
  const out: Achado[] = [];
  for (const a of lista as Record<string, unknown>[]) {
    const campo = String(a?.campo ?? "") as CampoDaRevisao;
    if (!CAMPOS_DA_REVISAO.includes(campo)) continue;
    const reserva = txt(a.reserva_id, 60);
    const evidencia = txt(a.evidencia, 400);
    if (!reserva || !evidencia) continue;
    const certeza = a.certeza === "alta" || a.certeza === "media" ? a.certeza : "baixa";
    const quem = ["bot", "cliente", "equipe"].includes(String(a.quem_errou)) ? (a.quem_errou as Achado["quem_errou"]) : "desconhecido";
    out.push({
      reserva_id: reserva,
      campo,
      valor_atual: txt(a.valor_atual),
      valor_correto: txt(a.valor_correto),
      evidencia,
      quem_errou: quem,
      certeza,
      explicacao: txt(a.explicacao, 300) ?? "",
    });
  }
  return out;
}

const semAcento = (t: string) => t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
/** Alguma palavra do valor (4 letras ou mais) está na prova escrita? */
export function valorNaProva(valor: string | null | undefined, evidencia: string | null | undefined): boolean {
  const prova = ` ${semAcento(String(evidencia ?? "")).replace(/[^a-z0-9 ]+/g, " ")} `;
  return semAcento(String(valor ?? ""))
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((p) => p.length >= 4)
    .some((p) => prova.includes(` ${p} `));
}

/** Campo da reserva sem informação: vazio, "—" ou "a confirmar" ("Em casa (bairro)" é informação: deixar em casa). */
export function campoVazio(v: string | null | undefined): boolean {
  const t = String(v ?? "").trim();
  return !t || /^(—|-|endere[cç]o a confirmar|a confirmar)$/i.test(t);
}

/**
 * Volta sem desembarque não é pendência: é em São Luís (dono, 23/11 — issue #497). Vale quando a reserva
 * está vazia e o achado não traz lugar nenhum (ou só "São Luís"); lugar que o cliente escreveu continua.
 */
export function soFaltaDesembarqueDaVolta(a: Achado, reserva: ReservaRevisada | undefined): boolean {
  if (a.campo !== "desembarque" || reserva?.direcao !== "volta" || !campoVazio(reserva.desembarque)) return false;
  const lugar = normalizarTexto(a.valor_correto ?? "");
  return campoVazio(a.valor_correto) || /^(em )?(sao luis|slz|sao luis ma|nao informado|nao informada)$/.test(lugar);
}

/**
 * Decide o destino de cada achado: corrigir sozinho, pendência para a equipe ou descartar.
 * Achados da mesma reserva viram UMA correção (dia + sentido + ponto juntos).
 */
export function decidirRevisao(
  achados: Achado[],
  ctx: {
    reservas: ReservaRevisada[];
    conversa: string;
    hoje: string;
    pontos: { ida: string[]; volta: string[] };
    /** falas com hora: dia e sentido só mudam sozinhos se a prova veio DEPOIS da reserva */
    falas?: FalaDaRevisao[];
    /** "HH:MM" em São Luís: viagem que já saiu não é mexida */
    horaAgora?: string | null;
    /** por reserva, quando uma pessoa mudou cada campo (camposMudadosPelaEquipe) — issue #389 */
    mudancasDaEquipe?: Record<string, Partial<Record<CampoDaRevisao, string>>>;
    /**
     * A equipe marcou "Atualizado ☑️" (issue #410): é a confirmação de que a conversa vale. Corrige
     * com certeza média ou alta, inclusive dia e sentido, sem esperar prova escrita depois da reserva.
     */
    confirmadoPelaEquipe?: boolean;
    /** para conferir se embarque/desembarque combinam com o sentido (issue #426) */
    bairros?: { neighborhood: string }[];
    locaisDeOutros?: string[];
  },
): { correcoes: Correcao[]; pendencias: Achado[]; descartados: Achado[] } {
  const porId = new Map(ctx.reservas.map((r) => [r.id, r]));
  const correcoes = new Map<string, Correcao>();
  const pendencias: Achado[] = [];
  const descartados: Achado[] = [];
  for (const a of achados) {
    const r = porId.get(a.reserva_id);
    if (!r || !evidenciaNaConversa(a.evidencia, ctx.conversa)) {
      descartados.push(a);
      continue;
    }
    // viagem que já saiu (ou já passou) não é mexida
    if (r.data < ctx.hoje || (r.data === ctx.hoje && viagemDeHojeJaSaiu(r.direcao, ctx.horaAgora))) {
      descartados.push(a);
      continue;
    }
    const valor = a.valor_correto;
    // "corrigir" para o mesmo valor não é achado
    const atual = { data: r.data, sentido: r.direcao, ponto: r.ponto, bairro: r.bairro, embarque: r.embarque, desembarque: r.desembarque, quantidade: String(r.quantidade) }[
      a.campo as "data"
    ];
    if (a.campo !== "tipo" && a.campo !== "nome" && valor != null && mesmo(valor, atual)) {
      descartados.push(a);
      continue;
    }
    const hora = ctx.falas ? horaDaEvidencia(a.evidencia, ctx.falas) : null;
    // a equipe (ou o Assistente) mudou este campo à mão: vence o que o cliente escreveu ANTES.
    // Só se o cliente escreveu DEPOIS da mudança vira pendência; o revisor nunca desfaz sozinho (#389)
    const mudouEm = ctx.mudancasDaEquipe?.[r.id]?.[a.campo];
    const posterior = !!hora && Date.parse(hora) > Date.parse(r.criada_em);
    if (mudouEm) {
      // com o "Atualizado ☑️", o que o cliente escreveu depois da mudança à mão vale (issue #410)
      const depoisDaMudanca = !!hora && Date.parse(hora) > Date.parse(mudouEm);
      if (!(ctx.confirmadoPelaEquipe && depoisDaMudanca)) {
        if (depoisDaMudanca) pendencias.push(a);
        else descartados.push(a);
        continue;
      }
    }
    // o cliente (ou a equipe) corrigiu DEPOIS de a reserva ser criada: é a confirmação (issue #343)
    const mudaAViagem = a.campo === "data" || a.campo === "sentido";
    let ok = CORRIGE_SOZINHO.includes(a.campo) &&
      (a.certeza === "alta" || (a.certeza === "media" && (ctx.confirmadoPelaEquipe || (posterior && !mudaAViagem))));
    // dia e sentido mudam a viagem inteira: só sozinho se o cliente/equipe disse DEPOIS da reserva
    // ("na verdade é dia 15"). Prova anterior pode ser de outro pedido — a equipe confere.
    // Com o "Atualizado ☑️" a equipe já conferiu (issue #410).
    if (ok && mudaAViagem && !ctx.confirmadoPelaEquipe) ok = posterior;
    // campo VAZIO (embarque, desembarque, bairro) preenchido com o que está na conversa: não apaga
    // nada, então certeza média basta, mesmo com a prova antes da reserva (issue #464)
    // E o valor tem de estar na própria prova (uma palavra dele, de 4 letras ou mais): o modelo não
    // pode tirar um bairro de uma frase que não fala dele.
    if (!ok && campoVazio(atual) && ["embarque", "desembarque", "bairro"].includes(a.campo) && (a.certeza === "alta" || a.certeza === "media")) {
      ok = !!valor && !campoVazio(valor) && valorNaProva(valor, a.evidencia);
    }
    const c = correcoes.get(r.id) ?? { reserva_id: r.id, motivos: [] };
    if (ok) {
      switch (a.campo) {
        case "data":
          ok = !!valor && DATA.test(valor) && valor >= ctx.hoje;
          if (ok) c.data = valor as string;
          break;
        case "sentido":
          ok = valor === "ida" || valor === "volta";
          if (ok) c.sentido = valor as "ida" | "volta";
          break;
        case "ponto": {
          const p = String(valor ?? "").toLowerCase();
          ok = !!p && [...ctx.pontos.ida, ...ctx.pontos.volta].includes(p);
          if (ok) c.ponto = p;
          break;
        }
        case "quantidade": {
          const q = Number(valor);
          ok = Number.isInteger(q) && q >= 1 && q <= 10;
          if (ok) c.quantidade = q;
          break;
        }
        case "bairro":
          c.bairro = valor;
          break;
        case "embarque":
          ok = !!valor;
          if (ok) c.embarque = valor;
          break;
        case "desembarque":
          c.desembarque = valor;
          break;
      }
    }
    if (!ok) {
      pendencias.push(a);
      continue;
    }
    c.motivos.push(`${a.campo}: ${a.valor_atual ?? "—"} → ${valor ?? "—"} ("${a.evidencia}")`);
    correcoes.set(r.id, c);
  }
  // sentido mudou: o ponto tem de existir no novo sentido; senão a correção inteira vira pendência
  const finais: Correcao[] = [];
  for (const c of correcoes.values()) {
    const r = porId.get(c.reserva_id) as ReservaRevisada;
    const sentido = c.sentido ?? r.direcao;
    const ponto = c.ponto ?? r.ponto;
    if (ponto && !ctx.pontos[sentido].includes(ponto)) {
      for (const a of achados.filter((x) => x.reserva_id === c.reserva_id && CORRIGE_SOZINHO.includes(x.campo))) {
        if (!pendencias.includes(a)) pendencias.push(a);
      }
      continue;
    }
    // Ida ↔ Volta: quem sobe vira quem desce. O endereço de São Luís passa para o outro lado
    // junto com o sentido, senão a Volta "sai do condomínio e desce na praça" (issue #401)
    if (c.sentido && c.sentido !== r.direcao && !("embarque" in c && "desembarque" in c)) {
      const saoLuis = [r.embarque, r.bairro].filter(Boolean).join(", ") || null;
      const interior = r.desembarque || null;
      if (saoLuis || interior) {
        // o lado que o revisor já corrigiu com prova fica; o outro troca com o sentido
        if (!("embarque" in c)) c.embarque = c.sentido === "volta" ? interior : saoLuis;
        if (!("desembarque" in c)) c.desembarque = c.sentido === "volta" ? saoLuis : interior;
        if (c.sentido === "volta") c.bairro = null;
        c.motivos.push(`embarque e desembarque trocados com o sentido: "${r.embarque ?? "—"}" ↔ "${r.desembarque ?? "—"}"`);
        for (const a of achados.filter((x) => x.reserva_id === c.reserva_id && (x.campo === "embarque" || x.campo === "desembarque"))) {
          const i = pendencias.indexOf(a);
          if (i >= 0) pendencias.splice(i, 1);
        }
      }
    }
    // O LUGAR DIZ O SENTIDO (issue #426): a correção não pode deixar embarque/desembarque contra o sentido
    const depois = {
      direction: c.sentido ?? r.direcao,
      route_point_code: c.ponto ?? r.ponto,
      pickup_detail: "embarque" in c ? c.embarque ?? null : r.embarque,
      pickup_neighborhood: "bairro" in c ? c.bairro ?? null : r.bairro,
      dropoff_location: "desembarque" in c ? c.desembarque ?? null : r.desembarque,
      type: r.tipo,
    };
    const contra = lugaresContraOSentido(depois, { bairros: ctx.bairros, locaisDeOutros: ctx.locaisDeOutros });
    if (contra) {
      for (const a of achados.filter((x) => x.reserva_id === c.reserva_id && CORRIGE_SOZINHO.includes(x.campo))) {
        if (!pendencias.includes(a)) pendencias.push(a);
      }
      continue;
    }
    finais.push(c);
  }
  // reserva futura que JÁ está com o lugar contra o sentido e nenhuma correção mexeu: pendência
  const corrigidas = new Set(finais.map((c) => c.reserva_id));
  for (const r of ctx.reservas) {
    if (corrigidas.has(r.id) || !["confirmada", "pendente"].includes(r.status)) continue;
    if (r.data < ctx.hoje || (r.data === ctx.hoje && viagemDeHojeJaSaiu(r.direcao, ctx.horaAgora))) continue;
    if (pendencias.some((a) => a.reserva_id === r.id)) continue;
    const contra = lugaresContraOSentido(
      { direction: r.direcao, route_point_code: r.ponto, pickup_detail: r.embarque, pickup_neighborhood: r.bairro, dropoff_location: r.desembarque, type: r.tipo },
      { bairros: ctx.bairros, locaisDeOutros: ctx.locaisDeOutros },
    );
    if (contra) {
      pendencias.push({
        reserva_id: r.id,
        campo: "sentido",
        valor_atual: r.direcao,
        valor_correto: null,
        evidencia: "",
        quem_errou: "desconhecido",
        certeza: "media",
        explicacao: `O lugar não combina com o sentido: ${contra}. Confira com o passageiro se é Ida ou Volta.`,
      });
    }
  }
  return {
    correcoes: finais,
    pendencias: pendencias.filter((a) => !soFaltaDesembarqueDaVolta(a, ctx.reservas.find((r) => r.id === a.reserva_id))),
    descartados,
  };
}

/**
 * Reservas duplicadas na mesma viagem do mesmo passageiro. Se todas as repetidas foram
 * criadas pelo bot, cancela as mais novas e fica a mais antiga; se a equipe criou alguma,
 * é pendência (a equipe pode ter lançado de propósito).
 */
export function duplicadasDaRevisao(reservas: ReservaRevisada[]): { cancelar: string[]; pendentes: string[][] } {
  const ativas = reservas.filter((r) => r.status === "confirmada" || r.status === "pendente");
  const porViagem = new Map<string, ReservaRevisada[]>();
  for (const r of ativas) porViagem.set(r.trip_id, [...(porViagem.get(r.trip_id) ?? []), r]);
  const cancelar: string[] = [];
  const pendentes: string[][] = [];
  for (const grupo of porViagem.values()) {
    if (grupo.length < 2) continue;
    const ordem = [...grupo].sort((a, b) => a.criada_em.localeCompare(b.criada_em));
    const [, ...repetidas] = ordem;
    if (repetidas.every((r) => r.criada_pelo_bot)) cancelar.push(...repetidas.map((r) => r.id));
    else pendentes.push(ordem.map((r) => r.id));
  }
  return { cancelar, pendentes };
}

/**
 * Preço depois da revisão: a tabela manda quando a reserva está sem valor, ou quando o
 * valor foi posto pelo bot e não bate com a tabela. Valor que a equipe mudou à mão fica.
 */
export function precoRevisado(p: { atual: number | null; tabela: number | null; alteradoPelaEquipe: boolean }): number | null {
  if (p.tabela == null || !(p.tabela > 0)) return null;
  const atual = Number(p.atual ?? 0);
  if (!(atual > 0)) return p.tabela;
  if (!p.alteradoPelaEquipe && atual !== p.tabela) return p.tabela;
  return null;
}

/** Reservas em texto para o modelo comparar com a conversa. */
export function reservasParaOPrompt(reservas: ReservaRevisada[], nomesDosPontos: Record<string, string>): string {
  if (!reservas.length) return "(nenhuma)";
  return reservas
    .map((r) =>
      [
        `- reserva_id=${r.id}`,
        `${r.direcao === "ida" ? "Ida" : "Volta"} ${r.data.split("-").reverse().slice(0, 2).join("/")} (${r.data})`,
        `tipo ${r.tipo}`,
        `ponto ${r.ponto ?? "?"}${r.ponto && nomesDosPontos[r.ponto] ? ` (${nomesDosPontos[r.ponto]})` : ""}`,
        r.bairro ? `bairro ${r.bairro}` : null,
        `embarque "${r.embarque ?? ""}"`,
        `desembarque "${r.desembarque ?? ""}"`,
        `${r.quantidade} passagem(ns)`,
        `status ${r.status}`,
        r.criada_pelo_bot ? "lançada pelo bot" : "lançada pela equipe",
      ].filter(Boolean).join(" · ")
    )
    .join("\n");
}

/** Instruções do revisor: crítico, mas só aponta o que a conversa prova. */
export function instrucoesDoRevisor(ctx: { pontos: string; hoje: string; extras?: string }): string {
  return `Você é o REVISOR de reservas da AriTur (vans entre São Luís e Pirapemas/Cantanhede, MA). Hoje é ${ctx.hoje}.
Você recebe as reservas FUTURAS de um passageiro e a conversa do WhatsApp dele com a equipe. Compare CADA campo de cada reserva com o que foi pedido e combinado na conversa e aponte TODO erro, por menor que seja — do bot, do cliente (ex.: escreveu o dia errado e corrigiu depois) ou da equipe.

O que conferir em cada reserva:
- dia e sentido (Ida = sai de São Luís; Volta = sai de Pirapemas/Cantanhede). O SENTIDO SAI DA ORDEM DAS PARADAS (dono, 14/11): a Ida vai São Luís → Bacabeira → Santa Rita → Entroncamento → Miranda → Matões → Cantanhede → Campestre → Pirapemas; a Volta faz o caminho contrário, saindo de Pirapemas. Destino DEPOIS da origem nessa ordem = IDA; ANTES = VOLTA. Pense como o motorista: "de Pirapemas pra Cantanhede" é Volta; "de Cantanhede pra Pirapemas" é IDA (a Volta já passou por Cantanhede vinda de Pirapemas, não tem como ir a Pirapemas); saindo de São Luís é sempre Ida; saindo de Pirapemas é sempre Volta. "Hoje", "amanhã", "sexta" contam do dia em que a mensagem foi escrita. O que o cliente corrigiu depois vale ("não, é dia 15").
- ${REGRA_DO_LUGAR} Ex.: "aguardo vcs no retorno" é Ida no Retorno; "Rua X, Pirapemas" como embarque é Volta; "vou ficar no Cohatrac" é Volta (desce em São Luís).
- ponto de embarque (códigos abaixo), bairro (busca em casa), embarque (rua/referência), desembarque, quantidade, tipo (passagem/encomenda).
- endereço trocado de lugar: rua/referência da cidade de embarque gravada como desembarque (na Volta, rua de Cantanhede/Pirapemas no desembarque), ou o NOME do passageiro lido como lugar ("De Cantanhede pra Luís / Maria Souza / Rua X perto do banco": "Luís" = São Luís, "Maria Souza" = nome, a rua = embarque). Confira cada parte do que o cliente escreveu e onde ela foi parar. Rua com nome de cidade ("Rua Santa Rita", "Av. Colombo") é só a rua, não a cidade do caminho.
- quantidade: é o número que o cliente PEDIU. Frase de costume ("eu e minhas filhas viajamos sempre com vocês") não pede mais vagas: não aponte. N passagens com desembarques diferentes na mesma viagem formam UMA reserva de N (todas têm de estar reservadas).
- Criança de até 5 anos vai no colo e NÃO conta na quantidade ("2 adultos e uma criança", "3 anos" = 2 passagens); a partir dos 6 conta e paga inteira. Não aponte a quantidade por causa de criança de colo.
- "Estrada de Pirapemas" fica entre as duas cidades, mais perto de Cantanhede: em geral o ponto é Cantanhede, não é contradição.
- Cajuí (rua do Cajuí, entrada do Cajuí) e Jardim Botânico são em Cantanhede: na Volta são EMBARQUE, nunca desembarque.
- Pirapemas até Cantanhede é Volta válida (passagem extra).
- Busca em casa com o BAIRRO e sem rua está completa (o taxista só precisa do bairro): não aponte nem peça o endereço.
- Volta SEM desembarque não é erro nem dúvida: é em São Luís. Não aponte, não ponha em observacoes e não peça ação da equipe só por isso. Aponte só se o cliente ESCREVEU onde desce e a reserva não tem esse lugar (ou tem outro).
- apartamento/bloco/casa mandados depois são complemento: o endereço tem de manter a rua e o condomínio.
- DESISTÊNCIA: o CLIENTE escreveu, depois da reserva, que desmarca/cancela/não vai mais nesta viagem ("estou desmarcando minha passagem", "não vou mais") → ponha em cancelamentos (reserva_id + trecho LITERAL do cliente + certeza), não em achados nem em observacoes. Remarcar ("passa pra quarta") é mudança de dia, não desistência. Se ele voltou atrás depois, se só perguntou ("posso cancelar?") ou se não dá para saber de qual reserva fala, certeza "baixa".
- reserva repetida; pedido da conversa que ficou sem reserva (não aponte como achado: só explique em observacoes).
- CUIDADO com pedidos antigos: a conversa traz pedidos de viagens JÁ FEITAS (listadas em VIAGENS PASSADAS). Mensagem que pediu uma viagem passada não vale para as futuras. Cada reserva futura corresponde ao pedido mais recente antes dela.
- A resposta do cliente vale para o que a equipe perguntou ("Te buscamos aonde?" → embarque). Sugestão da equipe que o cliente negou não vale. "Parada das vans" = ponto retorno. Campestre na Volta = ponto pirapemas; outras cidades do caminho na Volta, e os povoados Palmeiral e Sozinho (entre Cantanhede e Matões do Norte), = ponto cantanhede.

REGRAS DURAS
- Só aponte um achado se a CONVERSA prova o erro. Em "evidencia", copie LITERALMENTE o trecho da conversa (cliente ou equipe) que mostra o valor certo. Sem trecho, não aponte.
- "certeza": "alta" só quando a conversa deixa claro, sem outra leitura possível. Em dúvida, "media". Correção clara que o cliente mandou DEPOIS da reserva ou da confirmação ("ficaremos na rodoviária", "é pra amanhã", "são 3") é "alta".
- Não aponte preço/valor: o sistema recalcula pela tabela. Não aponte o que está certo. Não invente.
- Tudo certo: achados vazio, sem observação e equipe_precisa_agir = false. Não escreva "confere" nem "nenhum erro".
- Responda SEMPRE chamando a ferramenta registrar_revisao.

PONTOS DE EMBARQUE (código = nome):
${ctx.pontos}${ctx.extras ? `\n\n${ctx.extras}` : ""}`;
}

/** Ferramenta do revisor (formato da API). */
export const FERRAMENTA_DA_REVISAO = {
  name: "registrar_revisao",
  description: "Registra o resultado da revisão das reservas do passageiro: os erros achados (com a prova da conversa).",
  input_schema: {
    type: "object",
    properties: {
      achados: {
        type: "array",
        items: {
          type: "object",
          properties: {
            reserva_id: { type: "string" },
            campo: { type: "string", enum: [...CAMPOS_DA_REVISAO] },
            valor_atual: { type: "string" },
            valor_correto: {
              type: "string",
              description: "data AAAA-MM-DD; sentido ida|volta; ponto = código; quantidade = número; demais = texto",
            },
            evidencia: { type: "string", description: "trecho LITERAL da conversa que prova o valor certo" },
            quem_errou: { type: "string", enum: ["bot", "cliente", "equipe", "desconhecido"] },
            certeza: { type: "string", enum: ["alta", "media", "baixa"] },
            explicacao: { type: "string" },
          },
          required: ["reserva_id", "campo", "valor_correto", "evidencia", "certeza"],
        },
      },
      cancelamentos: {
        type: "array",
        description: "reservas de que o CLIENTE desistiu com todas as letras (vazio se nenhuma)",
        items: {
          type: "object",
          properties: {
            reserva_id: { type: "string" },
            evidencia: { type: "string", description: "trecho LITERAL em que o cliente desiste" },
            certeza: { type: "string", enum: ["alta", "media", "baixa"] },
          },
          required: ["reserva_id", "evidencia", "certeza"],
        },
      },
      observacoes: { type: "string", description: "pedido sem reserva ou dúvida que a equipe deve ver" },
      equipe_precisa_agir: {
        type: "boolean",
        description: "true SÓ se a observação pede uma ação da equipe (pedido sem reserva, dúvida que você não resolve). Tudo certo = false.",
      },
    },
    required: ["achados"],
  },
};

/** Assunto da pendência do revisor que põe o passageiro em risco (vai para a faixa vermelha — issue #476). */
export const ASSUNTO_DIA_OU_SENTIDO = "Revisão: dia ou sentido errado";

/**
 * O revisor achou DIA ou SENTIDO errado, com certeza alta, numa viagem de hoje até 7 dias (issue #476)?
 * Esse erro deixa o passageiro fora da lista da viagem: a pendência vai para a faixa vermelha, não
 * para a fila comum (onde uma foi fechada sem corrigir e a passageira não viajou).
 */
export function pendenciaDeDiaOuSentido(
  pendencias: Pick<Achado, "reserva_id" | "campo" | "certeza">[],
  reservas: { id: string; data: string }[],
  hoje: string,
): boolean {
  const limite = new Date(`${hoje}T12:00:00Z`);
  limite.setUTCDate(limite.getUTCDate() + 7);
  const ate = limite.toISOString().slice(0, 10);
  return (pendencias ?? []).some((a) => {
    if ((a.campo !== "data" && a.campo !== "sentido") || a.certeza !== "alta") return false;
    const r = (reservas ?? []).find((x) => x.id === a.reserva_id);
    return !!r && r.data >= hoje && r.data <= ate;
  });
}

// ---------------------------------------------------------------------------
// Desistência do cliente (issue #490): o revisor cancela sozinho quando é claro
// ---------------------------------------------------------------------------

/** O que o modelo apontou como desistência do cliente numa reserva. */
export type PedidoDeCancelamento = { reserva_id: string; evidencia: string; certeza: "alta" | "media" | "baixa" };

export function cancelamentosValidos(bruto: unknown): PedidoDeCancelamento[] {
  const lista = Array.isArray(bruto) ? bruto : [];
  const out: PedidoDeCancelamento[] = [];
  for (const c of lista as Record<string, unknown>[]) {
    const reserva = txt(c?.reserva_id, 60);
    const evidencia = txt(c?.evidencia, 400);
    if (!reserva || !evidencia) continue;
    out.push({ reserva_id: reserva, evidencia, certeza: c.certeza === "alta" || c.certeza === "media" ? c.certeza : "baixa" });
  }
  return out;
}

const RE_DESISTENCIA =
  / (desmarc\w*|cancel\w*|desist\w*|nao vou (mais|poder|conseguir|viajar|precisar|ir)|nao (preciso|precisarei|irei|viajo|viajarei) mais|nao vai (dar|mais)|tira (meu nome|minha passagem|minha vaga|a minha)|pode tirar|libera (a|minha) vaga) /;
const RE_VOLTOU_ATRAS =
  / (vou sim|vou mesmo|ainda vou|mudei de ideia|(quero|vou querer) (remarcar|marcar|agendar|reservar|a passagem|uma passagem|a vaga)|remarc\w*|(agend|marc|reserv)\w* de novo|deixa (marcad|agendad|reservad)\w*|nao cancel\w*|nao desmarc\w*) /;
/** Mudar de dia não é desistir: "desmarca segunda e marca pra quarta", "passa pra terça", "adiar". */
const RE_MUDANCA =
  / (remarc\w*|marc(a|ar|ando)|agend(a|ar|e)|reservar|adi(a|ar|e|ando)|trocar?|troca|mud(a|ar|e|ando)|passa(r)? (pra|para)|outro dia|outra data|no lugar) /;
/** Pergunta sem interrogação: "tem como desmarcar", "posso cancelar". */
const RE_PERGUNTA = / (tem como|teria como|posso|podemos|da pra|da para|daria|sera que|consigo|queria saber|e se) /;
/** Quem não vai é outra pessoa: "a menina que ia comigo não vai mais". */
const RE_TERCEIRO =
  / (comigo|ele|ela|eles|elas|menin[oa]s?|rapaz|moc[oa]|amig[oa]s?|mae|pai|filh[oa]s?|espos[oa]|marido|mulher|irma|irmao|sobrinh[oa]s?|net[oa]s?|prim[oa]s?|ti[oa]|avo) (\w+ ){0,6}(nao (vai|vao|ira|irao|pode|podera|quer)|desist\w*|cancel\w*|desmarc\w*) /;
/** Desistência da reserva inteira quando ela tem mais de uma passagem. */
const RE_TODAS = / (todas|todos|toda|tudo|nossas? (passage(?:m|ns)|vagas?|viagem|reserva)|minhas (passagens|vagas)|as passagens|as vagas|ninguem (vai|mais)|nao vamos) /;
const SEMANA = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];

/**
 * A frase da desistência diz QUAL reserva ("a ida", "a de segunda", "dia 23")? Devolve as reservas
 * que combinam com o que ela cita; sem citar nada, todas.
 */
export function reservasCitadas<T extends { id: string; data: string; direcao: "ida" | "volta" }>(
  evidencia: string,
  reservas: T[],
  /** quando a frase foi escrita: "hoje" e "amanhã" contam desse dia (em São Luís) */
  em?: string,
): T[] {
  const n = ` ${normalizarTexto(evidencia)} `;
  let candidatas = reservas;
  const ida = / (ida|de ida) /.test(n);
  const volta = / (volta|de volta) /.test(n);
  if (ida !== volta) candidatas = candidatas.filter((r) => r.direcao === (ida ? "ida" : "volta"));
  // "não vou mais hoje" depois que a de hoje saiu não é a reserva de sexta
  const relativo = / (hoje|hj) /.test(n) ? 0 : / (amanha|amnh|amanhã) /.test(n) ? 1 : null;
  if (relativo !== null && em && Number.isFinite(Date.parse(em))) {
    // São Luís é UTC-3 o ano todo
    const citado = new Date(Date.parse(em) - 3 * 3600_000 + relativo * 86400_000).toISOString().slice(0, 10);
    candidatas = candidatas.filter((r) => r.data === citado);
  }
  const dia = SEMANA.findIndex((d) => n.includes(` ${d} `));
  if (dia >= 0) candidatas = candidatas.filter((r) => new Date(`${r.data}T12:00:00Z`).getUTCDay() === dia);
  const ddmm = n.match(/ (\d{1,2}) (\d{1,2}) /);
  const diaDoMes = n.match(/ dia (\d{1,2}) /);
  const numero = ddmm ? Number(ddmm[1]) : diaDoMes ? Number(diaDoMes[1]) : null;
  if (numero) candidatas = candidatas.filter((r) => Number(r.data.slice(8, 10)) === numero);
  return candidatas;
}

/**
 * Decide o que fazer com cada desistência apontada (issue #490). Cancela sozinho só quando TUDO vale:
 * a frase é do CLIENTE, está na conversa, foi escrita DEPOIS da reserva, diz que desiste (desmarcar,
 * cancelar, não vou mais…), com certeza alta; a reserva é a única que a frase pode querer dizer; ele
 * não voltou atrás depois e a equipe não marcou "Agendado/Atualizado ☑️" nem mexeu na reserva depois; não
 * é pergunta, mudança de dia, só uma de várias passagens nem encomenda; e a reserva não foi paga
 * (reembolso é com a equipe). Com o "Atualizado ☑️" da equipe, certeza média basta. O resto com
 * prova na conversa vira pendência; sem prova, é descartado.
 */
export function decidirCancelamentos(
  pedidos: PedidoDeCancelamento[],
  ctx: {
    reservas: ReservaRevisada[];
    conversa: string;
    falas: FalaDaRevisao[];
    pagas?: string[];
    confirmadoPelaEquipe?: boolean;
    /** por reserva, a última vez que uma PESSOA mexeu nela: o que ela fez depois da frase vence (issue #389) */
    mexidaPelaEquipe?: Record<string, string>;
  },
): { cancelar: { reserva_id: string; evidencia: string }[]; pendencias: string[] } {
  const cancelar: { reserva_id: string; evidencia: string }[] = [];
  const pendencias: string[] = [];
  const vistos = new Set<string>();
  for (const p of pedidos ?? []) {
    if (vistos.has(p.reserva_id)) continue;
    vistos.add(p.reserva_id);
    const r = ctx.reservas.find((x) => x.id === p.reserva_id);
    if (!r || !evidenciaNaConversa(p.evidencia, ctx.conversa)) continue;
    const quando = `${r.direcao === "ida" ? "Ida" : "Volta"} ${r.data.split("-").reverse().slice(0, 2).join("/")}`;
    const pendencia = (motivo: string) =>
      pendencias.push(`O cliente parece ter desistido da ${quando}: "${p.evidencia}" — ${motivo}. Confira e cancele pela Agenda.`);
    const parte = partesDaEvidencia(p.evidencia).at(-1) ?? "";
    const falaDele = [...ctx.falas]
      .filter((f) => f.quem === "cliente" && ` ${normalizarTexto(f.texto)} `.includes(parte))
      .sort((a, b) => b.em.localeCompare(a.em))[0];
    if (!falaDele) {
      pendencia("a frase não é do cliente");
      continue;
    }
    if (!(Date.parse(falaDele.em) > Date.parse(r.criada_em))) {
      pendencia("a frase é de antes da reserva");
      continue;
    }
    if (!RE_DESISTENCIA.test(` ${normalizarTexto(falaDele.texto)} `)) {
      pendencia("a frase não diz que ele desiste");
      continue;
    }
    if (falaDele.texto.includes("?") || RE_PERGUNTA.test(` ${normalizarTexto(falaDele.texto)} `)) {
      pendencia("é uma pergunta");
      continue;
    }
    if (RE_MUDANCA.test(` ${normalizarTexto(falaDele.texto)} `)) {
      pendencia("parece mudança de dia, não desistência");
      continue;
    }
    if (RE_TERCEIRO.test(` ${normalizarTexto(falaDele.texto)} `)) {
      pendencia("parece que quem não vai é outra pessoa");
      continue;
    }
    if (r.quantidade > 1 && !RE_TODAS.test(` ${normalizarTexto(falaDele.texto)} `)) {
      pendencia(`a reserva tem ${r.quantidade} passagens e a frase não diz que são todas`);
      continue;
    }
    if (r.tipo === "encomenda") {
      pendencia("é encomenda");
      continue;
    }
    const mexida = ctx.mexidaPelaEquipe?.[r.id];
    if (mexida && Date.parse(mexida) > Date.parse(falaDele.em)) {
      pendencia("a equipe mexeu na reserva depois");
      continue;
    }
    if (!(p.certeza === "alta" || (ctx.confirmadoPelaEquipe && p.certeza === "media"))) {
      pendencia(`certeza ${p.certeza}`);
      continue;
    }
    const depois = ctx.falas.filter((f) => Date.parse(f.em) > Date.parse(falaDele.em));
    if (depois.some((f) => f.quem === "cliente" && RE_VOLTOU_ATRAS.test(` ${normalizarTexto(f.texto)} `))) {
      pendencia("depois ele parece ter voltado atrás");
      continue;
    }
    if (!ctx.confirmadoPelaEquipe && depois.some((f) => f.quem === "equipe" && (ehMarcaDeAgendado(f.texto) || ehMarcaDeCorrecao(f.texto)))) {
      pendencia("a equipe marcou a conversa depois");
      continue;
    }
    if ((ctx.pagas ?? []).includes(r.id)) {
      pendencia("a reserva está paga (ver reembolso)");
      continue;
    }
    const citadas = reservasCitadas(falaDele.texto, ctx.reservas, falaDele.em);
    if (!ctx.confirmadoPelaEquipe && (citadas.length !== 1 || citadas[0].id !== r.id)) {
      pendencia("a frase não aponta só para esta reserva");
      continue;
    }
    cancelar.push({ reserva_id: r.id, evidencia: p.evidencia });
  }
  return { cancelar, pendencias };
}

/** "Cancelei a passagem da Volta de segunda (23/11), como você pediu…" — nunca valor. */
export function mensagemDeCancelamento(
  reservas: { data: string; direcao: "ida" | "volta"; tipo: "passagem" | "encomenda"; quantidade: number }[],
  ctx: { hoje: string; nome?: string | null },
): string | null {
  if (!reservas.length) return null;
  const quando = (data: string) => {
    const ddmm = `${data.slice(8, 10)}/${data.slice(5, 7)}`;
    const amanha = new Date(`${ctx.hoje}T12:00:00Z`);
    amanha.setUTCDate(amanha.getUTCDate() + 1);
    if (data === ctx.hoje) return `de hoje (${ddmm})`;
    if (data === amanha.toISOString().slice(0, 10)) return `de amanhã (${ddmm})`;
    const dia = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"][new Date(`${data}T12:00:00Z`).getUTCDay()];
    return `de ${dia} (${ddmm})`;
  };
  const itens = reservas.map((r) => {
    const o = r.tipo === "encomenda" ? "a encomenda" : r.quantidade > 1 ? `as ${r.quantidade} passagens` : "a passagem";
    return `${o} da ${r.direcao === "ida" ? "Ida" : "Volta"} ${quando(r.data)}`;
  });
  const lista = itens.length === 1 ? itens[0] : `${itens.slice(0, -1).join(", ")} e ${itens.at(-1)}`;
  const primeiro = String(ctx.nome ?? "").trim().split(/\s+/)[0];
  return `${primeiro ? `${primeiro}, c` : "C"}ancelei ${lista}, como você pediu. Se foi engano ou quiser remarcar, é só responder aqui.`;
}
