// src/services/reservationBackupsService.js
//
// Backup diário das reservas do dia (database/60-backup-diario-reservas.sql).
// O servidor grava sozinho às 23h55 (São Luís); esta camada só lista, busca
// o retrato de um dia e dispara "fazer agora".

import { ServiceError, supabase } from "../lib/supabaseClient";

function isNetworkish(error) {
  return /fetch|network|timeout/i.test(error?.message || "");
}

export const reservationBackupsService = {
  /** Metadados dos dias com backup (sem o retrato, que pode ser grande). */
  async list(limit = 60) {
    const { data, error } = await supabase
      .from("reservation_day_backups")
      .select(
        "id, backup_date, taken_at, origem, reservas_total, reservas_canceladas, passagens, size_bytes",
      )
      .order("backup_date", { ascending: false })
      .limit(limit);
    if (error) {
      throw new ServiceError(`list: ${error.message}`, {
        cause: error,
        retryable: isNetworkish(error),
      });
    }
    return data ?? [];
  },

  /** O retrato (jsonb) de um dia específico. */
  async getById(id) {
    const { data, error } = await supabase
      .from("reservation_day_backups")
      .select("data")
      .eq("id", id)
      .single();
    if (error) {
      throw new ServiceError(`getById: ${error.message}`, {
        cause: error,
        retryable: isNetworkish(error),
      });
    }
    return data?.data;
  },

  /** Faz (ou refaz) o backup de um dia agora; sem data = hoje. */
  async runNow(date = null) {
    const { data, error } = await supabase.rpc("rpc_backup_reservas_do_dia", { p_date: date });
    if (error) {
      throw new ServiceError(`runNow: ${error.message}`, {
        cause: error,
        retryable: isNetworkish(error),
      });
    }
    if (!data?.success) {
      throw new ServiceError(data?.message || "Não foi possível fazer o backup.", {
        retryable: false,
      });
    }
    return data;
  },
};
