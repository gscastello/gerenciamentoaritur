import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/erros.js", () => ({ logTecnico: vi.fn() }));
vi.mock("../../lib/copiaOffline.js", () => ({
  lerCopia: () => null,
  salvarCopia: () => {},
  semRede: () => false,
}));

import { useSupabaseQuery } from "../useSupabaseQuery.js";

function adiada() {
  let resolver;
  let rejeitar;
  const promessa = new Promise((res, rej) => {
    resolver = res;
    rejeitar = rej;
  });
  return { promessa, resolver, rejeitar };
}

describe("useSupabaseQuery: só a leitura mais nova escreve na tela (issue #444)", () => {
  it("resposta atrasada do passageiro anterior não cai por cima da do atual", async () => {
    const pedidos = { ana: adiada(), bia: adiada() };
    const { result, rerender } = renderHook(
      ({ quem }) => useSupabaseQuery(() => pedidos[quem].promessa, [quem]),
      { initialProps: { quem: "ana" } },
    );
    rerender({ quem: "bia" });
    await act(async () => {
      pedidos.bia.resolver("viagens da Bia");
    });
    await waitFor(() => expect(result.current.data).toBe("viagens da Bia"));
    // a da Ana chega depois: é de um pedido antigo e não pode aparecer
    await act(async () => {
      pedidos.ana.resolver("viagens da Ana");
    });
    expect(result.current.data).toBe("viagens da Bia");
    expect(result.current.loading).toBe(false);
  });

  it("erro atrasado de uma leitura antiga não apaga a leitura boa mais nova", async () => {
    const pedidos = [adiada(), adiada()];
    let n = 0;
    const { result } = renderHook(() => useSupabaseQuery(() => pedidos[n++].promessa, []));
    act(() => {
      result.current.refetch();
    });
    await act(async () => {
      pedidos[1].resolver("lista nova");
    });
    await waitFor(() => expect(result.current.data).toBe("lista nova"));
    await act(async () => {
      pedidos[0].rejeitar(new Error("caiu"));
    });
    expect(result.current.error).toBeNull();
    expect(result.current.data).toBe("lista nova");
  });

  it("uma leitura só continua funcionando: dado, erro e nova tentativa", async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error("regra de negócio"))
      .mockResolvedValueOnce(["ok"]);
    const { result } = renderHook(() => useSupabaseQuery(fetcher, []));
    await waitFor(() => expect(result.current.error?.message).toBe("regra de negócio"));
    await act(async () => {
      await result.current.refetch();
    });
    expect(result.current.data).toEqual(["ok"]);
    expect(result.current.error).toBeNull();
  });
});
