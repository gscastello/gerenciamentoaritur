import { describe, expect, it } from "vitest";
import {
  CIDADES_ATENDIDAS,
  CIDADES_INTERMEDIARIAS,
  cidadeIntermediariaDaVolta,
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

describe("cidadeIntermediariaDaVolta", () => {
  const areas = [
    { code: "retorno", label: "Retorno", needs_review: false },
    { code: "miranda", label: "Miranda do Norte", needs_review: true },
    { code: "santa_rita", label: "Santa Rita", needs_review: true },
    { code: "cantanhede", label: "Cantanhede", needs_review: true },
  ];
  const volta = (campos) => cidadeIntermediariaDaVolta({ direcao: "volta", ...campos }, { areas });

  it("cidade marcada no desembarque, mesmo sem texto", () => {
    expect(volta({ desembarqueArea: "miranda" })).toBe("Miranda do Norte");
  });
  it("cidade citada no texto, pelo nome ou pelo código da área", () => {
    expect(volta({ desembarque: "Miranda do Norte, perto da praça" })).toBe("Miranda do Norte");
    expect(volta({ desembarque: "desce em miranda" })).toBe("Miranda do Norte");
    expect(volta({ desembarque: "Santa Rita" })).toBe("Santa Rita");
  });
  it("intermediária que não virou área também conta, com o nome capitalizado", () => {
    expect(volta({ desembarque: "no entroncamento" })).toBe("Entroncamento");
    expect(
      cidadeIntermediariaDaVolta(
        { direcao: "volta", desembarque: "Vila Nova" },
        { intermediarias: ["vila nova"] },
      ),
    ).toBe("Vila Nova");
  });
  it("cidade fixa nunca destaca, mesmo marcada para revisão", () => {
    expect(volta({ desembarqueArea: "cantanhede" })).toBeNull();
    expect(volta({ desembarque: "Cantanhede" })).toBeNull();
  });
  it("local comum de São Luís não destaca", () => {
    expect(volta({ desembarqueArea: "retorno", desembarque: "Retorno do Aeroporto" })).toBeNull();
    expect(volta({ desembarque: "Cohama" })).toBeNull();
    expect(volta({})).toBeNull();
  });
  it("área comum com texto de cidade intermediária destaca", () => {
    expect(volta({ desembarqueArea: "retorno", desembarque: "Miranda" })).toBe("Miranda do Norte");
  });
  it("só na Volta", () => {
    expect(
      cidadeIntermediariaDaVolta({ direcao: "ida", desembarqueArea: "miranda" }, { areas }),
    ).toBeNull();
    expect(cidadeIntermediariaDaVolta()).toBeNull();
  });
});
