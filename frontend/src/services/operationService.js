// src/services/operationService.js
import { supabase, getCurrentUserId, ServiceError } from "../lib/supabaseClient";

function isNetworkish(error) { return /fetch|network|timeout/i.test(error?.message || ""); }
async function handle(promise, context) {
  const { data, error } = await promise;
  if (error) throw new ServiceError(`${context}: ${error.message}`, { cause: error, retryable: isNetworkish(error) });
  return data;
}

export const operationService = {
  // ---- combustível --------------------------------------------------
  async listFuelRecords({ vehicleId, from, to } = {}) {
    let q = supabase.from("fuel_records").select("*").is("deleted_at", null).order("record_date", { ascending: false });
    if (vehicleId) q = q.eq("vehicle_id", vehicleId);
    if (from) q = q.gte("record_date", from);
    if (to) q = q.lte("record_date", to);
    return handle(q, "listFuelRecords");
  },

  /** Cria o abastecimento — o lançamento financeiro de despesa é gerado sozinho pela trigger do banco. */
  async addFuelRecord({ vehicleId, tripId, recordDate, direction, km, liters, cost }) {
    const actor = await getCurrentUserId();
    return handle(
      supabase
        .from("fuel_records")
        .insert({ vehicle_id: vehicleId, trip_id: tripId ?? null, record_date: recordDate, direction: direction ?? null, km, liters, cost, created_by: actor })
        .select()
        .single(),
      "addFuelRecord"
    );
  },

  async updateFuelRecord(id, fields) {
    const actor = await getCurrentUserId();
    return handle(supabase.from("fuel_records").update({ ...fields, updated_by: actor }).eq("id", id).select().single(), "updateFuelRecord");
  },

  /** Soft-delete via RPC SECURITY DEFINER (UPDATE direto de deleted_at é
   *  recusado pela RLS — ver database/retrofit-soft-delete-rpc.sql). A
   *  despesa correspondente em financial_entries some junto. */
  async removeFuelRecord(id) {
    const { data, error } = await supabase.rpc("rpc_soft_delete_fuel_record", { p_id: id });
    if (error) throw new ServiceError(`removeFuelRecord: ${error.message}`, { cause: error, retryable: isNetworkish(error) });
    if (!data?.success) throw new ServiceError(data?.message || "Não foi possível remover o abastecimento.", { retryable: false });
    return data;
  },

  /** Consumo médio (km/L) e custo/km calculados no banco, não somando arrays no cliente. */
  async getFuelStats(vehicleId, { from, to } = {}) {
    const records = await this.listFuelRecords({ vehicleId, from, to });
    const totalKm = records.reduce((s, r) => s + Number(r.km || 0), 0);
    const totalLiters = records.reduce((s, r) => s + Number(r.liters || 0), 0);
    const totalCost = records.reduce((s, r) => s + Number(r.cost || 0), 0);
    return {
      totalKm, totalLiters, totalCost,
      avgConsumptionKmL: totalLiters > 0 ? totalKm / totalLiters : null,
      avgCostPerKm: totalKm > 0 ? totalCost / totalKm : 0,
    };
  },

  // ---- manutenção preventiva -----------------------------------------
  async listMaintenance(vehicleId) {
    return handle(
      supabase.from("maintenance").select("*").eq("vehicle_id", vehicleId).is("deleted_at", null).order("performed_at", { ascending: false }),
      "listMaintenance"
    );
  },

  /** O lançamento de despesa correspondente é criado sozinho pela trigger. */
  async addMaintenance({ vehicleId, type, performedAt, odometerKm, intervalKm, cost, notes }) {
    const actor = await getCurrentUserId();
    return handle(
      supabase
        .from("maintenance")
        .insert({ vehicle_id: vehicleId, type, performed_at: performedAt, odometer_km: odometerKm, interval_km: intervalKm, cost, notes, created_by: actor })
        .select()
        .single(),
      "addMaintenance"
    );
  },

  /** Soft-delete via RPC SECURITY DEFINER (ver removeFuelRecord). */
  async removeMaintenance(id) {
    const { data, error } = await supabase.rpc("rpc_soft_delete_maintenance", { p_id: id });
    if (error) throw new ServiceError(`removeMaintenance: ${error.message}`, { cause: error, retryable: isNetworkish(error) });
    if (!data?.success) throw new ServiceError(data?.message || "Não foi possível remover a manutenção.", { retryable: false });
    return data;
  },

  /** % do intervalo já rodado desde a última manutenção, somando fuel_records do mesmo veículo após a data. */
  async getMaintenanceStatus(maintenanceRecord) {
    const { data, error } = await supabase
      .from("fuel_records")
      .select("km")
      .eq("vehicle_id", maintenanceRecord.vehicle_id)
      .gte("record_date", maintenanceRecord.performed_at)
      .is("deleted_at", null);
    if (error) throw new ServiceError(`getMaintenanceStatus: ${error.message}`, { cause: error, retryable: isNetworkish(error) });
    const kmSince = (data || []).reduce((s, r) => s + Number(r.km || 0), 0);
    const pct = maintenanceRecord.interval_km ? Math.min(100, Math.round((kmSince / maintenanceRecord.interval_km) * 100)) : 0;
    return { kmSince, pct, overdue: pct >= 100, dueSoon: pct >= 80 && pct < 100 };
  },

  // ---- ocorrências operacionais ---------------------------------------
  async addOccurrence({ tripId, vehicleId, type, severity, description }) {
    const actor = await getCurrentUserId();
    return handle(
      supabase
        .from("operational_occurrences")
        .insert({ trip_id: tripId ?? null, vehicle_id: vehicleId ?? null, type, severity: severity ?? "baixa", description, created_by: actor })
        .select()
        .single(),
      "addOccurrence"
    );
  },

  async listOccurrences({ tripId } = {}) {
    let q = supabase.from("operational_occurrences").select("*").is("deleted_at", null).order("occurred_at", { ascending: false });
    if (tripId) q = q.eq("trip_id", tripId);
    return handle(q, "listOccurrences");
  },
};
