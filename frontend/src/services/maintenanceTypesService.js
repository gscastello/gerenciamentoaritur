// src/services/maintenanceTypesService.js
//
// Catálogo simples de tipos de manutenção (database/46-...sql) — não é
// expense_categories (aquilo é categoria financeira do Gestão); isto é
// só "que serviço foi feito" no veículo, pra não deixar o campo livre e
// virar "troca de óleo" e "Troca de Óleo" como duas coisas diferentes.

import { ServiceError, getCurrentUserId, supabase } from "../lib/supabaseClient";

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

export const maintenanceTypesService = {
  async list() {
    return handle(
      supabase
        .from("maintenance_types")
        .select("id, label, active, sort_order")
        .order("sort_order")
        .order("label"),
      "list",
    );
  },

  async create(label) {
    const actor = await getCurrentUserId();
    return handle(
      supabase.from("maintenance_types").insert({ label, created_by: actor }).select().single(),
      "create",
    );
  },

  async setActive(id, active) {
    return handle(
      supabase.from("maintenance_types").update({ active }).eq("id", id).select().single(),
      "setActive",
    );
  },
};
