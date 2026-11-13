// src/services/fechamentoService.js
//
// Fechamento do mês (issue #365, database/105): o pacote do banco, as receitas
// dos meses anteriores (para a estimativa do DAS) e a URL assinada da foto de
// cada nota (bucket privado `notas`, database/99).

import { ServiceError, supabase } from "../lib/supabaseClient";

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

export const fechamentoService = {
  async doMes(mes) {
    return handle(supabase.rpc("rpc_fechamento_do_mes", { p_mes: mes }), "fechamentoDoMes");
  },

  async receitasDesde(desde, ate) {
    return handle(
      supabase
        .from("financial_entries")
        .select("entry_date, amount, type")
        .eq("type", "receita")
        .gte("entry_date", desde)
        .lte("entry_date", ate)
        .is("deleted_at", null)
        .limit(10000),
      "receitasDoFechamento",
    );
  },

  async urlDaNota(arquivo) {
    const data = await handle(
      supabase.storage.from("notas").createSignedUrl(arquivo, 600),
      "urlDaNota",
    );
    return data.signedUrl;
  },
};
