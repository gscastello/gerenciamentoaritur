// Resultado de cada dia do mês (issue #446, visual v18): as barras embaixo do "Resultado antes do
// imposto" no Financeiro. Regras puras — sem React, sem I/O.

/**
 * Receitas menos despesas em cada dia do mês (`mes` de 1 a 12): [{ dia, resultado }], um item por
 * dia, mesmo sem lançamento. Lançamento de outro mês fica de fora.
 */
export function resultadoPorDia(lancamentos, ano, mes) {
  const dias = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const prefixo = `${ano}-${String(mes).padStart(2, "0")}-`;
  const lista = Array.from({ length: dias }, (_, i) => ({ dia: i + 1, resultado: 0 }));
  for (const l of lancamentos ?? []) {
    const data = String(l?.data ?? "");
    if (!data.startsWith(prefixo)) continue;
    const dia = Number(data.slice(8, 10));
    if (!(dia >= 1 && dia <= dias)) continue;
    const valor = Number(l.valor) || 0;
    if (l.tipo === "receita") lista[dia - 1].resultado += valor;
    else if (l.tipo === "despesa") lista[dia - 1].resultado -= valor;
  }
  return lista;
}

/** Altura de cada barra de 0 a 1 em relação ao maior resultado (em módulo) do mês. */
export function alturasDasBarras(dias) {
  const maior = Math.max(0, ...dias.map((d) => Math.abs(d.resultado)));
  return dias.map((d) => (maior > 0 ? Math.abs(d.resultado) / maior : 0));
}
