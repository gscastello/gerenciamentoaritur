import { describe, expect, it } from "vitest";
import {
  parseAnotacaoEncomenda,
  parseAnotacaoRapida,
  parseLinhaEncomenda,
  separarBairro,
} from "../anotacaoRapida.js";

describe("parseAnotacaoRapida", () => {
  it("formato completo: quantidade + bairro + telefone sem máscara", () => {
    const r = parseAnotacaoRapida("1P Cohatrac 98999998888");
    expect(r).toEqual({
      ok: true,
      quantidade: 1,
      local: "Cohatrac",
      telefone: "98999998888",
      nome: "",
    });
  });

  it("quantidade > 1, 'p' minúsculo, telefone com +55 e máscara", () => {
    const r = parseAnotacaoRapida("2p Miranda +55 98 8516-6052");
    expect(r.ok).toBe(true);
    expect(r.quantidade).toBe(2);
    expect(r.local).toBe("Miranda");
    expect(r.telefone).toBe("9885166052");
  });

  it("telefone com espaço no meio, sem máscara", () => {
    const r = parseAnotacaoRapida("1p Cohama 98 7024-2260");
    expect(r.ok).toBe(true);
    expect(r.local).toBe("Cohama");
    expect(r.telefone).toBe("9870242260");
  });

  it("sem prefixo de quantidade => assume 1", () => {
    const r = parseAnotacaoRapida("Cohatrac 98999998888");
    expect(r.ok).toBe(true);
    expect(r.quantidade).toBe(1);
    expect(r.local).toBe("Cohatrac");
  });

  it("só telefone, sem local (ponto não precisa de bairro, ex. Rodoviária)", () => {
    const r = parseAnotacaoRapida("1P 98999998888");
    expect(r.ok).toBe(true);
    expect(r.local).toBe("");
    expect(r.telefone).toBe("98999998888");
  });

  it("espaços extras no local são colapsados", () => {
    const r = parseAnotacaoRapida("1P  Cohatrac   perto do posto   98999998888");
    expect(r.ok).toBe(true);
    expect(r.local).toBe("Cohatrac perto do posto");
  });

  it("telefone colado do WhatsApp/iOS com marcas bidirecionais invisíveis coladas no fim", () => {
    const r = parseAnotacaoRapida("1P Cohatrac ⁦98999998888⁩");
    expect(r.ok).toBe(true);
    expect(r.local).toBe("Cohatrac");
    expect(r.telefone).toBe("98999998888");

    const r2 = parseAnotacaoRapida("1P Cohatrac 98999998888‎");
    expect(r2.ok).toBe(true);
    expect(r2.telefone).toBe("98999998888");
  });

  it("vazio => erro", () => {
    expect(parseAnotacaoRapida("").ok).toBe(false);
    expect(parseAnotacaoRapida("   ").ok).toBe(false);
    expect(parseAnotacaoRapida(null).ok).toBe(false);
    expect(parseAnotacaoRapida(undefined).ok).toBe(false);
  });

  it("sem telefone reconhecível => erro", () => {
    const r = parseAnotacaoRapida("1P Cohatrac");
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/telefone/i);
  });

  it("telefone inválido (poucos dígitos) => erro da própria validação de telefone", () => {
    const r = parseAnotacaoRapida("1P Cohatrac 123");
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/DDD/i);
  });

  it("quantidade fora do intervalo razoável => erro", () => {
    const r = parseAnotacaoRapida("99P Cohatrac 98999998888");
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/quantidade/i);
  });
});

