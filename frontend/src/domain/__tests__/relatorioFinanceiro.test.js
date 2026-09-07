import { describe, expect, it } from "vitest";
import {
  agregarPorPeriodo,
  chavePeriodo,
  despesaPorCategoria,
  montarRelatorioFinanceiro,
  partesData,
  totaisRelatorio,
} from "../relatorioFinanceiro.js";

const e = (entry_date, type, amount, category) => ({ entry_date, type, amount, category });

describe("partesData", () => {
  it("quebra uma data ISO válida", () => {
    expect(partesData("2026-09-07")).toEqual({ ano: 2026, mes: 9, dia: 7 });
  });
  it("rejeita formato errado", () => {
    expect(partesData("07/09/2026")).toBeNull();
    expect(partesData("2026-9-7")).toBeNull();
    expect(partesData("")).toBeNull();
    expect(partesData(null)).toBeNull();
    expect(partesData(20260907)).toBeNull();
  });
  it("rejeita mês/dia fora do intervalo", () => {
    expect(partesData("2026-13-01")).toBeNull();
    expect(partesData("2026-00-01")).toBeNull();
    expect(partesData("2026-09-00")).toBeNull();
    expect(partesData("2026-09-32")).toBeNull();
  });
});

describe("chavePeriodo", () => {
  it("dia => YYYY-MM-DD com zero à esquerda", () => {
    expect(chavePeriodo("2026-03-05", "dia")).toBe("2026-03-05");
  });
  it("mes => YYYY-MM", () => {
    expect(chavePeriodo("2026-03-05", "mes")).toBe("2026-03");
  });
  it("ano => YYYY", () => {
    expect(chavePeriodo("2026-03-05", "ano")).toBe("2026");
  });
  it("data inválida => null", () => {
    expect(chavePeriodo("xx", "mes")).toBeNull();
  });
});

describe("agregarPorPeriodo", () => {
  it("soma faturamento, despesa e lucro por mês", () => {
    const linhas = agregarPorPeriodo(
      [
        e("2026-01-10", "receita", 100),
        e("2026-01-20", "receita", 50),
        e("2026-01-25", "despesa", 30),
        e("2026-02-01", "receita", 200),
      ],
      "mes",
    );
    expect(linhas).toHaveLength(2);
    expect(linhas[0]).toEqual({
      periodo: "2026-01",
      faturamento: 150,
      despesa: 30,
      lucro: 120,
      lancamentos: 3,
    });
    expect(linhas[1].periodo).toBe("2026-02");
    expect(linhas[1].lucro).toBe(200);
  });

  it("ordena os períodos em ordem crescente", () => {
    const linhas = agregarPorPeriodo(
      [e("2026-12-01", "receita", 1), e("2026-01-01", "receita", 1), e("2026-06-01", "receita", 1)],
      "mes",
    );
    expect(linhas.map((l) => l.periodo)).toEqual(["2026-01", "2026-06", "2026-12"]);
  });

  it("ignora lançamentos sem type receita/despesa ou com data inválida", () => {
    const linhas = agregarPorPeriodo(
      [
        e("2026-01-01", "receita", 10),
        e("2026-01-02", "ajuste", 999),
        e("bad-date", "receita", 999),
        { type: "receita", amount: 999 },
        null,
        undefined,
      ],
      "mes",
    );
    expect(linhas).toHaveLength(1);
    expect(linhas[0].faturamento).toBe(10);
    expect(linhas[0].lancamentos).toBe(1);
  });

  it("trata amount não numérico como zero", () => {
    const linhas = agregarPorPeriodo(
      [e("2026-01-01", "receita", "abc"), e("2026-01-01", "receita", 5)],
      "mes",
    );
    expect(linhas[0].faturamento).toBe(5);
    expect(linhas[0].lancamentos).toBe(2);
  });

  it("agrega por dia e por ano", () => {
    const dados = [e("2026-01-01", "receita", 10), e("2026-01-01", "despesa", 4), e("2027-05-05", "receita", 1)];
    expect(agregarPorPeriodo(dados, "dia")).toHaveLength(2);
    const porAno = agregarPorPeriodo(dados, "ano");
    expect(porAno.map((l) => l.periodo)).toEqual(["2026", "2027"]);
    expect(porAno[0].lucro).toBe(6);
  });

  it("lista vazia / nula => []", () => {
    expect(agregarPorPeriodo([], "mes")).toEqual([]);
    expect(agregarPorPeriodo(null, "mes")).toEqual([]);
  });

  it("granularidade inválida lança erro", () => {
    expect(() => agregarPorPeriodo([], "semana")).toThrow(/granularidade/);
  });
});

