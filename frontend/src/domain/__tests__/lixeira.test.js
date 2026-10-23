import { describe, expect, it } from "vitest";
import {
  mensagemDeCancelamento,
  mensagemDeRestauracao,
  quandoCancelada,
  reservasNaLixeira,
} from "../lixeira.js";

const AGORA = Date.parse("2026-10-23T12:00:00Z");
const dias = (n) => new Date(AGORA - n * 24 * 60 * 60 * 1000).toISOString();

const r = (id, extra = {}) => ({
  id,
  status: "cancelada",
  nome: id,
  telefone: "98999990000",
  canceladaEm: dias(1),
  ...extra,
});

describe("quandoCancelada", () => {
  it("usa canceladaEm; sem ele, a última atualização (dado antigo)", () => {
    expect(quandoCancelada({ canceladaEm: "2026-10-01T00:00:00Z" })).toBe(
      Date.parse("2026-10-01T00:00:00Z"),
    );
    expect(quandoCancelada({ atualizadoEm: "2026-09-01T00:00:00Z" })).toBe(
      Date.parse("2026-09-01T00:00:00Z"),
    );
    expect(quandoCancelada({})).toBeNull();
    expect(quandoCancelada({ canceladaEm: "lixo" })).toBeNull();
  });
});

describe("reservasNaLixeira", () => {
  it("só canceladas, mais recentes primeiro", () => {
    const lista = reservasNaLixeira(
      [
        r("antiga", { canceladaEm: dias(10) }),
        r("ativa", { status: "confirmada" }),
        r("nova", { canceladaEm: dias(1) }),
      ],
      { agora: AGORA },
    );
    expect(lista.map((x) => x.id)).toEqual(["nova", "antiga"]);
  });

  it("respeita a janela de dias", () => {
    const lista = reservasNaLixeira(
      [r("a", { canceladaEm: dias(5) }), r("b", { canceladaEm: dias(40) })],
      { agora: AGORA, dias: 30 },
    );
    expect(lista.map((x) => x.id)).toEqual(["a"]);
    expect(
      reservasNaLixeira([r("b", { canceladaEm: dias(40) })], { agora: AGORA, dias: 60 }),
    ).toHaveLength(1);
  });

  it("sem data de cancelamento não esconde a reserva (melhor mostrar que perder)", () => {
    const lista = reservasNaLixeira([r("sem", { canceladaEm: null })], { agora: AGORA });
    expect(lista).toHaveLength(1);
  });

  it("busca por nome (sem acento/caixa) e por telefone", () => {
    const reservas = [
      r("1", { nome: "José da Conceição", telefone: "98987654321" }),
      r("2", { nome: "Maria", telefone: "98911112222", telefone2: "98933334444" }),
    ];
    expect(reservasNaLixeira(reservas, { agora: AGORA, busca: "jose" }).map((x) => x.id)).toEqual([
      "1",
    ]);
    expect(reservasNaLixeira(reservas, { agora: AGORA, busca: "9876" }).map((x) => x.id)).toEqual([
      "1",
    ]);
    expect(reservasNaLixeira(reservas, { agora: AGORA, busca: "3333" }).map((x) => x.id)).toEqual([
      "2",
    ]);
    expect(reservasNaLixeira(reservas, { agora: AGORA, busca: "zzz" })).toEqual([]);
  });

  it("lista ausente não quebra", () => {
    expect(reservasNaLixeira(undefined, { agora: AGORA })).toEqual([]);
  });
});

describe("mensagens de confirmação", () => {
  it("restaurar diz o nome, a data e que a lotação é respeitada", () => {
    const m = mensagemDeRestauracao({ nome: "Ana" }, "25/10/2026");
    expect(m).toContain("Restaurar a reserva de Ana (25/10/2026)?");
    expect(m).toContain("já lotou");
    expect(m).toContain("estorno automático");
  });

  it("cancelar avisa que vai para a Lixeira", () => {
    const m = mensagemDeCancelamento({ nome: "Ana" });
    expect(m).toContain("Cancelar a reserva de Ana?");
    expect(m).toContain("Lixeira");
    expect(mensagemDeCancelamento(undefined)).toContain("passageiro");
  });
});