describe("parseAnotacaoRapida — ordem NP, endereço, telefone, nome (issue #202)", () => {
  it("nome depois do telefone", () => {
    expect(parseAnotacaoRapida("1P Cohatrac Rua 7 98999998888 Maria Silva")).toEqual({
      ok: true,
      quantidade: 1,
      local: "Cohatrac Rua 7",
      telefone: "98999998888",
      nome: "Maria Silva",
    });
  });

  it("aceita ' - ' entre as partes", () => {
    const r = parseAnotacaoRapida("2P - Miranda - 98 8516-6052 - João");
    expect(r).toEqual({
      ok: true,
      quantidade: 2,
      local: "Miranda",
      telefone: "9885166052",
      nome: "João",
    });
  });

  it("vírgulas e ponto e vírgula entre as partes são ignorados", () => {
    const r = parseAnotacaoRapida("1P Cohatrac, Rua 7, 98999998888, Maria");
    expect(r.ok).toBe(true);
    expect(r.local).toBe("Cohatrac Rua 7");
    expect(r.telefone).toBe("98999998888");
    expect(r.nome).toBe("Maria");
  });

  it("número no endereço não é confundido com o telefone", () => {
    const r = parseAnotacaoRapida("1P Rua 7 98999998888 Ana");
    expect(r.local).toBe("Rua 7");
    expect(r.telefone).toBe("98999998888");
    expect(r.nome).toBe("Ana");

    const r2 = parseAnotacaoRapida("1P Cohama 12 98 99999-8888 Ana");
    expect(r2.local).toBe("Cohama 12");
    expect(r2.telefone).toBe("98999998888");
    expect(r2.nome).toBe("Ana");

    // número "55" no endereço (igual ao prefixo do país) continua no endereço
    const r3 = parseAnotacaoRapida("1P Rua 55 98999998888 Ana");
    expect(r3.local).toBe("Rua 55");
    expect(r3.telefone).toBe("98999998888");
  });

  it("+55 colado ao telefone não vaza para o endereço", () => {
    const r = parseAnotacaoRapida("1P Miranda +55 98 8516-6052 João");
    expect(r.local).toBe("Miranda");
    expect(r.telefone).toBe("9885166052");
    expect(r.nome).toBe("João");
  });

  it("sem endereço: só quantidade, telefone e nome", () => {
    const r = parseAnotacaoRapida("1P 98999998888 Maria");
    expect(r.ok).toBe(true);
    expect(r.local).toBe("");
    expect(r.nome).toBe("Maria");
  });

  it("telefone com 55 e DDD num bloco só (13 dígitos) ainda é reconhecido", () => {
    const r = parseAnotacaoRapida("1P Cohatrac 5598999998888 Maria");
    expect(r.ok).toBe(true);
    expect(r.telefone).toBe("98999998888");
    expect(r.nome).toBe("Maria");
  });

  it("nome com vários nomes e acentos", () => {
    const r = parseAnotacaoRapida("1P Anil 98999998888 José da Conceição Ribeiro");
    expect(r.nome).toBe("José da Conceição Ribeiro");
  });
});

describe("parseAnotacaoEncomenda", () => {
  it("só telefone: 'E <telefone>'", () => {
    const r = parseAnotacaoEncomenda("E 98999998888");
    expect(r).toEqual({ ok: true, item: "", telefone: "98999998888" });
  });

  it("com item opcional antes do telefone", () => {
    const r = parseAnotacaoEncomenda("E Documentos 98999998888");
    expect(r.ok).toBe(true);
    expect(r.item).toBe("Documentos");
    expect(r.telefone).toBe("98999998888");
  });

  it("'e' minúsculo e com ponto, telefone com máscara", () => {
    const r = parseAnotacaoEncomenda("e. Caixa de sapato +55 98 8516-6052");
    expect(r.ok).toBe(true);
    expect(r.item).toBe("Caixa de sapato");
    expect(r.telefone).toBe("9885166052");
  });

  it("telefone colado do WhatsApp/iOS com marcas invisíveis coladas no fim", () => {
    const r = parseAnotacaoEncomenda("E 98999998888‎");
    expect(r.ok).toBe(true);
    expect(r.telefone).toBe("98999998888");
  });

  it("sem prefixo 'E' => sinaliza semPrefixo (deixa a anotação de passagem tentar)", () => {
    const r = parseAnotacaoEncomenda("1P Cohatrac 98999998888");
    expect(r.ok).toBe(false);
    expect(r.semPrefixo).toBe(true);
  });

  it("vazio/nulo => sinaliza semPrefixo", () => {
    expect(parseAnotacaoEncomenda("").semPrefixo).toBe(true);
    expect(parseAnotacaoEncomenda(null).semPrefixo).toBe(true);
    expect(parseAnotacaoEncomenda(undefined).semPrefixo).toBe(true);
  });

  it("bairro começando com 'e' não é confundido (precisa de espaço/ponto logo após o 'e')", () => {
    const r = parseAnotacaoEncomenda("Estiva 98999998888");
    expect(r.ok).toBe(false);
    expect(r.semPrefixo).toBe(true);
  });

  it("com prefixo mas sem telefone reconhecível => erro", () => {
    const r = parseAnotacaoEncomenda("E Documentos");
    expect(r.ok).toBe(false);
    expect(r.semPrefixo).toBeUndefined();
    expect(r.erro).toMatch(/telefone/i);
  });

  it("telefone inválido => erro da própria validação de telefone", () => {
    const r = parseAnotacaoEncomenda("E 123");
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/DDD/i);
  });
});

