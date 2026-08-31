// src/services/routePointsService.js
//
// Pontos de embarque/desembarque (route_points) e preço por bairro
// (neighborhood_pricing). Leitura é liberada para qualquer papel — o bot
// e o app precisam consultar horário/preço. Escrita é só admin (RLS).

import { supabase, getCurrentUserId, ServiceError } from "../lib/supabaseClient";

function isNetworkish(error) {
  return /fetch|network|timeout/i.test(error?.message || "");
}
async function handle(promise, context) {
  const { data, error } = await promise;
  if (error) {
    throw new ServiceError(`${context}: ${error.message}`, { cause: error, retryable: isNetworkish(error) });
  }
  return data;
}

export const routePointsService = {
  /** Pontos ativos de uma direção, na ordem de exibição. */
  async listByDirection(direction) {
    return handle(
      supabase
        .from("route_points")
        .select("id, direction, code, name, base_time, price, requires_detail, detail_label, boarding_window, is_core, display_order")
        .eq("direction", direction)
        .eq("active", true)
        .is("deleted_at", null)
        .order("display_order", { ascending: true }),
      "listByDirection",
    );
  },

  /** Todos os pontos (ida + volta) — usado na aba Sistema. */
  async listAll() {
    return handle(
      supabase
        .from("route_points")
        .select("*")
        .is("deleted_at", null)
        .order("direction", { ascending: true })
        .order("display_order", { ascending: true }),
      "listAll",
    );
  },

  async update(pointId, fields) {
    const actor = await getCurrentUserId();
    return handle(
      supabase.from("route_points").update({ ...fields, updated_by: actor }).eq("id", pointId).select().single(),
      "update",
    );
  },

  async addCustomPoint({ direction, name, baseTime, price }) {
    const actor = await getCurrentUserId();
    const code = `custom-${Date.now().toString(36)}`;
    return handle(
      supabase
        .from("route_points")
        .insert({
          direction, code, name, base_time: baseTime, price,
          is_core: false, requires_detail: false, active: true,
          display_order: 99, created_by: actor,
        })
        .select()
        .single(),
      "addCustomPoint",
    );
  },

  async removeCustomPoint(pointId) {
    const actor = await getCurrentUserId();
    return handle(
      supabase.from("route_points").update({ deleted_at: new Date().toISOString(), updated_by: actor }).eq("id", pointId).eq("is_core", false),
      "removeCustomPoint",
    );
  },

  // ---- precificação por bairro (Buscar em Casa) ------------------------

  async listNeighborhoodPricing() {
    return handle(
      supabase.from("neighborhood_pricing").select("id, neighborhood, price").order("neighborhood"),
      "listNeighborhoodPricing",
    );
  },

  /**
   * Preço de um bairro. `null` quando o bairro não está na tabela — a UI
   * então encaminha para um atendente confirmar o valor (nunca chuta).
   */
  async getNeighborhoodPrice(neighborhood) {
    if (!neighborhood?.trim()) return null;
    const { data, error } = await supabase
      .from("neighborhood_pricing")
      .select("price")
      .ilike("neighborhood", neighborhood.trim())
      .maybeSingle();
    if (error) throw new ServiceError(`getNeighborhoodPrice: ${error.message}`, { cause: error, retryable: isNetworkish(error) });
    return data?.price ?? null;
  },
};
