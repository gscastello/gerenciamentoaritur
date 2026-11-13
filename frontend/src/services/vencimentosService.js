// src/services/vencimentosService.js
//
// Calendário de vencimentos (issues #366 e #369, database/101): imposto,
// documentos dos veículos, seguro, parcelas. Quitar passa pela RPC, que já
// agenda o próximo quando a conta se repete. Remover é soft delete.

import { ServiceError, getCurrentUserId, supabase } from "../lib/supabaseClient";

function isNetworkish(error) {
  return /fetch|network|timeout/i.test(error?.message || "");
}
async function handle(promise, context) {
  const { data, error } = await promise;
  if (error)
    throw new ServiceError(`${context}: ${error.message}`, {
      cause: error,
      retryable: isNetworkish(error),
    });
  return data;
}

export const vencimentosService = {
  /** Abertos e os quitados dos últimos 60 dias. */
  async listar() {
    const desde = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
    return handle(
      supabase
        .from("vencimentos")
        .select(
          "id, titulo, categoria, vehicle_id, vence_em, valor, recorrencia, avisar_dias, quitado_em, notas",
        )
        .or(`quitado_em.is.null,quitado_em.gte.${desde}`)
        .order("vence_em"),
      "listarVencimentos",
    );
  },

  async criar(dados) {
    const actor = await getCurrentUserId();
    return handle(
      supabase
        .from("vencimentos")
        .insert({ ...dados, created_by: actor })
        .select()
        .single(),
      "criarVencimento",
    );
  },

  async quitar(id) {
    const data = await handle(
      supabase.rpc("rpc_quitar_vencimento", { p_id: id }),
      "quitarVencimento",
    );
    if (!data?.success) throw new ServiceError(data?.message || "Não foi possível quitar.");
    return data;
  },

  async remover(id) {
    return handle(
      supabase.from("vencimentos").update({ deleted_at: new Date().toISOString() }).eq("id", id),
      "removerVencimento",
    );
  },

  /** Receitas desde `desde` (para a estimativa do DAS). */
  async receitasDesde(desde) {
    return handle(
      supabase
        .from("financial_entries")
        .select("entry_date, amount, type")
        .eq("type", "receita")
        .gte("entry_date", desde),
      "receitasDesde",
    );
  },
};
