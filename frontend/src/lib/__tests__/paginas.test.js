import { describe, expect, it } from "vitest";
import { buscarTodasAsPaginas } from "../paginas.js";

// Simula o PostgREST: devolve no máximo `maxRows` linhas por pedido, mesmo pedindo mais.
function servidor(total, { maxRows = 1000, erroNa } = {}) {
  const linhas = Array.from({ length: total }, (_, i) => ({ id: i }));
  const pedidos = [];
  const montar = () => ({
    range(de, ate) {
      pedidos.push([de, ate]);
      if (erroNa === pedidos.length)
        return Promise.resolve({ data: null, error: { message: "x" } });
      const fim = Math.min(ate + 1, de + maxRows);
      return Promise.resolve({ data: linhas.slice(de, fim), error: null });
    },
  });
  return { montar, pedidos };
}

describe("buscar todas as páginas (issue #442)", () => {
  it("1.010 reservas: vem tudo, inclusive as 10 mais novas que o corte de 1.000 escondia", async () => {
    const s = servidor(1010);
    const { data, error } = await buscarTodasAsPaginas(s.montar);
    expect(error).toBeNull();
    expect(data).toHaveLength(1010);
    expect(data.at(-1)).toEqual({ id: 1009 });
    expect(s.pedidos).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it("menos de uma página: um pedido só; exatamente uma página: confere a próxima", async () => {
    const pouco = servidor(5);
    expect((await buscarTodasAsPaginas(pouco.montar)).data).toHaveLength(5);
    expect(pouco.pedidos).toEqual([[0, 999]]);
    const cheia = servidor(1000);
    expect((await buscarTodasAsPaginas(cheia.montar)).data).toHaveLength(1000);
    expect(cheia.pedidos).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
    const vazio = servidor(0);
    expect((await buscarTodasAsPaginas(vazio.montar)).data).toEqual([]);
  });

  it("erro em qualquer página devolve o erro (nunca uma lista pela metade)", async () => {
    const s = servidor(2500, { erroNa: 2 });
    expect(await buscarTodasAsPaginas(s.montar)).toEqual({ data: null, error: { message: "x" } });
  });

  it("respeita o tamanho da página e o teto", async () => {
    const s = servidor(250, { maxRows: 100 });
    expect((await buscarTodasAsPaginas(s.montar, { pagina: 100 })).data).toHaveLength(250);
    expect(s.pedidos).toHaveLength(3);
    const t = servidor(10000, { maxRows: 100 });
    expect((await buscarTodasAsPaginas(t.montar, { pagina: 100, teto: 300 })).data).toHaveLength(
      300,
    );
  });

  it("data nula do servidor conta como página vazia", async () => {
    const montar = () => ({ range: () => Promise.resolve({ data: null, error: null }) });
    expect(await buscarTodasAsPaginas(montar)).toEqual({ data: [], error: null });
  });
});
