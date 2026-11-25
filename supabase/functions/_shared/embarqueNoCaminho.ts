// supabase/functions/_shared/embarqueNoCaminho.ts
//
// Quem embarca numa cidade do caminho (Campestre, Matões, Miranda…) está no ponto Pirapemas, Cantanhede ou
// Outros, mas a van passa lá em OUTRO horário (issue #533): a confirmação e o lembrete usam o nome do lugar e a
// hora do cronograma, não os do ponto. Regra PURA.

import { type Cronograma, cronogramaValido, lugarNoCronograma } from "./agentePuro.ts";
import { paradaDoInterior } from "./ladoDaRota.ts";

const NOMES: Record<string, string> = {
  bacabeira: "Bacabeira",
  "santa rita": "Santa Rita",
  entroncamento: "Entroncamento",
  miranda: "Miranda do Norte",
  matoes: "Matões do Norte",
  campestre: "Campestre",
};

export type EmbarqueNoCaminho = { nome: string; hora: string; detalhe: string | null };

export function embarqueNoCaminho(
  r: { direcao: "ida" | "volta"; ponto: string | null; detalhe: string | null | undefined },
  cronograma: Cronograma,
): EmbarqueNoCaminho | null {
  const pontos = r.direcao === "volta" ? ["pirapemas", "cantanhede"] : ["outro"];
  if (!r.ponto || !pontos.includes(r.ponto)) return null;
  const parada = paradaDoInterior(r.detalhe);
  const nome = parada ? NOMES[parada] : null;
  if (!nome) return null;
  const achado = lugarNoCronograma(cronograma[r.direcao], [nome]);
  if (!achado) return null;
  // "Campestre (povoado Mata)" → "povoado Mata": o nome já vem na frente
  const resto = String(r.detalhe ?? "")
    .replace(new RegExp(`^\\s*${nome.split(" ")[0]}(?: do Norte)?\\s*[,:–—-]?\\s*`, "i"), "")
    .replace(/^\(([^()]*)\)/, "$1")
    .trim();
  return { nome, hora: achado.de, detalhe: resto || null };
}

/** Com `settings.trip_schedule` como veio do banco. */
export function embarqueNoCaminhoDe(
  r: { direcao: "ida" | "volta"; ponto: string | null; detalhe: string | null | undefined },
  tripSchedule: unknown,
): EmbarqueNoCaminho | null {
  return embarqueNoCaminho(r, cronogramaValido(tripSchedule));
}
