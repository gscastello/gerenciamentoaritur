// src/services/atendimentoService.js
//
// Painel de atendimento do WhatsApp (database/52). O estado da fila vem do
// espelho que a Edge Function `chatwoot-bot` grava em whatsapp_conversations
// (status no Chatwoot, quem falou por último, prévia) — o navegador nunca
// fala com a API do Chatwoot nem guarda token dela.

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

export const atendimentoService = {
  /** Conversas ainda em andamento (abertas = com a equipe; pendentes = com o bot). */
  async listarConversas() {
    return handle(
      supabase
        .from("v_atendimento_whatsapp")
        .select(
          "conversation_id, chatwoot_conversation_id, phone, nome_whatsapp, customer_id, nome_cadastro, status, modo, last_message_by, previa, last_message_at, aguardando_equipe",
        )
        .in("status", ["open", "pending"])
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(100),
      "listarConversas",
    );
  },

  /** Perguntas que o bot não soube responder e ninguém tratou ainda. */
  async listarPerguntas() {
    return handle(
      supabase
        .from("bot_unanswered")
        .select("id, question, reason, created_at")
        .is("resolved_at", null)
        .order("created_at", { ascending: false })
        .limit(50),
      "listarPerguntas",
    );
  },

  async resolverPergunta(id) {
    const actor = await getCurrentUserId();
    const { error } = await supabase
      .from("bot_unanswered")
      .update({ resolved_at: new Date().toISOString(), resolved_by: actor })
      .eq("id", id);
    if (error)
      throw new ServiceError(`resolverPergunta: ${error.message}`, {
        cause: error,
        retryable: isNetworkish(error),
      });
  },
};
