import { describe, expect, it } from "vitest";
import {
  agruparPorResponsavel,
  diferencasDaBusca,
  moverNaLista,
  moverParaIndice,
  moverParaPosicao,
  ordenarBusca,
  responsavelDaBusca,
} from "../buscaEmCasa.js";

describe("responsavelDaBusca", () => {
  it("devolve o responsável salvo ou táxi quando não há", () => {
    expect(responsavelDaBusca({ buscaPor: "ari" })).toBe("ari");
    expect(responsavelDaBusca({ buscaPor: "proprio" })).toBe("proprio");
    expect(responsavelDaBusca({})).toBe("taxi");
    expect(responsavelDaBusca({ buscaPor: "outro-qualquer" })).toBe("taxi");
    expect(responsavelDaBusca(null)).toBe("taxi");
  });
});

describe("ordenarBusca", () => {
  const r = (id, buscaSeq, criadoEm) => ({ id, buscaSeq, criadoEm });

  it("posição salva primeiro; sem posição vem depois, por ordem de reserva", () => {
    const ordenado = ordenarBusca([
      r("c", null, "2026-10-01T10:00"),
      r("a", 2, "2026-10-01T12:00"),
      r("b", 1, "2026-10-01T13:00"),
      r("d", null, "2026-10-01T09:00"),
    ]);
    expect(ordenado.map((x) => x.id)).toEqual(["b", "a", "d", "c"]);
  });

  it("não muda a lista original", () => {
    const original = [r("b", 2), r("a", 1)];
    ordenarBusca(original);
    expect(original.map((x) => x.id)).toEqual(["b", "a"]);
  });
});

describe("moverNaLista", () => {
  it("sobe e desce uma posição", () => {
    expect(moverNaLista(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(moverNaLista(["a", "b", "c"], "b", 1)).toEqual(["a", "c", "b"]);
  });

  it("nos limites (ou id inexistente) não muda nada", () => {
    const ids = ["a", "b", "c"];
    expect(moverNaLista(ids, "a", -1)).toBe(ids);
    expect(moverNaLista(ids, "c", 1)).toBe(ids);
    expect(moverNaLista(ids, "x", 1)).toBe(ids);
  });
});

describe("moverParaPosicao (arrastar e soltar)", () => {
  it("coloca o item na posição do destino", () => {
    expect(moverParaPosicao(["a", "b", "c", "d"], "a", "c")).toEqual(["b", "c", "a", "d"]);
    expect(moverParaPosicao(["a", "b", "c", "d"], "d", "b")).toEqual(["a", "d", "b", "c"]);
  });

  it("mesmo item ou id inexistente não muda nada", () => {
    const ids = ["a", "b"];
    expect(moverParaPosicao(ids, "a", "a")).toBe(ids);
    expect(moverParaPosicao(ids, "x", "a")).toBe(ids);
  });
});

describe("agruparPorResponsavel", () => {
  it("junta por responsável (Táxi → Gustavo → Maurício → Ari) mantendo a ordem dentro do grupo", () => {
    const modos = { a: "ari", b: "taxi", c: "proprio", d: "taxi", e: "motorista" };
    expect(agruparPorResponsavel(["a", "b", "c", "d", "e"], (id) => modos[id])).toEqual([
      "b",
      "d",
      "c",
      "e",
      "a",
    ]);
  });
});

describe("diferencasDaBusca", () => {
  const original = ["a", "b", "c"];
  const modosOriginais = { a: "taxi", b: "taxi", c: "taxi" };

  it("sem mudanças não manda nada", () => {
    expect(
      diferencasDaBusca({ original, ordem: original, modosOriginais, modos: modosOriginais }),
    ).toEqual({ ordem: null, atribuicoes: [] });
  });

  it("nova ordem e atribuições agrupadas por responsável", () => {
    const d = diferencasDaBusca({
      original,
      ordem: ["c", "a", "b"],
      modosOriginais,
      modos: { a: "ari", b: "taxi", c: "ari" },
    });
    expect(d.ordem).toEqual(["c", "a", "b"]);
    expect(d.atribuicoes).toEqual([{ modo: "ari", ids: ["c", "a"] }]);
  });
});

describe("moverParaIndice — ir direto para a posição N", () => {
  const ids = ["a", "b", "c", "d"];
  it("leva o item para a posição pedida (1 = primeiro)", () => {
    expect(moverParaIndice(ids, "d", 1)).toEqual(["d", "a", "b", "c"]);
    expect(moverParaIndice(ids, "a", 3)).toEqual(["b", "c", "a", "d"]);
    expect(moverParaIndice(ids, "b", "4")).toEqual(["a", "c", "d", "b"]);
  });
  it("ajusta posições fora da lista ao primeiro/último", () => {
    expect(moverParaIndice(ids, "c", 0)).toEqual(["c", "a", "b", "d"]);
    expect(moverParaIndice(ids, "c", 99)).toEqual(["a", "b", "d", "c"]);
  });
  it("não muda nada com posição inválida, mesma posição ou id desconhecido", () => {
    expect(moverParaIndice(ids, "b", "x")).toBe(ids);
    expect(moverParaIndice(ids, "b", 2)).toBe(ids);
    expect(moverParaIndice(ids, "z", 1)).toBe(ids);
  });
  it("não muta a lista original", () => {
    const copia = [...ids];
    moverParaIndice(ids, "d", 1);
    expect(ids).toEqual(copia);
  });
});
