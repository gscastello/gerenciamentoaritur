// src/services/recurringExpensesService.js
//
// Custos recorrentes da empresa (aba Gestão Operacional): salários, pró-
// labore, impostos, taxas, seguro, IPVA, pneus, etc. Cada template é
// lançado sozinho toda competência pelo job do banco
// (fn_generate_recurring_expenses / cron) — ver
// database/19-gestao-operacional.sql. A linha gerada é um financial_entries
// comum e continua editável pela aba Financeiro.

import { supabase, getCurrentUserId, ServiceError } from "../lib/supabaseClient";

function isNetworkish(error) {
  return /fetch|network|timeout/i.test(error?.message || "");
}
async function handle(promise, context) {
  const { data, error } = await promise;
  if (error)
    throw new ServiceError(`${context}: ${error.message}`, { cause: error, retryable: isNetworkish(error) });
  return data;
}

export const recurringExpensesService = {
  async list() {
    return handle(
      supabase
        .from("recurring_expense_templates")
        .select("*")
        .is("deleted_at", null)
        .order("category", { ascending: true }),
      "list",
    );
  },

  async create({ category, label, amount, frequency, dueDay, dueMonth, notes }) {
    const actor = await getCurrentUserId();
    return handle(
      supabase
        .from("recurring_expense_templates")
        .insert({
          category,
          label,
          amount,
          frequency,
          due_day: dueDay ?? 1,
          due_month: frequency === "anual" ? (dueMonth ?? 1) : null,
          notes: notes ?? null,
          created_by: actor,
        })
        .select()
        .single(),
      "create",
    );
  },

  /** Edição direta (valor, descrição, dia, ativo…). Campos em snake_case. */
  async update(id, fields) {
    const actor = await getCurrentUserId();
    return handle(
      supabase
        .from("recurring_expense_templates")
        .update({ ...fields, updated_by: actor })
        .eq("id", id)
        .select()
        .single(),
      "update",
    );
  },

  /** Soft-delete via RPC (a RLS recusa UPDATE direto de deleted_at). */
  async remove(id) {
    const { data, error } = await supabase.rpc("rpc_soft_delete_recurring_template", { p_id: id });
    if (error)
      throw new ServiceError(`remove: ${error.message}`, { cause: error, retryable: isNetworkish(error) });
    if (!data?.success)
      throw new ServiceError(data?.message || "Não foi possível remover o custo recorrente.", { retryable: false });
    return data;
  },

  /** "Gerar agora" — lança as competências vencidas de todos os templates ativos. */
  async runNow() {
    const { data, error } = await supabase.rpc("rpc_run_recurring_expenses");
    if (error)
      throw new ServiceError(`runNow: ${error.message}`, { cause: error, retryable: isNetworkish(error) });
    if (!data?.success)
      throw new ServiceError(data?.message || "Não foi possível gerar os lançamentos.", { retryable: false });
    return data;
  },
};
