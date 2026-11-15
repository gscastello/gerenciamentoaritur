import { describe, expect, it } from "vitest";
import { LUGARES_DA_VAN, fileirasDoVeiculo, ocupacaoDosLugares } from "../mapaDosLugares.js";

/** "AA_PP" = 2 assentos, corredor, porta, porta. */
const desenho = (fileiras) =>
  fileiras.map((f) =>
    f.map((c) => (c.tipo === "assento" ? "A" : c.tipo === "corredor" ? "_" : "P")).join(""),
  );
const assentos = (fileiras) => fileiras.flat().filter((c) => c.tipo === "assento");

describe("fileirasDoVeiculo", () => {
  it("ônibus de 31: 2 na frente à esquerda (porta à direita), 6 fileiras de 2+2 e o fundo com 5", () => {
    const f = fileirasDoVeiculo(31);
    expect(desenho(f)).toEqual([
      "AA_PP",
      "AA_AA",
      "AA_AA",
      "AA_AA",
      "AA_AA",
      "AA_AA",
      "AA_AA",
      "AAAAA",
    ]);
    // numerados 0…30 na ordem do desenho
    expect(assentos(f).map((c) => c.n)).toEqual(Array.from({ length: 31 }, (_, i) => i));
  });
  it("van de 15: fileiras de 2 + corredor + 1 e o fundo com 3", () => {
    expect(desenho(fileirasDoVeiculo(15))).toEqual(["AA_A", "AA_A", "AA_A", "AA_A", "AAA"]);
  });
  it("van que não fecha em 3: fundo com 4 ou 2", () => {
    expect(desenho(fileirasDoVeiculo(16))).toEqual(["AA_A", "AA_A", "AA_A", "AA_A", "AAAA"]);
    expect(desenho(fileirasDoVeiculo(14))).toEqual(["AA_A", "AA_A", "AA_A", "AA_A", "AA"]);
    expect(desenho(fileirasDoVeiculo(2))).toEqual(["AA"]);
    expect(desenho(fileirasDoVeiculo(1))).toEqual(["A"]);
  });
  it("até 20 lugares é van; acima é ônibus", () => {
    expect(LUGARES_DA_VAN).toBe(20);
    expect(desenho(fileirasDoVeiculo(20)).at(-1)).toBe("AA");
    expect(desenho(fileirasDoVeiculo(21))[0]).toBe("AA_AA");
    expect(desenho(fileirasDoVeiculo(21)).at(-1)).toBe("AAAAA");
  });
  it("ônibus com 1 ou 3 sobrando na frente", () => {
    expect(desenho(fileirasDoVeiculo(30))[0]).toBe("A" + "P_PP");
    expect(desenho(fileirasDoVeiculo(32))[0]).toBe("AA_AP");
    expect(assentos(fileirasDoVeiculo(30))).toHaveLength(30);
    expect(assentos(fileirasDoVeiculo(32))).toHaveLength(32);
  });
  it("todo tamanho tem exatamente a quantidade de assentos", () => {
    for (let n = 1; n <= 50; n++) expect(assentos(fileirasDoVeiculo(n))).toHaveLength(n);
  });
  it("sem lugares: nenhuma fileira", () => {
    expect(fileirasDoVeiculo(0)).toEqual([]);
    expect(fileirasDoVeiculo(undefined)).toEqual([]);
    expect(fileirasDoVeiculo(-3)).toEqual([]);
    expect(fileirasDoVeiculo(15.7)).toHaveLength(5);
  });
});

describe("ocupacaoDosLugares", () => {
  it("confirmados acendem primeiro, depois os pendentes; o resto livre", () => {
    const o = ocupacaoDosLugares({ capacidade: 31, confirmados: 19, pendentes: 3 });
    expect([o.total, o.acesos, o.riscados, o.livres]).toEqual([31, 19, 3, 9]);
    expect([
      o.estado(0),
      o.estado(18),
      o.estado(19),
      o.estado(21),
      o.estado(22),
      o.estado(30),
    ]).toEqual(["confirmado", "confirmado", "pendente", "pendente", "livre", "livre"]);
  });
  it("nunca passa da capacidade (viagem cheia ou com pendentes demais)", () => {
    expect(ocupacaoDosLugares({ capacidade: 15, confirmados: 20, pendentes: 2 })).toMatchObject({
      acesos: 15,
      riscados: 0,
      livres: 0,
    });
    expect(ocupacaoDosLugares({ capacidade: 15, confirmados: 13, pendentes: 5 })).toMatchObject({
      acesos: 13,
      riscados: 2,
      livres: 0,
    });
    expect(ocupacaoDosLugares({ capacidade: 0, confirmados: 3 })).toMatchObject({
      total: 0,
      acesos: 0,
      livres: 0,
    });
    expect(
      ocupacaoDosLugares({ capacidade: 10, confirmados: -2, pendentes: undefined }),
    ).toMatchObject({
      acesos: 0,
      riscados: 0,
      livres: 10,
    });
  });
});
