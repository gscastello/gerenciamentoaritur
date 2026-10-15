// supabase/functions/_shared/chatwootPayload.ts
//
// Lê o webhook do Chatwoot e decide se é uma mensagem de cliente que o bot
// deve tratar. O Agent Bot recebe TODO evento da caixa (mensagens enviadas
// pela equipe, notas privadas, mudanças de status…), então o filtro aqui é
// o que impede o bot de responder a si mesmo ou à equipe.
//
// Módulo sem dependências de propósito (testável sem env vars).

export type TipoAnexo = "audio" | "image" | "document" | "sticker";

/**
 * Figurinha do WhatsApp chega do Chatwoot como imagem WebP. Foto de verdade
 * (comprovante, print) vem como JPEG/PNG — então WebP = figurinha.
 */
// biome-ignore lint/suspicious/noExplicitAny: anexo externo do Chatwoot
export function tipoDoAnexo(a: any): TipoAnexo {
  if (a?.file_type === "audio") return "audio";
  if (a?.file_type === "image") {
    const ext = String(a.extension ?? "").toLowerCase().replace(".", "");
    const url = String(a.data_url ?? "").split("?")[0].toLowerCase();
    return ext === "webp" || url.endsWith(".webp") ? "sticker" : "image";
  }
  return "document";
}

export type MensagemDeCliente = {
  chatwootMessageId: number;
  chatwootConversationId: number;
  statusConversa: string | null;
  /** E.164 sem "+", ex.: 5598981012388 */
  telefone: string;
  texto?: string;
  anexo?: { url: string; tipo: TipoAnexo };
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
        tipo: tipoDoAnexo(a),
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

export type Atividade = {
  chatwootConversationId: number;
  /** E.164 sem "+" */
  telefone: string;
  nomeContato?: string;
  contatoId?: number;
  status?: string;
  autor?: "cliente" | "equipe" | "bot";
  previa?: string;
};

const EVENTOS_DE_CONVERSA = new Set([
  "conversation_created",
  "conversation_opened",
  "conversation_resolved",
  "conversation_status_changed",
  "conversation_updated",
]);

const PREVIA_MAX = 140;

/**
 * Atividade da conversa pra espelhar no app (fila de atendimento): mensagem
 * de cliente, da equipe ou do próprio bot, e mudanças de status. Notas
 * privadas nunca entram. O payload de eventos de conversa tem a conversa na
 * raiz; o de mensagem a traz em `conversation` — os dois formatos são aceitos.
 */
// biome-ignore lint/suspicious/noExplicitAny: payload externo do Chatwoot
export function extrairAtividade(body: any, inboxIdEsperado = 0): Atividade | null {
  const evento = body?.event;
  const ehMensagem = evento === "message_created";
  if (!ehMensagem && !EVENTOS_DE_CONVERSA.has(evento)) return null;

  let autor: Atividade["autor"];
  let previa: string | undefined;
  if (ehMensagem) {
    if (body.private) return null;
    const tipo = body.message_type;
    if (tipo === "incoming" || tipo === 0) autor = "cliente";
    else if (tipo === "outgoing" || tipo === 1) autor = body.sender?.type === "agent_bot" ? "bot" : "equipe";
    else return null;
    const a = body.attachments?.[0];
    const anexo = a ? tipoDoAnexo(a) : null;
    const texto = typeof body.content === "string" ? body.content.trim() : "";
    const rotulo = { audio: "[áudio]", image: "[imagem]", sticker: "[figurinha]", document: "[arquivo]" };
    previa = (texto || (anexo ? rotulo[anexo] : "")).slice(0, PREVIA_MAX) || undefined;
  }

  const conv = ehMensagem ? (body.conversation ?? {}) : (body.conversation ?? body);
  const chatwootConversationId = Number(conv.id);
  if (!chatwootConversationId) return null;
  if (inboxIdEsperado && Number(body.inbox?.id ?? conv.inbox_id ?? body.inbox_id) !== inboxIdEsperado) return null;

  const contato = conv.meta?.sender ?? (autor === "cliente" ? body.sender : undefined);
  const telefone = String(contato?.phone_number ?? "").replace(/\D/g, "");
  if (!telefone) return null;

  return {
    chatwootConversationId,
    telefone,
    nomeContato: typeof contato?.name === "string" && contato.name.trim() ? contato.name.trim() : undefined,
    contatoId: Number(contato?.id) || undefined,
    status: typeof conv.status === "string" ? conv.status : undefined,
    autor,
    previa,
  };
}
