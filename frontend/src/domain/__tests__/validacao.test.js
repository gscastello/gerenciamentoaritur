import { describe, expect, it } from "vitest";
import {
  primeiroErro,
  validarData,
  validarHora,
  validarNome,
  validarObrigatorio,
  validarQuantidade,
  validarTelefone,
  validarValor,
} from "../validacao.js";

describe("validarTelefone", () => {
  it("aceita 11 dígitos com 9", () => {
    expect(validarTelefone("98991234567")).toEqual({ ok: true, valor: "98991234567" });
  });
  it("aceita 10 dígitos (fixo)", () => {
    expect(validarTelefone("9832221100")).toEqual({ ok: true, valor: "9832221100" });
  });
  it("tira máscara e +55", () => {
    expect(validarTelefone("+55 (98) 99123-4567").valor).toBe("98991234567");
  });
  it("não tira 55 quando faz parte do número curto", () => {
    // 5511987654 -> 10 dígitos, começa com 55 mas length <= 11: mantém
    expect(validarTelefone("5511987654").valor).toBe("5511987654");
  });
  it("recusa curto/longo", () => {
    expect(validarTelefone("123").ok).toBe(false);
    expect(validarTelefone("9899123456789").ok).toBe(false);
  });
  it("recusa DDD inválido", () => {
    expect(validarTelefone("0891234567").ok).toBe(false);
  });
  it("recusa celular de 11 sem o 9", () => {
    expect(validarTelefone("98891234567").ok).toBe(false);
  });
  it("recusa vazio/nulo", () => {
    expect(validarTelefone("").ok).toBe(false);
    expect(validarTelefone(null).ok).toBe(false);
  });
});

describe("validarData", () => {
  it("aceita ISO válida", () => {
    expect(validarData("2026-09-15")).toEqual({ ok: true, valor: "2026-09-15" });
  });
  it("recusa formato errado", () => {
    expect(validarData("15/09/2026").ok).toBe(false);
    expect(validarData(null).ok).toBe(false);
  });
  it("recusa data inexistente", () => {
    expect(validarData("2026-02-30").ok).toBe(false);
  });
  it("respeita min", () => {
    expect(validarData("2026-09-01", { min: "2026-09-10" }).ok).toBe(false);
    expect(validarData("2026-09-10", { min: "2026-09-10" }).ok).toBe(true);
  });
  it("respeita max", () => {
    expect(validarData("2027-01-01", { max: "2026-12-31" }).ok).toBe(false);
  });
});

describe("validarHora", () => {
  it("aceita e normaliza", () => {
    expect(validarHora("5:40")).toEqual({ ok: true, valor: "05:40" });
    expect(validarHora("23:59").ok).toBe(true);
  });
  it("recusa formato e intervalo", () => {
    expect(validarHora("5h40").ok).toBe(false);
    expect(validarHora("24:00").ok).toBe(false);
    expect(validarHora("10:75").ok).toBe(false);
    expect(validarHora(null).ok).toBe(false);
  });
});

describe("validarValor", () => {
  it("aceita número e string com vírgula", () => {
    expect(validarValor("80,50")).toEqual({ ok: true, valor: 80.5 });
    expect(validarValor(60).valor).toBe(60);
  });
  it("recusa não-número e vazio", () => {
    expect(validarValor("abc").ok).toBe(false);
    expect(validarValor("").ok).toBe(false);
    expect(validarValor(null).ok).toBe(false);
    expect(validarValor(Number.POSITIVE_INFINITY).ok).toBe(false);
  });
  it("respeita min e max", () => {
    expect(validarValor(-1).ok).toBe(false);
    expect(validarValor(5, { min: 10 }).ok).toBe(false);
    expect(validarValor(50, { max: 40 }).ok).toBe(false);
  });
});

describe("validarQuantidade", () => {
  it("aceita inteiro no intervalo", () => {
    expect(validarQuantidade(2, { max: 31 })).toEqual({ ok: true, valor: 2 });
  });
  it("recusa não-inteiro, abaixo do min e acima do max", () => {
    expect(validarQuantidade(1.5).ok).toBe(false);
    expect(validarQuantidade(0).ok).toBe(false);
    expect(validarQuantidade("x").ok).toBe(false);
    expect(validarQuantidade(40, { max: 31 }).ok).toBe(false);
  });
});

describe("validarObrigatorio / validarNome", () => {
  it("obrigatorio", () => {
    expect(validarObrigatorio("  ", "Bairro").ok).toBe(false);
    expect(validarObrigatorio("Cohama").ok).toBe(true);
    expect(validarObrigatorio(null).ok).toBe(false);
  });
  it("nome", () => {
    expect(validarNome("A").ok).toBe(false);
    expect(validarNome(" Maria ").valor).toBe("Maria");
  });
});

describe("primeiroErro", () => {
  it("devolve o primeiro erro ou null", () => {
    expect(primeiroErro([{ ok: true }, { ok: false, erro: "X" }, { ok: false, erro: "Y" }])).toBe(
      "X",
    );
    expect(primeiroErro([{ ok: true }, null])).toBe(null);
    expect(primeiroErro([{ ok: false }])).toBe("Dado inválido.");
  });
});
