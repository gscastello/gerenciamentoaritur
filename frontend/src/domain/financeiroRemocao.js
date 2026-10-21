// Remover / limpar lançamentos financeiros (issue #200).
//
// A remoção é sempre "soft" (o registro some do financeiro mas fica no banco
// e na auditoria). Pode atingir lançamentos que NASCEM de outra coisa — a
// receita de uma reserva, o abastecimento, a manutenção —, então a tela
// precisa dizer ao dono exatamente o que ele está tirando e o que continua
// existindo. Aqui ficam as contas e o texto da confirmação (puro, testável).

import { fmtBRL } from "./format.js";

/**
 * Resumo do que será removido. Cada item é um lançamento no formato da tela
 * (`mapEntry`): { tipo: "receita"|"despesa", valor, auto, reservationId }.
 */
export function resumoDaRemocao(entradas) {
  const lista = entradas ?? [];
  const soma = (tipo) =>
    lista.filter((e) => e.tipo === tipo).reduce((s, e) => s + (Number(e.valor) || 0), 0);
  return {
    total: lista.length,
    receitas: lista.filter((e) => e.tipo === "receita").length,
    despesas: lista.filter((e) => e.tipo === "despesa").length,
    valorReceitas: soma("receita"),
    valorDespesas: soma("despesa"),
    deReservas: lista.filter((e) => !!e.reservationId).length,
    daOperacao: lista.filter((e) => !!e.auto).length,
  };
}

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/** Texto do `window.confirm`: o que sai, e o que continua existindo. */
export function mensagemDeRemocao(titulo, resumo) {
  const linhas = [
    `${titulo}?`,
    "",
    `• ${plural(resumo.total, "lançamento", "lançamentos")}: ` +
      `${plural(resumo.receitas, "receita", "receitas")} (${fmtBRL(resumo.valorReceitas)}) e ` +
      `${plural(resumo.despesas, "despesa", "despesas")} (${fmtBRL(resumo.valorDespesas)}).`,
  ];
  if (resumo.deReservas > 0) {
    linhas.push(
      `• ${plural(resumo.deReservas, "vem", "vêm")} de reservas: a reserva e o pagamento continuam; só saem do financeiro.`,
    );
  }
  if (resumo.daOperacao > 0) {
    linhas.push(
      `• ${plural(resumo.daOperacao, "vem", "vêm")} da operação (combustível/manutenção): o registro continua; só sai do financeiro.`,
    );
  }
  linhas.push(
    "",
    "O fechamento de caixa dos dias passados é recalculado. A remoção fica na auditoria.",
  );
  return linhas.join("\n");
}
