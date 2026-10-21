import { describe, expect, it } from "vitest";
import { mensagemDeRemocao, resumoDaRemocao } from "../financeiroRemocao.js";

const e = (tipo, valor, extra = {}) => ({
  tipo,
  valor,
  auto: false,
  reservationId: null,
  ...extra,
});

describe("resumoDaRemocao", () => {
  it("conta receitas, despesas, valores e as origens", () => {
    const r = resumoDaRemocao([
      e("receita", 60, { reservationId: "r1" }),
      e("receita", 120, { reservationId: "r2" }),
      e("despesa", 300, { auto: true }),
      e("despesa", 50),
    ]);
    expect(r).toEqual({
      total: 4,
      receitas: 2,
      despesas: 2,
      valorReceitas: 180,
      valorDespesas: 350,
      deReservas: 2,
      daOperacao: 1,
    });
  });

  it("lista vazia ou ausente dá tudo zero", () => {
    expect(resumoDaRemocao([]).total).toBe(0);
    expect(resumoDaRemocao(undefined).valorReceitas).toBe(0);
  });
});

describe("mensagemDeRemocao", () => {
  it("diz o que sai e avisa que reservas continuam", () => {
    const m = mensagemDeRemocao(
      "Remover os 2 lançamentos selecionados",
      resumoDaRemocao([e("receita", 60, { reservationId: "r1" }), e("despesa", 50)]),
    );
    expect(m).toContain("Remover os 2 lançamentos selecionados?");
    expect(m).toContain("2 lançamentos: 1 receita");
    expect(m).toContain("1 despesa");
    expect(m).toContain("1 vem de reservas: a reserva e o pagamento continuam");
    expect(m).not.toContain("operação");
    expect(m).toContain("auditoria");
  });

  it("avisa sobre combustível/manutenção e usa plural certo", () => {
    const m = mensagemDeRemocao(
      "Limpar o dia",
      resumoDaRemocao([e("despesa", 100, { auto: true }), e("despesa", 80, { auto: true })]),
    );
    expect(m).toContain("2 vêm da operação (combustível/manutenção)");
  });

  it("sem origem especial não menciona reservas nem operação", () => {
    const m = mensagemDeRemocao("Remover", resumoDaRemocao([e("despesa", 10)]));
    expect(m).not.toContain("reservas");
    expect(m).not.toContain("operação");
  });
});
