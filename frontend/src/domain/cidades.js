// Cidades da rota (issue #6). A rota para em São Luís, Cantanhede e
// Pirapemas. Cidades no meio do caminho (Bacabeira, Santa Rita...) NÃO são
// atendidas de rotina: uma reserva que menciona uma delas no texto livre
// de embarque/desembarque nasce `pendente` e passa por confirmação manual.
//
// Regra pura, sem I/O. As listas aqui são o fallback — em produção o bot e
// o painel leem `settings.served_cities` / `settings.intermediate_cities`
// (database/05-seed.sql) e passam como override.

import { normalizar } from "./format.js";

export const CIDADES_ATENDIDAS = ["sao luis", "cantanhede", "pirapemas"];

export const CIDADES_INTERMEDIARIAS = [
  "bacabeira",
  "santa rita",
  "entroncamento",
  "colombo",
  "miranda",
  "matoes", // "Matões" — normalizar tira o acento
];

/**
 * Classifica um texto livre de local:
 *   "intermediaria" — menciona uma cidade da rota onde não paramos
 *   "atendida"      — menciona São Luís/Cantanhede/Pirapemas, ou nenhuma
 *                     cidade reconhecível (assume área de operação; o
 *                     pendente ainda é revisado por humano se escapar)
 */
export function classificarLocal(texto, { intermediarias = CIDADES_INTERMEDIARIAS } = {}) {
  const t = normalizar(texto);
  if (!t) return "atendida";
  const mencionaAlguma = (lista) => lista.some((c) => t.includes(normalizar(c)));
  return mencionaAlguma(intermediarias) ? "intermediaria" : "atendida";
}

/**
 * Algum dos textos (embarque, desembarque, detalhe...) menciona cidade
 * intermediária? => a reserva precisa nascer `pendente`.
 */
export function foraDaAreaPadrao(textos, opts = {}) {
  const lista = Array.isArray(textos) ? textos : [textos];
  return lista.some((t) => classificarLocal(t, opts) === "intermediaria");
}

const ehCidadeFixa = (area) => CIDADES_ATENDIDAS.includes(normalizar(area.code));

/**
 * Na Volta, a reserva desce numa cidade da rota que não é parada fixa? Devolve o
 * nome da cidade para o destaque do motorista (senão, null). Vale a cidade marcada
 * no desembarque ou citada no texto; as áreas são as cadastradas em Sistema, e a
 * lista de intermediárias cobre o que não virou área (ex.: Entroncamento).
 */
export function cidadeIntermediariaDaVolta(
  { direcao, desembarque, desembarqueArea } = {},
  { areas = [], intermediarias = CIDADES_INTERMEDIARIAS } = {},
) {
  if (direcao !== "volta") return null;
  const foraDasFixas = areas.filter((a) => a.needs_review && !ehCidadeFixa(a));
  const marcada = foraDasFixas.find((a) => a.code === desembarqueArea);
  if (marcada) return marcada.label;

  const texto = normalizar(desembarque);
  if (!texto) return null;
  const citada = foraDasFixas.find(
    (a) =>
      texto.includes(normalizar(a.label)) || texto.includes(normalizar(a.code.replace(/_/g, " "))),
  );
  if (citada) return citada.label;
  const cidade = intermediarias.find((c) => texto.includes(normalizar(c)));
  if (!cidade) return null;
  return cidade.replace(/(^|\s)\p{L}/gu, (letra) => letra.toUpperCase());
}
