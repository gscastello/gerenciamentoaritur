import { afterEach, describe, expect, it, vi } from "vitest";
import { EVENTO_LISTA_CORTADA, fetchComGuarda, listaCortada } from "../guardaDeListas.js";

const BASE = "https://x.supabase.co/rest/v1/";

describe("guarda contra lista cortada (issue #444)", () => {
  it("1.000 linhas sem paginação: acusa a tabela (o corte calado da #442)", () => {
    expect(
      listaCortada({
        metodo: "GET",
        url: `${BASE}v_reservations_flat?select=*`,
        contentRange: "0-999/*",
      }),
    ).toBe("v_reservations_flat");
    // `limit` acima do teto também vem cortado
    expect(
      listaCortada({ metodo: "GET", url: `${BASE}payments?limit=8000`, contentRange: "0-999/*" }),
    ).toBe("payments");
  });

  it("leitura em páginas (offset) nunca acusa: quem pagina busca o resto", () => {
    expect(
      listaCortada({
        metodo: "GET",
        url: `${BASE}v_reservations_flat?offset=0&limit=1000`,
        contentRange: "0-999/*",
      }),
    ).toBeNull();
  });

  it("menos de 1.000 linhas, lista vazia e resposta sem o cabeçalho não acusam", () => {
    const url = `${BASE}customers?select=*`;
    expect(listaCortada({ metodo: "GET", url, contentRange: "0-998/*" })).toBeNull();
    expect(listaCortada({ metodo: "GET", url, contentRange: "*/*" })).toBeNull();
    expect(listaCortada({ metodo: "GET", url, contentRange: null })).toBeNull();
    expect(listaCortada({ metodo: undefined, url, contentRange: "0-999/*" })).toBe("customers");
  });

  it("função que devolve lista (rpc por POST) também é vigiada; gravação comum não", () => {
    expect(
      listaCortada({ metodo: "POST", url: `${BASE}rpc/fn_lugares`, contentRange: "0-999/*" }),
    ).toBe("rpc/fn_lugares");
    expect(
      listaCortada({ metodo: "POST", url: `${BASE}customers`, contentRange: "0-999/*" }),
    ).toBeNull();
    expect(
      listaCortada({ metodo: "PATCH", url: `${BASE}customers`, contentRange: "0-999/*" }),
    ).toBeNull();
  });

  it("endereço de fora do banco (login, arquivos) ou inválido não acusa", () => {
    expect(
      listaCortada({
        metodo: "GET",
        url: "https://x.supabase.co/auth/v1/user",
        contentRange: "0-999/*",
      }),
    ).toBeNull();
    expect(listaCortada({ metodo: "GET", url: "não é url", contentRange: "0-999/*" })).toBeNull();
  });
});

describe("fetch com a guarda", () => {
  afterEach(() => vi.restoreAllMocks());

  const resposta = (contentRange) => ({ headers: { get: () => contentRange }, ok: true });

  it("devolve a resposta como veio e avisa a tela quando a lista veio cortada", async () => {
    const avisos = [];
    const ouvir = (e) => avisos.push(e.detail.tabela);
    window.addEventListener(EVENTO_LISTA_CORTADA, ouvir);
    const r = resposta("0-999/*");
    const f = fetchComGuarda(async () => r);
    expect(await f(`${BASE}financial_entries?select=*`, { method: "GET" })).toBe(r);
    expect(await f({ url: `${BASE}trips?select=*`, method: "GET" })).toBe(r);
    await f(`${BASE}customers?offset=1000&limit=1000`, { method: "GET" });
    window.removeEventListener(EVENTO_LISTA_CORTADA, ouvir);
    expect(avisos).toEqual(["financial_entries", "trips"]);
  });

  it("erro dentro da guarda nunca derruba a leitura", async () => {
    const r = {
      headers: {
        get: () => {
          throw new Error("x");
        },
      },
    };
    const f = fetchComGuarda(async () => r);
    expect(await f(`${BASE}customers`, { method: "GET" })).toBe(r);
  });

  it("erro de rede continua subindo para quem chamou", async () => {
    const f = fetchComGuarda(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(f(`${BASE}customers`)).rejects.toThrow("Failed to fetch");
  });
});
