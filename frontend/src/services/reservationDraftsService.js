// src/services/reservationDraftsService.js
//
// Reservas PREPARADAS pela IA (database/72, issue #254). O bot lê as conversas
// do WhatsApp e, quando o cliente já mandou data e endereço, grava um rascunho.
// Aqui a equipe só lê e descarta: lançar é criar a reserva normal (o gatilho
// do banco tira o rascunho da lista sozinho).

import { ServiceError, supabase } from "../lib/supabaseClient";

function isNetworkish(error) {
  return /fetch|network|timeout/i.test(error?.message || "");
}

export const reservationDraftsService = {
  /** Rascunhos prontos de hoje em diante, a viagem mais próxima primeiro. */
  async listarProntos(hoje) {
    const { data, error } = await supabase
      .from("reservation_drafts")
      .select(
        "id, conversation_id, chatwoot_conversation_id, customer_id, phone, customer_name, type, trip_date, direction, route_point_code, pickup_neighborhood, pickup_detail, dropoff_location, dropoff_area, quantity, client_excerpt, notes, updated_at",
      )
      .eq("status", "pronta")
      .gte("trip_date", hoje)
      .order("trip_date", { ascending: true })
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error)
      throw new ServiceError(`listarRascunhos: ${error.message}`, {
        cause: error,
        retryable: isNetworkish(error),
      });
    return data ?? [];
  },

  async descartar(id) {
    const { data, error } = await supabase.rpc("rpc_descartar_rascunho_de_reserva", {
      p_draft_id: id,
    });
    if (error)
      throw new ServiceError(`descartarRascunho: ${error.message}`, {
        cause: error,
        retryable: isNetworkish(error),
      });
    if (!data?.success) throw new ServiceError(data?.message || "Não foi possível descartar.");
  },
};
