import { describe, expect, it } from "vitest";
import { mesAnterior, montarFechamento, nomeDaFotoNoZip, nomeDoMes } from "../fechamentoDoMes.js";

// Fechamento do mês para o contador (issue #365).

const dados = {
  mes: "2026-10",
  gerado_em: "2026-11-01T11:00:00Z",
  numeros: {
    lancamentos: {
      receita: 71313,
      despesa: 45589,
      margem_pct: 36.1,
      despesa_por_categoria: { combustivel: 16054, motorista: 6600, taxi: 630 },
      receita_por_categoria: { passagem: 71313 },
    },
    reservas: {
      passageiros: 436,
      ticket_medio: 65.89,
      cobertura_da_receita_pct: 39.5,
      por_sentido: {
        volta: { viagens: 11, passageiros: 223, valor: 13430, ticket_medio: 60.22 },
        ida: { viagens: 14, passageiros: 213, valor: 14770, ticket_medio: 69.34 },
      },
      por_forma_de_pagamento: { dinheiro: 28000, pix: 200 },
    },
    viagens: {
      lista: [
        { data: "2026-10-17", sentido: "volta", passageiros: 20, valor: 1200 },
        { data: "2026-10-17", sentido: "ida", passageiros: 4, valor: 300 },
      ],
    },
    a_receber: { total: 28200 },
  },
  lancamentos: [
    {
      data: "2026-10-01",
      tipo: "despesa",
      categoria: "combustivel",
      valor: 550,
      descricao: "Diesel",
      nota: "2026-10/a.jpg",
    },
    {
      data: "2026-10-01",
      tipo: "receita",
      categoria: "passagem",
      valor: 2000,
      descricao: null,
      nota: null,
    },
    {
      data: "2026-10-02",
      tipo: "despesa",
      categoria: "taxi",
      valor: 30,
      descricao: "Táxi",
      nota: null,
    },
    {
      data: "2026-10-03",
      tipo: "despesa",
      categoria: "motorista",
      valor: 200,
      descricao: "",
      nota: "2026-10/b.png",
    },
  ],
  pagamentos: [
    { data: "2026-10-05", forma: "pix", valor: 70, viagem: "2026-10-06", sentido: "ida" },
  ],
  contas_quitadas: [
    { titulo: "IPVA", valor: 1250, vence_em: "2026-10-10", quitado_em: "2026-10-09" },
  ],
};
const ROTULOS = {
  combustivel: "Combustível",
  motorista: "Motorista(s)",
  taxi: "Táxi",
  passagem: "Passagem",
};
const rotulo = (s) => ROTULOS[s] ?? s;
const das = { valor: 4500.5, mesesSemDado: 11 };

describe("datas e nomes", () => {
  it("nome do mês e mês anterior (atravessa o ano)", () => {
    expect(nomeDoMes("2026-10")).toBe("outubro de 2026");
    // sem mês (pacote incompleto): nunca "undefined de undefined" (issue #397)
    expect(nomeDoMes(undefined)).toBe("");
    expect(nomeDoMes("2026")).toBe("");
    expect(montarFechamento({}).titulo).toBe("Fechamento do mês");
    expect(mesAnterior("2026-11-13")).toBe("2026-10");
    expect(mesAnterior("2027-01-01")).toBe("2026-12");
  });
  it("foto no .zip: data, categoria, valor e ordem — sem nome de pessoa", () => {
    expect(
      nomeDaFotoNoZip(
        { data: "2026-10-01", categoria: "combustivel", valor: 550, nota: "x/a.JPG" },
        1,
      ),
    ).toBe("2026-10-01_combustivel_550,00_001.jpg");
    expect(
      nomeDaFotoNoZip({ data: "2026-10-03", categoria: "a/b c", valor: 1.5, nota: "x/b" }, 12),
    ).toBe("2026-10-03_abc_1,50_012.jpg");
  });
});

