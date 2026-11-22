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

/** Áudio que o Chatwoot não transcreveu: o bot sabe que existe, mas não sabe o que diz. */
export const AUDIO_SEM_TRANSCRICAO = "[áudio sem transcrição — ouça no WhatsApp]";

/**
 * Áudio e localização como texto que o bot lê (issue #460). O Chatwoot transcreve o áudio em
 * `transcribed_text` (às vezes só depois, num message_updated); a localização vem com as
 * coordenadas e o nome do lugar. Sem isso, o dia ou o endereço mandados por áudio sumiam.
 */
// biome-ignore lint/suspicious/noExplicitAny: anexos externos do Chatwoot
export function textoDosAnexos(attachments: any): string | undefined {
  if (!Array.isArray(attachments)) return undefined;
  const partes: string[] = [];
  for (const a of attachments) {
    if (a?.file_type === "audio") {
      const t = String(a.transcribed_text ?? "").replace(/\s+/g, " ").trim();
      partes.push(t ? `[áudio: ${t}]` : AUDIO_SEM_TRANSCRICAO);
    } else if (a?.file_type === "location") {
      const lat = Number(a.coordinates_lat);
      const lng = Number(a.coordinates_long);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) continue;
      const nome = String(a.fallback_title ?? "").replace(/\s+/g, " ").trim();
      partes.push(`[localização${nome ? `: ${nome}` : ""} — https://maps.google.com/?q=${lat},${lng}]`);
    }
  }
  return partes.length ? partes.join(" ") : undefined;
}

/**
 * A mensagem é SÓ um áudio ainda sem transcrição (issue #470)? O Chatwoot transcreve em segundos e
 * manda o texto num message_updated: até lá o bot não responde (senão diria "não consigo ouvir").
 */
export function soAudioSemTranscricao(texto: string | undefined): boolean {
  return (texto ?? "").replaceAll(AUDIO_SEM_TRANSCRICAO, "").trim() === "" && (texto ?? "").includes(AUDIO_SEM_TRANSCRICAO);
}

/** Quanto o bot espera a transcrição do áudio antes de pedir para o cliente escrever (issue #470). */
export const ESPERA_DA_TRANSCRICAO_MS = 40_000;

/** Quantos áudios vieram com e sem transcrição (para o registro: o Chatwoot está transcrevendo?). */
// biome-ignore lint/suspicious/noExplicitAny: anexos externos do Chatwoot
export function audiosTranscritos(attachments: any): { com: number; sem: number } {
  const audios = Array.isArray(attachments) ? attachments.filter((a) => a?.file_type === "audio") : [];
  const com = audios.filter((a) => String(a.transcribed_text ?? "").trim()).length;
  return { com, sem: audios.length - com };
}

/** Texto da mensagem com o card de contato, a transcrição do áudio e a localização (se houver). */
// biome-ignore lint/suspicious/noExplicitAny: anexos externos do Chatwoot
export function textoComContatos(conteudo: string | undefined, attachments: any): string | undefined {
  const contatos = textoDosContatos(contatosCompartilhados(attachments));
  const anexos = textoDosAnexos(attachments);
  const t = (conteudo ?? "").trim();
  return [t, contatos, anexos].filter(Boolean).join(" ") || undefined;
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
    // na prévia da fila, áudio sem transcrição continua "[áudio]" (o texto longo é para o bot)
    const paraPrevia = conteudo.replace(AUDIO_SEM_TRANSCRICAO, "").trim();
    previa = (paraPrevia || (anexo ? rotulo[anexo] : "")).slice(0, PREVIA_MAX) || undefined;
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

// ---------------------------------------------------------------------------
// Transcrição feita pelo próprio bot (issue #482): quando o Chatwoot não transcreve (o crédito do
// Captain acabou em 22/11), o bot transcreve o áudio e guarda o texto na observação da mensagem.
// ---------------------------------------------------------------------------

// biome-ignore lint/suspicious/noExplicitAny: anexos externos do Chatwoot
type Anexo = Record<string, any>;

/** Os áudios sem texto que dá para baixar: a URL e o tipo do arquivo. */
export function audiosSemTexto(attachments: unknown): { indice: number; url: string; tipo: string | null }[] {
  if (!Array.isArray(attachments)) return [];
  return (attachments as Anexo[]).flatMap((a, indice) =>
    a?.file_type === "audio" && !String(a.transcribed_text ?? "").trim() && /^https:\/\//.test(String(a.data_url ?? ""))
      ? [{ indice, url: String(a.data_url), tipo: a.content_type ? String(a.content_type) : null }]
      : []
  );
}

/** Os anexos com o texto que o bot transcreveu no lugar do `transcribed_text` que faltava. */
export function anexosComTranscricao(attachments: unknown, textos: Map<number, string>): Anexo[] {
  if (!Array.isArray(attachments)) return [];
  return (attachments as Anexo[]).map((a, i) => (textos.get(i)?.trim() ? { ...a, transcribed_text: textos.get(i)!.trim() } : a));
}

/**
 * As mensagens lidas do Chatwoot com a transcrição que o BOT fez (guardada na observação): o
 * Chatwoot continua mostrando o áudio vazio, mas a leitura do Agendado precisa do que foi falado.
 * `transcritas`: id da mensagem → texto da observação (só as que já têm "[áudio: …]").
 */
export function comTranscricoesDoBot<T extends { id?: number; attachments?: unknown; content?: unknown }>(
  mensagens: T[],
  transcritas: Map<number, string>,
): T[] {
  return (mensagens ?? []).map((m) => {
    const texto = m?.id != null ? transcritas.get(Number(m.id)) : undefined;
    const audioSemTexto = Array.isArray(m?.attachments) &&
      (m.attachments as Anexo[]).some((a) => a?.file_type === "audio" && !String(a.transcribed_text ?? "").trim());
    if (!texto || !texto.includes("[áudio:") || !audioSemTexto) return m;
    // o texto da observação já traz o que foi escrito, os cards de contato e o áudio transcrito
    return { ...m, content: texto, attachments: [] };
  });
}

/** O Chatwoot mandou a transcrição DEPOIS da que o bot já fez: não é edição do cliente. */
export function transcricaoRepetida(textoGuardado: unknown, attachments: unknown): boolean {
  return String(textoGuardado ?? "").includes("[áudio:") &&
    Array.isArray(attachments) && (attachments as Anexo[]).some((a) => a?.file_type === "audio");
}
