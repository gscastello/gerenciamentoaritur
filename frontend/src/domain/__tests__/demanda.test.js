import { describe, expect, it } from "vitest";
import { DIAS_SEMANA, previsaoDemanda } from "../demanda.js";

const r = (data, quantidade, over = {}) => ({
  id: Math.random().toString(36).slice(2),
  data,
  direcao: "ida",
  status: "confirmada",
  quantidade,
  ...over,
});

describe("previsaoDemanda", () => {
  it("retorna os 7 dias da semana em ordem, com idx", () => {
    const d = previsaoDemanda([]);
    expect(d).toHaveLength(7);
    expect(d.map((x) => x.nome)).toEqual(DIAS_SEMANA);
    expect(d.map((x) => x.idx)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("lista vazia => tudo zerado", () => {
    for (const dia of previsaoDemanda([])) {
      expect(dia.media).toBe(0);
      expect(dia.amostras).toBe(0);
      expect(dia.diffPct).toBe(0);
    }
  });

  it("média por weekday = passageiros / número de datas distintas", () => {
    // 2026-09-01 e 2026-09-08 são terças
    const reservas = [
      r("2026-09-01", 4),
      r("2026-09-01", 2), // mesma data => 6 numa data
      r("2026-09-08", 10), // outra terça
    ];
    const terca = previsaoDemanda(reservas).find((x) => x.nome === "Terça-feira");
    expect(terca.amostras).toBe(2);
    expect(terca.media).toBe(8); // (6 + 10) / 2
  });

  it("quantidade ausente conta como 1", () => {
    const terca = previsaoDemanda([r("2026-09-01", undefined)]).find((x) => x.nome === "Terça-feira");
    expect(terca.media).toBe(1);
  });

  it("ignora cancelados, frete e encomenda", () => {
    const reservas = [
      r("2026-09-01", 5, { status: "cancelada" }),
      r("2026-09-01", 5, { tipo: "frete" }),
      r("2026-09-01", 5, { tipo: "encomenda" }),
      r("2026-09-01", 5, { status: "espera" }),
    ];
    const terca = previsaoDemanda(reservas).find((x) => x.nome === "Terça-feira");
    expect(terca.amostras).toBe(0);
    expect(terca.media).toBe(0);
  });

  it("conta status 'embarcado' na média", () => {
    const terca = previsaoDemanda([r("2026-09-01", 3, { status: "embarcado" })]).find(
      (x) => x.nome === "Terça-feira",
    );
    expect(terca.media).toBe(3);
  });

  it("diffPct compara o weekday com a média geral dos weekdays ativos", () => {
    // terça: média 10 · quinta: média 30 · média geral = 20
    // terça = (10-20)/20 = -50% · quinta = (30-20)/20 = +50%
    const reservas = [
      r("2026-09-01", 10), // terça
      r("2026-09-03", 30), // quinta
    ];
    const out = previsaoDemanda(reservas);
    expect(out.find((x) => x.nome === "Terça-feira").diffPct).toBe(-50);
    expect(out.find((x) => x.nome === "Quinta-feira").diffPct).toBe(50);
  });

  it("diffPct é 0 quando só um weekday tem histórico (ele É a média)", () => {
    const out = previsaoDemanda([r("2026-09-01", 10)]);
    expect(out.find((x) => x.nome === "Terça-feira").diffPct).toBe(0);
  });
});
