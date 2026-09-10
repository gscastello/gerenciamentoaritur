// src/services/notificationsService.js
//
// Mural de notificações internas do app (sino) — ver
// database/31-notificacoes-app.sql. Uma linha por evento (lotação,
// cancelamento, mudança de embarque/desembarque); o estado "lida" é por
// usuário. Escrita só por trigger no banco; aqui só leitura + marcar
// como lida via RPC.

import { supabase, ServiceError } from "../lib/supabaseClient";

function isNetworkish(error) {
  return /fetch|network|timeout/i.test(error?.message || "");
}

const LIMITE = 60;

export const notificationsService = {
  /** Últimas notificações (com `lida` já resolvido para o usuário). */
  async list() {
    const { data, error } = await supabase
      .from("v_app_notifications")
      .select("id, kind, title, body, reservation_id, trip_date, direction, meta, created_at, lida")
      .order("created_at", { ascending: false })
      .limit(LIMITE);
    if (error) {
      throw new ServiceError(`list: ${error.message}`, {
        cause: error,
        retryable: isNetworkish(error),
      });
    }
    return data ?? [];
  },

  /** Marca um conjunto de notificações como lidas para o usuário atual. */
  async markRead(ids) {
    if (!ids || ids.length === 0) return;
    const { data, error } = await supabase.rpc("rpc_mark_notifications_read", { p_ids: ids });
    if (error) {
      throw new ServiceError(`markRead: ${error.message}`, {
        cause: error,
        retryable: isNetworkish(error),
      });
    }
    if (data && data.success === false) {
      throw new ServiceError(data.message || "Não foi possível marcar como lida.", {
        retryable: false,
      });
    }
  },

  /** Marca todas como lidas para o usuário atual. */
  async markAllRead() {
    const { data, error } = await supabase.rpc("rpc_mark_all_notifications_read");
    if (error) {
      throw new ServiceError(`markAllRead: ${error.message}`, {
        cause: error,
        retryable: isNetworkish(error),
      });
    }
    if (data && data.success === false) {
      throw new ServiceError(data.message || "Não foi possível marcar todas como lidas.", {
        retryable: false,
      });
    }
  },
};
