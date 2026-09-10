// src/services/errorLogService.js
//
// Log de erros do app (database/36) — só admin lê. Alimentado pelo
// logTecnico() em lib/erros.js.

import { supabase, ServiceError } from "../lib/supabaseClient";

export const errorLogService = {
  async list({ limit = 50 } = {}) {
    const { data, error } = await supabase
      .from("app_error_log")
      .select("id, at, user_id, message, code, context, url")
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
};