describe("despesaPorCategoria", () => {
  it("soma despesas por categoria, maior primeiro, ignora receitas", () => {
    const out = despesaPorCategoria([
      e("2026-01-01", "despesa", 10, "combustivel"),
      e("2026-01-02", "despesa", 40, "salario"),
      e("2026-01-03", "despesa", 5, "combustivel"),
      e("2026-01-04", "receita", 999, "combustivel"),
    ]);
    expect(out).toEqual([
      { categoria: "salario", total: 40 },
      { categoria: "combustivel", total: 15 },
    ]);
  });
  it("categoria ausente vira 'outro'", () => {
    expect(despesaPorCategoria([e("2026-01-01", "despesa", 7)])).toEqual([{ categoria: "outro", total: 7 }]);
  });
  it("ignora elementos nulos na lista sem quebrar", () => {
    expect(despesaPorCategoria([null, undefined, e("2026-01-01", "despesa", 3, "pedagio")])).toEqual([
      { categoria: "pedagio", total: 3 },
    ]);
  });
  it("lista vazia => []", () => {
    expect(despesaPorCategoria([])).toEqual([]);
    expect(despesaPorCategoria(null)).toEqual([]);
  });
});

describe("totaisRelatorio", () => {
  it("soma as linhas agregadas", () => {
    const t = totaisRelatorio([
      { faturamento: 100, despesa: 30, lucro: 70, lancamentos: 2 },
      { faturamento: 50, despesa: 20, lucro: 30, lancamentos: 1 },
    ]);
    expect(t).toEqual({ faturamento: 150, despesa: 50, lucro: 100, lancamentos: 3 });
  });
  it("sem linhas => zeros", () => {
    expect(totaisRelatorio([])).toEqual({ faturamento: 0, despesa: 0, lucro: 0, lancamentos: 0 });
    expect(totaisRelatorio(null)).toEqual({ faturamento: 0, despesa: 0, lucro: 0, lancamentos: 0 });
  });
});

describe("montarRelatorioFinanceiro", () => {
  const dados = [
    e("2026-09-01", "receita", 300, null),
    e("2026-09-01", "despesa", 100, "combustivel"),
    e("2026-09-15", "receita", 200, null),
  ];

  it("junta linhas, totais e categorias com metadados", () => {
    const rel = montarRelatorioFinanceiro(dados, {
      granularidade: "mes",
      escopo: "Setembro/2026",
      geradoEm: "2026-09-30T12:00:00.000Z",
    });
    expect(rel.granularidade).toBe("mes");
    expect(rel.escopo).toBe("Setembro/2026");
    expect(rel.geradoEm).toBe("2026-09-30T12:00:00.000Z");
    expect(rel.linhas).toHaveLength(1);
    expect(rel.totais).toEqual({ faturamento: 500, despesa: 100, lucro: 400, lancamentos: 3 });
    expect(rel.porCategoria).toEqual([{ categoria: "combustivel", total: 100 }]);
  });

  it("usa defaults quando não passa opções", () => {
    const rel = montarRelatorioFinanceiro(dados);
    expect(rel.granularidade).toBe("mes");
    expect(rel.escopo).toBe("");
    expect(typeof rel.geradoEm).toBe("string");
    expect(rel.geradoEm).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
