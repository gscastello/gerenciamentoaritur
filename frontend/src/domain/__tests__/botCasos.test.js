import { describe, expect, it } from "vitest";
import {
  chaveDoEsperado,
  diferencasDoCaso,
  mensagensDoCaso,
  mudancasDoCaso,
  rotuloDaViagemDoCaso,
  sugestaoDoCaso,
  textoDoPlacar,
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

describe("sugestaoDoCaso", () => {
  const agora = { ...de, route_point_code: "retorno" };
  const md = { esperado_da_marca: [de], esperado_de_agora: [agora] };
  it("diz qual botão a sugestão do bot escolhe", () => {
    const caso = (esperado, incerto = false) => ({
      mudou_depois: {
        ...md,
        sugestao: { esperado, incerto, notas: ["ponto: retorno → rodoviaria", " "] },
      },
    });
    expect(sugestaoDoCaso(caso([de]))).toEqual({
      vale: "marca",
      incerto: false,
      notas: ["ponto: retorno → rodoviaria"],
    });
    expect(sugestaoDoCaso(caso([agora])).vale).toBe("agora");
    expect(sugestaoDoCaso(caso([{ ...de, quantity: 2 }])).vale).toBe("outro");
    expect(sugestaoDoCaso(caso([de], true))).toEqual({
      vale: null,
      incerto: true,
      notas: ["ponto: retorno → rodoviaria"],
    });
  });
  it("sem sugestão ou torta: null", () => {
    expect(sugestaoDoCaso({})).toBeNull();
    expect(sugestaoDoCaso({ mudou_depois: { sugestao: { esperado: "x" } } })).toBeNull();
    expect(sugestaoDoCaso({ mudou_depois: { sugestao: { esperado: [] } } }).incerto).toBe(true);
    expect(
      sugestaoDoCaso({ mudou_depois: { sugestao: { esperado: [], incerto: false, notas: "x" } } }),
    ).toEqual({
      vale: "marca",
      incerto: false,
      notas: [],
    });
  });
});

describe("chaveDoEsperado e textoDoPlacar", () => {
  it("compara só o que a avaliação compara, em ordem estável", () => {
    const a = { ...de, pickup_neighborhood: "Cohatrac", reservation_id: "x" };
    const b = { ...de, trip_date: "2026-11-25", direction: "volta", quantity: "x" };
    expect(chaveDoEsperado([a, b])).toBe(
      chaveDoEsperado([b, { ...a, pickup_neighborhood: "COHATRAC", type: "y" }]),
    );
    expect(chaveDoEsperado([b])).toBe("2026-11-25|volta|rodoviaria|1|");
    expect(chaveDoEsperado([{}])).toBe("|||1|");
    expect(chaveDoEsperado([null])).toBe("");
    expect(chaveDoEsperado(null)).toBe("");
  });
  it("placar", () => {
    expect(textoDoPlacar(null)).toBeNull();
    expect(textoDoPlacar({ concordou: 0, discordou: 0 })).toBeNull();
    expect(textoDoPlacar({ concordou: 7, discordou: 2 })).toBe(
      "A sugestão do bot bateu com a sua em 7 de 9 conferência(s) (78%).",
    );
    expect(textoDoPlacar({ discordou: 1 })).toContain("0 de 1");
  });
});
