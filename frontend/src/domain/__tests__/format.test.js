import { describe, expect, it } from "vitest";
import { digitos, fmtBRL, fmtDate, fmtHora, normalizar, todayStr } from "../format.js";

describe("format", () => {
  it("fmtBRL", () => {
    expect(fmtBRL(1234.5)).toContain("1.234,5");
    expect(fmtBRL(0)).toContain("0,00");
    expect(fmtBRL(null)).toContain("0,00");
  });

  it("fmtDate", () => {
    expect(fmtDate("2026-09-01")).toBe("01/09/2026");
    expect(fmtDate("")).toBe("—");
    expect(fmtDate(undefined)).toBe("—");
    expect(fmtDate("lixo")).toBe("—");
  });

  it("fmtHora devolve HH:MM", () => {
    expect(fmtHora("2026-09-01T14:05:00")).toMatch(/^\d{2}:\d{2}$/);
  });

  it("todayStr devolve YYYY-MM-DD", () => {
    expect(todayStr()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("normalizar remove acento e caixa", () => {
    expect(normalizar("São Cristóvão")).toBe("sao cristovao");
    expect(normalizar("  COHAMA  ")).toBe("cohama");
    expect(normalizar(null)).toBe("");
  });

  it("digitos", () => {
    expect(digitos("(98) 98101-2388")).toBe("98981012388");
    expect(digitos(null)).toBe("");
  });
});
