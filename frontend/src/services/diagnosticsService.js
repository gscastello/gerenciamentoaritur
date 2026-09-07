// src/services/diagnosticsService.js
//
// Diagnóstico de reservas no servidor (database/20-diagnostico-reservas.sql,
// issue #9). O mesmo conjunto de checagens do `domain/diagnostics.js` roda
// como job agendado (pg_cron, de 6 em 6h) e também sob demanda daqui, só
// para admin (rpc_run_reservation_diagnostics faz a checagem de papel).
//
// A única correção automática é re-sincronizar `reservations.quantity` com
// a contagem real de passageiros — sempre auditada em audit_logs pela
// trigger. Overbooking, ponto removido, telefone ausente etc. são só
// reportados (viram alerta interno em `notifications`).

import { supabase, ServiceError } from "../lib/supabaseClient";

function isNetworkish(error) {
  return /fetch|network|timeout/i.test(error?.message || "");
}

export const diagnosticsService = {
  /** Roda o job agora (corrige o seguro, enfileira o resto). Só admin. */
  async runNow() {
    const { data, error } = await supabase.rpc("rpc_run_reservation_diagnostics");
    if (error) {
      throw new ServiceError(`runNow: ${error.message}`, { cause: error, retryable: isNetworkish(error) });
    }
    if (!data?.success) {
      throw new ServiceError(data?.message || "Não foi possível rodar o diagnóstico.", { retryable: false });
    }
    return data; // { success, corrigidas, novos_alertas, por_tipo }
  },

  /** Achados atuais (view v_diagnostico_reservas — RLS por papel). */
  async listFindings() {
    const { data, error } = await supabase
      .from("v_diagnostico_reservas")
      .select("kind, reservation_id, trip_id, detail");
    if (error) {
      throw new ServiceError(`listFindings: ${error.message}`, { cause: error, retryable: isNetworkish(error) });
    }
    return data ?? [];
  },
};
