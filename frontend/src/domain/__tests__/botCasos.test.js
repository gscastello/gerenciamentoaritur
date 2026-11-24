import { describe, expect, it } from "vitest";
import {
  diferencasDoCaso,
  mensagensDoCaso,
  mudancasDoCaso,
  rotuloDaViagemDoCaso,
} from "../botCasos.js";

const de = {
  trip_date: "2026-11-24",
  direction: "ida",
  route_point_code: "rodoviaria",
  quantity: 3,
  pickup_neighborhood: null,
};

describe("rotuloDaViagemDoCaso", () => {
  it("monta dia, sentido, ponto, quantidade e bairro", () => {
    expect(rotuloDaViagemDoCaso(de)).toBe("Ida 24/11 · rodoviaria · 3P");
    expect(
      rotuloDaViagemDoCaso({
        trip_date: "2026-11-25",
        direction: "volta",
        route_point_code: "busca",
        quantity: "2",
        pickup_neighborhood: "Cohatrac",
        type: "encomenda",
      }),
    ).toBe("Volta 25/11 · busca · 2P · Cohatrac · encomenda");
  });
  it("aguenta dado faltando", () => {
    expect(rotuloDaViagemDoCaso(null)).toBe("—");
    expect(rotuloDaViagemDoCaso({})).toBe("? dia ? · sem ponto · 1P");
  });
});

describe("mudancasDoCaso", () => {
  it("lista o da marca e o de agora (caso 8bfa7860)", () => {
    const caso = {
      mudou_depois: {
        mudancas: [
          {
            reservation_id: "r1",
            em: "2026-11-23T16:55:07-03:00",
            campos: ["ponto"],
            de,
            para: { ...de, route_point_code: "retorno" },
          },
          null,
        ],
      },
    };
    expect(mudancasDoCaso(caso)).toEqual([
      {
        reserva: "r1",
        em: "2026-11-23T16:55:07-03:00",
        campos: ["ponto"],
        daMarca: "Ida 24/11 · rodoviaria · 3P",
        deAgora: "Ida 24/11 · retorno · 3P",
      },
    ]);
  });
  it("sem marca ou torto: lista vazia", () => {
    expect(mudancasDoCaso({})).toEqual([]);
    expect(mudancasDoCaso({ mudou_depois: { mudancas: "x" } })).toEqual([]);
    expect(mudancasDoCaso({ mudou_depois: { mudancas: [{}] } })[0]).toEqual({
      reserva: "",
      em: null,
      campos: [],
      daMarca: "—",
      deAgora: "—",
    });
  });
});

describe("mensagensDoCaso e diferencasDoCaso", () => {
  it("só mensagens com texto", () => {
    const caso = {
      mudou_depois: { mensagens: [{ texto: "É no retorno viu" }, { texto: " " }, null] },
    };
    expect(mensagensDoCaso(caso)).toEqual([{ texto: "É no retorno viu" }]);
    expect(mensagensDoCaso({})).toEqual([]);
  });
  it("tira o aviso fixo de conferir", () => {
    const caso = {
      avaliacao: {
        diferencas: ["mudou depois da marca: conferir", "Ida 24/11 errada: ponto: a ≠ b", 3],
      },
    };
    expect(diferencasDoCaso(caso)).toEqual(["Ida 24/11 errada: ponto: a ≠ b"]);
    expect(diferencasDoCaso({})).toEqual([]);
  });
});
