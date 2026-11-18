import { describe, expect, it } from "vitest";
import { alturasDasBarras, resultadoPorDia } from "../resultadoDoMes.js";

describe("resultado de cada dia do mês (issue #446)", () => {
  it("receitas menos despesas por dia, um item por dia do mês", () => {
    const dias = resultadoPorDia(
      [
        { data: "2026-11-02", tipo: "receita", valor: 500 },
        { data: "2026-11-02", tipo: "despesa", valor: 120 },
        { data: "2026-11-30", tipo: "despesa", valor: "80" },
        { data: "2026-10-31", tipo: "receita", valor: 999 },
        { data: "2026-11-05", tipo: "outro", valor: 50 },
        { data: "2026-11-xx", tipo: "receita", valor: 50 },
        { data: null, tipo: "receita", valor: 50 },
        { data: "2026-11-07", tipo: "receita", valor: "abc" },
      ],
      2026,
      11,
    );
    expect(dias).toHaveLength(30);
    expect(dias[0]).toEqual({ dia: 1, resultado: 0 });
    expect(dias[1]).toEqual({ dia: 2, resultado: 380 });
    expect(dias[4].resultado).toBe(0);
    expect(dias[6].resultado).toBe(0);
    expect(dias[29]).toEqual({ dia: 30, resultado: -80 });
    expect(resultadoPorDia(null, 2028, 2)).toHaveLength(29);
  });

  it("altura das barras pelo maior resultado em módulo", () => {
    expect(
      alturasDasBarras([
        { resultado: 400 },
        { resultado: -100 },
        { resultado: 0 },
        { resultado: 200 },
      ]),
    ).toEqual([1, 0.25, 0, 0.5]);
    expect(alturasDasBarras([{ resultado: 0 }])).toEqual([0]);
    expect(alturasDasBarras([])).toEqual([]);
  });
});
