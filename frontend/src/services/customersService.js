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

  /**
   * Lista agregada do CRM (v_customers_stats, database/37) — paginada e
   * com busca no servidor. `range` é [de, ate] inclusivo (PostgREST).
   * Devolve { linhas, total }.
   */
  async listStats({ search, de = 0, ate = 24 } = {}) {
    let query = supabase
      .from("v_customers_stats")
      .select(
        "customer_id, nome, telefone, notes, bairro_padrao, viagens_count, total_passagens, cancelamentos, nao_compareceu, total_gasto, ultima_data, reservas_total",
        { count: "exact" },
      )
      .order("total_gasto", { ascending: false })
      .order("ultima_data", { ascending: false, nullsFirst: false })
      .range(de, ate);
    if (search) {
      const termo = String(search).replace(/[,()*:\\%]/g, " ").trim().slice(0, 80);
      if (termo) query = query.or(`nome.ilike.%${termo}%,telefone.ilike.%${termo}%`);
    }
    const { data, error, count } = await query;
    if (error) {
      throw new ServiceError(`listStats: ${error.message}`, {
        cause: error,
        retryable: isNetworkish(error),
      });
    }
    return { linhas: data ?? [], total: count ?? (data?.length ?? 0) };
  },

  /**
   * Histórico "achatado" de UM cliente (v_reservations_flat) — carregado
   * só quando o card do passageiro abre. Traz os campos de endereço para
   * calcular os endereços mais usados.
   */
  async getHistoryFlat(customerId) {
    return handle(
      supabase
        .from("v_reservations_flat")
        .select(
          "id, data, direcao, status, quantidade, valorTotal, bairro, localExato, rua, referencia, desembarque, pontoId, criadoEm",
        )
        .eq("customer_id", customerId)
        .order("criadoEm", { ascending: false })
        .limit(400),
      "getHistoryFlat",
    );
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
