// Issue #474: "Tornar endereço padrão" ao agendar ou editar uma reserva, e a edição do cadastro do
// passageiro sem "sem permissão" (as colunas que ela grava têm de estar no grant de database/126).
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const chamadas = [];
let respostas = {};
vi.mock("../../lib/supabaseClient", () => {
  class ServiceError extends Error {
    constructor(message, opts = {}) {
      super(message);
      this.code = opts.code;
    }
  }
  return {
    ServiceError,
    isRetryableError: () => false,
    getCurrentUserId: async () => "usuario-1",
    supabase: {
      rpc: async (nome, args) => {
        chamadas.push({ nome, args });
        return respostas[nome] ?? { data: { success: true }, error: null };
      },
    },
  };
});

const { reservationsService } = await import("../reservationsService.js");

const PEDIDO = {
  tripDate: "2026-11-30",
  direction: "volta",
  customerName: "Maria Teste",
  customerPhone: "98999990000",
};

describe("tornar endereço padrão (issue #474)", () => {
  beforeEach(() => {
    chamadas.length = 0;
    respostas = {
      rpc_create_reservation: {
        data: { success: true, reservation_id: "r-1", status: "confirmada" },
        error: null,
      },
      rpc_edit_reservation: { data: { success: true }, error: null },
    };
  });

  it("sem a caixa marcada, não mexe no endereço padrão", async () => {
    await reservationsService.create(PEDIDO);
    expect(chamadas.map((c) => c.nome)).toEqual(["rpc_create_reservation"]);
  });

  it("agendar com a caixa marcada: depois da reserva, o endereço dela vira o padrão", async () => {
    const r = await reservationsService.create({ ...PEDIDO, tornarEnderecoPadrao: true });
    expect(chamadas.map((c) => c.nome)).toEqual([
      "rpc_create_reservation",
      "rpc_tornar_endereco_padrao",
    ]);
    expect(chamadas[1].args).toEqual({ p_reservation_id: "r-1" });
    expect(r.enderecoPadraoErro).toBeNull();
    // a caixa não vai para a criação da reserva
    expect(chamadas[0].args).not.toHaveProperty("tornarEnderecoPadrao");
  });

  it("se o padrão falhar, a reserva continua criada e volta o motivo (nunca relançar a reserva)", async () => {
    respostas.rpc_tornar_endereco_padrao = {
      data: { success: false, message: "Sem permissão." },
      error: null,
    };
    const r = await reservationsService.create({ ...PEDIDO, tornarEnderecoPadrao: true });
    expect(r.reservation_id).toBe("r-1");
    expect(r.enderecoPadraoErro).toBe("Sem permissão.");
  });

  it("editar com a caixa marcada: grava a edição e depois o padrão", async () => {
    const r = await reservationsService.editReservationFull("r-9", {
      details: { dropoff_location: "Cohatrac" },
      tornarEnderecoPadrao: true,
    });
    expect(chamadas.map((c) => c.nome)).toEqual([
      "rpc_edit_reservation",
      "rpc_tornar_endereco_padrao",
    ]);
    expect(chamadas[1].args).toEqual({ p_reservation_id: "r-9" });
    expect(r.enderecoPadraoErro).toBeNull();
  });

  it("edição recusada: não toca no endereço padrão", async () => {
    respostas.rpc_edit_reservation = {
      data: { success: false, message: "Viagem lotada." },
      error: null,
    };
    await expect(
      reservationsService.editReservationFull("r-9", { tornarEnderecoPadrao: true }),
    ).rejects.toThrow("Viagem lotada.");
    expect(chamadas.map((c) => c.nome)).toEqual(["rpc_edit_reservation"]);
  });
});

describe("edição do cadastro do passageiro sem 'sem permissão' (issue #474)", () => {
  it("toda coluna que updateProfile grava está no grant do banco", () => {
    const aqui = dirname(fileURLToPath(import.meta.url));
    const service = readFileSync(resolve(aqui, "../customersService.js"), "utf8");
    const corpo = service.slice(
      service.indexOf("async updateProfile("),
      service.indexOf("async upsertByPhone("),
    );
    const colunas = [...corpo.matchAll(/patch\.([a-z_]+)\s*=/g)].map((m) => m[1]);
    expect(colunas.length).toBeGreaterThan(0);
    // database/12 (name, phone, notes, default_neighborhood, updated_by) + database/126
    const permitidas = [
      "name",
      "phone",
      "notes",
      "default_neighborhood",
      "updated_by",
      "phone_secondary",
      "default_route_point_code",
      "default_payment_method",
    ];
    // (o banco confere o mesmo na própria migração 126: ela falha se faltar o grant de uma coluna)
    expect(colunas.filter((c) => !permitidas.includes(c))).toEqual([]);
  });
});
