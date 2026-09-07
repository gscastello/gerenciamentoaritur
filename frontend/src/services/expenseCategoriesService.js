// src/services/expenseCategoriesService.js
//
// Categorias de despesa editáveis (ver database/22-categorias-de-despesa.sql).
// Usadas na aba Gestão (custos recorrentes + DRE) e no lançamento manual do
// Financeiro. `slug` é o id estável gravado em financial_entries.category /
// recurring_expense_templates.category.

import { supabase, ServiceError } from "../lib/supabaseClient";

function isNetworkish(error) {
  return /fetch|network|timeout/i.test(error?.message || "");
}
async function handle(promise, context) {
  const { data, error } = await promise;
  if (error) throw new ServiceError(`${context}: ${error.message}`, { cause: error, retryable: isNetworkish(error) });
  return data;
}

export const expenseCategoriesService = {
  async list() {
    return handle(
      supabase
        .from("expense_categories")
        .select("id, slug, label, grupo, kind, icon, sort_order, active")
        .is("deleted_at", null)
        .order("sort_order", { ascending: true })
        .order("label", { ascending: true }),
      "list",
    );
  },

  /** Cria (slug derivado do rótulo) ou atualiza pelo slug. Só admin/financeiro. */
  async upsert({ slug, label, grupo, kind, icon, sortOrder }) {
    const { data, error } = await supabase.rpc("rpc_upsert_expense_category", {
      p_slug: slug ?? null,
      p_label: label,
      p_grupo: grupo ?? "Estrutura",
      p_kind: kind ?? "gestao",
      p_icon: icon ?? null,
      p_sort_order: sortOrder ?? null,
    });
    if (error) throw new ServiceError(`upsert: ${error.message}`, { cause: error, retryable: isNetworkish(error) });
    if (!data?.success) throw new ServiceError(data?.message || "Não foi possível salvar a categoria.", { retryable: false });
    return data; // { success, id, slug }
  },

  /** Edição direta de campos (rótulo, grupo, sort_order, active). */
  async update(id, fields) {
    return handle(
      supabase.from("expense_categories").update(fields).eq("id", id).select().single(),
      "update",
    );
  },

  /** Soft-delete via RPC (bloqueia se houver custo recorrente ativo usando). */
  async remove(id) {
    const { data, error } = await supabase.rpc("rpc_soft_delete_expense_category", { p_id: id });
    if (error) throw new ServiceError(`remove: ${error.message}`, { cause: error, retryable: isNetworkish(error) });
    if (!data?.success) throw new ServiceError(data?.message || "Não foi possível remover a categoria.", { retryable: false });
    return data;
  },
};
