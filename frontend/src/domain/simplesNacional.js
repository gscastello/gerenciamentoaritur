// src/domain/simplesNacional.js
//
// Estimativa do DAS do Simples Nacional (issue #366). É ESTIMATIVA para o dono
// se planejar: quem confirma é o contador (o Simples tem detalhes que mudam a
// conta — transporte intermunicipal de passageiros, por exemplo, troca o ISS do
// Anexo III pelo ICMS do Anexo I). Por isso a alíquota pode ser fixada à mão
// (settings.simples.aliquota_manual), com o número que o contador passar.
//
// Conta oficial (LC 123/2006, art. 18): alíquota efetiva =
//   (RBT12 × alíquota nominal da faixa − parcela a deduzir) ÷ RBT12
// RBT12 = receita bruta dos 12 meses anteriores ao mês de apuração.

const FAIXAS = {
  // [teto da faixa (R$), alíquota nominal, parcela a deduzir (R$)]
  I: [
    [180000, 0.04, 0],
    [360000, 0.073, 5940],
    [720000, 0.095, 13860],
    [1800000, 0.107, 22500],
    [3600000, 0.143, 87300],
    [4800000, 0.19, 378000],
  ],
  III: [
    [180000, 0.06, 0],
    [360000, 0.112, 9360],
    [720000, 0.135, 17640],
    [1800000, 0.16, 35640],
    [3600000, 0.21, 125640],
    [4800000, 0.33, 648000],
  ],
};

export const ANEXOS = Object.keys(FAIXAS);
const LIMITE = 4800000;

/** Alíquota efetiva (0–1) pela receita dos últimos 12 meses. null = fora do Simples. */
export function aliquotaEfetiva(rbt12, anexo = "III") {
  const faixas = FAIXAS[anexo] ?? FAIXAS.III;
  const rb = Number(rbt12) || 0;
  if (rb > LIMITE) return null;
  if (rb <= 0) return faixas[0][1]; // começo de atividade: a primeira faixa
  const [, nominal, deduzir] = faixas.find(([teto]) => rb <= teto);
  return Math.round(((rb * nominal - deduzir) / rb) * 1e6) / 1e6;
}

/** Os 12 meses anteriores a `mes` ("AAAA-MM"), do mais antigo ao mais novo. */
export function mesesDoRbt12(mes) {
  const [a, m] = String(mes).split("-").map(Number);
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(a, m - 1 - 12 + i, 1));
    return d.toISOString().slice(0, 7);
  });
}

/**
 * Estimativa do DAS de um mês de apuração.
 * `receitas`: { "AAAA-MM": total de receitas do mês }.
 * Devolve { mes, receitaMes, rbt12, aliquota, manual, valor, mesesSemDado } ou null fora do Simples.
 */
export function estimarDas({ mes, receitas, anexo = "III", aliquotaManual = null }) {
  const meses = mesesDoRbt12(mes);
  const rbt12 = Math.round(meses.reduce((s, k) => s + (Number(receitas?.[k]) || 0), 0) * 100) / 100;
  const receitaMes = Math.round((Number(receitas?.[mes]) || 0) * 100) / 100;
  const manual =
    aliquotaManual != null && Number(aliquotaManual) > 0 ? Number(aliquotaManual) / 100 : null;
  const aliquota = manual ?? aliquotaEfetiva(rbt12, anexo);
  if (aliquota == null) return null;
  return {
    mes,
    receitaMes,
    rbt12,
    aliquota,
    manual: manual != null,
    valor: Math.round(receitaMes * aliquota * 100) / 100,
    mesesSemDado: meses.filter((k) => !(Number(receitas?.[k]) > 0)).length,
  };
}

/** Soma das receitas por mês ("AAAA-MM") a partir dos lançamentos do Financeiro. */
export function receitasPorMes(lancamentos) {
  const out = {};
  for (const l of lancamentos ?? []) {
    if (l?.type !== "receita") continue;
    const k = String(l.entry_date ?? "").slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(k)) continue;
    out[k] = Math.round(((out[k] ?? 0) + (Number(l.amount) || 0)) * 100) / 100;
  }
  return out;
}

/** Mês de apuração do DAS que vence em `vence_em` (o DAS do dia 20 é do mês anterior). */
export function mesDeApuracao(venceEm) {
  const [a, m] = String(venceEm).split("-").map(Number);
  return new Date(Date.UTC(a, m - 2, 1)).toISOString().slice(0, 7);
}
