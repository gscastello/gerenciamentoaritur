import { describe, expect, it } from "vitest";
import {
  REGRA_DE_CONSUMO,
  capacidadeDaViagem,
  consumoForaDoNormal,
  custoPorKm,
  kmPorLitro,
  textoDoConsumo,
  viagensForaDoPadrao,
} from "../frota.js";

// Consumo fora do normal (issue #369) — a mesma regra do trigger em database/103.
const ab = (id, data, km, litros, combustivel, veiculoId = "van") => ({
  id,
  data,
  km,
  litros,
  combustivel,
  veiculoId,
});

const historico = [
  ab("a1", "2026-11-01", 400, 50, 300), // 8 km/l
  ab("a2", "2026-11-03", 420, 50, 310), // 8,4
  ab("a3", "2026-11-05", 380, 50, 290), // 7,6
  ab("a4", "2026-11-07", 410, 50, 305), // 8,2
];

describe("medidas", () => {
  it("km/l e custo por km só com os dados", () => {
    expect(kmPorLitro(ab("x", "d", 400, 50, 0))).toBe(8);
    expect(kmPorLitro(ab("x", "d", 400, 0, 0))).toBeNull();
    expect(kmPorLitro(null)).toBeNull();
    expect(custoPorKm(ab("x", "d", 400, 0, 300))).toBe(0.75);
    expect(custoPorKm(ab("x", "d", 0, 0, 300))).toBeNull();
  });
});

describe("consumo fora do normal", () => {
  it("km/l abaixo de 85% da mediana dos anteriores avisa", () => {
    const ruim = ab("a5", "2026-11-09", 300, 50, 300); // 6 km/l; normal 8,1
    const c = consumoForaDoNormal(ruim, [...historico, ruim]);
    expect(c).toEqual({ fora: true, medida: "km_l", atual: 6, normal: 8.1 });
    expect(textoDoConsumo(c)).toBe("consumo fora do normal: 6,0 km/l (normal 8,1)");
  });
  it("dentro do normal não avisa (e 85% em cima ainda é normal)", () => {
    const ok = ab("a5", "2026-11-09", 390, 50, 300);
    expect(consumoForaDoNormal(ok, historico).fora).toBe(false);
    const limite = ab("a6", "2026-11-09", 345, 50, 300); // 6,9 km/l ≥ 85% de 8,1 (6,885)
    expect(consumoForaDoNormal(limite, historico).fora).toBe(false);
    expect(textoDoConsumo(consumoForaDoNormal(ok, historico))).toBe("");
  });
  it("só compara com abastecimentos ANTERIORES do mesmo veículo", () => {
    const primeiro = ab("a0", "2026-10-30", 200, 50, 300);
    expect(consumoForaDoNormal(primeiro, historico)).toBeNull(); // nada antes dele
    const outraVan = ab("b1", "2026-11-09", 200, 50, 300, "onibus");
    expect(consumoForaDoNormal(outraVan, historico)).toBeNull();
  });
  it("com menos de 3 anteriores não há normal", () => {
    const r = ab("a3", "2026-11-05", 100, 50, 290);
    expect(consumoForaDoNormal(r, historico)).toBeNull(); // só a1 e a2 antes
  });
  it("a mediana não se deixa levar por um lançamento errado", () => {
    const comErro = [...historico, ab("a4b", "2026-11-08", 4000, 50, 300)]; // 80 km/l digitado errado
    const ruim = ab("a5", "2026-11-09", 300, 50, 300);
    expect(consumoForaDoNormal(ruim, comErro)).toMatchObject({ fora: true, normal: 8.2 });
  });
  it("só os últimos 8 entram no normal", () => {
    const antigos = Array.from({ length: 6 }, (_, i) =>
      ab(`o${i}`, `2026-10-0${i + 1}`, 100, 50, 300),
    ); // 2 km/l
    const novos = Array.from({ length: 8 }, (_, i) => ab(`n${i}`, `2026-10-1${i}`, 400, 50, 300)); // 8 km/l
    const r = ab("z", "2026-10-30", 300, 50, 300);
    expect(consumoForaDoNormal(r, [...antigos, ...novos])).toMatchObject({ fora: true, normal: 8 });
  });
  it("sem litros: custo por km acima de 120% do normal", () => {
    const semLitros = historico.map((h) => ({ ...h, litros: 0 }));
    const caro = ab("a5", "2026-11-09", 300, 0, 300); // R$ 1,00/km; normal ~0,74
    const c = consumoForaDoNormal(caro, semLitros);
    expect(c).toMatchObject({ fora: true, medida: "custo_km", atual: 1 });
    expect(textoDoConsumo(c)).toMatch(/^custo por km acima do normal: R\$ 1,00/);
    expect(consumoForaDoNormal(ab("a5", "2026-11-09", 0, 0, 0), semLitros)).toBeNull();
  });
  it("mesmo dia: desempata pelo id", () => {
    const dia = [
      ab("d1", "2026-11-01", 400, 50, 300),
      ab("d2", "2026-11-01", 400, 50, 300),
      ab("d3", "2026-11-01", 400, 50, 300),
    ];
    const d4 = ab("d4", "2026-11-01", 200, 50, 300);
    expect(consumoForaDoNormal(d4, dia)).toMatchObject({ fora: true, normal: 8 });
    expect(consumoForaDoNormal(dia[0], [...dia, d4])).toBeNull();
  });
  it("a regra é a combinada com o banco", () => {
    expect(REGRA_DE_CONSUMO).toEqual({
      kmPorLitroMinimo: 0.85,
      custoPorKmMaximo: 1.2,
      janela: 8,
      minimoAnteriores: 3,
    });
  });
});

describe("lugares de cada viagem (issue #408)", () => {
  const viagens = [
    { id: "a", trip_date: "2026-11-21", direction: "volta", capacity: 15, vehicle_id: "van" },
    { id: "b", trip_date: "2026-11-21", direction: "ida", capacity: 15, vehicle_id: "van" },
    { id: "c", trip_date: "2026-11-20", direction: "ida", capacity: 31, vehicle_id: "onibus" },
  ];
  it("usa a capacidade da viagem; sem viagem, a do padrão", () => {
    expect(capacidadeDaViagem(viagens, "2026-11-21", "ida", 31)).toBe(15);
    expect(capacidadeDaViagem(viagens, "2026-11-20", "ida", 31)).toBe(31);
    expect(capacidadeDaViagem(viagens, "2026-11-22", "ida", 31)).toBe(31);
    expect(
      capacidadeDaViagem(
        [{ trip_date: "2026-11-22", direction: "ida", capacity: 0 }],
        "2026-11-22",
        "ida",
        31,
      ),
    ).toBe(31);
  });
  it("lista as viagens fora do veículo padrão por data e sentido", () => {
    expect(viagensForaDoPadrao(viagens, "onibus").map((t) => t.id)).toEqual(["b", "a"]);
    expect(viagensForaDoPadrao(viagens, null)).toEqual([]);
  });
});
