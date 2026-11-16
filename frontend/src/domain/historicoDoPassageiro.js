// Histórico de viagens do passageiro no CRM (issue #436): as próximas primeiro (da mais perto
// para a mais longe), depois as anteriores (da mais recente para a mais antiga), com a data, o
// sentido e a situação de cada uma. Regras puras — sem React, sem I/O.

const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

const SITUACAO = {
  confirmada: "Confirmada",
  pendente: "Pendente",
  embarcado: "Embarcou",
  cancelada: "Cancelada",
  nao_compareceu: "Não compareceu",
};

/** Rótulo da situação da reserva; status desconhecido aparece como veio. */
export const situacaoDaViagem = (status) => SITUACAO[status] ?? String(status ?? "");

/** "seg, 16/11/2026" — o dia da semana ajuda a lembrar a viagem (segunda tem horário próprio). */
export function dataDoHistorico(data) {
  const [a, m, d] = data.split("-");
  return `${SEMANA[new Date(`${data}T12:00:00Z`).getUTCDay()]}, ${d}/${m}/${a}`;
}

// No mesmo dia a Ida vem antes da Volta; no mesmo dia e sentido, a reserva mais antiga antes.
const ordemNoDia = (a, b) =>
  (a.direcao === "volta") - (b.direcao === "volta") ||
  String(a.criadoEm ?? "").localeCompare(String(b.criadoEm ?? ""));

/**
 * Separa o histórico em próximas (data de hoje em diante) e anteriores. Linha sem data válida
 * fica de fora. Cada item ganha `quando`, `sentido`, `situacao`, `encomenda` e `valor` (sem valor
 * na cancelada: não conta no que o passageiro gerou).
 */
export function historicoDoPassageiro(viagens, hoje) {
  const itens = (viagens ?? [])
    .filter((v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v?.data ?? "")))
    .map((v) => ({
      ...v,
      quando: dataDoHistorico(v.data),
      sentido: v.direcao === "volta" ? "Volta" : "Ida",
      situacao: situacaoDaViagem(v.status),
      encomenda: v.tipo === "encomenda",
      valor: v.status === "cancelada" ? null : Number(v.valorTotal) || null,
    }));
  const proximas = itens
    .filter((v) => v.data >= hoje)
    .sort((a, b) => a.data.localeCompare(b.data) || ordemNoDia(a, b));
  const anteriores = itens
    .filter((v) => v.data < hoje)
    .sort((a, b) => b.data.localeCompare(a.data) || ordemNoDia(b, a));
  return { proximas, anteriores, total: itens.length };
}
