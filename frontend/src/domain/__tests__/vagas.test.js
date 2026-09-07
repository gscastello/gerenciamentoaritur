import { describe, expect, it } from "vitest";
import { cabeNaViagem, excedeCapacidade, ocupacao, vagasDisponiveis } from "../vagas.js";

const r = (over) => ({
  id: Math.random().toString(36).slice(2),
  data: "2026-09-01",
  direcao: "ida",
  status: "confirmada",
  quantidade: 1,
  ...over,
});

describe("motor de vagas — lotação compartilhada por viagem", () => {
  it("soma quantidade só de reservas que ocupam vaga na mesma viagem", () => {
    const reservas = [
      r({ quantidade: 2 }),
      r({ quantidade: 3, status: "embarcado" }),
      r({ quantidade: 5, status: "cancelada" }), // não conta
      r({ quantidade: 4, status: "pendente" }), // não conta
      r({ quantidade: 9, direcao: "volta" }), // outra viagem
      r({ quantidade: 9, data: "2026-09-02" }), // outro dia
    ];
    expect(ocupacao(reservas, "2026-09-01", "ida")).toBe(5);
    expect(vagasDisponiveis(reservas, "2026-09-01", "ida", 31)).toBe(26);
  });

  it("ignora frete e encomenda mesmo confirmados", () => {
    const reservas = [r({ quantidade: 10, tipo: "frete" }), r({ quantidade: 2 })];
    expect(ocupacao(reservas, "2026-09-01", "ida")).toBe(2);
  });

  it("nunca retorna vagas negativas", () => {
    const reservas = [r({ quantidade: 40 })];
    expect(vagasDisponiveis(reservas, "2026-09-01", "ida", 31)).toBe(0);
  });

  it("a lotação é por viagem, não por ponto de embarque", () => {
    const reservas = [
      r({ quantidade: 15, pontoId: "rodoviaria" }),
      r({ quantidade: 15, pontoId: "br" }),
    ];
    // 30/31 na viagem inteira — ainda cabe 1, independente do ponto
    expect(vagasDisponiveis(reservas, "2026-09-01", "ida", 31)).toBe(1);
  });
});

describe("cabeNaViagem — criação e edição", () => {
  const reservas = [r({ id: "A", quantidade: 28 }), r({ id: "B", quantidade: 2 })];

  it("bloqueia nova reserva que estoura a capacidade", () => {
    expect(
      cabeNaViagem({ reservas, data: "2026-09-01", direcao: "ida", capacidade: 31, quantidade: 2 }),
    ).toBe(false);
  });

  it("na edição, exclui a própria reserva da contagem (issue #14)", () => {
    // Editar a reserva A de 28 -> 29: sobram 31 - 2 (só B) = 29. Cabe.
    expect(
      cabeNaViagem({
        reservas,
        data: "2026-09-01",
        direcao: "ida",
        capacidade: 31,
        quantidade: 29,
        ignorarId: "A",
      }),
    ).toBe(true);
    // Editar A -> 30 não cabe (30 + 2 = 32).
    expect(
      excedeCapacidade({
        reservas,
        data: "2026-09-01",
        direcao: "ida",
        capacidade: 31,
        quantidade: 30,
        ignorarId: "A",
      }),
    ).toBe(true);
  });

  it("troca de veículo (ônibus 31 -> van 14) reduz a capacidade efetiva", () => {
    const base = [r({ quantidade: 12 })];
    const p = { reservas: base, data: "2026-09-01", direcao: "ida", quantidade: 3 };
    expect(cabeNaViagem({ ...p, capacidade: 31 })).toBe(true);
    expect(cabeNaViagem({ ...p, capacidade: 14 })).toBe(false);
  });

  it("quantidade ausente conta como 1 (ocupação e na checagem)", () => {
    const reservas = [r({ quantidade: undefined }), r({ quantidade: undefined })];
    expect(ocupacao(reservas, "2026-09-01", "ida")).toBe(2);
    expect(
      cabeNaViagem({ reservas, data: "2026-09-01", direcao: "ida", capacidade: 3, quantidade: undefined }),
    ).toBe(true); // 2 ocupados + 1 = 3, cabe
  });

  it("cabe exatamente na última vaga", () => {
    const reservas = [r({ quantidade: 30 })];
    expect(cabeNaViagem({ reservas, data: "2026-09-01", direcao: "ida", capacidade: 31, quantidade: 1 })).toBe(true);
    expect(cabeNaViagem({ reservas, data: "2026-09-01", direcao: "ida", capacidade: 31, quantidade: 2 })).toBe(false);
  });

  it("excedeCapacidade é o complemento de cabeNaViagem", () => {
    const p = { reservas: [r({ quantidade: 30 })], data: "2026-09-01", direcao: "ida", capacidade: 31 };
    expect(excedeCapacidade({ ...p, quantidade: 1 })).toBe(false);
    expect(excedeCapacidade({ ...p, quantidade: 5 })).toBe(true);
  });
});
