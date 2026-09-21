import { afterEach, describe, expect, it, vi } from "vitest";
import { deslocarDia, diaAgendaPadrao, todayStr } from "../tabShared.jsx";

// Regressão (2026-09-21): a volta pra São Luís termina por volta das 14h
// (pedido do dono) — depois disso não sobra mais embarque pra "hoje", então
// a Agenda deve abrir direto no dia seguinte. São Luís é UTC-3 o ano todo
// (sem horário de verão), então 14h lá = 17h UTC.

function emSaoLuis(hora, minuto = 0) {
  return new Date(Date.UTC(2026, 8, 21, hora + 3, minuto));
}

describe("diaAgendaPadrao", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("antes das 14h em São Luís, mostra o dia de hoje", () => {
    vi.useFakeTimers();
    vi.setSystemTime(emSaoLuis(13, 59));
    expect(diaAgendaPadrao()).toBe(todayStr());
  });

  it("às 14h em São Luís (limite), já avança pro dia seguinte", () => {
    vi.useFakeTimers();
    vi.setSystemTime(emSaoLuis(14, 0));
    expect(diaAgendaPadrao()).toBe(deslocarDia(todayStr(), 1));
  });

  it("depois das 14h em São Luís, mostra o dia seguinte", () => {
    vi.useFakeTimers();
    vi.setSystemTime(emSaoLuis(20, 30));
    expect(diaAgendaPadrao()).toBe(deslocarDia(todayStr(), 1));
  });

  it("à meia-noite em São Luís, continua no dia de hoje (não pula cedo demais)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(emSaoLuis(0, 5));
    expect(diaAgendaPadrao()).toBe(todayStr());
  });
});

describe("deslocarDia", () => {
  it("avança e retrocede dias mantendo o formato YYYY-MM-DD", () => {
    expect(deslocarDia("2026-09-21", 1)).toBe("2026-09-22");
    expect(deslocarDia("2026-09-21", -1)).toBe("2026-09-20");
  });

  it("atravessa virada de mês corretamente", () => {
    expect(deslocarDia("2026-09-30", 1)).toBe("2026-10-01");
    expect(deslocarDia("2026-10-01", -1)).toBe("2026-09-30");
  });
});
