// src/services/botLearningService.js
//
// Aprendizado do bot (database/64-sombra-aprende.sql): lições que ele extraiu das
// conversas observadas e anotações dos clientes recorrentes. A leitura é de admin/atendente; revisar
// (aprovar, recusar, editar) é só do admin; "Aprender agora" chama a Edge
// Function bot-aprender (também só admin).

import { ServiceError, getCurrentUserId, supabase } from "../lib/supabaseClient";

function isNetworkish(error) {
  return /fetch|network|timeout/i.test(error?.message || "");
}

export const botLearningService = {
  async list() {
    const { data, error } = await supabase
      .from("bot_learnings")
      .select(
        "id, kind, title, content, status, needs_review, evidence_count, first_seen_at, last_seen_at, reviewed_at, proposed_content, proposed_at",
      )
      .order("last_seen_at", { ascending: false })
      .limit(300);
    if (error) {
      throw new ServiceError(`list: ${error.message}`, {
        cause: error,
        retryable: isNetworkish(error),
      });
    }
    return data ?? [];
  },

  async stats() {
    const { data, error } = await supabase.rpc("rpc_bot_learning_stats");
    if (error) {
      throw new ServiceError(`stats: ${error.message}`, {
        cause: error,
        retryable: isNetworkish(error),
      });
    }
    if (!data?.success) {
      throw new ServiceError(data?.message || "Sem permissão.", { retryable: false });
    }
    return data;
  },

  async update(id, fields) {
    const { error } = await supabase.from("bot_learnings").update(fields).eq("id", id);
    if (error) {
      throw new ServiceError(`update: ${error.message}`, {
        cause: error,
        retryable: isNetworkish(error),
      });
    }
  },

  /** Anotações dos clientes recorrentes (só admin). */
  async listNotes() {
    const { data, error } = await supabase
      .from("bot_customer_notes")
      .select(
        "id, customer_id, notes, status, evidence_count, last_seen_at, customer:customers(name)",
      )
      .order("last_seen_at", { ascending: false })
      .limit(300);
    if (error) {
      throw new ServiceError(`listNotes: ${error.message}`, {
        cause: error,
        retryable: isNetworkish(error),
      });
    }
    return (data ?? []).map((n) => ({ ...n, customer_name: n.customer?.name ?? "Cliente" }));
  },

  async updateNote(id, fields) {
    const { error } = await supabase.from("bot_customer_notes").update(fields).eq("id", id);
    if (error) {
      throw new ServiceError(`updateNote: ${error.message}`, {
        cause: error,
        retryable: isNetworkish(error),
      });
    }
  },

  async currentUserId() {
    return getCurrentUserId();
  },

  async learnNow() {
    const { data, error } = await supabase.functions.invoke("bot-aprender", { body: {} });
    if (error) {
      let msg = error.message;
      try {
        const body = await error.context?.json?.();
        if (body?.message) msg = body.message;
      } catch {
        /* usa error.message */
      }
      throw new ServiceError(`learnNow: ${msg}`, { cause: error, retryable: false });
    }
    if (!data?.success) {
      throw new ServiceError(data?.message || "Não foi possível aprender agora.", {
        retryable: false,
      });
    }
    return data.resumo;
  },
};
