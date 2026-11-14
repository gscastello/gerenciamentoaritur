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
import { viagemDeHojeJaSaiu } from "./rascunhoPuro.ts";

/** Uma fala da conversa (cliente ou equipe) com a hora em que foi escrita. */
export type FalaDaRevisao = { em: string; texto: string };

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
    if (mudouEm) {
      if (hora && Date.parse(hora) > Date.parse(mudouEm)) pendencias.push(a);
      else descartados.push(a);
      continue;
    }
    // o cliente (ou a equipe) corrigiu DEPOIS de a reserva ser criada: é a confirmação (issue #343)
    const posterior = !!hora && Date.parse(hora) > Date.parse(r.criada_em);
    const mudaAViagem = a.campo === "data" || a.campo === "sentido";
    let ok = CORRIGE_SOZINHO.includes(a.campo) &&
      (a.certeza === "alta" || (a.certeza === "media" && posterior && !mudaAViagem));
    // dia e sentido mudam a viagem inteira: só sozinho se o cliente/equipe disse DEPOIS da reserva
    // ("na verdade é dia 15"). Prova anterior pode ser de outro pedido — a equipe confere.
    if (ok && mudaAViagem) ok = posterior;
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
    finais.push(c);
  }
  return { correcoes: finais, pendencias, descartados };
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
- ponto de embarque (códigos abaixo), bairro (busca em casa), embarque (rua/referência), desembarque, quantidade, tipo (passagem/encomenda).
- endereço trocado de lugar: rua/referência da cidade de embarque gravada como desembarque (na Volta, rua de Cantanhede/Pirapemas no desembarque), ou o NOME do passageiro lido como lugar ("De Cantanhede pra Luís / Maria Souza / Rua X perto do banco": "Luís" = São Luís, "Maria Souza" = nome, a rua = embarque). Confira cada parte do que o cliente escreveu e onde ela foi parar. Rua com nome de cidade ("Rua Santa Rita", "Av. Colombo") é só a rua, não a cidade do caminho.
- quantidade: é o número que o cliente PEDIU. Frase de costume ("eu e minhas filhas viajamos sempre com vocês") não pede mais vagas: não aponte. N passagens com desembarques diferentes na mesma viagem formam UMA reserva de N (todas têm de estar reservadas).
- apartamento/bloco/casa mandados depois são complemento: o endereço tem de manter a rua e o condomínio.
- reserva que o cliente desistiu ou que está repetida; pedido da conversa que ficou sem reserva (não aponte como achado: só explique em observacoes).
- CUIDADO com pedidos antigos: a conversa traz pedidos de viagens JÁ FEITAS (listadas em VIAGENS PASSADAS). Mensagem que pediu uma viagem passada não vale para as futuras. Cada reserva futura corresponde ao pedido mais recente antes dela.
- A resposta do cliente vale para o que a equipe perguntou ("Te buscamos aonde?" → embarque). Sugestão da equipe que o cliente negou não vale. "Parada das vans" = ponto retorno. Campestre na Volta = ponto pirapemas; outras cidades do caminho na Volta = ponto cantanhede.

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
      observacoes: { type: "string", description: "pedido sem reserva, desistência ou dúvida que a equipe deve ver" },
      equipe_precisa_agir: {
        type: "boolean",
        description: "true SÓ se a observação pede uma ação da equipe (pedido sem reserva, desistência, dúvida que você não resolve). Tudo certo = false.",
      },
    },
    required: ["achados"],
  },
};