describe("montarFechamento", () => {
  const f = montarFechamento(dados, { das, rotulo });

  it("DRE com e sem o DAS estimado", () => {
    expect(f.titulo).toBe("Fechamento de outubro de 2026");
    expect(f.resumo).toEqual([
      { rotulo: "Receita (lançamentos)", valor: 71313 },
      { rotulo: "Despesas (lançamentos)", valor: -45589 },
      { rotulo: "Resultado antes do imposto", valor: 25724, destaque: true },
      { rotulo: "DAS estimado do mês", valor: -4500.5 },
      { rotulo: "Resultado depois do DAS estimado", valor: 21223.5, destaque: true },
    ]);
    expect(montarFechamento(dados, { rotulo }).resumo).toHaveLength(3);
    expect(f.margemPct).toBe(36.1);
  });
  it("receitas e despesas por categoria, da maior para a menor", () => {
    expect(f.despesasPorCategoria.map((d) => d.categoria)).toEqual([
      "Combustível",
      "Motorista(s)",
      "Táxi",
    ]);
    expect(f.receitasPorCategoria).toEqual([{ categoria: "Passagem", total: 71313 }]);
  });
  it("por sentido, forma de pagamento e viagem", () => {
    expect(f.porSentido.map((s) => s.sentido)).toEqual([
      "Ida (sai de São Luís)",
      "Volta (para São Luís)",
    ]);
    expect(f.porSentido[0]).toMatchObject({
      viagens: 14,
      passageiros: 213,
      valor: 14770,
      ticketMedio: 69.34,
    });
    expect(f.porForma).toEqual([
      { forma: "Dinheiro", valor: 28000 },
      { forma: "Pix", valor: 200 },
    ]);
    expect(f.viagens.map((v) => v.sentido)).toEqual(["Ida", "Volta"]);
    expect(f.passageiros).toBe(436);
    expect(f.ticketMedio).toBe(65.89);
  });
  it("lançamentos com o nome da foto e a lista de notas para o .zip", () => {
    expect(f.notas).toEqual([
      {
        arquivo: "2026-10/a.jpg",
        nome: "2026-10-01_combustivel_550,00_001.jpg",
        data: "2026-10-01",
        valor: 550,
      },
      {
        arquivo: "2026-10/b.png",
        nome: "2026-10-03_motorista_200,00_002.png",
        data: "2026-10-03",
        valor: 200,
      },
    ]);
    expect(f.lancamentos[0]).toMatchObject({
      tipo: "Despesa",
      categoria: "Combustível",
      foto: "2026-10-01_combustivel_550,00_001.jpg",
    });
    expect(f.lancamentos[1]).toMatchObject({ tipo: "Receita", descricao: "", foto: "" });
  });
  it("pagamentos, contas quitadas e a receber", () => {
    expect(f.pagamentos).toEqual([
      { data: "2026-10-05", forma: "Pix", valor: 70, viagem: "2026-10-06", sentido: "Ida" },
    ]);
    expect(f.contasQuitadas).toEqual([
      { titulo: "IPVA", valor: 1250, venceEm: "2026-10-10", quitadoEm: "2026-10-09" },
    ]);
    expect(f.aReceber).toBe(28200);
  });
  it("avisa cobertura baixa, meses sem dado no DAS e despesa sem nota", () => {
    expect(f.avisos).toHaveLength(3);
    expect(f.avisos[0]).toMatch(/39,5% da receita lançada/);
    expect(f.avisos[1]).toMatch(/11 dos 12 meses/);
    expect(f.avisos[2]).toBe("1 despesa(s) sem foto da nota.");
  });
  it("mês vazio não quebra", () => {
    const v = montarFechamento({ mes: "2026-12", numeros: {}, lancamentos: [] });
    expect(v.resumo.map((x) => x.valor)).toEqual([0, -0, 0]);
    expect(v).toMatchObject({
      notas: [],
      lancamentos: [],
      avisos: [],
      aReceber: null,
      ticketMedio: null,
    });
  });
});
