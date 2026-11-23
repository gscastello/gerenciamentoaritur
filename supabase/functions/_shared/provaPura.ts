// supabase/functions/_shared/provaPura.ts
//
// Prova do atendente de IA (etapa 2 do bot autônomo, issue #501) — regras PURAS, sem rede.
// O atendente (agente.ts) refaz uma conversa real que virou "Agendado ☑️": as mensagens do CLIENTE
// entram como foram escritas, em turnos; as da equipe saem e no lugar delas entra o que o atendente
// responderia. Nada é enviado nem gravado. Aqui: montar os turnos e o histórico de cada um, comparar
// o que ele faria com as viagens que ficaram (inclusive o preço) e estimar o custo por mês.

import { compararCaso, type ResultadoDoCaso, type ViagemDoCaso, type ViagemPlanejada } from "./avaliacaoPura.ts";
import type { MensagemDaConversa } from "./agentePuro.ts";

/** Mensagens seguidas do cliente com até este intervalo entre elas são um turno só (o bot junta). */
export const JANELA_DO_TURNO_MS = 3 * 60 * 1000;
/** Conversa com mais turnos que isso é cortada (custo); os últimos turnos ficam, o pedido costuma estar neles. */
export const MAX_TURNOS = 12;

export type Turno = { mensagens: MensagemDaConversa[]; em: string; /** o "sim" da prova, não do cliente */ sintetico?: boolean };

/**
 * Turnos do cliente até a marca: mensagens seguidas dele (sem resposta da equipe no meio e sem um
 * intervalo maior que a janela) formam um turno. O que a equipe e o bot escreveram sai.
 */
export function turnosDoCliente(mensagens: MensagemDaConversa[], ate: number, janelaMs = JANELA_DO_TURNO_MS): Turno[] {
  const ordenadas = [...mensagens].filter((m) => Date.parse(m.em) <= ate).sort((a, b) => a.em.localeCompare(b.em));
  const turnos: Turno[] = [];
  let atual: MensagemDaConversa[] = [];
  const fechar = () => {
    if (atual.length) turnos.push({ mensagens: atual, em: atual[atual.length - 1].em });
    atual = [];
  };
  for (const m of ordenadas) {
    if (m.quem !== "cliente") {
      fechar();
      continue;
    }
    const ultima = atual[atual.length - 1];
    if (ultima && Date.parse(m.em) - Date.parse(ultima.em) > janelaMs) fechar();
    atual.push(m);
  }
  fechar();
  return turnos.length > MAX_TURNOS ? turnos.slice(-MAX_TURNOS) : turnos;
}

/**
 * O que o atendente lê no turno `i`: os turnos do cliente até ele, cada um seguido da resposta que o
 * próprio atendente deu na prova (a resposta fica 1 s depois da última mensagem do turno).
 */
export function historicoDoTurno(turnos: Turno[], respostas: (string | null)[], i: number): MensagemDaConversa[] {
  const out: MensagemDaConversa[] = [];
  for (let t = 0; t <= i && t < turnos.length; t++) {
    out.push(...turnos[t].mensagens);
    const r = respostas[t];
    if (t < i && r) out.push({ quem: "bot", texto: r, em: new Date(Date.parse(turnos[t].em) + 1000).toISOString() });
  }
  return out;
}

/** O que o atendente FARIA (nada disso é gravado). */
export type AcaoDaProva =
  | {
      tipo: "criar";
      id: string;
      trip_date: string;
      direction: string;
      route_point_code: string | null;
      route_point_name?: string | null;
      quantity: number;
      pickup_neighborhood: string | null;
      pickup_detail: string | null;
      dropoff_location: string | null;
      unit_price: number | null;
      status: string;
      cancelada?: boolean;
      turno: number;
    }
  | { tipo: "remarcar" | "cancelar"; reserva_id: string; da_prova: boolean; detalhe?: Record<string, unknown>; turno: number }
  | { tipo: "espera"; trip_date: string; direction: string; quantity: number; turno: number }
  | { tipo: "avisar_equipe" | "chamar_atendente"; texto: string; turno: number };

export type EsperadaComPreco = ViagemDoCaso & { unit_price?: number | null };

/**
 * Resultado da prova: as reservas que ficariam (criadas e não canceladas na própria prova) contra as
 * que ficaram de verdade, com as regras da avaliação do Agendado, mais o preço. Mexer numa reserva
 * que já existia (remarcar, cancelar) é sempre "errado" para alguém conferir: o caso não diz se era o certo.
 * Passar para a equipe ou terminar perguntando ao cliente sem reservar é pendente (seguro).
 */
