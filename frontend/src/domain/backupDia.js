// Backup diário das reservas do dia (issue #208).
//
// O servidor (database/60) guarda, todo dia às 23h55, um retrato JSON de
// todas as reservas daquele dia de viagem — inclusive canceladas e apagadas,
// com cliente, passageiros e pagamentos. Aqui ficam as regras puras para
// LER esse retrato como lista/CSV legível (sem React, sem I/O).

const SENTIDOS = { ida: "Ida", volta: "Volta" };

/** Uma linha por reserva do retrato, em campos legíveis. */
export function linhasDoBackup(snapshot) {
  return (snapshot?.reservas ?? []).map((e) => {
    const r = e?.reserva ?? {};
    const c = e?.cliente ?? {};
    const endereco = [r.pickup_neighborhood, r.street, r.pickup_detail, r.reference_point]
      .filter(Boolean)
      .join(" · ");
    return {
      sentido: SENTIDOS[e?.viagem?.direcao] ?? e?.viagem?.direcao ?? "",
      ponto: e?.ponto?.nome ?? "",
      quantidade: Number(r.quantity) || 0,
      endereco,
      desembarque: r.dropoff_location ?? "",
      nome: c.nome ?? "",
      telefone: c.telefone ?? "",
      telefone2: c.telefone2 ?? "",
      status: r.status ?? "",
      tipo: r.type ?? "",
      pagamento: r.payment_method ?? "",
      valor: r.total_price == null ? "" : String(r.total_price),
      apagada: r.deleted_at ? "sim" : "",
    };
  });
}

const CABECALHO = [
  ["sentido", "Sentido"],
  ["ponto", "Ponto de embarque"],
  ["quantidade", "Passagens"],
  ["endereco", "Endereço"],
  ["desembarque", "Desembarque"],
  ["nome", "Nome"],
  ["telefone", "Telefone"],
  ["telefone2", "Telefone 2"],
  ["status", "Status"],
  ["tipo", "Tipo"],
  ["pagamento", "Pagamento"],
  ["valor", "Valor"],
  ["apagada", "Apagada"],
];

const celula = (v) => {
  const t = String(v ?? "");
  return /[";\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

/**
 * CSV para o Excel brasileiro: separador ";" e BOM (UTF-8) para os acentos
 * abrirem certos.
 */
export function csvDoBackup(linhas) {
  const cab = CABECALHO.map(([, titulo]) => celula(titulo)).join(";");
  const corpo = linhas.map((l) => CABECALHO.map(([chave]) => celula(l[chave])).join(";"));
  return `﻿${[cab, ...corpo].join("\r\n")}\r\n`;
}

/** Resumo curto de uma linha da lista de backups. */
export function resumoDoBackup(b) {
  const canceladas = b.reservas_canceladas > 0 ? ` (${b.reservas_canceladas} canceladas)` : "";
  return `${b.reservas_total} reservas${canceladas} · ${b.passagens} passagens`;
}
