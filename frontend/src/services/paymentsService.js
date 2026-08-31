// src/services/paymentsService.js
import { supabase, getCurrentUserId, ServiceError } from "../lib/supabaseClient";

function isNetworkish(error) { return /fetch|network|timeout/i.test(error?.message || ""); }
async function handle(promise, context) {
  const { data, error } = await promise;
  if (error) throw new ServiceError(`${context}: ${error.message}`, { cause: error, retryable: isNetworkish(error) });
  return data;
}

export const paymentsService = {
  async listByReservation(reservationId) {
    return handle(
      supabase.from("payments").select("*").eq("reservation_id", reservationId).is("deleted_at", null).order("created_at"),
      "listByReservation"
    );
  },

  async listPendingForDate(tripDate) {
    return handle(
      supabase
        .from("payments")
        .select("*, reservation:reservations!inner(id, trip:trips!inner(trip_date), customer:customers(name, phone), total_price)")
        .eq("status", "pendente")
        .eq("reservation.trip.trip_date", tripDate)
        .is("deleted_at", null),
      "listPendingForDate"
    );
  },

  async create({ reservationId, amount, method }) {
    const actor = await getCurrentUserId();
    return handle(
      supabase
        .from("payments")
        .insert({ reservation_id: reservationId, amount, method, status: "pendente", created_by: actor })
        .select()
        .single(),
      "create"
    );
  },

  async markPaid(paymentId) {
    const actor = await getCurrentUserId();
    return handle(
      supabase
        .from("payments")
        .update({ status: "pago", paid_at: new Date().toISOString(), updated_by: actor })
        .eq("id", paymentId)
        .select()
        .single(),
      "markPaid"
    );
  },

  async markProofReceived(paymentId, received = true) {
    const actor = await getCurrentUserId();
    return handle(
      supabase.from("payments").update({ proof_received: received, updated_by: actor }).eq("id", paymentId).select().single(),
      "markProofReceived"
    );
  },

  /**
   * A tela operacional (Agenda) trata pagamento como um flag por reserva
   * ("pago" / "comprovante recebido"), não uma lista de parcelas. Estas
   * duas funções consolidam isso num único registro de `payments` por
   * reserva: cria se não existir, atualiza se existir.
   */
  async _ensureForReservation({ reservationId, amount, method }) {
    const actor = await getCurrentUserId();
    const existing = await handle(
      supabase.from("payments").select("*").eq("reservation_id", reservationId).is("deleted_at", null).order("created_at").limit(1),
      "_ensureForReservation(find)"
    );
    if (existing?.[0]) return existing[0];
    return handle(
      supabase
        .from("payments")
        .insert({ reservation_id: reservationId, amount: amount ?? 0, method: method ?? "dinheiro", status: "pendente", created_by: actor })
        .select()
        .single(),
      "_ensureForReservation(insert)"
    );
  },

  async setPaidForReservation({ reservationId, paid, amount, method }) {
    const actor = await getCurrentUserId();
    const row = await paymentsService._ensureForReservation({ reservationId, amount, method });
    return handle(
      supabase
        .from("payments")
        .update({
          status: paid ? "pago" : "pendente",
          paid_at: paid ? new Date().toISOString() : null,
          updated_by: actor,
        })
        .eq("id", row.id)
        .select()
        .single(),
      "setPaidForReservation"
    );
  },

  async setProofForReservation({ reservationId, received, amount, method }) {
    const actor = await getCurrentUserId();
    const row = await paymentsService._ensureForReservation({ reservationId, amount, method });
    return handle(
      supabase.from("payments").update({ proof_received: received, updated_by: actor }).eq("id", row.id).select().single(),
      "setProofForReservation"
    );
  },
};
