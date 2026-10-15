import { describe, expect, it } from "vitest";
import { detalheDoPonto, pontoSoNome } from "../agendaLinha.js";

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
