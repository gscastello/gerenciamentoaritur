// src/services/settingsService.js
//
// Configuração chave/valor (tabela `settings`). Leitura liberada
// (RLS `settings_select using (true)`); escrita só admin.
//
// Chaves usadas hoje (ver database/05-seed.sql):
//   monday_adjustment   {"active": true, "hours": 1}
//   attendance_mode     {"mode": "ia"}          -- 'ia' | 'manual'
//   pix                 {"key": "...", "name": "..."}
//   intermediate_cities [...]
//   served_cities       [...]

import { supabase, getCurrentUserId, ServiceError } from "../lib/supabaseClient";

function isNetworkish(error) {
  return /fetch|network|timeout/i.test(error?.message || "");
}

export const settingsService = {
  /** Todas as configs, já como objeto { chave: valor }. */
  async getAll() {
    const { data, error } = await supabase.from("settings").select("key, value");
    if (error) throw new ServiceError(`getAll: ${error.message}`, { cause: error, retryable: isNetworkish(error) });
    return Object.fromEntries((data ?? []).map((row) => [row.key, row.value]));
  },

  async get(key) {
    const { data, error } = await supabase.from("settings").select("value").eq("key", key).maybeSingle();
    if (error) throw new ServiceError(`get(${key}): ${error.message}`, { cause: error, retryable: isNetworkish(error) });
    return data?.value ?? null;
  },

  /** Upsert de uma chave. Só admin (RLS). */
  async set(key, value) {
    const actor = await getCurrentUserId();
    const { data, error } = await supabase
      .from("settings")
      .upsert({ key, value, updated_by: actor }, { onConflict: "key" })
      .select()
      .single();
    if (error) throw new ServiceError(`set(${key}): ${error.message}`, { cause: error, retryable: isNetworkish(error) });
    return data;
  },

  /** Atalho: 'ia' | 'manual'. É o que o bot do WhatsApp consulta antes de responder. */
  async setAttendanceMode(mode) {
    return this.set("attendance_mode", { mode });
  },

  async setMondayAdjustment({ active, hours }) {
    return this.set("monday_adjustment", { active, hours });
  },
};
