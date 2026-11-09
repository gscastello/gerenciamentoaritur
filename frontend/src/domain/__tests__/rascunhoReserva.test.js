import { describe, expect, it } from "vitest";
import {
  anotacaoDaEncomenda,
  embarqueDoRascunho,
  inicialDoRascunho,
  viagemDoRascunho,
} from "../rascunhoReserva.js";

const trips = {
  ida: {
    pontos: [
      { id: "busca", nome: "Buscar em Casa", campo: "bairro" },
      { id: "rodoviaria", nome: "Rodoviária" },
    ],
  },
  volta: { pontos: [{ id: "cantanhede", nome: "Cantanhede" }] },
};

const busca = {
  customer_name: "Maria Silva",
  phone: "98988887777",
  trip_date: "2026-11-10",
  direction: "ida",
  route_point_code: "busca",
  pickup_neighborhood: "Cohatrac",
  pickup_detail: "Rua 7, casa 12",
  dropoff_location: "Pirapemas centro",
  dropoff_area: "pirapemas",
  quantity: 2,
  client_excerpt: "amanhã, moro no Cohatrac rua 7",
};

describe("inicialDoRascunho — formulário já preenchido (issue #254)", () => {
  it("busca em casa: bairro, detalhe, desembarque, quantidade e aviso com o trecho do cliente", () => {
    const f = inicialDoRascunho(busca, trips);
    expect(f).toMatchObject({
      nome: "Maria Silva",
      telefone: "98988887777",
      data: "2026-11-10",
      direcao: "ida",
      pontoId: "busca",
      bairro: "Cohatrac",
      anotacao: "Rua 7, casa 12",
      desembarque: "Pirapemas centro",
      desembarqueArea: "pirapemas",
      quantidade: 2,
      pagamento: "dinheiro",
    });
    expect(f.aviso).toContain("amanhã, moro no Cohatrac rua 7");
    expect(f.aviso).toMatch(/Confira/);
  });

  it("ponto sem bairro: o bairro não vai para o formulário", () => {
    const f = inicialDoRascunho(
      { ...busca, direction: "volta", route_point_code: "cantanhede", pickup_detail: null },
      trips,
    );
    expect(f.pontoId).toBe("cantanhede");
    expect(f.bairro).toBe("");
    expect(f.anotacao).toBe("");
  });

  it("ponto que não existe mais: deixa a equipe escolher e avisa", () => {
    const f = inicialDoRascunho({ ...busca, route_point_code: "sumiu" }, trips);
    expect(f.pontoId).toBe("");
    expect(f.anotacao).toBe("");
    expect(f.aviso).toMatch(/escolha o ponto/);
  });

  it("sem nome nem trecho: campos vazios, quantidade 1", () => {
    const f = inicialDoRascunho(
      { ...busca, customer_name: null, client_excerpt: null, quantity: null },
      trips,
    );
    expect(f.nome).toBe("");
    expect(f.quantidade).toBe(1);
    expect(f.aviso).not.toContain("“");
  });

  it("rascunho vazio não quebra", () => {
    expect(inicialDoRascunho(null, trips).direcao).toBe("ida");
  });
});

describe("textos do cartão", () => {
  it("embarque: nome do ponto e o local", () => {
    expect(embarqueDoRascunho(busca, trips)).toBe("Buscar em Casa · Cohatrac, Rua 7, casa 12");
    expect(embarqueDoRascunho({ direction: "volta", route_point_code: "cantanhede" }, trips)).toBe(
      "Cantanhede",
    );
    expect(embarqueDoRascunho({ direction: "ida", route_point_code: "x" }, trips)).toBe("x");
  });

  it("viagem: sentido, dia da semana e data", () => {
    expect(viagemDoRascunho(busca)).toBe("Ida · ter 10/11");
    expect(viagemDoRascunho({ trip_date: "2026-11-15", direction: "volta" })).toBe(
      "Volta · dom 15/11",
    );
    expect(viagemDoRascunho({})).toBe("");
  });

  it("encomenda vira a anotação rápida da Agenda", () => {
    expect(
      anotacaoDaEncomenda({
        pickup_detail: "Rua Grande 10",
        phone: "98988887777",
        customer_name: "Zé",
      }),
    ).toBe("E Rua Grande 10 98988887777 Zé");
    expect(anotacaoDaEncomenda({ pickup_detail: "Centro", phone: "98988887777" })).toBe(
      "E Centro 98988887777",
    );
  });
});
