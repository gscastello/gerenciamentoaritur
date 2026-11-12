// src/domain/puxarParaAtualizar.js
//
// Regra do "puxar para atualizar" (issue #353): o dedo puxa a página para baixo
// a partir do topo; a distância mostrada cresce com resistência (metade do
// movimento) até um teto, e só atualiza se passar do limiar ao soltar.

/** Distância (px) que o indicador precisa descer para atualizar ao soltar. */
export const LIMIAR_PUXAO = 70;
/** Até onde o indicador desce, por mais que o dedo puxe. */
export const PUXAO_MAXIMO = 110;

/** Quanto o indicador desce para um movimento do dedo de `dy` px (para baixo). */
export function distanciaDoPuxao(dy) {
  const d = Number(dy);
  if (!(d > 0)) return 0;
  return Math.min(PUXAO_MAXIMO, Math.round(d * 0.5));
}

/** Soltou com essa distância: atualiza? */
export function puxaoAtualiza(distancia) {
  return Number(distancia) >= LIMIAR_PUXAO;
}
