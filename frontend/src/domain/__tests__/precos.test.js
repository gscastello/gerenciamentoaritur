import { describe, expect, it } from "vitest";
import { precoBairro, valorTotal, valorUnitario } from "../precos.js";

describe("precoBairro", () => {
  it("reconhece bairro da tabela de R$80 (acento/caixa irrelevantes)", () => {
    expect(precoBairro("Cohama")).toBe(80);
    expect(precoBairro("  cohama ")).toBe(80);
    expect(precoBairro("São Cristóvão")).toBe(80);
    expect(precoBairro("sao cristovao")).toBe(80);
  });

  it("reconhece bairro da tabela de R$90", () => {
    expect(precoBairro("Anjo da Guarda")).toBe(90);
    expect(precoBairro("Vila Embratel")).toBe(90);
  });

  it("null quando informado mas não reconhecido", () => {
    expect(precoBairro("Bairro Inventado")).toBeNull();
  });

  it("undefined quando nada informado", () => {
    expect(precoBairro("")).toBeUndefined();
    expect(precoBairro(undefined)).toBeUndefined();
  });
});

describe("valorUnitario / valorTotal", () => {
  const pontoBusca = { campo: "bairro" };
  const pontoBR = { valor: 60 };

  it("ponto fixo usa o valor do ponto", () => {
    expect(valorUnitario({ ponto: pontoBR })).toBe(60);
  });

  it("ponto sem valor cai no padrão R$60", () => {
    expect(valorUnitario({ ponto: {} })).toBe(60);
  });

  it("busca em casa usa o preço do bairro", () => {
    expect(valorUnitario({ ponto: pontoBusca, bairro: "Anjo da Guarda" })).toBe(90);
  });

  it("busca em casa com bairro não reconhecido cai no piso R$80", () => {
    expect(valorUnitario({ ponto: pontoBusca, bairro: "Nao Existe" })).toBe(80);
  });

  it("valorTotal multiplica pela quantidade", () => {
    expect(valorTotal({ ponto: pontoBR, quantidade: 3 })).toBe(180);
    expect(valorTotal({ ponto: pontoBusca, bairro: "Cohama", quantidade: 2 })).toBe(160);
    expect(valorTotal({ ponto: pontoBR })).toBe(60);
  });
});
