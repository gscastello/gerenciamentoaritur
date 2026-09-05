// src/services/backupService.js
//
// Backup completo — gerado pelo servidor (rpc_generate_backup), nunca a
// partir do que já está carregado no navegador. Ver
// database/17-backup-completo.sql. Um cron diário (fn_run_scheduled_backup)
// grava automaticamente em system_backups; esta camada só lê/dispara.

import { supabase, ServiceError } from "../lib/supabaseClient";

function isNetworkish(error) {
  return /fetch|network|timeout/i.test(error?.message || "");
}

export const backupService = {
  /**
   * Gera um backup completo AGORA (todas as tabelas de negócio, inclusive
   * linhas apagadas), grava em system_backups (origem "manual") e devolve
   * o jsonb inteiro pra oferecer o download na hora. Só admin (RLS/RPC).
   */
  async generateNow() {
    const { data, error } = await supabase.rpc("rpc_generate_backup");
    if (error) {
      throw new ServiceError(`generateNow: ${error.message}`, {
        cause: error,
        retryable: isNetworkish(error),
      });
    }
    if (!data?.success) {
      throw new ServiceError(data?.message || "Não foi possível gerar o backup.", {
        retryable: false,
      });
    }
    return data;
  },

  /** Histórico (metadados só — sem o payload, que pode ser grande). */
  async list(limit = 30) {
    const { data, error } = await supabase
      .from("system_backups")
      .select("id, created_at, origem, tamanho_bytes")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      throw new ServiceError(`list: ${error.message}`, { cause: error, retryable: isNetworkish(error) });
    }
    return data ?? [];
  },

  /** O jsonb completo de um backup específico do histórico. */
  async getById(id) {
    const { data, error } = await supabase
      .from("system_backups")
      .select("payload")
      .eq("id", id)
      .single();
    if (error) {
      throw new ServiceError(`getById: ${error.message}`, { cause: error, retryable: isNetworkish(error) });
    }
    return data?.payload;
  },
};
