// src/services/financeService.js
import { supabase, getCurrentUserId, ServiceError } from "../lib/supabaseClient";

function isNetworkish(error) { return /fetch|network|timeout/i.test(error?.message || ""); }
async function handle(promise, context) {
  const { data, error } = await promise;
  if (error) throw new ServiceError(`${context}: ${error.message}`, { cause: error, retryable: isNetworkish(error) });
  return data;
}

export const financeService = {
  async listByDate(entryDate) {
    return handle(
      supabase.from("financial_entries").select("*").eq("entry_date", entryDate).is("deleted_at", null).order("created_at"),
      "listByDate"
    );
  },

  async listByMonth(year, month /* 1-12 */) {
    const first = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const last = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    return handle(
      supabase.from("financial_entries").select("*").gte("entry_date", first).lte("entry_date", last).is("deleted_at", null),
      "listByMonth"
    );
  },

  /** Ano inteiro — usado pra "lucro real anual" do Dashboard. */
  async listByYear(year) {
    return handle(
      supabase
        .from("financial_entries")
        .select("*")
        .gte("entry_date", `${year}-01-01`)
        .lte("entry_date", `${year}-12-31`)
        .is("deleted_at", null),
      "listByYear"
    );
  },

  /**
   * Lançamento manual (receita/despesa). Combustível e manutenção NUNCA
   * são lançados por aqui — eles entram sozinhos via trigger quando um
   * fuel_record/maintenance é criado (ver operationService), o que
   * elimina a dupla contagem que existia na versão anterior.
   */
  async addManualEntry({ entryDate, type, category, amount, description, reservationId }) {
    const actor = await getCurrentUserId();
    return handle(
      supabase
        .from("financial_entries")
        .insert({
          entry_date: entryDate, type, category: category ?? "outro", amount, description,
          reservation_id: reservationId ?? null, created_by: actor,
        })
        .select()
        .single(),
      "addManualEntry"
    );
  },

  async update(entryId, fields) {
    const actor = await getCurrentUserId();
    return handle(
      supabase.from("financial_entries").update({ ...fields, updated_by: actor }).eq("id", entryId).select().single(),
      "update"
    );
  },

  /**
   * Soft-delete via RPC SECURITY DEFINER: um UPDATE direto de `deleted_at`
   * é recusado pela RLS desta instância (a policy de SELECT vira WITH
   * CHECK no UPDATE). Ver database/retrofit-soft-delete-rpc.sql.
   */
  async softDelete(entryId) {
    const { data, error } = await supabase.rpc("rpc_soft_delete_financial_entry", { p_id: entryId });
    if (error) throw new ServiceError(`softDelete: ${error.message}`, { cause: error, retryable: isNetworkish(error) });
    if (!data?.success) throw new ServiceError(data?.message || "Não foi possível remover o lançamento.", { retryable: false });
    return data;
  },

  /** Lucro real do dia = receitas − despesas manuais − combustível − manutenção (tudo já em financial_entries). */
  async getDaySummary(entryDate) {
    const entries = await this.listByDate(entryDate);
    const revenue = entries.filter((e) => e.type === "receita").reduce((s, e) => s + Number(e.amount), 0);
    const expenses = entries.filter((e) => e.type === "despesa").reduce((s, e) => s + Number(e.amount), 0);
    return { revenue, expenses, profit: revenue - expenses, entries };
  },
};
