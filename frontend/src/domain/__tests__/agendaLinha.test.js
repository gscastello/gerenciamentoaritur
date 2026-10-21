import { describe, expect, it } from "vitest";
import {
  detalheDoPonto,
  formatarTelefoneBR,
  pontoSoNome,
  textoDaListaDeBusca,
  textoParaTaxista,
} from "../agendaLinha.js";

describe("pontoSoNome", () => {
  it("Rodoviária, Retorno e Posto Carone não repetem o nome do ponto", () => {
    for (const pontoId of ["rodoviaria", "retorno", "postocarone"]) {
      expect(pontoSoNome({ direcao: "ida", pontoId })).toBe(true);
    }
  });

  it("qualquer ponto da Volta não repete a cidade (o título já diz)", () => {
    expect(pontoSoNome({ direcao: "volta", pontoId: "cantanhede" })).toBe(true);
    expect(pontoSoNome({ direcao: "volta", pontoId: "pirapemas" })).toBe(true);
    expect(pontoSoNome({ direcao: "volta", pontoId: "qualquer-outro" })).toBe(true);
  });

  it("Buscar em casa, BR e Outro (ida) continuam mostrando o endereço", () => {
    for (const pontoId of ["busca", "br", "outro", undefined, null, ""]) {
      expect(pontoSoNome({ direcao: "ida", pontoId })).toBe(false);
    }
    expect(pontoSoNome(null)).toBe(false);
  });
});

describe("detalheDoPonto", () => {
  it("junta rua, local exato e referência, na ordem", () => {
    expect(
      detalheDoPonto({ rua: "Rua A", localExato: "km 12", referencia: "perto do posto" }),
    ).toBe("Rua A · km 12 · ref.: perto do posto");
  });

  it("ignora o que não foi informado", () => {
    expect(detalheDoPonto({ referencia: "portão azul" })).toBe("ref.: portão azul");
    expect(detalheDoPonto({})).toBe("");
    expect(detalheDoPonto(null)).toBe("");
  });
});

describe("formatarTelefoneBR", () => {
  it("formata celular de 11 e fixo de 10 dígitos", () => {
    expect(formatarTelefoneBR("98987654321")).toBe("(98) 98765-4321");
    expect(formatarTelefoneBR("9832221111")).toBe("(98) 3222-1111");
  });

  it("aceita número colado com +55, parênteses e traço", () => {
    expect(formatarTelefoneBR("+55 (98) 98765-4321")).toBe("(98) 98765-4321");
  });

  it("devolve o que não reconhece, sem inventar", () => {
    expect(formatarTelefoneBR("123")).toBe("123");
    expect(formatarTelefoneBR(null)).toBe("");
  });
});

describe("textoParaTaxista", () => {
  it("endereço + contato juntos", () => {
    expect(
      textoParaTaxista({ endereco: "Cohatrac · Rua 7", telefone: "98987654321", quantidade: 1 }),
    ).toBe("Cohatrac · Rua 7 — (98) 98765-4321");
  });

  it("inclui o telefone secundário e a quantidade quando maior que 1", () => {
    expect(
      textoParaTaxista({
        endereco: "Anil",
        telefone: "98987654321",
        telefone2: "98981110000",
        quantidade: 2,
      }),
    ).toBe("Anil (2 passagens) — (98) 98765-4321 / (98) 98111-0000");
  });

  it("sem endereço avisa em vez de sair vazio", () => {
    expect(textoParaTaxista({ endereco: "", telefone: "98987654321" })).toBe(
      "endereço não informado — (98) 98765-4321",
    );
  });
});

describe("textoDaListaDeBusca", () => {
  it("numera uma reserva por linha", () => {
    expect(
      textoDaListaDeBusca([
        { endereco: "Anil", telefone: "98987654321", quantidade: 1 },
        { endereco: "Cohama", telefone: "98981110000", quantidade: 3 },
      ]),
    ).toBe("1) Anil — (98) 98765-4321\n2) Cohama (3 passagens) — (98) 98111-0000");
  });

  it("lista vazia vira texto vazio", () => {
    expect(textoDaListaDeBusca([])).toBe("");
  });
});
