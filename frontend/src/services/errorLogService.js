// src/services/errorLogService.js
//
// Log de erros do app (database/36 + 47) — só admin lê/resolve.
// Alimentado pelo logTecnico() em lib/erros.js. Por padrão só traz os
// não resolvidos, mesmo espírito de Pendências: resolvido some da lista.

import { ServiceError, getCurrentUserId, supabase } from "../lib/supabaseClient";

export const errorLogService = {
  async list({ limit = 50 } = {}) {
    const { data, error } = await supabase
      .from("app_error_log")
      .select("id, at, user_id, message, code, context, url")
      .is("resolved_at", null)
      .order("at", { ascending: false })
      .limit(limit);
    if (error) {
      throw new ServiceError(`errorLog.list: ${error.message}`, {
        cause: error,
        retryable: /fetch|network|timeout/i.test(error.message || ""),
      });
    }
    return data ?? [];
  },

  async resolve(id) {
    const actor = await getCurrentUserId();
    const { data, error } = await supabase
      .from("app_error_log")
      .update({ resolved_at: new Date().toISOString(), resolved_by: actor })
      .eq("id", id)
      .select()
      .single();
    if (error) {
      throw new ServiceError(`errorLog.resolve: ${error.message}`, {
        cause: error,
        retryable: /fetch|network|timeout/i.test(error.message || ""),
      });
    }
    return data;
  },
};
