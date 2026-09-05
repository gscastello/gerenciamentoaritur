// src/services/searchService.js
//
// Busca global do app: passageiros (tabela customers) e reservas
// (view v_reservations_flat). Viagens e "ir para" são resolvidos na
// própria tela (sem I/O). O RLS decide o que cada papel enxerga —
// motorista, por exemplo, lê customers mas não financial_entries.

import { supabase, ServiceError, isRetryableError } from "../lib/supabaseClient";

// PostgREST monta o filtro `.or()` a partir de uma string — tiramos
// vírgula/parênteses/curinga pra não abrir condições extras. Sobra texto
// puro pro ilike (limitado a 60 chars).
function limpar(termo) {
  return String(termo || "")
    .replace(/[,()*%\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function run(promise, context) {
  const { data, error } = await promise;
  if (error)
    throw new ServiceError(`${context}: ${error.message}`, {
      cause: error,
      retryable: isRetryableError(error),
    });
  return data ?? [];
}

export const searchService = {
  async customers(termo) {
    const t = limpar(termo);
    if (t.length < 2) return [];
    return run(
      supabase
        .from("customers")
        .select("id,name,phone,default_neighborhood")
        .is("deleted_at", null)
        .or(`name.ilike.%${t}%,phone.ilike.%${t}%`)
        .order("name", { ascending: true })
        .limit(12),
      "searchCustomers",
    );
  },

  async reservations(termo) {
    const t = limpar(termo);
    if (t.length < 2) return [];
    const filtros = [`nome.ilike.%${t}%`, `telefone.ilike.%${t}%`];
    if (UUID_RE.test(t)) filtros.push(`id.eq.${t}`);
    return run(
      supabase
        .from("v_reservations_flat")
        .select(
          "id,data,direcao,nome,telefone,status,tipo,quantidade,valorTotal,pontoId,bairro",
        )
        .or(filtros.join(","))
        .order("data", { ascending: false, nullsFirst: false })
        .limit(15),
      "searchReservations",
    );
  },
};
