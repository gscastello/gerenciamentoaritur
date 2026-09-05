// src/services/customersService.js
import { supabase, getCurrentUserId, ServiceError } from "../lib/supabaseClient";

function isNetworkish(error) { return /fetch|network|timeout/i.test(error?.message || ""); }
async function handle(promise, context) {
  const { data, error } = await promise;
  if (error) throw new ServiceError(`${context}: ${error.message}`, { cause: error, retryable: isNetworkish(error) });
  return data;
}

const CUSTOMER_COLS = "id, name, phone, notes, default_neighborhood, created_at";

export const customersService = {
  async list({ search } = {}) {
    let query = supabase
      .from("customers")
      .select(CUSTOMER_COLS)
      .is("deleted_at", null)
      .order("name");
    if (search) {
      // `.or()` do PostgREST usa vírgula/parênteses como sintaxe: tirar
      // esses caracteres evita que um termo de busca "vaze" para
      // condições extras. Sobra texto puro para o ilike (limitado a 80).
      const termo = String(search)
        .replace(/[,()*:\\%]/g, " ")
        .trim()
        .slice(0, 80);
      if (termo) query = query.or(`name.ilike.%${termo}%,phone.ilike.%${termo}%`);
    }
    return handle(query, "list");
  },

  async getByPhone(phone) {
    return handle(
      supabase.from("customers").select(CUSTOMER_COLS).eq("phone", phone).is("deleted_at", null).maybeSingle(),
      "getByPhone",
    );
  },

  /** Histórico + total gerado, calculado no banco para não depender de somar tudo no cliente. */
  async getHistory(customerId) {
    return handle(
      supabase
        .from("reservations")
        .select("id, status, quantity, total_price, created_at, trip:trips(trip_date, direction)")
        .eq("customer_id", customerId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      "getHistory"
    );
  },

  async updateNotes(customerId, notes) {
    const actor = await getCurrentUserId();
    return handle(
      supabase.from("customers").update({ notes, updated_by: actor }).eq("id", customerId).select().single(),
      "updateNotes"
    );
  },

  async upsertByPhone({ name, phone, defaultNeighborhood }) {
    const actor = await getCurrentUserId();
    const existing = await this.getByPhone(phone);
    if (existing) {
      return handle(
        supabase
          .from("customers")
          .update({ name: name || existing.name, default_neighborhood: defaultNeighborhood ?? existing.default_neighborhood, updated_by: actor })
          .eq("id", existing.id)
          .select()
          .single(),
        "upsertByPhone(update)"
      );
    }
    return handle(
      supabase.from("customers").insert({ name, phone, default_neighborhood: defaultNeighborhood ?? null, created_by: actor }).select().single(),
      "upsertByPhone(insert)"
    );
  },
};
