import { describe, expect, it } from "vitest";
import { runDiagnostics } from "../diagnostics.js";

const TRIPS = {
  ida: {
    nome: "Ida",
    pontos: [{ id: "rodoviaria" }, { id: "br" }, { id: "busca", campo: "bairro" }],
  },
  volta: { nome: "Volta", pontos: [{ id: "pirapemas" }, { id: "cantanhede" }] },
};

const r = (over) => ({
  id: Math.random().toString(36).slice(2),
  nome: "Fulano",
  data: "2026-09-01",
  direcao: "ida",
  pontoId: "rodoviaria",
  status: "confirmada",
  telefone: "98999990000",
  quantidade: 1,
  ...over,
});

describe("runDiagnostics", () => {
  it("autocorrige quantidade inválida para 1 e registra em fixed", () => {
    const { corrigidas, fixed } = runDiagnostics([r({ quantidade: 0 })], 31, TRIPS);
    expect(corrigidas[0].quantidade).toBe(1);
    expect(fixed).toHaveLength(1);
  });

  it("reporta overbooking por viagem sem alterar as reservas", () => {
    const reservas = [r({ quantidade: 20 }), r({ quantidade: 20 })];
    const { issues, corrigidas } = runDiagnostics(reservas, 31, TRIPS);
    expect(issues.some((i) => i.includes("overbooking"))).toBe(true);
    expect(corrigidas.map((x) => x.quantidade)).toEqual([20, 20]);
  });

  it("reporta ponto de embarque inexistente", () => {
    const { issues } = runDiagnostics([r({ pontoId: "fantasma" })], 31, TRIPS);
    expect(issues.some((i) => i.includes("não existe mais"))).toBe(true);
  });

  it("reporta reserva sem telefone", () => {
    const { issues } = runDiagnostics([r({ telefone: "" })], 31, TRIPS);
    expect(issues.some((i) => i.includes("sem telefone"))).toBe(true);
  });

  it("reporta id duplicado", () => {
    const { issues } = runDiagnostics([r({ id: "dup" }), r({ id: "dup" })], 31, TRIPS);
    expect(issues.some((i) => i.includes("duplicado"))).toBe(true);
  });

  it("frete/encomenda não entram na contagem de overbooking", () => {
    const reservas = [r({ quantidade: 40, tipo: "encomenda", pontoId: "br" })];
    const { issues } = runDiagnostics(reservas, 31, TRIPS);
    expect(issues.some((i) => i.includes("overbooking"))).toBe(false);
  });
});
