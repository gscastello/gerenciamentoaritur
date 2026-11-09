import { describe, expect, it } from "vitest";
import {
  digitosDeBusca,
  primeiroErro,
  validarData,
  validarHora,
  validarNome,
  validarObrigatorio,
  validarQuantidade,
  validarTelefone,
  validarValor,
  variantesTelefone,
} from "../validacao.js";

describe("validarTelefone", () => {
  it("aceita 11 dígitos com 9", () => {
    expect(validarTelefone("98991234567")).toEqual({ ok: true, valor: "98991234567" });
  });
  it("aceita 10 dígitos (fixo)", () => {
    expect(validarTelefone("9832221100")).toEqual({ ok: true, valor: "9832221100" });
  });
  it("tira máscara e +55", () => {
    expect(validarTelefone("+55 (98) 99123-4567").valor).toBe("98991234567");
  });
  it("não tira 55 quando faz parte do número curto", () => {
    // 5511987654 -> 10 dígitos, começa com 55 mas length <= 11: mantém
    expect(validarTelefone("5511987654").valor).toBe("5511987654");
  });
  it("recusa curto/longo", () => {
    expect(validarTelefone("123").ok).toBe(false);
    expect(validarTelefone("9899123456789").ok).toBe(false);
  });
  it("recusa DDD inválido", () => {
    const r = validarTelefone("1091234567");
    expect(r.ok).toBe(false);
    expect(r.erro).toBe("DDD inválido.");
  });
  it("aceita espaço, parênteses e traço em qualquer lugar", () => {
    expect(validarTelefone(" 98 9 8101 2388 ").valor).toBe("98981012388");
    expect(validarTelefone("(98) 8101-2388").valor).toBe("9881012388");
  });
  it("tira o zero antes do DDD", () => {
    expect(validarTelefone("098 98101-2388").valor).toBe("98981012388");
    expect(validarTelefone("0 98 8101-2388").valor).toBe("9881012388");
  });
  it("número sem DDD assume o da operação", () => {
    expect(validarTelefone("98101-2388")).toEqual({ ok: true, valor: "98981012388" });
    expect(validarTelefone("8101-2388")).toEqual({ ok: true, valor: "9881012388" });
    expect(validarTelefone("3222-1100").valor).toBe("9832221100");
  });
  it("sem DDD, recusa o que não pode ser telefone", () => {
    expect(validarTelefone("1101-2388").ok).toBe(false);
    expect(validarTelefone("88101-2388").ok).toBe(false);
    expect(validarTelefone("1234567").ok).toBe(false);
    expect(validarTelefone("65000-000").ok).toBe(false);
  });
  it("recusa celular de 11 sem o 9", () => {
    expect(validarTelefone("98891234567").ok).toBe(false);
  });
  it("recusa vazio/nulo", () => {
    expect(validarTelefone("").ok).toBe(false);
    expect(validarTelefone(null).ok).toBe(false);
  });
});

describe("variantesTelefone", () => {
  it("com e sem o nono dígito, a forma digitada primeiro", () => {
    expect(variantesTelefone("(98) 98101-2388")).toEqual(["98981012388", "9881012388"]);
    expect(variantesTelefone("98 8101-2388")).toEqual(["9881012388", "98981012388"]);
    expect(variantesTelefone("8101-2388")).toEqual(["9881012388", "98981012388"]);
  });
  it("fixo só tem uma forma", () => {
    expect(variantesTelefone("98 3222-1100")).toEqual(["9832221100"]);
  });
  it("11 dígitos cujo número depois do 9 não é de celular só tem uma forma", () => {
    expect(variantesTelefone("98 93222-1100")).toEqual(["98932221100"]);
  });
  it("inválido não tem forma nenhuma", () => {
    expect(variantesTelefone("123")).toEqual([]);
    expect(variantesTelefone(null)).toEqual([]);
  });
});

