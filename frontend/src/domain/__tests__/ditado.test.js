import { describe, expect, it } from "vitest";
import { parseAnotacaoEncomenda, parseAnotacaoRapida } from "../anotacaoRapida.js";
import { ditadoParaAnotacao } from "../ditado.js";

describe("ditadoParaAnotacao — fala vira anotação rápida (issue #258)", () => {
  it("quantidade por extenso vira NP", () => {
    expect(ditadoParaAnotacao("uma passagem Cohatrac 98 98888 7777 Maria")).toBe(
      "1P Cohatrac 98 98888 7777 Maria",
    );
    expect(ditadoParaAnotacao("duas passagens Turu 98988887777")).toBe("2P Turu 98988887777");
    expect(ditadoParaAnotacao("Três pessoas Anil 98988887777")).toBe("3P Anil 98988887777");
    expect(ditadoParaAnotacao("dez lugares Centro 98988887777")).toBe("10P Centro 98988887777");
  });

  it("número em algarismo e 'passagem' sozinha", () => {
    expect(ditadoParaAnotacao("2 passagens Cohama 98988887777")).toBe("2P Cohama 98988887777");
    expect(ditadoParaAnotacao("passagem pra Cohama 98988887777")).toBe("1P Cohama 98988887777");
  });

  it("rótulos falados saem; acento e dois-pontos não atrapalham", () => {
    expect(
      ditadoParaAnotacao("uma passagem endereço Rua 7 Cohatrac telefone 98988887777 nome: Maria"),
    ).toBe("1P Rua 7 Cohatrac 98988887777 Maria");
    expect(ditadoParaAnotacao("uma passagem Anil número 98988887777")).toBe("1P Anil 98988887777");
  });

  it("encomenda vira E", () => {
    expect(ditadoParaAnotacao("encomenda Rua Grande 10 telefone 98977776666")).toBe(
      "E Rua Grande 10 98977776666",
    );
    expect(ditadoParaAnotacao("Encomenda da Rua Grande 98977776666")).toBe(
      "E Rua Grande 98977776666",
    );
  });

  it("sem quantidade dita: fica como foi dito; ponto final sai", () => {
    expect(ditadoParaAnotacao("Cohatrac 98988887777.")).toBe("Cohatrac 98988887777");
    expect(ditadoParaAnotacao("  ")).toBe("");
    expect(ditadoParaAnotacao(null)).toBe("");
  });

  it("o resultado é lido pela anotação rápida", () => {
    const p = parseAnotacaoRapida(
      ditadoParaAnotacao("duas passagens Cohatrac telefone 98 98888 7777 nome Maria"),
    );
    expect(p).toMatchObject({ ok: true, quantidade: 2, telefone: "98988887777", nome: "Maria" });
    const e = parseAnotacaoEncomenda(ditadoParaAnotacao("encomenda Rua Grande 10 98977776666"));
    expect(e).toMatchObject({ ok: true, endereco: "Rua Grande 10", telefone: "98977776666" });
  });
});
