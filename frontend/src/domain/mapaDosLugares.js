// Mapa dos lugares da Agenda (issue #430): o desenho do veículo da viagem do dia, fiel ao da
// AriTur. Regras puras — sem React, sem I/O.
//
// Ônibus (31): 1ª fileira só com os assentos que sobram, do lado esquerdo (à direita fica a
// porta), fileiras de 2 + corredor + 2 e o fundo com 5 — 2 + 6×4 + 5 = 31.
// Van (até 20 lugares, a reserva tem 15): fileiras de 2 + corredor + 1 e o fundo inteiro.
//
// Cada fileira é uma lista de casas: { tipo: "assento", n } (n = 0, 1, 2… na ordem em que os
// lugares são ocupados no desenho), { tipo: "corredor" } ou { tipo: "porta" } (sem assento).

/** Até quantos lugares o veículo é desenhado como van. */
export const LUGARES_DA_VAN = 20;

const CORREDOR = { tipo: "corredor" };
const PORTA = { tipo: "porta" };

function numerador() {
  let n = 0;
  return () => ({ tipo: "assento", n: n++ });
}

function fileirasDoOnibus(total) {
  const assento = numerador();
  const fundo = Math.min(5, total);
  const meio = total - fundo;
  const frente = meio % 4;
  const cheias = (meio - frente) / 4;
  const fileiras = [];
  if (frente) {
    // os que sobram vão na frente, do lado esquerdo; o lado direito é a porta
    const esquerda = Math.min(2, frente);
    const direita = frente - esquerda;
    fileiras.push([
      ...Array.from({ length: esquerda }, assento),
      ...(esquerda < 2 ? [PORTA] : []),
      CORREDOR,
      ...Array.from({ length: direita }, assento),
      ...Array.from({ length: 2 - direita }, () => PORTA),
    ]);
  }
  for (let i = 0; i < cheias; i++)
    fileiras.push([assento(), assento(), CORREDOR, assento(), assento()]);
  fileiras.push(Array.from({ length: fundo }, assento));
  return fileiras;
}

function fileirasDaVan(total) {
  const assento = numerador();
  // o fundo é inteiro: 3 lugares (ou 4 / 2 quando a conta não fecha em fileiras de 3)
  const resto = total % 3;
  const fundo = Math.min(total, resto === 0 ? 3 : resto === 1 ? 4 : 2);
  const fileiras = [];
  for (let i = 0; i < (total - fundo) / 3; i++)
    fileiras.push([assento(), assento(), CORREDOR, assento()]);
  fileiras.push(Array.from({ length: fundo }, assento));
  return fileiras;
}

/** As fileiras do veículo de `capacidade` lugares (vazio quando não há lugares). */
export function fileirasDoVeiculo(capacidade) {
  const total = Math.max(0, Math.floor(Number(capacidade) || 0));
  if (!total) return [];
  return total <= LUGARES_DA_VAN ? fileirasDaVan(total) : fileirasDoOnibus(total);
}

/**
 * Estado de cada lugar no desenho: os confirmados acendem primeiro, depois os pendentes
 * (riscados); o resto fica livre. Nunca passa da capacidade.
 */
export function ocupacaoDosLugares({ capacidade, confirmados, pendentes }) {
  const total = Math.max(0, Math.floor(Number(capacidade) || 0));
  const acesos = Math.min(Math.max(0, Number(confirmados) || 0), total);
  const riscados = Math.min(Math.max(0, Number(pendentes) || 0), total - acesos);
  return {
    total,
    acesos,
    riscados,
    livres: total - acesos - riscados,
    estado: (n) => (n < acesos ? "confirmado" : n < acesos + riscados ? "pendente" : "livre"),
  };
}
