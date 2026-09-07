import { describe, expect, it } from "vitest";
import {
  CIDADES_ATENDIDAS,
  CIDADES_INTERMEDIARIAS,
  classificarLocal,
  foraDaAreaPadrao,
} from "../cidades.js";

describe("classificarLocal", () => {
  it("cidade atendida => 'atendida'", () => {
    expect(classificarLocal("centro de Pirapemas")).toBe("atendida");
    expect(classificarLocal("vou ficar em São Luís")).toBe("atendida");
    expect(classificarLocal("Cantanhede, perto da praça")).toBe("atendida");
  });

  it("texto sem cidade reconhecível => 'atendida' (não flageia à toa)", () => {
    expect(classificarLocal("na casa da minha tia, bairro Cohama")).toBe("atendida");
    expect(classificarLocal("")).toBe("atendida");
    expect(classificarLocal(null)).toBe("atendida");
    expect(classificarLocal(undefined)).toBe("atendida");
  });

  it("cidade intermediária => 'intermediaria' (acento/caixa irrelevantes)", () => {
    expect(classificarLocal("desço em Bacabeira")).toBe("intermediaria");
    expect(classificarLocal("SANTA RITA")).toBe("intermediaria");
    expect(classificarLocal("no Entroncamento")).toBe("intermediaria");
    expect(classificarLocal("Matões")).toBe("intermediaria");
    expect(classificarLocal("matoes")).toBe("intermediaria");
  });

  it("intermediária prevalece mesmo se citar cidade atendida junto", () => {
    expect(classificarLocal("saio de São Luís e desço em Bacabeira")).toBe("intermediaria");
  });

  it("aceita lista de intermediárias customizada (settings)", () => {
    expect(classificarLocal("Rosário", { intermediarias: ["rosario"] })).toBe("intermediaria");
    expect(classificarLocal("Bacabeira", { intermediarias: ["rosario"] })).toBe("atendida");
  });
});

describe("foraDaAreaPadrao", () => {
  it("true se qualquer texto menciona cidade intermediária", () => {
    expect(foraDaAreaPadrao(["Rodoviária", "vou ficar em Santa Rita"])).toBe(true);
    expect(foraDaAreaPadrao("desembarque no Colombo")).toBe(true);
  });

  it("false quando todos os textos estão na área", () => {
    expect(foraDaAreaPadrao(["Rodoviária", "centro de Pirapemas", ""])).toBe(false);
    expect(foraDaAreaPadrao([])).toBe(false);
  });

  it("repassa a lista customizada", () => {
    expect(foraDaAreaPadrao(["Rosário"], { intermediarias: ["rosario"] })).toBe(true);
  });
});

describe("listas", () => {
  it("as duas listas não têm sobreposição", () => {
    const inter = new Set(CIDADES_INTERMEDIARIAS);
    expect(CIDADES_ATENDIDAS.filter((c) => inter.has(c))).toEqual([]);
  });
});
