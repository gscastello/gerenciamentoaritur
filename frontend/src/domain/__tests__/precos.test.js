import { describe, expect, it } from "vitest";
import {
  VALOR_BUSCA_PADRAO,
  VALOR_PONTO_PADRAO,
  _tabelas,
  descreverSugestaoDePreco,
  precoBairro,
  precoDoLocalDeOutros,
  valorTotal,
  valorUnitario,
} from "../precos.js";

describe("constantes e tabelas", () => {
  it("os padrões são R$60 (ponto) e R$80 (busca)", () => {
    expect(VALOR_PONTO_PADRAO).toBe(60);
    expect(VALOR_BUSCA_PADRAO).toBe(80);
  });
  it("as tabelas de bairro não têm sobreposição entre R$80 e R$90", () => {
    const set80 = new Set(_tabelas.BAIRROS_80.map((b) => b.toLowerCase()));
    const overlap = _tabelas.BAIRROS_90.filter((b) => set80.has(b.toLowerCase()));
    expect(overlap).toEqual([]);
  });
});

describe("precoBairro", () => {
  it("reconhece bairro da tabela de R$80 (acento/caixa irrelevantes)", () => {
    expect(precoBairro("Cohama")).toBe(80);
    expect(precoBairro("  cohama ")).toBe(80);
    expect(precoBairro("São Cristóvão")).toBe(80);
    expect(precoBairro("sao cristovao")).toBe(80);
  });

  it("reconhece bairro da tabela de R$90", () => {
    expect(precoBairro("Anjo da Guarda")).toBe(90);
    expect(precoBairro("Vila Embratel")).toBe(90);
  });

  it("null quando informado mas não reconhecido", () => {
    expect(precoBairro("Bairro Inventado")).toBeNull();
  });

  it("undefined quando nada informado", () => {
    expect(precoBairro("")).toBeUndefined();
    expect(precoBairro(undefined)).toBeUndefined();
  });
});

describe("valorUnitario / valorTotal", () => {
  const pontoBusca = { campo: "bairro" };
  const pontoBR = { valor: 60 };

  it("ponto fixo usa o valor do ponto", () => {
    expect(valorUnitario({ ponto: pontoBR })).toBe(60);
  });

  it("ponto sem valor cai no padrão R$60", () => {
    expect(valorUnitario({ ponto: {} })).toBe(60);
  });

  it("busca em casa usa o preço do bairro", () => {
    expect(valorUnitario({ ponto: pontoBusca, bairro: "Anjo da Guarda" })).toBe(90);
  });

  it("busca em casa com bairro não reconhecido cai no piso R$80", () => {
    expect(valorUnitario({ ponto: pontoBusca, bairro: "Nao Existe" })).toBe(80);
    expect(valorUnitario({ ponto: pontoBusca })).toBe(80); // sem bairro
  });

  it("sem nenhum argumento devolve o padrão de ponto", () => {
    expect(valorUnitario()).toBe(60);
    expect(valorTotal()).toBe(60);
  });

  it("valorTotal multiplica pela quantidade", () => {
    expect(valorTotal({ ponto: pontoBR, quantidade: 3 })).toBe(180);
    expect(valorTotal({ ponto: pontoBusca, bairro: "Cohama", quantidade: 2 })).toBe(160);
    expect(valorTotal({ ponto: pontoBR })).toBe(60);
  });

  it("quantidade 0 ou não numérica conta como 1", () => {
    expect(valorTotal({ ponto: pontoBR, quantidade: 0 })).toBe(60);
    expect(valorTotal({ ponto: pontoBR, quantidade: "x" })).toBe(60);
  });
});

describe("descreverSugestaoDePreco", () => {
  it("bairro e trecho em uma frase", () => {
    expect(
      descreverSugestaoDePreco({ tipo: "bairro", origem: "Maiobinha", price: 80 }).replace(
        /\s/g,
        " ",
      ),
    ).toBe("Busca em casa em Maiobinha: R$ 80,00");
    expect(
      descreverSugestaoDePreco({
        tipo: "trecho",
        origem: "Pirapemas",
        destino: "Miranda",
        price: 30,
      }).replace(/\s/g, " "),
    ).toBe("Pirapemas a Miranda: R$ 30,00");
  });
});

