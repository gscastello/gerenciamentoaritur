import { describe, expect, it } from "vitest";
import {
  dataDoHistorico,
  historicoDoPassageiro,
  situacaoDaViagem,
} from "../historicoDoPassageiro.js";

const v = (id, data, extra = {}) => ({
  id,
  data,
  direcao: "ida",
  status: "confirmada",
  tipo: "passagem",
  quantidade: 1,
  valorTotal: "60.00",
  criadoEm: "2026-11-01T10:00:00Z",
  ...extra,
});

describe("histórico de viagens do passageiro (issue #436)", () => {
  it("data com o dia da semana e o ano", () => {
    expect(dataDoHistorico("2026-11-16")).toBe("seg, 16/11/2026");
    expect(dataDoHistorico("2025-12-27")).toBe("sáb, 27/12/2025");
    expect(dataDoHistorico("2026-11-15")).toBe("dom, 15/11/2026");
  });

  it("rótulo de cada situação", () => {
    expect(situacaoDaViagem("confirmada")).toBe("Confirmada");
    expect(situacaoDaViagem("pendente")).toBe("Pendente");
    expect(situacaoDaViagem("embarcado")).toBe("Embarcou");
    expect(situacaoDaViagem("cancelada")).toBe("Cancelada");
    expect(situacaoDaViagem("nao_compareceu")).toBe("Não compareceu");
    expect(situacaoDaViagem("outro")).toBe("outro");
    expect(situacaoDaViagem(undefined)).toBe("");
  });

  it("próximas da mais perto para a mais longe; anteriores da mais recente para a mais antiga", () => {
    const { proximas, anteriores, total } = historicoDoPassageiro(
      [
        v("a", "2026-10-02"),
        v("b", "2026-11-20"),
        v("c", "2026-11-16"),
        v("d", "2026-11-10"),
        v("e", "2025-12-30"),
        v("sem-data", null),
        v("data-ruim", "16/11/2026"),
      ],
      "2026-11-16",
    );
    expect(proximas.map((x) => x.id)).toEqual(["c", "b"]);
    expect(anteriores.map((x) => x.id)).toEqual(["d", "a", "e"]);
    expect(total).toBe(5);
  });

  it("no mesmo dia: Ida antes da Volta nas próximas, Volta antes da Ida nas anteriores", () => {
    const viagens = [
      v("volta-futura", "2026-11-20", { direcao: "volta" }),
      v("ida-futura", "2026-11-20"),
      v("ida-passada", "2026-11-01"),
      v("volta-passada", "2026-11-01", { direcao: "volta" }),
    ];
    const { proximas, anteriores } = historicoDoPassageiro(viagens, "2026-11-16");
    expect(proximas.map((x) => x.id)).toEqual(["ida-futura", "volta-futura"]);
    expect(anteriores.map((x) => x.id)).toEqual(["volta-passada", "ida-passada"]);
  });

  it("mesmo dia e sentido: a reserva mais antiga primeiro nas próximas e por último nas anteriores", () => {
    const viagens = [
      v("nova", "2026-11-20", { criadoEm: "2026-11-05T10:00:00Z" }),
      v("antiga", "2026-11-20", { criadoEm: "2026-11-02T10:00:00Z" }),
      v("p-nova", "2026-11-01", { criadoEm: "2026-10-30T10:00:00Z" }),
      v("p-antiga", "2026-11-01", { criadoEm: "2026-10-20T10:00:00Z" }),
      v("p-sem", "2026-11-01", { criadoEm: undefined }),
    ];
    const { proximas, anteriores } = historicoDoPassageiro(viagens, "2026-11-16");
    expect(proximas.map((x) => x.id)).toEqual(["antiga", "nova"]);
    expect(anteriores.map((x) => x.id)).toEqual(["p-nova", "p-antiga", "p-sem"]);
  });

  it("cada item traz a data, o sentido, a situação, se é encomenda e o valor (sem valor na cancelada)", () => {
    const { proximas, anteriores } = historicoDoPassageiro(
      [
        v("ida", "2026-11-20", { valorTotal: "120.00", quantidade: 2 }),
        v("volta", "2026-11-21", { direcao: "volta", status: "pendente" }),
        v("cancelada", "2026-11-01", { status: "cancelada" }),
        v("encomenda", "2026-10-01", { tipo: "encomenda", valorTotal: null, status: "embarcado" }),
      ],
      "2026-11-16",
    );
    expect(proximas[0]).toMatchObject({
      id: "ida",
      quando: "sex, 20/11/2026",
      sentido: "Ida",
      situacao: "Confirmada",
      encomenda: false,
      valor: 120,
      quantidade: 2,
    });
    expect(proximas[1]).toMatchObject({ sentido: "Volta", situacao: "Pendente", valor: 60 });
    expect(anteriores[0]).toMatchObject({ situacao: "Cancelada", valor: null });
    expect(anteriores[1]).toMatchObject({ encomenda: true, situacao: "Embarcou", valor: null });
  });

  it("sem histórico", () => {
    expect(historicoDoPassageiro(undefined, "2026-11-16")).toEqual({
      proximas: [],
      anteriores: [],
      total: 0,
    });
    expect(historicoDoPassageiro([null], "2026-11-16").total).toBe(0);
  });
});
