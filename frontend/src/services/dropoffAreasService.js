// src/services/dropoffAreasService.js
//
// Baldes de desembarque por direção (tabela dropoff_areas,
// database/24-baldes-desembarque.sql). Organizam a rota do motorista e o
// passo "Onde você vai ficar" da tela Reservar. `code` é estável (vai em
// reservations.dropoff_area).

import { supabase, ServiceError } from "../lib/supabaseClient";

function isNetworkish(error) {
  return /fetch|network|timeout/i.test(error?.message || "");
}
async function handle(promise, context) {
  const { data, error } = await promise;
  if (error) throw new ServiceError(`${context}: ${error.message}`, { cause: error, retryable: isNetworkish(error) });
  return data;
}

export const dropoffAreasService = {
  async list() {
    return handle(
      supabase
        .from("dropoff_areas")
        .select("id, direction, code, label, detail_label, detail_placeholder, detail_required, sort_order, active")
        .is("deleted_at", null)
        .order("direction")
        .order("sort_order"),
      "list",
    );
  },

  async upsert({ direction, code, label, detailLabel, detailPlaceholder, detailRequired, sortOrder }) {
    const { data, error } = await supabase.rpc("rpc_upsert_dropoff_area", {
      p_direction: direction,
      p_code: code ?? null,
      p_label: label,
      p_detail_label: detailLabel ?? null,
      p_detail_placeholder: detailPlaceholder ?? null,
      p_detail_required: detailRequired ?? null,
      p_sort_order: sortOrder ?? null,
    });
    if (error) throw new ServiceError(`upsert: ${error.message}`, { cause: error, retryable: isNetworkish(error) });
    if (!data?.success) throw new ServiceError(data?.message || "Não foi possível salvar o local.", { retryable: false });
    return data;
  },

  async update(id, fields) {
    return handle(
      supabase.from("dropoff_areas").update(fields).eq("id", id).select().single(),
      "update",
    );
  },

  async remove(id) {
    const { data, error } = await supabase.rpc("rpc_soft_delete_dropoff_area", { p_id: id });
    if (error) throw new ServiceError(`remove: ${error.message}`, { cause: error, retryable: isNetworkish(error) });
    if (!data?.success) throw new ServiceError(data?.message || "Não foi possível remover o local.", { retryable: false });
    return data;
  },
};
