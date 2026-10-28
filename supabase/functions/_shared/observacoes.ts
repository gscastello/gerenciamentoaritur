// supabase/functions/_shared/observacoes.ts
//
// Modo sombra OBSERVA: guarda o texto (só texto) do que o cliente escreveu, do
// que o atendente respondeu e do rascunho que o bot teria enviado. Melhor
// esforço — nunca pode derrubar o atendimento. Ver database/64-sombra-aprende.sql.

import { supabaseAdmin } from "./supabaseAdmin.ts";

const MAX_CHARS = 2000;

export async function registrarObservacao(o: {
  conversationId?: string;
  chatwootConversationId: number;
  chatwootMessageId?: number;
  author: "cliente" | "equipe" | "bot_rascunho";
  content?: string;
}) {
  const content = (o.content ?? "").trim().slice(0, MAX_CHARS);
  if (!content) return;
  try {
    const linha = {
      conversation_id: o.conversationId ?? null,
      chatwoot_conversation_id: o.chatwootConversationId,
      chatwoot_message_id: o.chatwootMessageId ?? null,
      author: o.author,
      content,
    };
    // mensagem com id do Chatwoot: reenvio do webhook não duplica
    const { error } = o.chatwootMessageId
      ? await supabaseAdmin
          .from("bot_observations")
          .upsert(linha, { onConflict: "chatwoot_message_id", ignoreDuplicates: true })
      : await supabaseAdmin.from("bot_observations").insert(linha);
    if (error) console.error("Falha ao registrar observação:", error.message);
  } catch (err) {
    console.error("Falha ao registrar observação:", String(err).slice(0, 200));
  }
}
