import { describe, expect, it } from "vitest";
import { diaSemana, isMonday, shiftHour } from "../horarios.js";

describe("isMonday", () => {
  it("true só na segunda-feira", () => {
    expect(isMonday("2026-08-31")).toBe(true); // segunda
    expect(isMonday("2026-09-01")).toBe(false); // terça
    expect(isMonday("2026-09-06")).toBe(false); // domingo
    expect(isMonday("2026-09-07")).toBe(true); // segunda
  });
});

describe("diaSemana", () => {
  it("devolve o nome do dia em pt-BR", () => {
    expect(diaSemana("2026-08-31")).toMatch(/segunda/i);
    expect(diaSemana("2026-09-06")).toMatch(/domingo/i);
  });
});

describe("shiftHour — ajuste de segunda-feira", () => {
  it("sem efeito quando inativo", () => {
    expect(shiftHour("05:40", false)).toBe("05:40");
    expect(shiftHour("05:40", false, 3)).toBe("05:40");
  });

  it("adianta 1h por padrão, preservando os minutos", () => {
    expect(shiftHour("05:40", true)).toBe("04:40");
    expect(shiftHour("06:00", true)).toBe("05:00");
    expect(shiftHour("13:07", true)).toBe("12:07");
  });

  it("adianta N horas quando configurado", () => {
    expect(shiftHour("05:40", true, 2)).toBe("03:40");
    expect(shiftHour("09:15", true, 4)).toBe("05:15");
  });

  it("faz wrap corretamente na virada da meia-noite", () => {
    expect(shiftHour("00:30", true, 1)).toBe("23:30");
    expect(shiftHour("01:00", true, 3)).toBe("22:00");
  });
});
