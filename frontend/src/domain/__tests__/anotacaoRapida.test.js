import { describe, expect, it } from "vitest";
import { parseAnotacaoEncomenda, parseAnotacaoRapida } from "../anotacaoRapida.js";

describe("parseAnotacaoRapida", () => {
  it("formato completo: quantidade + bairro + telefone sem máscara", () => {
    const r = parseAnotacaoRapida("1P Cohatrac 98999998888");
    expect(r).toEqual({ ok: true, quantidade: 1, local: "Cohatrac", telefone: "98999998888" });
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
