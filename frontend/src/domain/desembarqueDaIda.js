// Desembarque da Ida na Rota (issue #428): quem deixamos em Cantanhede e em Pirapemas, na ordem
// da entrega. Regras puras — sem React, sem I/O.
//
// A cidade sai da área do desembarque (dropoff_area) e, sem ela, do texto. Campestre fica entre
// Cantanhede e Pirapemas e vai com Pirapemas (como no embarque da Volta). Cidade do caminho
// (Matões, Miranda…) e desembarque sem cidade vão para "outros".

import { normalizar } from "./format.js";

/** Cidade do desembarque de uma reserva da Ida: "cantanhede", "pirapemas" ou null. */
export function cidadeDoDesembarque(r) {
  const area = normalizar(r?.desembarqueArea);
  if (area === "cantanhede") return "cantanhede";
  if (area === "pirapemas" || area === "campestre") return "pirapemas";
  if (area && area !== "outro") return null;
  const texto = normalizar(r?.desembarque);
  const emCantanhede = /cantanhede|catanhede/.test(texto);
  const emPirapemas = /pirapemas|campestre/.test(texto);
  if (emCantanhede === emPirapemas) return null;
  return emCantanhede ? "cantanhede" : "pirapemas";
}

/**
 * Ordem da entrega: posição salva (`desembarqueSeq`) primeiro; quem ainda não tem posição vem
 * depois, na ordem em que foi reservado. Estável e sem mutar.
 */
export function ordenarDesembarque(itens) {
  return [...itens].sort((a, b) => {
    const sa = a.desembarqueSeq ?? Number.POSITIVE_INFINITY;
    const sb = b.desembarqueSeq ?? Number.POSITIVE_INFINITY;
    if (sa !== sb) return sa < sb ? -1 : 1;
    return String(a.criadoEm ?? "").localeCompare(String(b.criadoEm ?? ""));
  });
}

const FORA_DA_ROTA = new Set(["cancelada", "espera"]);

/**
 * O desembarque da Ida do dia, separado por cidade e na ordem salva. Passagens e encomendas
 * (a encomenda também é entregue no destino); cancelada e lista de espera ficam de fora.
 */
export function desembarqueDaIda(reservas, data) {
  const doDia = (reservas || []).filter(
    (r) =>
      r.data === data && r.direcao === "ida" && r.tipo !== "frete" && !FORA_DA_ROTA.has(r.status),
  );
  const grupos = { cantanhede: [], pirapemas: [], outros: [] };
  for (const r of doDia) grupos[cidadeDoDesembarque(r) ?? "outros"].push(r);
  return {
    cantanhede: ordenarDesembarque(grupos.cantanhede),
    pirapemas: ordenarDesembarque(grupos.pirapemas),
    outros: ordenarDesembarque(grupos.outros),
  };
}