describe("precoDoLocalDeOutros — aeroporto ≠ retorno do aeroporto (issue #263)", () => {
  const LOCAIS = [{ local: "Aeroporto", price: 70 }];

  it("embarque dentro do aeroporto usa o preço próprio", () => {
    for (const t of [
      "Aeroporto de São Luís",
      "no aeroporto",
      "AEROPORTO, saguão",
      "terminal do aeroporto",
    ]) {
      expect(precoDoLocalDeOutros(t, LOCAIS)).toBe(70);
    }
  });

  it("'retorno do aeroporto' NÃO é o aeroporto", () => {
    for (const t of ["Retorno do aeroporto", "no retorno perto do aeroporto", "retorno"]) {
      expect(precoDoLocalDeOutros(t, LOCAIS)).toBeNull();
    }
  });

  it("local sem preço próprio, vazio ou valor inválido → null", () => {
    expect(precoDoLocalDeOutros("BR — Maracanã", LOCAIS)).toBeNull();
    expect(precoDoLocalDeOutros("", LOCAIS)).toBeNull();
    expect(precoDoLocalDeOutros(null, LOCAIS)).toBeNull();
    expect(precoDoLocalDeOutros("aeroportos", LOCAIS)).toBeNull();
    expect(precoDoLocalDeOutros("aeroporto", [{ local: "Aeroporto", price: "x" }])).toBeNull();
    expect(precoDoLocalDeOutros("aeroporto")).toBeNull();
  });

  it("o local mais específico vence", () => {
    const locais = [
      { local: "Aeroporto", price: 70 },
      { local: "Aeroporto Hangar", price: 90 },
    ];
    expect(precoDoLocalDeOutros("aeroporto hangar 2", locais)).toBe(90);
    expect(precoDoLocalDeOutros("aeroporto", locais)).toBe(70);
  });
});

describe("preço da Volta pelo desembarque (#349)", () => {
  const base = {
    valorDoPontoDaIda: (c) => ({ rodoviaria: 60, retorno: 60, outro: 60 })[c],
    nomesDeBairros: [
      "Santo Antônio",
      "Estrada da Maioba",
      "Cohatrac",
      "Turu",
      "Residencial Santo Antônio",
    ],
    precoBairro: (n) =>
      ({ "Santo Antônio": 80, "Estrada da Maioba": 80, Cohatrac: 90, Turu: null })[n] ?? null,
    precoLocalOutros: (t) => (/aeroporto/i.test(t) ? 70 : null),
  };
  it("cobra pelo lugar onde deixamos o cliente", async () => {
    const { precoDaVolta } = await import("../precos.js");
    expect(precoDaVolta({ ...base, area: "rodoviaria", texto: "" }).preco).toBe(60);
    expect(precoDaVolta({ ...base, area: "", texto: "no retorno" }).preco).toBe(60);
    expect(precoDaVolta({ ...base, area: "casa", texto: "Cohatrac, Rua 7" })).toEqual({
      preco: 90,
      bairro: "Cohatrac",
      bairroNaoReconhecido: false,
    });
    expect(
      precoDaVolta({ ...base, area: "", texto: "2 no Santo Antônio; 2 na Estrada da Maioba" })
        .preco,
    ).toBe(80);
    expect(precoDaVolta({ ...base, area: "br", texto: "Aeroporto" }).preco).toBe(70);
    expect(precoDaVolta({ ...base, area: "br", texto: "Maracanã" }).preco).toBe(60);
  });
  it("sem bairro, cidade do caminho ou bairro sem preço: não inventa", async () => {
    const { precoDaVolta } = await import("../precos.js");
    expect(precoDaVolta({ ...base, area: "", texto: "" }).preco).toBeNull();
    expect(precoDaVolta({ ...base, area: "miranda", texto: "Miranda" }).preco).toBeNull();
    expect(precoDaVolta({ ...base, area: "casa", texto: "Rua desconhecida" })).toEqual({
      preco: null,
      bairro: null,
      bairroNaoReconhecido: true,
    });
    expect(precoDaVolta({ ...base, area: "casa", texto: "Turu" })).toEqual({
      preco: null,
      bairro: "Turu",
      bairroNaoReconhecido: true,
    });
  });
});
