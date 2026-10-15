// src/services/botKnowledgeService.js
//
// Base de conhecimento do bot de WhatsApp (database/50-...sql): assuntos
// editáveis que o bot pode usar pra responder. Remoção é soft-delete.

import { ServiceError, getCurrentUserId, supabase } from "../lib/supabaseClient";

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

export const botKnowledgeService = {
  async list() {
    return handle(
      supabase
        .from("bot_knowledge")
        .select("id, title, content, active, sort_order")
        .is("deleted_at", null)
        .order("sort_order")
        .order("title"),
      "list",
    );
  },

  async create({ title, content }) {
    const actor = await getCurrentUserId();
    return handle(
      supabase
        .from("bot_knowledge")
        .insert({ title, content, created_by: actor, updated_by: actor })
        .select()
        .single(),
      "create",
    );
  },

  async update(id, fields) {
    const actor = await getCurrentUserId();
    return handle(
      supabase
        .from("bot_knowledge")
        .update({ ...fields, updated_by: actor })
        .eq("id", id)
        .select()
        .single(),
      "update",
    );
  },

  async remove(id) {
    const actor = await getCurrentUserId();
    const { error } = await supabase
      .from("bot_knowledge")
      .update({ deleted_at: new Date().toISOString(), updated_by: actor })
      .eq("id", id);
    if (error)
      throw new ServiceError(`remove: ${error.message}`, {
        cause: error,
        retryable: isNetworkish(error),
      });
  },
};
