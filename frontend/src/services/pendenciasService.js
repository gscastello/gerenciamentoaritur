// src/services/pendenciasService.js
//
// Pendências de atendimento (fila da equipe) — ver
// database/32-pendencias-atendimento.sql. Uma pendência = um atendimento
// que precisa da equipe (bot transferiu p/ humano, ou alguém abriu
// manualmente). Fica aberta até "Resolver".

import { supabase, ServiceError } from "../lib/supabaseClient";

function isNetworkish(error) {
  return /fetch|network|timeout/i.test(error?.message || "");
}

export const pendenciasService = {
  /** Pendências abertas (mais recentes primeiro). */
  async list() {
    const { data, error } = await supabase
      .from("v_pendencias_atendimento")
      .select(
        "id, source, phone, customer_id, assunto, detail, status, meta, created_at, cliente, aberto_por",
      )
      .order("created_at", { ascending: false });
    if (error) {
      throw new ServiceError(`list: ${error.message}`, {
        cause: error,
        retryable: isNetworkish(error),
      });
    }
    return data ?? [];
  },

  /** Abre uma pendência manual ("ligar de volta para o cliente X"). */
  async abrir({ subject, detail, phone, customerId }) {
    const { data, error } = await supabase.rpc("rpc_open_support_ticket", {
      p_subject: subject,
      p_detail: detail ?? "",
      p_phone: phone ?? null,
      p_customer_id: customerId ?? null,
      p_source: "manual",
    });
    if (error) {
      throw new ServiceError(`abrir: ${error.message}`, {
        cause: error,
        retryable: isNetworkish(error),
      });
    }
    if (data && data.success === false) {
      throw new ServiceError(data.message || "Não foi possível abrir a pendência.", {
        retryable: false,
      });
    }
    return data;
  },

  /** Marca como resolvida. */
  async resolver(id) {
    const { data, error } = await supabase.rpc("rpc_resolve_support_ticket", { p_id: id });
    if (error) {
      throw new ServiceError(`resolver: ${error.message}`, {
        cause: error,
        retryable: isNetworkish(error),
      });
    }
    if (data && data.success === false) {
      throw new ServiceError(data.message || "Não foi possível resolver a pendência.", {
        retryable: false,
      });
    }
    return data;
  },
};
