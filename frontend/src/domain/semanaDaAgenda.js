// Semana e calendário da Agenda (issue #446, simulação v18 aprovada pelo dono): a semana fica no
// topo, com a lotação da Ida e da Volta de cada dia, e o mês inteiro abre num calendário.
// Regras puras — sem React, sem I/O. Datas sempre em texto "AAAA-MM-DD" (o dia de Fortaleza),
// com a conta feita em UTC para o fuso de quem usa o aparelho não mudar o dia.

import { contaNaLotacao } from "./vagas.js";

const DIA_MS = 86400000;
const SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const SEMANA_CURTA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

const paraData = (iso) => {
  const [a, m, d] = String(iso).split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d));
};
const paraIso = (dt) => dt.toISOString().slice(0, 10);

/** O dia `iso` mais `n` dias. */
export function somarDias(iso, n) {
  return paraIso(new Date(paraData(iso).getTime() + n * DIA_MS));
}

/** 0 = domingo … 6 = sábado. */
export function diaDaSemana(iso) {
  return paraData(iso).getUTCDay();
}

/** "seg", "ter"… */
export function nomeCurtoDoDia(iso) {
  return SEMANA_CURTA[diaDaSemana(iso)];
}

/** Os sete dias da semana de `iso`, de segunda a domingo. */
export function diasDaSemana(iso) {
  const segunda = somarDias(iso, -((diaDaSemana(iso) + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => somarDias(segunda, i));
}

/**
 * O mês em semanas de segunda a domingo, para o calendário. `mes` vai de 1 a 12; as casas antes
 * do dia 1 e depois do último dia ficam `null`.
 */
export function gradeDoMes(ano, mes) {
  const primeiro = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const dias = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const antes = (diaDaSemana(primeiro) + 6) % 7;
  const casas = [
    ...Array.from({ length: antes }, () => null),
    ...Array.from({ length: dias }, (_, i) => somarDias(primeiro, i)),
  ];
  while (casas.length % 7) casas.push(null);
  const semanas = [];
  for (let i = 0; i < casas.length; i += 7) semanas.push(casas.slice(i, i + 7));
  return semanas;
}

/** "novembro de 2026" */
export function nomeDoMes(ano, mes) {
  return `${MESES[mes - 1]} de ${ano}`;
}

/** O mês seguinte (`passo` = 1) ou o anterior (`passo` = -1): { ano, mes }. */
export function andarMes({ ano, mes }, passo) {
  const t = ano * 12 + (mes - 1) + passo;
  return { ano: Math.floor(t / 12), mes: (t % 12) + 1 };
}

/**
 * Passageiros que ocupam vaga, por dia e sentido: { "AAAA-MM-DD": { ida, volta } }. Mesma regra
 * da lotação da viagem (confirmada ou embarcada, sem extra, sem encomenda).
 */
export function lotacaoDosDias(reservas) {
  const dias = {};
  for (const r of reservas ?? []) {
    if (!r?.data || (r.direcao !== "ida" && r.direcao !== "volta") || !contaNaLotacao(r)) continue;
    dias[r.data] ??= { ida: 0, volta: 0 };
    dias[r.data][r.direcao] += Number(r.quantidade) || 1;
  }
  return dias;
}

/** A viagem está quase cheia (90% dos lugares ou mais)? É o que acende em vermelho. */
export function quaseCheia(passageiros, capacidade) {
  return capacidade > 0 && passageiros / capacidade >= 0.9;
}

/** Fração dos lugares ocupados, de 0 a 1 (para a barrinha de cada dia). */
export function fracaoOcupada(passageiros, capacidade) {
  if (!(capacidade > 0)) return 0;
  return Math.min(1, Math.max(0, passageiros / capacidade));
}

/** "Hoje, 16 de novembro", "Amanhã, 17 de novembro", "Sexta, 20 de novembro". */
export function rotuloDoDia(iso, hoje) {
  const d = paraData(iso);
  const resto = `${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`;
  if (iso === hoje) return `Hoje, ${resto}`;
  if (iso === somarDias(hoje, 1)) return `Amanhã, ${resto}`;
  if (iso === somarDias(hoje, -1)) return `Ontem, ${resto}`;
  const nome = SEMANA[d.getUTCDay()];
  return `${nome[0].toUpperCase()}${nome.slice(1)}, ${resto}`;
}

/** "Sexta, 20 de novembro: Ida 27 de 31, Volta 12 de 31" — o nome do dia para quem usa leitor de tela. */
export function descricaoDoDia(iso, hoje, { ida, volta, capIda, capVolta }) {
  return `${rotuloDoDia(iso, hoje)}: Ida ${ida} de ${capIda}, Volta ${volta} de ${capVolta}`;
}
