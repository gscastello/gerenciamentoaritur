import { describe, expect, it } from "vitest";
import {
  andarMes,
  descricaoDoDia,
  diaDaSemana,
  diasDaSemana,
  fracaoOcupada,
  gradeDoMes,
  lotacaoDosDias,
  nomeCurtoDoDia,
  nomeDoMes,
  quaseCheia,
  rotuloDoDia,
  somarDias,
} from "../semanaDaAgenda.js";

describe("semana e calendário da Agenda (issue #446)", () => {
  it("soma dias atravessando mês e ano", () => {
    expect(somarDias("2026-11-30", 1)).toBe("2026-12-01");
    expect(somarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(somarDias("2026-03-01", -1)).toBe("2026-02-28");
    expect(somarDias("2026-11-16", 0)).toBe("2026-11-16");
  });

  it("dia da semana e nome curto", () => {
    expect(diaDaSemana("2026-11-16")).toBe(1);
    expect(diaDaSemana("2026-11-22")).toBe(0);
    expect(nomeCurtoDoDia("2026-11-21")).toBe("sáb");
    expect(nomeCurtoDoDia("2026-11-18")).toBe("qua");
  });

  it("a semana vai de segunda a domingo, qualquer que seja o dia escolhido", () => {
    const semana = [
      "2026-11-16",
      "2026-11-17",
      "2026-11-18",
      "2026-11-19",
      "2026-11-20",
      "2026-11-21",
      "2026-11-22",
    ];
    expect(diasDaSemana("2026-11-16")).toEqual(semana);
    expect(diasDaSemana("2026-11-20")).toEqual(semana);
    expect(diasDaSemana("2026-11-22")).toEqual(semana);
    expect(diasDaSemana("2026-11-23")[0]).toBe("2026-11-23");
    expect(diasDaSemana("2026-12-01")[0]).toBe("2026-11-30");
  });

  it("grade do mês começa na segunda e completa a última semana", () => {
    const nov = gradeDoMes(2026, 11);
    // 1º de novembro de 2026 é domingo: seis casas vazias antes
    expect(nov[0]).toEqual([null, null, null, null, null, null, "2026-11-01"]);
    expect(nov[1][0]).toBe("2026-11-02");
    expect(nov.at(-1)).toEqual(["2026-11-30", null, null, null, null, null, null]);
    expect(nov).toHaveLength(6);
    expect(nov.every((s) => s.length === 7)).toBe(true);
    // fevereiro de 2027 começa na segunda e cabe em 4 semanas
    const fev = gradeDoMes(2027, 2);
    expect(fev).toHaveLength(4);
    expect(fev[0][0]).toBe("2027-02-01");
    expect(fev.at(-1).at(-1)).toBe("2027-02-28");
    // ano bissexto
    expect(gradeDoMes(2028, 2).flat().filter(Boolean)).toHaveLength(29);
  });

  it("nome do mês e andar entre meses atravessando o ano", () => {
    expect(nomeDoMes(2026, 11)).toBe("novembro de 2026");
    expect(nomeDoMes(2027, 1)).toBe("janeiro de 2027");
    expect(andarMes({ ano: 2026, mes: 12 }, 1)).toEqual({ ano: 2027, mes: 1 });
    expect(andarMes({ ano: 2027, mes: 1 }, -1)).toEqual({ ano: 2026, mes: 12 });
    expect(andarMes({ ano: 2026, mes: 6 }, 1)).toEqual({ ano: 2026, mes: 7 });
    expect(andarMes({ ano: 2026, mes: 6 }, -1)).toEqual({ ano: 2026, mes: 5 });
  });

  it("lotação por dia só conta quem ocupa vaga", () => {
    const r = (data, direcao, quantidade, extra = {}) => ({
      data,
      direcao,
      quantidade,
      status: "confirmada",
      tipo: "passagem",
      ...extra,
    });
    const dias = lotacaoDosDias([
      r("2026-11-16", "ida", 2),
      r("2026-11-16", "ida", 1, { status: "embarcado" }),
      r("2026-11-16", "volta", 3),
      r("2026-11-16", "ida", 5, { status: "pendente" }),
      r("2026-11-16", "ida", 4, { status: "cancelada" }),
      r("2026-11-16", "ida", 2, { extra: { fora_lotacao: true } }),
      r("2026-11-16", "ida", 1, { tipo: "encomenda" }),
      r("2026-11-17", "volta", undefined),
      r(null, "ida", 9),
      r("2026-11-18", "outra", 9),
      null,
    ]);
    expect(dias).toEqual({
      "2026-11-16": { ida: 3, volta: 3 },
      "2026-11-17": { ida: 0, volta: 1 },
    });
    expect(lotacaoDosDias(undefined)).toEqual({});
  });

  it("quase cheia a partir de 90% dos lugares", () => {
    expect(quaseCheia(28, 31)).toBe(true);
    expect(quaseCheia(27, 31)).toBe(false);
    expect(quaseCheia(27, 30)).toBe(true);
    expect(quaseCheia(31, 31)).toBe(true);
    expect(quaseCheia(5, 0)).toBe(false);
  });

  it("fração ocupada fica entre 0 e 1", () => {
    expect(fracaoOcupada(0, 31)).toBe(0);
    expect(fracaoOcupada(31, 31)).toBe(1);
    expect(fracaoOcupada(40, 31)).toBe(1);
    expect(fracaoOcupada(-3, 31)).toBe(0);
    expect(fracaoOcupada(15, 30)).toBe(0.5);
    expect(fracaoOcupada(3, 0)).toBe(0);
    expect(fracaoOcupada(3, undefined)).toBe(0);
  });

  it("rótulo do dia: hoje, amanhã, ontem ou o dia da semana", () => {
    const hoje = "2026-11-16";
    expect(rotuloDoDia("2026-11-16", hoje)).toBe("Hoje, 16 de novembro");
    expect(rotuloDoDia("2026-11-17", hoje)).toBe("Amanhã, 17 de novembro");
    expect(rotuloDoDia("2026-11-15", hoje)).toBe("Ontem, 15 de novembro");
    expect(rotuloDoDia("2026-11-20", hoje)).toBe("Sexta, 20 de novembro");
    expect(rotuloDoDia("2026-12-01", hoje)).toBe("Terça, 1 de dezembro");
  });

  it("descrição completa do dia para leitor de tela", () => {
    expect(
      descricaoDoDia("2026-11-20", "2026-11-16", { ida: 27, volta: 12, capIda: 31, capVolta: 15 }),
    ).toBe("Sexta, 20 de novembro: Ida 27 de 31, Volta 12 de 15");
  });
});