export function compararProva(
  esperadas: EsperadaComPreco[],
  acoes: AcaoDaProva[],
  opcoes: { ultimaResposta?: string | null; pendenteOk?: boolean; bairroNaTabela?: (b: string) => string | null } = {},
): ResultadoDoCaso {
  const criadas = acoes.filter((a): a is Extract<AcaoDaProva, { tipo: "criar" }> => a.tipo === "criar" && !a.cancelada);
  const planejadas: ViagemPlanejada[] = criadas.map((c) => ({
    trip_date: c.trip_date,
    direction: c.direction,
    route_point_code: c.route_point_code,
    quantity: c.quantity,
    pickup_neighborhood: c.pickup_neighborhood,
    type: "passagem",
    pendencia: c.status === "pendente" ? { motivo: "fora da área: a equipe confirma", codigo: "fora_da_area" } : null,
  }));
  const motivos: string[] = [];
  if (acoes.some((a) => a.tipo === "chamar_atendente")) motivos.push("passou_para_equipe");
  if (acoes.some((a) => a.tipo === "espera")) motivos.push("lista_de_espera");
  if (!criadas.length && terminaPerguntando(opcoes.ultimaResposta)) motivos.push("perguntou_ao_cliente");
  const base = compararCaso(esperadas, planejadas, {
    motivos,
    pendenteOk: opcoes.pendenteOk,
    bairroNaTabela: opcoes.bairroNaTabela,
  });

  const diferencas = [...base.diferencas];
  let errado = base.resultado === "errado";
  for (const c of criadas) {
    const e = esperadas.find((x) => x.trip_date === c.trip_date && x.direction === c.direction);
    if (!e || e.unit_price == null || c.unit_price == null) continue;
    if (Math.abs(Number(e.unit_price) - Number(c.unit_price)) >= 0.01) {
      errado = true;
      diferencas.push(`preço: ${c.unit_price} ≠ ${e.unit_price} (${c.direction} ${c.trip_date})`);
    }
  }
  for (const a of acoes) {
    if ((a.tipo === "remarcar" || a.tipo === "cancelar") && !a.da_prova) {
      errado = true;
      diferencas.push(`${a.tipo === "cancelar" ? "cancelaria" : "remarcaria"} a reserva ${a.reserva_id}, que já existia: conferir`);
    }
  }
  return { resultado: errado ? "errado" : base.resultado, diferencas };
}

/** O "sim" que a prova dá no lugar do cliente quando o atendente só pede a confirmação do resumo. */
export const SIM_DA_PROVA = "Sim, pode confirmar.";
/** No máximo tantos "sim" da prova por conversa: depois disso, o que faltou é do atendente. */
export const MAX_SIM_DA_PROVA = 2;

/**
 * O atendente terminou pedindo a confirmação do resumo ("Posso confirmar?", "Confirma?", "Pode ser?").
 * Na conversa real a equipe lançou sem perguntar, então o cliente nunca respondeu a isso: a prova responde
 * "sim" por ele, e o que o atendente gravar depois é o que o resumo dizia (se o resumo estava errado, é erro).
 * Pergunta de dado (nome, endereço, quantas) não conta: aí falta o que só o cliente sabe.
 */
export function pedeConfirmacao(texto: string | null | undefined): boolean {
  const t = String(texto ?? "").trim();
  if (!terminaPerguntando(t)) return false;
  const ultima = t.split(/\n+/).filter((l) => l.trim()).pop() ?? "";
  if (/\b(nome|endere[cç]o|rua|bairro|quantas|quantos|qual|onde|que horas|de onde|para onde)\b/i.test(ultima)) return false;
  return /\b(posso|podemos)\s+(confirmar|reservar|agendar|fechar|marcar|lan[cç]ar|garantir)|\bconfirm(a|o|ar|amos)\b|\bpode ser\b|\bfechado\b|\btudo certo\b|\bcerto\s*\?/i.test(ultima);
}

/** A última resposta termina com uma pergunta ao cliente (ele ainda ia responder). */
export function terminaPerguntando(texto: string | null | undefined): boolean {
  return /\?\s*[\p{Extended_Pictographic}\s]*$/u.test(String(texto ?? "").trim());
}

/**
 * Custo por mês: o custo médio por conversa da prova vezes as conversas por dia (82 medidas em 14 dias,
 * issue #501) vezes 30. A prova só tem conversas que viraram reserva; as outras costumam ser mais curtas.
 */
export function custoMensal(custoTotalUsd: number, conversas: number, conversasPorDia = 82): number {
  if (conversas <= 0) return 0;
  return Math.round((custoTotalUsd / conversas) * conversasPorDia * 30 * 100) / 100;
}
