// src/services/tripsService.js
import { supabase, getCurrentUserId, ServiceError } from "../lib/supabaseClient";

function isNetworkish(error) { return /fetch|network|timeout/i.test(error?.message || ""); }
async function handle(promise, context) {
  const { data, error } = await promise;
  if (error) throw new ServiceError(`${context}: ${error.message}`, { cause: error, retryable: isNetworkish(error) });
  return data;
}

export const tripsService = {
  /** Ida e Volta de um dia, já com ocupação calculada no banco (v_trip_occupancy). */
  async getDayOverview(tripDate) {
    return handle(
      supabase
        .from("v_trip_occupancy")
        .select("*")
        .eq("trip_date", tripDate),
      "getDayOverview"
    );
  },

  async getById(tripId) {
    return handle(supabase.from("trips").select("*").eq("id", tripId).single(), "getById");
  },

  /**
   * Consulta "só para exibir rápido" (ex.: "restam 3 vagas" antes mesmo de
   * o cliente terminar o formulário). NUNCA usar este valor para decidir
   * se pode confirmar — a decisão final é sempre da trigger de capacidade,
   * chamada dentro de reservationsService.create()/confirm()/move().
   */
  async getAvailability(tripDate, direction) {
    return handle(
      supabase
        .from("v_trip_occupancy")
        .select("*")
        .eq("trip_date", tripDate)
        .eq("direction", direction)
        .maybeSingle(),
      "getAvailability"
    );
  },

  async startTrip(tripId, { km, location }) {
    const actor = await getCurrentUserId();
    const { data, error } = await supabase.rpc("rpc_start_trip", { p_trip_id: tripId, p_km: km, p_location: location ?? null, p_actor: actor });
    if (error) throw new ServiceError(`startTrip: ${error.message}`, { cause: error, retryable: isNetworkish(error) });
    return data;
  },

  async finishTrip(tripId, { km, location }) {
    const actor = await getCurrentUserId();
    const { data, error } = await supabase.rpc("rpc_finish_trip", { p_trip_id: tripId, p_km: km, p_location: location ?? null, p_actor: actor });
    if (error) throw new ServiceError(`finishTrip: ${error.message}`, { cause: error, retryable: isNetworkish(error) });
    return data;
  },

  /**
   * Rede de segurança: garante que existam as linhas de Ida/Volta para os
   * próximos `days` dias, para a Agenda nunca aparecer vazia num dia sem
   * reserva (e "Iniciar viagem" sempre estar disponível). O trabalho real
   * é do pg_cron diário `ensure-upcoming-trips`; isto só cobre o caso de o
   * cron ter atrasado. Idempotente (index único parcial no banco).
   * Ver database/09-daily-trips.sql.
   */
  async ensureUpcoming(days = 14) {
    const { data, error } = await supabase.rpc("rpc_ensure_trips", { p_days: days });
    if (error) throw new ServiceError(`ensureUpcoming: ${error.message}`, { cause: error, retryable: isNetworkish(error) });
    return data;
  },

  async assignDriver(tripId, driverId) {
    const actor = await getCurrentUserId();
    return handle(
      supabase.from("trips").update({ driver_id: driverId, updated_by: actor }).eq("id", tripId).select().single(),
      "assignDriver"
    );
  },
};
