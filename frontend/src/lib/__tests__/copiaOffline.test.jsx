import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSupabaseQuery } from "../../hooks/useSupabaseQuery.js";
import { apagarCopias, lerCopia, salvarCopia, semRede } from "../copiaOffline.js";

// Issue #355: cópia da última leitura no aparelho para abrir a Agenda sem internet.

const erroDeRede = () =>
  Object.assign(new Error("listWindow: TypeError: Failed to fetch"), { retryable: true });

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("copiaOffline", () => {
  it("guarda e lê a última leitura com a hora", () => {
    salvarCopia("reservas", [{ id: 1 }], 1000);
    expect(lerCopia("reservas", 2000)).toEqual({ em: 1000, dados: [{ id: 1 }] });
  });

  it("cópia com mais de 7 dias não vale", () => {
    salvarCopia("reservas", [1], 0);
    expect(lerCopia("reservas", 8 * 86400000)).toBeNull();
  });

  it("com 'Permanecer conectado' desligado não guarda nada", () => {
    localStorage.setItem("aritur-remember-me", "0");
    salvarCopia("reservas", [1]);
    expect(lerCopia("reservas")).toBeNull();
    expect(Object.keys(localStorage)).toEqual(["aritur-remember-me"]);
  });

  it("sair apaga só as cópias", () => {
    salvarCopia("a", 1);
    salvarCopia("b", 2);
    localStorage.setItem("outra-coisa", "x");
    apagarCopias();
    expect(Object.keys(localStorage)).toEqual(["outra-coisa"]);
  });

  it("erro de conexão é sem rede; erro de regra do banco não", () => {
    expect(semRede(erroDeRede())).toBe(true);
    expect(semRede(new Error("Load failed"))).toBe(true);
    expect(semRede(new Error("CAPACIDADE_EXCEDIDA"))).toBe(false);
  });
});

describe("useSupabaseQuery com offlineKey", () => {
  it("leitura boa fica guardada; sem rede, devolve a cópia com a hora", async () => {
    const ok = renderHook(() => useSupabaseQuery(async () => ["r1"], [], { offlineKey: "t" }));
    await waitFor(() => expect(ok.result.current.data).toEqual(["r1"]));
    expect(ok.result.current.offlineDesde).toBeNull();
    ok.unmount();

    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const off = renderHook(() =>
      useSupabaseQuery(
        async () => {
          throw erroDeRede();
        },
        [],
        { offlineKey: "t" },
      ),
    );
    await waitFor(() => expect(off.result.current.data).toEqual(["r1"]));
    expect(off.result.current.error).toBeNull();
    expect(typeof off.result.current.offlineDesde).toBe("number");
  });

  it("quando a rede volta, lê de novo sozinho", async () => {
    salvarCopia("t", ["velha"]);
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    let falhar = true;
    const h = renderHook(() =>
      useSupabaseQuery(
        async () => {
          if (falhar) throw erroDeRede();
          return ["nova"];
        },
        [],
        { offlineKey: "t" },
      ),
    );
    await waitFor(() => expect(h.result.current.data).toEqual(["velha"]));
    falhar = false;
    online.mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    await waitFor(() => expect(h.result.current.data).toEqual(["nova"]));
    expect(h.result.current.offlineDesde).toBeNull();
  });

  it("erro de regra do banco não usa a cópia", async () => {
    salvarCopia("t", ["velha"]);
    const h = renderHook(() =>
      useSupabaseQuery(
        async () => {
          throw new Error("permission denied");
        },
        [],
        { offlineKey: "t" },
      ),
    );
    await waitFor(() => expect(h.result.current.error).not.toBeNull());
    expect(h.result.current.data).toBeNull();
  });
});
