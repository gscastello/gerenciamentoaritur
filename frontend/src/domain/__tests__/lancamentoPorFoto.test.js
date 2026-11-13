import { describe, expect, it } from "vitest";
import {
  DESTINOS,
  formDaLeitura,
  lancamentoDoForm,
  veiculoDaLeitura,
} from "../lancamentoPorFoto.js";

// Lançar por foto (issues #362 e #369): a leitura vira formulário; a pessoa confere.
const veiculos = [
  { id: "v1", plate: "ABC-1234", is_default: false },
  { id: "v2", plate: "DEF-5678", is_default: true },
];
const hoje = "2026-11-12";

describe("veículo da nota", () => {
  it("placa escrita na nota, senão o padrão, senão o primeiro", () => {
    expect(veiculoDaLeitura({ placa: "abc1234" }, veiculos)).toBe("v1");
    expect(veiculoDaLeitura({ placa: "ZZZ9999" }, veiculos)).toBe("v2");
    expect(veiculoDaLeitura({}, [{ id: "x", plate: "A" }])).toBe("x");
    expect(veiculoDaLeitura({}, [])).toBe("");
    expect(veiculoDaLeitura(null, null)).toBe("");
  });
});

describe("formulário a partir da leitura", () => {
  it("diesel vira abastecimento com litros e o veículo da placa", () => {
    const f = formDaLeitura(
      {
        tipo: "abastecimento",
        data: "2026-11-10",
        valor: 600,
        litros: 100,
        fornecedor: "Posto X",
        descricao: "Diesel S10",
        placa: "ABC-1234",
        categoria: "combustivel",
      },
      { hoje, veiculos },
    );
    expect(f).toMatchObject({
      destino: "abastecimento",
      data: "2026-11-10",
      valor: "600",
      litros: "100",
      descricao: "Diesel S10 · Posto X",
      veiculoId: "v1",
      categoria: "combustivel",
      kmRodados: "",
    });
  });

  it("sem data nem valor: hoje e vazio; categoria padrão por destino; destino forçado pela tela", () => {
    const f = formDaLeitura({ tipo: "despesa" }, { hoje, veiculos });
    expect(f).toMatchObject({ destino: "despesa", data: hoje, valor: "", categoria: "outro" });
    expect(formDaLeitura({}, { hoje, destino: "manutencao" })).toMatchObject({
      destino: "manutencao",
      categoria: "manutencao",
      intervaloKm: "10000",
    });
    expect(formDaLeitura({ tipo: "abastecimento" }, { hoje }).categoria).toBe("combustivel");
    expect(formDaLeitura(null).destino).toBe("despesa");
    expect(
      formDaLeitura(
        { tipo: "manutencao", odometro_km: 152000, tipo_manutencao: "Freios" },
        { hoje },
      ),
    ).toMatchObject({ odometro: "152000", tipoManutencao: "Freios" });
    expect(DESTINOS.map((d) => d.id)).toEqual(["despesa", "abastecimento", "manutencao"]);
  });
});

describe("conferência antes de lançar", () => {
  const base = {
    data: "2026-11-10",
    valor: "350,50",
    descricao: "  Pedágio  ",
    categoria: "outro",
  };

  it("despesa", () => {
    expect(lancamentoDoForm({ ...base, destino: "despesa" })).toEqual({
      ok: true,
      destino: "despesa",
      dados: {
        entryDate: "2026-11-10",
        type: "despesa",
        category: "outro",
        amount: 350.5,
        description: "Pedágio",
      },
    });
    expect(
      lancamentoDoForm({ ...base, destino: "despesa", categoria: "", descricao: "" }).dados,
    ).toMatchObject({ category: "outro", description: null });
  });

  it("valor e data obrigatórios", () => {
    expect(lancamentoDoForm({ ...base, valor: "" })).toEqual({
      ok: false,
      erro: "Informe o valor da nota.",
    });
    expect(lancamentoDoForm({ ...base, valor: "-3" }).ok).toBe(false);
    expect(lancamentoDoForm({ ...base, valor: "abc" }).ok).toBe(false);
    expect(lancamentoDoForm({ ...base, data: "10/11" })).toEqual({
      ok: false,
      erro: "Informe a data da nota.",
    });
    expect(lancamentoDoForm(null).ok).toBe(false);
  });

  it("abastecimento pede veículo e km rodados; litros é opcional", () => {
    const ab = {
      ...base,
      destino: "abastecimento",
      veiculoId: "v1",
      kmRodados: "420",
      litros: "1.234,5",
    };
    expect(lancamentoDoForm(ab)).toEqual({
      ok: true,
      destino: "abastecimento",
      dados: { vehicleId: "v1", recordDate: "2026-11-10", km: 420, liters: 1234.5, cost: 350.5 },
    });
    expect(lancamentoDoForm({ ...ab, litros: "" }).dados.liters).toBeNull();
    expect(lancamentoDoForm({ ...ab, veiculoId: "" })).toEqual({
      ok: false,
      erro: "Escolha o veículo.",
    });
    expect(lancamentoDoForm({ ...ab, kmRodados: "0" }).ok).toBe(false);
  });

  it("manutenção pede veículo, tipo, hodômetro e intervalo", () => {
    const m = {
      ...base,
      destino: "manutencao",
      veiculoId: "v2",
      tipoManutencao: "Freios",
      odometro: "152000",
      intervaloKm: "10000",
    };
    expect(lancamentoDoForm(m)).toEqual({
      ok: true,
      destino: "manutencao",
      dados: {
        vehicleId: "v2",
        type: "Freios",
        performedAt: "2026-11-10",
        odometerKm: 152000,
        intervalKm: 10000,
        cost: 350.5,
        notes: "Pedágio",
      },
    });
    expect(lancamentoDoForm({ ...m, veiculoId: "" }).erro).toBe("Escolha o veículo.");
    expect(lancamentoDoForm({ ...m, tipoManutencao: " " }).erro).toBe(
      "Escolha o tipo de manutenção.",
    );
    expect(lancamentoDoForm({ ...m, odometro: "" }).ok).toBe(false);
    expect(lancamentoDoForm({ ...m, intervaloKm: "0" }).ok).toBe(false);
  });
});
