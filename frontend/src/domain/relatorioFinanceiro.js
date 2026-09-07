// Relatório financeiro por período — regra pura (issue #12).
//
// Recebe as linhas cruas de `financial_entries` (mesma forma que o
// financeService devolve: { entry_date, type, category, amount }) e agrega
// em faturamento / despesa / lucro por dia, por mês ou por ano. SEM React,
// SEM I/O, SEM locale surpresa — quem formata é a camada de UI/export.
//
// `type` só pode ser "receita" ou "despesa" (enum do banco). Qualquer outro
// valor é ignorado — o relatório nunca inventa número.

const GRANULARIDADES = ["dia", "mes", "ano"];

/** "2026-09-07" -> { ano: 2026, mes: 9, dia: 7 } (ou null se malformado). */
export function partesData(entryDate) {
  if (typeof entryDate !== "string") return null;
  const m = entryDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  return { ano, mes, dia };
}

/** Chave do bucket de um lançamento para a granularidade pedida. */
export function chavePeriodo(entryDate, granularidade) {
  const p = partesData(entryDate);
  if (!p) return null;
  const mm = String(p.mes).padStart(2, "0");
  const dd = String(p.dia).padStart(2, "0");
  if (granularidade === "ano") return `${p.ano}`;
  if (granularidade === "mes") return `${p.ano}-${mm}`;
  return `${p.ano}-${mm}-${dd}`;
}

function valorLancamento(amount) {
  const n = Number(amount);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Agrega uma lista de lançamentos em linhas por período.
 * @returns {{ periodo: string, faturamento: number, despesa: number, lucro: number, lancamentos: number }[]}
 *          ordenado por período crescente.
 */
export function agregarPorPeriodo(entries, granularidade = "mes") {
  if (!GRANULARIDADES.includes(granularidade)) {
    throw new Error(`granularidade inválida: ${granularidade}`);
  }
  const buckets = new Map();
  for (const e of entries || []) {
    if (e?.type !== "receita" && e?.type !== "despesa") continue;
    const chave = chavePeriodo(e?.entry_date, granularidade);
    if (!chave) continue;
    if (!buckets.has(chave)) {
      buckets.set(chave, { periodo: chave, faturamento: 0, despesa: 0, lucro: 0, lancamentos: 0 });
    }
    const b = buckets.get(chave);
    const v = valorLancamento(e.amount);
    if (e.type === "receita") b.faturamento += v;
    else b.despesa += v;
    b.lucro = b.faturamento - b.despesa;
    b.lancamentos += 1;
  }
  // as chaves de período são strings zero-padded ("2026-01", "2026-01-05",
  // "2026") — ordem lexicográfica == ordem cronológica.
  return [...buckets.values()].sort((a, b) => a.periodo.localeCompare(b.periodo));
}

/** Quebra as despesas por categoria (para o corpo do relatório). */
export function despesaPorCategoria(entries) {
  const buckets = new Map();
  for (const e of entries || []) {
    if (e?.type !== "despesa") continue;
    const cat = e?.category || "outro";
    buckets.set(cat, (buckets.get(cat) || 0) + valorLancamento(e.amount));
  }
  return [...buckets.entries()]
    .map(([categoria, total]) => ({ categoria, total }))
    .sort((a, b) => b.total - a.total);
}

/** Soma geral de um conjunto de linhas já agregadas. */
export function totaisRelatorio(linhas) {
  return (linhas || []).reduce(
    (acc, l) => {
      acc.faturamento += l.faturamento;
      acc.despesa += l.despesa;
      acc.lucro = acc.faturamento - acc.despesa;
      acc.lancamentos += l.lancamentos;
      return acc;
    },
    { faturamento: 0, despesa: 0, lucro: 0, lancamentos: 0 },
  );
}

/**
 * Monta o objeto completo do relatório, pronto para a camada de export.
 * `escopo` é só metadado de título ("Setembro/2026", "2026"...).
 */
export function montarRelatorioFinanceiro(entries, { granularidade = "mes", escopo = "", geradoEm } = {}) {
  const linhas = agregarPorPeriodo(entries, granularidade);
  return {
    granularidade,
    escopo,
    geradoEm: geradoEm || new Date().toISOString(),
    linhas,
    totais: totaisRelatorio(linhas),
    porCategoria: despesaPorCategoria(entries),
  };
}
