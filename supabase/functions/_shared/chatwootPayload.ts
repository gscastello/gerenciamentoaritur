// supabase/functions/_shared/chatwootPayload.ts
//
// Lê o webhook do Chatwoot e decide se é uma mensagem de cliente que o bot
// deve tratar. O Agent Bot recebe TODO evento da caixa (mensagens enviadas
// pela equipe, notas privadas, mudanças de status…), então o filtro aqui é
// o que impede o bot de responder a si mesmo ou à equipe.
//
// Módulo sem dependências de propósito (testável sem env vars).

export type MensagemDeCliente = {
  chatwootMessageId: number;
  chatwootConversationId: number;
  statusConversa: string | null;
  /** E.164 sem "+", ex.: 5598981012388 */
  telefone: string;
  texto?: string;
  anexo?: { url: string; tipo: "audio" | "image" | "document" };
};

// biome-ignore lint/suspicious/noExplicitAny: payload externo do Chatwoot
export function extrairMensagemDeCliente(body: any, inboxIdEsperado = 0): MensagemDeCliente | null {
  if (body?.event !== "message_created") return null;
  // message_type chega como "incoming" (ou 0 em versões antigas)
  if (body.message_type !== "incoming" && body.message_type !== 0) return null;
  if (body.private) return null;

  const conv = body.conversation ?? {};
  const chatwootConversationId = Number(conv.id);
  const chatwootMessageId = Number(body.id);
  if (!chatwootConversationId || !chatwootMessageId) return null;
  if (inboxIdEsperado && Number(body.inbox?.id ?? conv.inbox_id) !== inboxIdEsperado) return null;

  const telefone = String(body.sender?.phone_number ?? conv.meta?.sender?.phone_number ?? "").replace(/\D/g, "");
  if (!telefone) return null;

  const a = body.attachments?.[0];
  const anexo = a?.data_url
    ? {
        url: String(a.data_url),
        tipo: (a.file_type === "audio" ? "audio" : a.file_type === "image" ? "image" : "document") as
          | "audio" | "image" | "document",
      }
    : undefined;

  return {
    chatwootMessageId,
    chatwootConversationId,
    statusConversa: typeof conv.status === "string" ? conv.status : null,
    telefone,
    texto: typeof body.content === "string" && body.content.trim() ? body.content : undefined,
    anexo,
  };
}