describe("separarBairro", () => {
  const BAIRROS = ["Cohatrac", "Anjo da Guarda", "Cohama"];

  it("bairro conhecido no começo: o resto vira detalhe", () => {
    expect(separarBairro("Cohatrac Rua 7", BAIRROS)).toEqual({
      bairro: "Cohatrac",
      detalhe: "Rua 7",
    });
  });

  it("bairro com várias palavras, sem acento/caixa", () => {
    expect(separarBairro("anjo da guarda quadra 12 casa 3", BAIRROS)).toEqual({
      bairro: "anjo da guarda",
      detalhe: "quadra 12 casa 3",
    });
  });

  it("só o bairro, sem detalhe", () => {
    expect(separarBairro("Cohama", BAIRROS)).toEqual({ bairro: "Cohama", detalhe: "" });
  });

  it("bairro desconhecido: o texto todo fica como bairro (como sempre foi)", () => {
    expect(separarBairro("Turu perto do posto", BAIRROS)).toEqual({
      bairro: "Turu perto do posto",
      detalhe: "",
    });
  });

  it("texto vazio ou lista vazia não quebra", () => {
    expect(separarBairro("", BAIRROS)).toEqual({ bairro: "", detalhe: "" });
    expect(separarBairro("Cohatrac Rua 7", [])).toEqual({ bairro: "Cohatrac Rua 7", detalhe: "" });
  });
});

describe("parseLinhaEncomenda — endereço, telefone, nome (issue #214)", () => {
  it("endereço + telefone", () => {
    expect(parseLinhaEncomenda("Rua das Flores 12 centro 98999998888")).toEqual({
      ok: true,
      endereco: "Rua das Flores 12 centro",
      telefone: "98999998888",
      nome: "",
    });
  });
  it("com nome depois do telefone e separadores ' - '", () => {
    expect(parseLinhaEncomenda("Pirapemas centro - 98 8516-6052 - João da Loja")).toEqual({
      ok: true,
      endereco: "Pirapemas centro",
      telefone: "9885166052",
      nome: "João da Loja",
    });
  });
  it("só o telefone: endereço vazio, o resto se completa depois", () => {
    const r = parseLinhaEncomenda("98999998888");
    expect(r).toMatchObject({ ok: true, endereco: "", telefone: "98999998888" });
  });
  it("sem telefone: o texto todo é o endereço", () => {
    expect(parseLinhaEncomenda("Mercadinho do Zé, quadra 7")).toEqual({
      ok: true,
      endereco: "Mercadinho do Zé quadra 7",
      telefone: "",
      nome: "",
    });
  });
  it("vazio pede ao menos o endereço", () => {
    expect(parseLinhaEncomenda("   ")).toEqual({
      ok: false,
      erro: "Escreva ao menos o endereço de entrega.",
    });
  });
});