describe("digitosDeBusca", () => {
  it("com 8 dígitos ou mais, compara só os 8 finais", () => {
    expect(digitosDeBusca("+55 (98) 98101-2388")).toBe("81012388");
    expect(digitosDeBusca("9881012388")).toBe("81012388");
    expect(digitosDeBusca("8101-2388")).toBe("81012388");
  });
  it("trecho curto de número busca os dígitos dele, sem máscara", () => {
    expect(digitosDeBusca("81 01")).toBe("8101");
    expect(digitosDeBusca("(98) 81")).toBe("9881");
    expect(digitosDeBusca(" 1234567 ")).toBe("1234567");
  });
  it("nome ou número curto demais não é busca por telefone", () => {
    expect(digitosDeBusca("Maria")).toBeNull();
    expect(digitosDeBusca("Rua 7")).toBeNull();
    expect(digitosDeBusca("981")).toBeNull();
    expect(digitosDeBusca("")).toBeNull();
    expect(digitosDeBusca(null)).toBeNull();
  });
});

describe("validarData", () => {
  it("aceita ISO válida", () => {
    expect(validarData("2026-09-15")).toEqual({ ok: true, valor: "2026-09-15" });
  });
  it("recusa formato errado", () => {
    expect(validarData("15/09/2026").ok).toBe(false);
    expect(validarData(null).ok).toBe(false);
  });
  it("recusa data inexistente", () => {
    expect(validarData("2026-02-30").ok).toBe(false);
  });
  it("respeita min", () => {
    expect(validarData("2026-09-01", { min: "2026-09-10" }).ok).toBe(false);
    expect(validarData("2026-09-10", { min: "2026-09-10" }).ok).toBe(true);
  });
  it("respeita max", () => {
    expect(validarData("2027-01-01", { max: "2026-12-31" }).ok).toBe(false);
  });
});

describe("validarHora", () => {
  it("aceita e normaliza", () => {
    expect(validarHora("5:40")).toEqual({ ok: true, valor: "05:40" });
    expect(validarHora("23:59").ok).toBe(true);
  });
  it("recusa formato e intervalo", () => {
    expect(validarHora("5h40").ok).toBe(false);
    expect(validarHora("24:00").ok).toBe(false);
    expect(validarHora("10:75").ok).toBe(false);
    expect(validarHora(null).ok).toBe(false);
  });
});

describe("validarValor", () => {
  it("aceita número e string com vírgula", () => {
    expect(validarValor("80,50")).toEqual({ ok: true, valor: 80.5 });
    expect(validarValor(60).valor).toBe(60);
  });
  it("recusa não-número e vazio", () => {
    expect(validarValor("abc").ok).toBe(false);
    expect(validarValor("").ok).toBe(false);
    expect(validarValor(null).ok).toBe(false);
    expect(validarValor(Number.POSITIVE_INFINITY).ok).toBe(false);
  });
  it("respeita min e max", () => {
    expect(validarValor(-1).ok).toBe(false);
    expect(validarValor(5, { min: 10 }).ok).toBe(false);
    expect(validarValor(50, { max: 40 }).ok).toBe(false);
  });
});

describe("validarQuantidade", () => {
  it("aceita inteiro no intervalo", () => {
    expect(validarQuantidade(2, { max: 31 })).toEqual({ ok: true, valor: 2 });
  });
  it("recusa não-inteiro, abaixo do min e acima do max", () => {
    expect(validarQuantidade(1.5).ok).toBe(false);
    expect(validarQuantidade(0).ok).toBe(false);
    expect(validarQuantidade("x").ok).toBe(false);
    expect(validarQuantidade(40, { max: 31 }).ok).toBe(false);
  });
});

describe("validarObrigatorio / validarNome", () => {
  it("obrigatorio", () => {
    expect(validarObrigatorio("  ", "Bairro").ok).toBe(false);
    expect(validarObrigatorio("Cohama").ok).toBe(true);
    expect(validarObrigatorio(null).ok).toBe(false);
  });
  it("nome", () => {
    expect(validarNome("A").ok).toBe(false);
    expect(validarNome(" Maria ").valor).toBe("Maria");
  });
});

describe("primeiroErro", () => {
  it("devolve o primeiro erro ou null", () => {
    expect(primeiroErro([{ ok: true }, { ok: false, erro: "X" }, { ok: false, erro: "Y" }])).toBe(
      "X",
    );
    expect(primeiroErro([{ ok: true }, null])).toBe(null);
    expect(primeiroErro([{ ok: false }])).toBe("Dado inválido.");
  });
});
