import { describe, expect, it } from "vitest";
import { isMonday, shiftHour } from "../horarios.js";

describe("isMonday", () => {
  it("true só na segunda-feira", () => {
    expect(isMonday("2026-08-31")).toBe(true); // segunda
    expect(isMonday("2026-09-01")).toBe(false); // terça
    expect(isMonday("2026-09-06")).toBe(false); // domingo
  });
});

describe("shiftHour — ajuste de segunda-feira", () => {
  it("sem efeito quando inativo", () => {
    expect(shiftHour("05:40", false)).toBe("05:40");
  });

  it("adianta 1h por padrão", () => {
    expect(shiftHour("05:40", true)).toBe("04:40");
    expect(shiftHour("06:00", true)).toBe("05:00");
  });

  it("adianta N horas quando configurado", () => {
    expect(shiftHour("05:40", true, 2)).toBe("03:40");
  });

  it("faz wrap corretamente na virada da meia-noite", () => {
    expect(shiftHour("00:30", true, 1)).toBe("23:30");
  });
});
