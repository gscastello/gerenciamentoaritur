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

export type ContatoCompartilhado = { nome: string | null; telefone: string };

/**
 * Card de contato do WhatsApp (issue #268): o Chatwoot entrega como anexo
 * `file_type: "contact"`, com o telefone em `fallback_title` e o nome em `meta`
 * (firstName/lastName). É como o cliente manda o número do passageiro quando
 * marca para outra pessoa.
 */
// biome-ignore lint/suspicious/noExplicitAny: anexos externos do Chatwoot
export function contatosCompartilhados(attachments: any): ContatoCompartilhado[] {
  if (!Array.isArray(attachments)) return [];
  const saida: ContatoCompartilhado[] = [];
  for (const a of attachments) {
    if (a?.file_type !== "contact") continue;
    const telefone = String(a.fallback_title ?? a.meta?.phone ?? "").replace(/\D/g, "");
    if (telefone.length < 10) continue;
    const meta = a.meta ?? {};
    const nome = [meta.firstName ?? meta.first_name, meta.lastName ?? meta.last_name]
      .filter((x: unknown) => typeof x === "string" && x.trim())
      .join(" ")
      .trim();
    saida.push({ nome: nome || null, telefone });
  }
  return saida;
}

/** "[contato compartilhado: Maria Silva — 5598988887777]": entra no texto que o bot lê. */
export function textoDosContatos(contatos: ContatoCompartilhado[]): string | undefined {
  if (contatos.length === 0) return undefined;
  return contatos.map((c) => `[contato compartilhado: ${c.nome ? `${c.nome} — ` : ""}${c.telefone}]`).join(" ");
}

/** Texto da mensagem com o card de contato junto (se houver). */
// biome-ignore lint/suspicious/noExplicitAny: anexos externos do Chatwoot
export function textoComContatos(conteudo: string | undefined, attachments: any): string | undefined {
  const contatos = textoDosContatos(contatosCompartilhados(attachments));
  const t = (conteudo ?? "").trim();
  return [t, contatos].filter(Boolean).join(" ") || undefined;
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
  const anexo = a?.data_url && a.file_type !== "contact"
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
    texto: textoComContatos(typeof body.content === "string" ? body.content : undefined, body.attachments),
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
  /** Texto inteiro da mensagem (sem anexo) — o modo sombra observa por aqui. */
  texto?: string;
  /** id da mensagem no Chatwoot (idempotência de quem grava). */
  mensagemId?: number;
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
  let texto: string | undefined;
  let mensagemId: number | undefined;
  if (ehMensagem) {
    if (body.private) return null;
    const tipo = body.message_type;
    if (tipo === "incoming" || tipo === 0) autor = "cliente";
    else if (tipo === "outgoing" || tipo === 1) autor = body.sender?.type === "agent_bot" ? "bot" : "equipe";
    else return null;
    const a = body.attachments?.[0];
    const anexo = a ? tipoDoAnexo(a) : null;
    const conteudo = textoComContatos(typeof body.content === "string" ? body.content : undefined, body.attachments) ?? "";
    const rotulo = { audio: "[áudio]", image: "[imagem]", sticker: "[figurinha]", document: "[arquivo]" };
    previa = (conteudo || (anexo ? rotulo[anexo] : "")).slice(0, PREVIA_MAX) || undefined;
    texto = conteudo || undefined;
    mensagemId = Number(body.id) || undefined;
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
    texto,
    mensagemId,
  };
}

/** O dono/equipe pediu para testar o bot nesta conversa (nota privada "#testar …", issue #278). */
export type PedidoDeTeste = {
  chatwootConversationId: number;
  /** E.164 sem "+" */
  telefone: string;
  /** o que vem depois de "#testar": a mensagem de cliente a simular (null = responder à conversa como está) */
  pergunta: string | null;
};

const RE_TESTE = /^\s*#\s*test(ar|e)\b[\s:,-]*/i;

/**
 * Nota PRIVADA de alguém da equipe (não do bot) que começa com "#testar" ou "#teste".
 * Mensagem pública com "#testar" não conta: isso iria para o cliente.
 */
// biome-ignore lint/suspicious/noExplicitAny: payload externo do Chatwoot
export function extrairPedidoDeTeste(body: any, inboxIdEsperado = 0): PedidoDeTeste | null {
  if (body?.event !== "message_created" || body.private !== true) return null;
  if (body.message_type !== "outgoing" && body.message_type !== 1) return null;
  if (body.sender?.type === "agent_bot") return null;
  const conteudo = typeof body.content === "string" ? body.content : "";
  if (!RE_TESTE.test(conteudo)) return null;
  const conv = body.conversation ?? {};
  const chatwootConversationId = Number(conv.id);
  if (!chatwootConversationId) return null;
  if (inboxIdEsperado && Number(body.inbox?.id ?? conv.inbox_id) !== inboxIdEsperado) return null;
  const telefone = String(conv.meta?.sender?.phone_number ?? "").replace(/\D/g, "");
  if (!telefone) return null;
  const pergunta = conteudo.replace(RE_TESTE, "").trim();
  return { chatwootConversationId, telefone, pergunta: pergunta || null };
}
