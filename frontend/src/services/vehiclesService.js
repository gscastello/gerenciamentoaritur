// src/services/vehiclesService.js
import { supabase, getCurrentUserId, ServiceError } from "../lib/supabaseClient";

function isNetworkish(error) { return /fetch|network|timeout/i.test(error?.message || ""); }
async function handle(promise, context) {
  const { data, error } = await promise;
  if (error) throw new ServiceError(`${context}: ${error.message}`, { cause: error, retryable: isNetworkish(error) });
  return data;
}

export const vehiclesService = {
  async list() {
    return handle(supabase.from("vehicles").select("*").is("deleted_at", null).order("is_default", { ascending: false }), "list");
  },

  async getDefault() {
    return handle(supabase.from("vehicles").select("*").eq("is_default", true).is("deleted_at", null).maybeSingle(), "getDefault");
  },

  /**
   * Troca qual veículo é o padrão. IMPORTANTE: isso NÃO altera a
   * capacidade de viagens já criadas — trips.capacity é um snapshot
   * gravado na hora da criação da viagem (ver DATABASE.md, seção 1).
   */
  async setDefault(vehicleId) {
    const actor = await getCurrentUserId();
    await handle(
      supabase.from("vehicles").update({ is_default: false, updated_by: actor }).eq("is_default", true),
      "setDefault(unset)"
    );
    return handle(
      supabase.from("vehicles").update({ is_default: true, updated_by: actor }).eq("id", vehicleId).select().single(),
      "setDefault(set)"
    );
  },

  async update(vehicleId, fields) {
    const actor = await getCurrentUserId();
    return handle(supabase.from("vehicles").update({ ...fields, updated_by: actor }).eq("id", vehicleId).select().single(), "update");
  },

  // ---- motoristas -------------------------------------------------------
  async listDrivers() {
    return handle(supabase.from("drivers").select("*").is("deleted_at", null).order("name"), "listDrivers");
  },

  async addDriver({ name, phone }) {
    const actor = await getCurrentUserId();
    return handle(supabase.from("drivers").insert({ name, phone, created_by: actor }).select().single(), "addDriver");
  },

  async updateDriver(driverId, fields) {
    const actor = await getCurrentUserId();
    return handle(supabase.from("drivers").update({ ...fields, updated_by: actor }).eq("id", driverId).select().single(), "updateDriver");
  },

  /** Soft-delete via RPC SECURITY DEFINER (UPDATE direto de deleted_at é
   *  recusado pela RLS — ver database/retrofit-soft-delete-rpc.sql). */
  async removeDriver(driverId) {
    const { data, error } = await supabase.rpc("rpc_soft_delete_driver", { p_id: driverId });
    if (error) throw new ServiceError(`removeDriver: ${error.message}`, { cause: error, retryable: isNetworkish(error) });
    if (!data?.success) throw new ServiceError(data?.message || "Não foi possível remover o motorista.", { retryable: false });
    return data;
  },
};
