import { describe, expect, it } from "vitest";
import { detalheDoPonto, pontoSoNome } from "../agendaLinha.js";

describe("pontoSoNome", () => {
  it("Rodoviária, Retorno e Posto Carone mostram só o nome do passageiro", () => {
    expect(pontoSoNome("rodoviaria")).toBe(true);
    expect(pontoSoNome("retorno")).toBe(true);
    expect(pontoSoNome("postocarone")).toBe(true);
  });

  it("demais pontos continuam mostrando o endereço", () => {
    for (const id of ["busca", "br", "outro", "cantanhede", "pirapemas", undefined, null, ""]) {
      expect(pontoSoNome(id)).toBe(false);
    }
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
