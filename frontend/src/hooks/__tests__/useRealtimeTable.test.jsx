import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const canais = [];
vi.mock("../../lib/supabaseClient", () => ({
  supabase: {
    channel: () => {
      const canal = {
        eventos: [],
        on(_tipo, filtro, fn) {
          canal.eventos.push({ filtro, fn });
          return canal;
        },
        subscribe(fn) {
          canal.status = fn;
          return canal;
        },
      };
      canais.push(canal);
      return canal;
    },
    removeChannel: vi.fn(),
  },
}));

import { ESCONDIDO_MINIMO_MS, useRealtimeTable } from "../useRealtimeTable.js";

let visibilidade = "visible";
function mudarVisibilidade(estado) {
  visibilidade = estado;
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("useRealtimeTable: relê quando pode ter perdido eventos (issue #444)", () => {
  beforeEach(() => {
    canais.length = 0;
    visibilidade = "visible";
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibilidade,
    });
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it("evento do banco chama onChange com o que veio", () => {
    const onChange = vi.fn();
    renderHook(() => useRealtimeTable(["reservations", "trips"], onChange));
    expect(canais[0].eventos.map((e) => e.filtro.table)).toEqual(["reservations", "trips"]);
    canais[0].eventos[0].fn({ eventType: "INSERT" });
    expect(onChange).toHaveBeenCalledWith({ eventType: "INSERT" });
  });

  it("reconectou depois de cair: relê; a primeira conexão não relê", () => {
    const onChange = vi.fn();
    renderHook(() => useRealtimeTable("reservations", onChange));
    canais[0].status("SUBSCRIBED");
    expect(onChange).not.toHaveBeenCalled();
    canais[0].status("CHANNEL_ERROR");
    canais[0].status("SUBSCRIBED");
    expect(onChange).toHaveBeenCalledWith({ resync: true, motivo: "reconectou" });
    canais[0].status("TIMED_OUT");
    canais[0].status("SUBSCRIBED");
    canais[0].status("CLOSED");
    canais[0].status("SUBSCRIBED");
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it("celular voltou do bloqueio: relê; troca rápida de app não relê", () => {
    const onChange = vi.fn();
    renderHook(() => useRealtimeTable("reservations", onChange));
    mudarVisibilidade("hidden");
    vi.advanceTimersByTime(ESCONDIDO_MINIMO_MS - 1);
    mudarVisibilidade("visible");
    expect(onChange).not.toHaveBeenCalled();
    mudarVisibilidade("hidden");
    vi.advanceTimersByTime(ESCONDIDO_MINIMO_MS);
    mudarVisibilidade("visible");
    expect(onChange).toHaveBeenCalledWith({ resync: true, motivo: "voltou" });
    // já visível: outro aviso de visibilidade não relê de novo
    mudarVisibilidade("visible");
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("a internet voltou: relê", () => {
    const onChange = vi.fn();
    renderHook(() => useRealtimeTable("reservations", onChange));
    window.dispatchEvent(new Event("online"));
    expect(onChange).toHaveBeenCalledWith({ resync: true, motivo: "online" });
  });

  it("conferência de tempos em tempos só com a tela visível e só se pedida", () => {
    const semConferir = vi.fn();
    const comConferir = vi.fn();
    renderHook(() => useRealtimeTable("trips", semConferir));
    renderHook(() => useRealtimeTable("reservations", comConferir, { conferirACada: 1000 }));
    vi.advanceTimersByTime(3000);
    expect(semConferir).not.toHaveBeenCalled();
    expect(comConferir).toHaveBeenCalledTimes(3);
    expect(comConferir).toHaveBeenLastCalledWith({ resync: true, motivo: "conferencia" });
    visibilidade = "hidden";
    vi.advanceTimersByTime(3000);
    expect(comConferir).toHaveBeenCalledTimes(3);
  });

  it("desligado não assina nada; ao sair da tela para de ouvir", () => {
    const onChange = vi.fn();
    renderHook(() => useRealtimeTable("reservations", onChange, { enabled: false }));
    expect(canais).toHaveLength(0);
    const { unmount } = renderHook(() =>
      useRealtimeTable("reservations", onChange, { conferirACada: 1000 }),
    );
    unmount();
    window.dispatchEvent(new Event("online"));
    vi.advanceTimersByTime(5000);
    expect(onChange).not.toHaveBeenCalled();
  });
});
