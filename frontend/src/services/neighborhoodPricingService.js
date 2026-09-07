// src/services/neighborhoodPricingService.js
//
// Preço de "Buscar em Casa" por bairro (tabela neighborhood_pricing,
// database/01-schema.sql + 23-precos-bairro-editaveis.sql). O bot já lê
// dela; este serviço é para o painel (Sistema) e para o fluxo de reserva.
// `neighborhood` é citext — "cohama" e "Cohama" são o mesmo bairro.

import { supabase, ServiceError } from "../lib/supabaseClient";

function isNetworkish(error) {
  return /fetch|network|timeout/i.test(error?.message || "");
}
async function handle(promise, context) {
  const { data, error } = await promise;
  if (error) throw new ServiceError(`${context}: ${error.message}`, { cause: error, retryable: isNetworkish(error) });
  return data;
}

export const neighborhoodPricingService = {
  async list() {
    return handle(
      supabase.from("neighborhood_pricing").select("id, neighborhood, price").order("neighborhood"),
      "list",
    );
  },

  /** Cria ou atualiza o preço de um bairro (case-insensitive). Só admin. */
  async upsert(neighborhood, price) {
    const { data, error } = await supabase.rpc("rpc_upsert_neighborhood_price", {
      p_neighborhood: neighborhood,
      p_price: price,
    });
    if (error) throw new ServiceError(`upsert: ${error.message}`, { cause: error, retryable: isNetworkish(error) });
    if (!data?.success) throw new ServiceError(data?.message || "Não foi possível salvar o bairro.", { retryable: false });
    return data;
  },

  async remove(id) {
    return handle(
      supabase.from("neighborhood_pricing").delete().eq("id", id),
      "remove",
    );
  },
};
