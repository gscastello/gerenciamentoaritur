import { describe, expect, it } from "vitest";
import { previsaoDemanda } from "../demanda.js";

const r = (data, quantidade, over = {}) => ({
  id: Math.random().toString(36).slice(2),
  data,
  direcao: "ida",
  status: "confirmada",
  quantidade,
  ...over,
});

describe("previsaoDemanda", () => {
  it("retorna os 7 dias da semana em ordem", () => {
    const d = previsaoDemanda([]);
    expect(d).toHaveLength(7);
    expect(d[0].nome).toBe("Domingo");
    expect(d[1].nome).toBe("Segunda-feira");
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

  it("ignora cancelados, frete e encomenda", () => {
    const reservas = [
      r("2026-09-01", 5, { status: "cancelada" }),
      r("2026-09-01", 5, { tipo: "frete" }),
    ];
    const terca = previsaoDemanda(reservas).find((x) => x.nome === "Terça-feira");
    expect(terca.amostras).toBe(0);
    expect(terca.media).toBe(0);
  });
});
