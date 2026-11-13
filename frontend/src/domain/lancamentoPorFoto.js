// src/domain/lancamentoPorFoto.js
//
// Lançar por foto (issues #362 e #369). A Edge Function `ler-documento` devolve o
// que a IA LEU na nota; aqui isso vira o formulário que a pessoa confere e a
// conferência antes de lançar. Regra pura.

export const DESTINOS = [
  { id: "despesa", label: "Despesa" },
  { id: "abastecimento", label: "Abastecimento" },
  { id: "manutencao", label: "Manutenção" },
];

const INTERVALO_PADRAO_KM = 10000;

const texto = (v) => (v == null ? "" : String(v));
const placaLimpa = (p) =>
  texto(p)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

/** Veículo da nota: o da placa escrita nela; senão o padrão; senão o primeiro. */
export function veiculoDaLeitura(leitura, veiculos) {
  const lista = veiculos ?? [];
  const placa = placaLimpa(leitura?.placa);
  const dela = placa ? lista.find((v) => placaLimpa(v.plate) === placa) : null;
  return (dela ?? lista.find((v) => v.is_default) ?? lista[0])?.id ?? "";
}

/** Formulário inicial a partir da leitura. `destino` força a tela (ex.: Operação → abastecimento). */
export function formDaLeitura(leitura, { hoje, veiculos, destino } = {}) {
  const l = leitura ?? {};
  const tipo = destino ?? (["abastecimento", "manutencao"].includes(l.tipo) ? l.tipo : "despesa");
  const descricao = [l.descricao, l.fornecedor].filter(Boolean).join(" · ");
  return {
    destino: tipo,
    data: l.data || hoje || "",
    valor: l.valor != null ? String(l.valor) : "",
    categoria:
      l.categoria ||
      (tipo === "abastecimento" ? "combustivel" : tipo === "manutencao" ? "manutencao" : "outro"),
    descricao,
    veiculoId: veiculoDaLeitura(l, veiculos),
    litros: l.litros != null ? String(l.litros) : "",
    kmRodados: "",
    odometro: l.odometro_km != null ? String(l.odometro_km) : "",
    tipoManutencao: l.tipo_manutencao || "",
    intervaloKm: String(INTERVALO_PADRAO_KM),
  };
}

const numero = (v) => {
  const s = texto(v).trim().replace(/\s/g, "");
  if (!s) return null;
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) ? n : null;
};

/**
 * Confere o formulário e devolve o que cada destino grava:
 * { ok: true, destino, dados } ou { ok: false, erro }.
 */
export function lancamentoDoForm(form) {
  const f = form ?? {};
  const valor = numero(f.valor);
  if (valor == null || valor <= 0) return { ok: false, erro: "Informe o valor da nota." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto(f.data)))
    return { ok: false, erro: "Informe a data da nota." };
  const descricao = texto(f.descricao).trim() || null;

  if (f.destino === "abastecimento") {
    if (!f.veiculoId) return { ok: false, erro: "Escolha o veículo." };
    const km = numero(f.kmRodados);
    if (km == null || km <= 0)
      return {
        ok: false,
        erro: "Informe quantos km o veículo rodou desde o último abastecimento.",
      };
    const litros = numero(f.litros);
    return {
      ok: true,
      destino: "abastecimento",
      dados: {
        vehicleId: f.veiculoId,
        recordDate: f.data,
        km,
        liters: litros && litros > 0 ? litros : null,
        cost: valor,
      },
    };
  }
  if (f.destino === "manutencao") {
    if (!f.veiculoId) return { ok: false, erro: "Escolha o veículo." };
    if (!texto(f.tipoManutencao).trim())
      return { ok: false, erro: "Escolha o tipo de manutenção." };
    const odometro = numero(f.odometro);
    if (odometro == null || odometro <= 0)
      return { ok: false, erro: "Informe a quilometragem do veículo (hodômetro)." };
    const intervalo = numero(f.intervaloKm);
    if (intervalo == null || intervalo <= 0)
      return { ok: false, erro: "Informe de quantos em quantos km repete." };
    return {
      ok: true,
      destino: "manutencao",
      dados: {
        vehicleId: f.veiculoId,
        type: f.tipoManutencao,
        performedAt: f.data,
        odometerKm: odometro,
        intervalKm: intervalo,
        cost: valor,
        notes: descricao,
      },
    };
  }
  return {
    ok: true,
    destino: "despesa",
    dados: {
      entryDate: f.data,
      type: "despesa",
      category: texto(f.categoria) || "outro",
      amount: valor,
      description: descricao,
    },
  };
}
