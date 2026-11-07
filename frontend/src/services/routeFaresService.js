// src/services/routeFaresService.js
//
// Preço por trecho (route_fares) e preços que o bot sugere (bot_price_suggestions),
// database/70-precos-por-trecho.sql. Ler é de admin/atendente; mudar é só do admin.
// Sugestão não vale sozinha: só entra na tabela de preços quando o dono aprova.

import { ServiceError, supabase } from "../lib/supabaseClient";

function isNetworkish(error) {
  return /fetch|network|timeout/i.test(error?.message || "");
}
async function handle(promise, context) {
  const { data, error } = await promise;
  if (error)
    throw new ServiceError(`${context}: ${error.message}`, {
      cause: error,
      retryable: isNetworkish(error),
    });
  return data;
}
function exigirSucesso(data, mensagem) {
  if (!data?.success) throw new ServiceError(data?.message || mensagem, { retryable: false });
  return data;
}

export const routeFaresService = {
  async list() {
    return handle(
      supabase
        .from("route_fares")
        .select("id, origem, destino, price")
        .order("origem")
        .order("destino"),
      "list",
    );
  },

  async upsert({ origem, destino, price }) {
    const data = await handle(
      supabase.rpc("rpc_upsert_route_fare", {
        p_origem: origem,
        p_destino: destino,
        p_price: price,
      }),
      "upsert",
    );
    return exigirSucesso(data, "Não foi possível salvar o trecho.");
  },

  async remove(id) {
    return handle(supabase.from("route_fares").delete().eq("id", id), "remove");
  },

  async listSuggestions() {
    return handle(
      supabase
        .from("bot_price_suggestions")
        .select("id, tipo, origem, destino, price, fonte, evidence_count, last_seen_at")
        .eq("status", "proposta")
        .order("evidence_count", { ascending: false })
        .order("last_seen_at", { ascending: false }),
      "listSuggestions",
    );
  },

  async reviewSuggestion({ id, aprovar, price }) {
    const data = await handle(
      supabase.rpc("rpc_revisar_sugestao_de_preco", {
        p_id: id,
        p_aprovar: aprovar,
        p_price: price ?? null,
      }),
      "reviewSuggestion",
    );
    return exigirSucesso(data, "Não foi possível salvar a decisão.");
  },
};
