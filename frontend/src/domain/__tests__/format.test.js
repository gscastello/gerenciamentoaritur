import { describe, expect, it } from "vitest";
import {
  FORMAS_PAGAMENTO,
  digitos,
  fmtBRL,
  fmtDate,
  fmtHora,
  normalizar,
  rotuloPagamento,
  todayStr,
} from "../format.js";

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

describe("formas de pagamento", () => {
  it("lista dinheiro, Pix e cartão, nessa ordem", () => {
    expect(FORMAS_PAGAMENTO.map((f) => f.valor)).toEqual(["dinheiro", "pix", "cartao"]);
  });

  it("dá o rótulo de cada forma; sem forma conhecida, Dinheiro", () => {
    expect(rotuloPagamento("dinheiro")).toBe("Dinheiro");
    expect(rotuloPagamento("pix")).toBe("Pix");
    expect(rotuloPagamento("cartao")).toBe("Cartão");
    expect(rotuloPagamento(undefined)).toBe("Dinheiro");
    expect(rotuloPagamento("cheque")).toBe("Dinheiro");
  });
});
