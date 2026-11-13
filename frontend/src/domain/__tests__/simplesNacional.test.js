import { describe, expect, it } from "vitest";
import {
  ANEXOS,
  aliquotaEfetiva,
  estimarDas,
  mesDeApuracao,
  mesesDoRbt12,
  receitasPorMes,
} from "../simplesNacional.js";

// Estimativa do DAS (issue #366) — o contador confirma; aqui é a conta da LC 123.
describe("alíquota efetiva", () => {
  it("Anexo III e Anexo I, pela faixa da receita dos 12 meses", () => {
    expect(aliquotaEfetiva(100000, "III")).toBe(0.06); // 1ª faixa: a nominal
    expect(aliquotaEfetiva(300000, "III")).toBe(0.0808); // (300000×11,2% − 9.360) ÷ 300000
    expect(aliquotaEfetiva(500000, "I")).toBe(0.06728); // (500000×9,5% − 13.860) ÷ 500000
    expect(aliquotaEfetiva(180000, "III")).toBe(0.06); // no teto ainda é a 1ª faixa
    expect(aliquotaEfetiva(0, "I")).toBe(0.04); // começo de atividade
    expect(aliquotaEfetiva(4800001)).toBeNull(); // fora do Simples
    expect(aliquotaEfetiva(300000, "X")).toBe(0.0808); // anexo desconhecido → III
    expect(ANEXOS).toEqual(["I", "III"]);
  });
});

describe("meses e receitas", () => {
  it("RBT12 são os 12 meses anteriores, atravessando o ano", () => {
    const m = mesesDoRbt12("2026-02");
    expect(m).toHaveLength(12);
    expect(m[0]).toBe("2025-02");
    expect(m[11]).toBe("2026-01");
  });
  it("receitas por mês ignoram despesas e datas ruins", () => {
    expect(
      receitasPorMes([
        { type: "receita", entry_date: "2026-10-03", amount: 80 },
        { type: "receita", entry_date: "2026-10-30", amount: "60.5" },
        { type: "despesa", entry_date: "2026-10-30", amount: 999 },
        { type: "receita", entry_date: null, amount: 10 },
      ]),
    ).toEqual({ "2026-10": 140.5 });
    expect(receitasPorMes(null)).toEqual({});
  });
  it("o DAS que vence dia 20 é do mês anterior", () => {
    expect(mesDeApuracao("2026-11-20")).toBe("2026-10");
    expect(mesDeApuracao("2027-01-20")).toBe("2026-12");
  });
});

describe("estimativa do DAS", () => {
  const receitas = Object.fromEntries(mesesDoRbt12("2026-10").map((k) => [k, 25000]));
  receitas["2026-10"] = 30000;

  it("receita do mês × alíquota efetiva pelo RBT12", () => {
    const e = estimarDas({ mes: "2026-10", receitas });
    expect(e).toMatchObject({
      mes: "2026-10",
      receitaMes: 30000,
      rbt12: 300000,
      aliquota: 0.0808,
      manual: false,
      mesesSemDado: 0,
    });
    expect(e.valor).toBe(2424);
  });
  it("alíquota do contador vence a conta", () => {
    const e = estimarDas({ mes: "2026-10", receitas, aliquotaManual: 7.5 });
    expect(e).toMatchObject({ aliquota: 0.075, manual: true, valor: 2250 });
    expect(estimarDas({ mes: "2026-10", receitas, aliquotaManual: 0 }).manual).toBe(false);
  });
  it("meses sem lançamento são contados (o app pode ter começado no meio)", () => {
    const e = estimarDas({ mes: "2026-10", receitas: { "2026-09": 1000, "2026-10": 500 } });
    expect(e.mesesSemDado).toBe(11);
    expect(e.valor).toBe(30);
  });
  it("acima do teto do Simples não estima", () => {
    expect(
      estimarDas({ mes: "2026-10", receitas: { "2026-09": 5000000, "2026-10": 1 } }),
    ).toBeNull();
  });
});
