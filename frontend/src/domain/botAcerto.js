// src/domain/botAcerto.js
//
// Acerto do bot (issue #311) — regras puras para mostrar o que `rpc_bot_acerto`
// devolve: o nível do acerto, o texto de cada correção e as correções juntas por
// reserva. O cálculo em si é do banco (database/93-acerto-do-bot.sql).

/** Períodos que o cartão oferece, em dias. */
export const PERIODOS_DO_ACERTO = [7, 30, 90];

/**
 * Nível do acerto (% de reservas lançadas pelo bot que ninguém precisou corrigir).
 * O modo automático (`ia`) só faz sentido quando o acerto é alto por semanas.
 */
export function nivelDoAcerto(acerto, lancadas) {
  if (!lancadas || acerto == null) {
    return { nivel: "sem_dados", texto: "Nenhuma reserva lançada pelo bot neste período." };
  }
  if (acerto >= 95) {
    return { nivel: "bom", texto: "Acerto alto: o bot está lançando como a equipe lançaria." };
  }
  if (acerto >= 80) {
    return { nivel: "atencao", texto: "Acerto médio: ainda vale conferir as reservas do bot." };
  }
  return { nivel: "ruim", texto: "Acerto baixo: confira as reservas do bot antes da viagem." };
}

const reais = (v) => {
  const n = Number(v);
  return Number.isFinite(n)
    ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : String(v);
};

/** Valor legível de um lado da correção ("—" quando vazio; valor em reais). */
export function valorDaCorrecao(campo, valor) {
  if (valor == null || String(valor).trim() === "") return "—";
  return campo === "valor" ? reais(valor) : String(valor);
}

/** "dia/sentido: 12/11 Ida → 11/11 Volta" */
export function textoDaCorrecao(c) {
  return `${c.campo}: ${valorDaCorrecao(c.campo, c.antes)} → ${valorDaCorrecao(c.campo, c.depois)}`;
}

/**
 * Junta as correções da mesma reserva (vêm da mais nova para a mais antiga),
 * mantendo a ordem da primeira aparição. A quantidade mudada e desfeita (1→2→1)
 * aparece como as duas mudanças: é o que a equipe fez.
 */
export function correcoesPorReserva(correcoes) {
  const grupos = new Map();
  for (const c of correcoes ?? []) {
    if (!c?.reserva) continue;
    if (!grupos.has(c.reserva)) {
      grupos.set(c.reserva, {
        reserva: c.reserva,
        cliente: c.cliente?.trim() || "Sem nome",
        viagem: c.viagem ?? null,
        por: c.por ?? null,
        em: c.em ?? null,
        itens: [],
      });
    }
    grupos.get(c.reserva).itens.push(textoDaCorrecao(c));
  }
  return [...grupos.values()];
}
