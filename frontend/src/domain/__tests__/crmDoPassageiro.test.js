import { describe, expect, it } from "vitest";
import {
  GRUPOS,
  ORDENS,
  clienteDesde,
  diaCurto,
  diasEntre,
  etiquetas,
  fraseDoHabito,
  haQuantoTempo,
  habitoPorDia,
  iniciais,
  ladoDaLinha,
  linhaDeBaixo,
  noDia,
  nomeParaMostrar,
  pagamentosDoPassageiro,
  viagensPorMes,
} from "../crmDoPassageiro.js";

const HOJE = "2026-11-17"; // terça

describe("CRM dos passageiros (issue #446)", () => {
  it("grupos e ordens têm id, rótulo e explicação", () => {
    expect(GRUPOS.map((g) => g.id)).toEqual([
      "todos",
      "sumiram",
      "sem_pagamento",
      "frequentes",
      "marcada",
      "novos",
      "sem_nome",
    ]);
    expect(GRUPOS.every((g) => g.rotulo && g.explicacao)).toBe(true);
    expect(ORDENS.map((o) => o.id)).toEqual(["viagens", "recente", "gasto", "a_receber", "nome"]);
  });

  it("dias entre datas, há quanto tempo e dia curto", () => {
    expect(diasEntre("2026-11-14", HOJE)).toBe(3);
    expect(diasEntre("2026-10-31", "2026-11-01")).toBe(1);
    expect(diasEntre(HOJE, "2026-11-14")).toBe(-3);
    expect(haQuantoTempo(0)).toBe("hoje");
    expect(haQuantoTempo(-2)).toBe("hoje");
    expect(haQuantoTempo(1)).toBe("ontem");
    expect(haQuantoTempo(12)).toBe("há 12 dias");
    expect(diaCurto(HOJE, HOJE)).toBe("hoje");
    expect(diaCurto("2026-11-18", HOJE)).toBe("amanhã");
    expect(diaCurto("2026-11-20", HOJE)).toBe("sex 20");
    expect(diaCurto("2026-12-06", HOJE)).toBe("dom 6");
  });

  it("artigo do dia da semana", () => {
    expect(noDia(1)).toBe("na segunda");
    expect(noDia(5)).toBe("na sexta");
    expect(noDia(6)).toBe("no sábado");
    expect(noDia(0)).toBe("no domingo");
  });

  it("iniciais ignoram da/das/de/do/dos e sem nome vira ?", () => {
    expect(iniciais("Maria das Dores")).toBe("MD");
    expect(iniciais("joão")).toBe("J");
    expect(iniciais("Francisco das Chagas Lima")).toBe("FL");
    expect(iniciais("")).toBe("?");
    expect(iniciais(null)).toBe("?");
    expect(iniciais("da de")).toBe("?");
  });

  it("nome para mostrar esconde o nome provisório", () => {
    expect(nomeParaMostrar({ nome: "Ana" })).toBe("Ana");
    expect(nomeParaMostrar({ nome: "  " })).toBe("");
    expect(nomeParaMostrar({ nome: "Passageiro (Cohama)" })).toBe("");
    expect(nomeParaMostrar({ nome: "Passageiro" })).toBe("");
    expect(nomeParaMostrar({ nome: "Passageiro 1" })).toBe("Passageiro 1");
    expect(nomeParaMostrar({})).toBe("");
    expect(nomeParaMostrar(null)).toBe("");
  });

  it("lado da linha: sem pagamento > próxima viagem > sumiu > viagens", () => {
    expect(ladoDaLinha({ a_receber: 1560, proxima_data: "2026-11-18" }, HOJE)).toEqual({
      texto: "R$ 1.560",
      sub: "sem pagamento",
      alerta: true,
    });
    expect(ladoDaLinha({ a_receber: 0, proxima_data: "2026-11-20" }, HOJE)).toEqual({
      texto: "sex 20",
      sub: "próxima viagem",
    });
    expect(ladoDaLinha({ sumiu: true, ultima_viagem: "2026-10-01" }, HOJE)).toEqual({
      texto: "47 dias",
      sub: "sem viajar",
    });
    expect(ladoDaLinha({ sumiu: true }, HOJE)).toEqual({ texto: "0", sub: "viagens" });
    expect(ladoDaLinha({ viagens_count: 1 }, HOJE)).toEqual({ texto: "1", sub: "viagem" });
    expect(ladoDaLinha({ viagens_count: 12 }, HOJE)).toEqual({ texto: "12", sub: "viagens" });
  });

  it("linha de baixo: telefone só quando não tem nome, última viagem e bairro", () => {
    expect(
      linhaDeBaixo({ nome: "Ana", ultima_viagem: "2026-11-14", bairro_padrao: "Cohama" }, HOJE),
    ).toBe("última há 3 dias · Cohama");
    expect(linhaDeBaixo({ nome: "", telefone: "98999990000" }, HOJE)).toBe(
      "98999990000 · ainda não viajou",
    );
    expect(linhaDeBaixo({ nome: "Ana", ultima_viagem: HOJE }, HOJE)).toBe("última hoje");
  });

  it("etiquetas: frequente, primeira viagem, sumiu, sem nome, pagamento e as da equipe", () => {
    expect(
      etiquetas(
        {
          nome: "Ana",
          frequente: true,
          novo: true,
          sumiu: true,
          ultima_viagem: "2026-10-07",
          pagamento_padrao: "pix",
          tags: ["indica clientes", " ", 3],
        },
        HOJE,
        (x) => x.toUpperCase(),
      ),
    ).toEqual([
      { texto: "Frequente", tipo: "forte" },
      { texto: "Primeira viagem no mês", tipo: "forte" },
      { texto: "Sumiu há 41 dias", tipo: "alerta" },
      { texto: "Paga em PIX", tipo: "normal" },
      { texto: "indica clientes", tipo: "normal" },
    ]);
    expect(etiquetas({ nome: "" }, HOJE)).toEqual([{ texto: "Sem nome", tipo: "alerta" }]);
    expect(etiquetas({ nome: "Bia", sumiu: true }, HOJE)).toEqual([]);
    // sem o tradutor da forma de pagamento, o texto vai como veio
    expect(etiquetas({ nome: "Bia", pagamento_padrao: "dinheiro" }, HOJE)).toEqual([
      { texto: "Paga em dinheiro", tipo: "normal" },
    ]);
  });

  const v = (data, direcao, extra = {}) => ({
    data,
    direcao,
    status: "confirmada",
    tipo: "passagem",
    valorTotal: 80,
    ...extra,
  });

  it("hábito por dia da semana só conta viagem feita", () => {
    const h = habitoPorDia([
      v("2026-11-16", "ida"),
      v("2026-11-09", "ida", { status: "embarcado" }),
      v("2026-11-13", "volta"),
      v("2026-11-02", "ida", { status: "cancelada" }),
      v("2026-11-03", "ida", { tipo: "encomenda" }),
      v("data-ruim", "ida"),
      v("2026-11-04", "outra"),
    ]);
    expect(h.ida).toEqual([0, 2, 0, 0, 0, 0, 0]);
    expect(h.volta).toEqual([0, 0, 0, 0, 0, 1, 0]);
    expect(habitoPorDia(undefined)).toEqual({
      ida: [0, 0, 0, 0, 0, 0, 0],
      volta: [0, 0, 0, 0, 0, 0, 0],
    });
  });

  it("frase do hábito só com costume de verdade", () => {
    expect(fraseDoHabito({ ida: [0, 3, 0, 0, 0, 1, 0], volta: [0, 0, 0, 0, 0, 3, 0] })).toBe(
      "Costuma ir na segunda e voltar na sexta.",
    );
    expect(fraseDoHabito({ ida: [0, 0, 0, 0, 0, 0, 3], volta: [1, 0, 0, 0, 0, 0, 0] })).toBe(
      "Costuma ir no sábado.",
    );
    expect(fraseDoHabito({ ida: [0, 1, 0, 0, 0, 0, 0], volta: [2, 0, 0, 0, 0, 0, 1] })).toBe(
      "Costuma voltar no domingo.",
    );
    // espalhado demais (menos da metade no dia mais comum) não é costume
    expect(fraseDoHabito({ ida: [1, 1, 1, 1, 0, 0, 0], volta: [0, 0, 0, 0, 0, 0, 0] })).toBeNull();
    // metade exata ainda é costume
    expect(fraseDoHabito({ ida: [0, 2, 2, 0, 0, 0, 0], volta: [0, 0, 0, 0, 0, 0, 0] })).toBe(
      "Costuma ir na segunda.",
    );
  });

  it("viagens por mês: os últimos 6 até o mês de hoje", () => {
    const meses = viagensPorMes(
      [
        v("2026-11-02", "ida"),
        v("2026-11-03", "volta"),
        v("2026-10-20", "ida"),
        v("2026-06-01", "ida"),
        v("2026-05-31", "ida"),
        v("2026-11-30", "ida"),
        v("2026-11-05", "ida", { status: "pendente" }),
        v("x", "ida"),
      ],
      HOJE,
    );
    expect(meses.map((m) => m.rotulo)).toEqual(["jun", "jul", "ago", "set", "out", "nov"]);
    expect(meses.map((m) => m.n)).toEqual([1, 0, 0, 0, 1, 2]);
    expect(meses.at(-1).atual).toBe(true);
    expect(meses[0].atual).toBe(false);
    expect(viagensPorMes(null, HOJE, 2).map((m) => m.n)).toEqual([0, 0]);
    const virada = viagensPorMes([v("2025-12-10", "ida")], "2026-02-10", 3);
    expect(virada.map((m) => [m.chave, m.n])).toEqual([
      ["2025-12", 1],
      ["2026-01", 0],
      ["2026-02", 0],
    ]);
  });

  it("cliente desde", () => {
    expect(clienteDesde("2026-03-05T10:00:00Z")).toBe("cliente desde março de 2026");
    expect(clienteDesde(null)).toBe("");
  });

  it("pagamentos: pendentes das mais antigas, pagas das mais recentes, sem viagem futura", () => {
    const p = pagamentosDoPassageiro(
      [
        v("2026-11-10", "ida", { pago: false }),
        v("2026-11-02", "volta", { pago: false, valorTotal: 60 }),
        v("2026-11-12", "ida", { pago: true }),
        v("2026-11-15", "volta", { pago: true, valorTotal: 60 }),
        v("2026-11-20", "ida", { pago: false }),
        v(HOJE, "ida", { pago: false }),
        v("2026-11-01", "ida", { status: "cancelada" }),
        v("2026-11-01", "ida", { tipo: "encomenda", valorTotal: null }),
        v("2026-11-01", "ida", { valorTotal: "abc" }),
      ],
      HOJE,
    );
    expect(p.pendentes.map((x) => x.data)).toEqual(["2026-11-01", "2026-11-02", "2026-11-10"]);
    expect(p.pagos.map((x) => x.data)).toEqual(["2026-11-15", "2026-11-12"]);
    expect(p.totalPendente).toBe(140);
    expect(p.totalPago).toBe(140);
    expect(pagamentosDoPassageiro(null, HOJE).totalPendente).toBe(0);
  });
});
