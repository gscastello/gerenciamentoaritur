import { describe, expect, it } from "vitest";
import { cidadeDoDesembarque, desembarqueDaIda, ordenarDesembarque } from "../desembarqueDaIda.js";

describe("cidadeDoDesembarque", () => {
  it("usa a área do desembarque primeiro; Campestre vai com Pirapemas", () => {
    expect(cidadeDoDesembarque({ desembarqueArea: "cantanhede", desembarque: "Pirapemas" })).toBe(
      "cantanhede",
    );
    expect(cidadeDoDesembarque({ desembarqueArea: "pirapemas" })).toBe("pirapemas");
    expect(cidadeDoDesembarque({ desembarqueArea: "campestre" })).toBe("pirapemas");
    expect(cidadeDoDesembarque({ desembarqueArea: "Cantanhede" })).toBe("cantanhede");
  });
  it("cidade do caminho fica de fora, mesmo com o nome da cidade no texto", () => {
    expect(
      cidadeDoDesembarque({
        desembarqueArea: "matoes",
        desembarque: "Matões, perto de Cantanhede",
      }),
    ).toBeNull();
    expect(cidadeDoDesembarque({ desembarqueArea: "miranda" })).toBeNull();
  });
  it("sem área (ou Outros), lê o texto; as duas cidades ou nenhuma = null", () => {
    expect(cidadeDoDesembarque({ desembarque: "Praça da Cruz, Cantanhede" })).toBe("cantanhede");
    expect(cidadeDoDesembarque({ desembarque: "Catanhede" })).toBe("cantanhede");
    expect(
      cidadeDoDesembarque({ desembarqueArea: "outro", desembarque: "Rua do Sol, Pirapemas" }),
    ).toBe("pirapemas");
    expect(cidadeDoDesembarque({ desembarque: "povoado de Campestre" })).toBe("pirapemas");
    expect(cidadeDoDesembarque({ desembarque: "Pirapemas ou Cantanhede" })).toBeNull();
    expect(cidadeDoDesembarque({ desembarque: "casa da tia" })).toBeNull();
    expect(cidadeDoDesembarque({})).toBeNull();
    expect(cidadeDoDesembarque(null)).toBeNull();
  });
});

describe("ordenarDesembarque", () => {
  it("posição salva primeiro; sem posição, na ordem da reserva; não muda a lista original", () => {
    const itens = [
      { id: "a", criadoEm: "2026-11-15T10:00:00Z" },
      { id: "b", desembarqueSeq: 2, criadoEm: "2026-11-15T09:00:00Z" },
      { id: "c", desembarqueSeq: 1, criadoEm: "2026-11-15T11:00:00Z" },
      { id: "d", criadoEm: "2026-11-15T08:00:00Z" },
    ];
    expect(ordenarDesembarque(itens).map((r) => r.id)).toEqual(["c", "b", "d", "a"]);
    expect(itens.map((r) => r.id)).toEqual(["a", "b", "c", "d"]);
  });
  it("sem data de reserva não quebra", () => {
    expect(
      ordenarDesembarque([{ id: "x" }, { id: "y", criadoEm: "2026-11-15" }]).map((r) => r.id),
    ).toEqual(["x", "y"]);
  });
});

describe("desembarqueDaIda", () => {
  const base = { data: "2026-11-16", direcao: "ida", tipo: "passagem", status: "confirmada" };
  it("separa por cidade só a Ida do dia, sem cancelada, espera e frete", () => {
    const reservas = [
      { ...base, id: "1", desembarqueArea: "cantanhede" },
      { ...base, id: "2", desembarque: "Pirapemas", desembarqueSeq: 2 },
      { ...base, id: "3", desembarqueArea: "campestre", desembarqueSeq: 1 },
      { ...base, id: "4", desembarqueArea: "miranda" },
      { ...base, id: "5", tipo: "encomenda", desembarqueArea: "cantanhede" },
      { ...base, id: "6", status: "cancelada", desembarqueArea: "cantanhede" },
      { ...base, id: "7", status: "espera", desembarqueArea: "cantanhede" },
      { ...base, id: "8", tipo: "frete", desembarqueArea: "cantanhede" },
      { ...base, id: "9", direcao: "volta", desembarqueArea: "cantanhede" },
      { ...base, id: "10", data: "2026-11-17", desembarqueArea: "cantanhede" },
      { ...base, id: "11", status: "embarcado", desembarque: "Cantanhede" },
    ];
    const g = desembarqueDaIda(reservas, "2026-11-16");
    expect(g.cantanhede.map((r) => r.id)).toEqual(["1", "5", "11"]);
    expect(g.pirapemas.map((r) => r.id)).toEqual(["3", "2"]);
    expect(g.outros.map((r) => r.id)).toEqual(["4"]);
  });
  it("lista vazia ou ausente", () => {
    expect(desembarqueDaIda(undefined, "2026-11-16")).toEqual({
      cantanhede: [],
      pirapemas: [],
      outros: [],
    });
  });
});
