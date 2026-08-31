// Motor de vagas. Regra central do sistema: a lotação é COMPARTILHADA por
// viagem (data + direção), nunca por ponto de embarque. Módulo crítico —
// gate de cobertura reforçado (ver vite.config.js / codecov.yml).

import { OCUPA_VAGA, TIPOS_SEM_VAGA } from "./constants.js";

function contaNaLotacao(r) {
  return OCUPA_VAGA.includes(r.status) && !TIPOS_SEM_VAGA.includes(r.tipo);
}

/** Lugares já ocupados numa viagem (data + direção). */
export function ocupacao(reservas, data, direcao) {
  return reservas
    .filter((r) => r.data === data && r.direcao === direcao && contaNaLotacao(r))
    .reduce((soma, r) => soma + (Number(r.quantidade) || 1), 0);
}

/** Vagas livres numa viagem. Nunca negativo. */
export function vagasDisponiveis(reservas, data, direcao, capacidade) {
  return Math.max(0, capacidade - ocupacao(reservas, data, direcao));
}

/**
 * Uma reserva (nova OU editada) cabe na viagem?
 * `ignorarId` exclui a própria reserva da contagem — é o que torna a
 * checagem correta na edição manual (issue #14), não só na criação.
 */
export function cabeNaViagem({
  reservas,
  data,
  direcao,
  capacidade,
  quantidade,
  ignorarId = null,
}) {
  const base = ignorarId ? reservas.filter((r) => r.id !== ignorarId) : reservas;
  return (Number(quantidade) || 1) <= vagasDisponiveis(base, data, direcao, capacidade);
}

export function excedeCapacidade(params) {
  return !cabeNaViagem(params);
}
