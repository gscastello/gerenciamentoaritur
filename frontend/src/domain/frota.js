// src/domain/frota.js
//
// Consumo fora do normal (issue #369). Regra única: a tela Operação marca o
// abastecimento e o banco (database/103, trigger em fuel_records) avisa no sino
// com a MESMA conta — mudou aqui, muda lá.
//
// Com litros: km/l do abastecimento abaixo de 85% do normal do veículo.
// Sem litros: custo por km acima de 120% do normal (o que a tela já fazia).
// "Normal" = mediana dos últimos 8 abastecimentos ANTERIORES do mesmo veículo
// (a mediana não se deixa levar por um abastecimento lançado errado). Com menos
// de 3 anteriores não há normal: não avisa.

export const REGRA_DE_CONSUMO = {
  kmPorLitroMinimo: 0.85,
  custoPorKmMaximo: 1.2,
  janela: 8,
  minimoAnteriores: 3,
};

const arred = (n, casas = 2) => Math.round(n * 10 ** casas) / 10 ** casas;

/** km/l de um abastecimento (km rodados ÷ litros) ou null sem os dois. */
export function kmPorLitro(r) {
  const km = Number(r?.km) || 0;
  const litros = Number(r?.litros) || 0;
  return km > 0 && litros > 0 ? arred(km / litros) : null;
}

/** R$ por km de um abastecimento ou null sem km. */
export function custoPorKm(r) {
  const km = Number(r?.km) || 0;
  const custo = Number(r?.combustivel) || 0;
  return km > 0 && custo > 0 ? arred(custo / km, 4) : null;
}

function mediana(valores) {
  const v = [...valores].sort((a, b) => a - b);
  if (v.length === 0) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** Os abastecimentos do mesmo veículo antes deste (data, depois id), do mais novo ao mais velho. */
function anteriores(registro, historico) {
  return (historico ?? [])
    .filter(
      (h) =>
        h.id !== registro.id &&
        h.veiculoId === registro.veiculoId &&
        (h.data < registro.data ||
          (h.data === registro.data && String(h.id) < String(registro.id))),
    )
    .sort((a, b) =>
      a.data === b.data ? String(b.id).localeCompare(String(a.id)) : b.data < a.data ? -1 : 1,
    );
}

/**
 * O abastecimento está fora do normal do veículo?
 * Devolve { fora, medida: "km_l" | "custo_km", atual, normal } ou null quando
 * não dá para comparar (sem km, sem histórico suficiente).
 */
export function consumoForaDoNormal(registro, historico, regra = REGRA_DE_CONSUMO) {
  const antes = anteriores(registro, historico);
  const atualKmL = kmPorLitro(registro);
  if (atualKmL != null) {
    const base = antes
      .map(kmPorLitro)
      .filter((x) => x != null)
      .slice(0, regra.janela);
    if (base.length < regra.minimoAnteriores) return null;
    const normal = arred(mediana(base));
    return {
      fora: atualKmL < normal * regra.kmPorLitroMinimo,
      medida: "km_l",
      atual: atualKmL,
      normal,
    };
  }
  const atualCusto = custoPorKm(registro);
  if (atualCusto == null) return null;
  const base = antes
    .map(custoPorKm)
    .filter((x) => x != null)
    .slice(0, regra.janela);
  if (base.length < regra.minimoAnteriores) return null;
  const normal = arred(mediana(base), 4);
  return {
    fora: atualCusto > normal * regra.custoPorKmMaximo,
    medida: "custo_km",
    atual: atualCusto,
    normal,
  };
}

/** Texto curto do alerta para a lista de abastecimentos. */
export function textoDoConsumo(c) {
  if (!c?.fora) return "";
  const br = (n, casas) =>
    n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
  return c.medida === "km_l"
    ? `consumo fora do normal: ${br(c.atual, 1)} km/l (normal ${br(c.normal, 1)})`
    : `custo por km acima do normal: R$ ${br(c.atual, 2)} (normal R$ ${br(c.normal, 2)})`;
}

/**
 * Lugares de UMA viagem (issue #408): a capacidade gravada na própria viagem (ônibus 31,
 * van reserva 15 — escolhida por dia na Operação). Sem a viagem cadastrada, a do veículo padrão.
 * @param {{trip_date:string, direction:string, capacity:number}[]} viagens
 */
export function capacidadeDaViagem(viagens, data, direcao, padrao = 31) {
  const v = (viagens ?? []).find((t) => t.trip_date === data && t.direction === direcao);
  const cap = Number(v?.capacity);
  return cap > 0 ? cap : padrao;
}

/**
 * Viagens marcadas com outro veículo que não o padrão (a van reserva), por data e sentido.
 * @param {{trip_date:string, direction:string, vehicle_id:string|null}[]} viagens
 */
export function viagensForaDoPadrao(viagens, padraoId) {
  if (!padraoId) return [];
  return (viagens ?? [])
    .filter((t) => t.vehicle_id && t.vehicle_id !== padraoId)
    .sort((a, b) =>
      a.trip_date === b.trip_date
        ? a.direction === "ida"
          ? -1
          : 1
        : a.trip_date < b.trip_date
          ? -1
          : 1,
    );
}
