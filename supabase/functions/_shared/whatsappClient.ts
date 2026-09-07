// supabase/functions/_shared/whatsappClient.ts
//
// Camada mais baixa: só sabe conversar com a Graph API da Meta (enviar
// texto, lista, botões). Não tem NENHUMA lógica de negócio — isso fica
// no whatsappService.ts. Separar assim deixa fácil trocar de provedor
// (ex.: Twilio) no futuro sem tocar no resto do sistema.

const WHATSAPP_TOKEN = Deno.env.get("WHATSAPP_TOKEN")!;
const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")!;
const GRAPH_API_VERSION = "v20.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const BASE_URL = `${GRAPH_BASE}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;

if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
  throw new Error("Faltam WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID nos secrets da função.");
}

async function callGraphApi(payload: Record<string, unknown>) {
  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`WhatsApp API error: ${JSON.stringify(data)}`);
  }
  return data; // { messaging_product, contacts, messages: [{ id }] }
}

export const whatsappClient = {
  async sendText(to: string, body: string) {
    return callGraphApi({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body },
    });
  },

  /** Lista de opções (até 10 itens) — usado no menu principal e na escolha de pontos. */
  async sendList(to: string, header: string, bodyText: string, buttonLabel: string, rows: { id: string; title: string; description?: string }[]) {
    return callGraphApi({
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "list",
        header: { type: "text", text: header },
        body: { text: bodyText },
        action: {
          button: buttonLabel,
          sections: [{ title: header, rows }],
        },
      },
    });
  },

  /** Botões rápidos (até 3) — usado para sim/não, confirmar/cancelar. */
  async sendButtons(to: string, bodyText: string, buttons: { id: string; title: string }[]) {
    return callGraphApi({
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: bodyText },
        action: { buttons: buttons.map((b) => ({ type: "reply", reply: { id: b.id, title: b.title } })) },
      },
    });
  },

  /** Templates pré-aprovados pela Meta — obrigatório para mensagens fora da janela de 24h (lembrete, motorista a caminho). */
  async sendTemplate(to: string, templateName: string, languageCode: string, components: unknown[] = []) {
    return callGraphApi({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: { name: templateName, language: { code: languageCode }, components },
    });
  },

  /**
   * Baixa uma mídia recebida (imagem/documento). Na Cloud API é em 2 passos:
   *   1) GET /{media-id}      -> { url, mime_type, ... } (url expira em ~5min)
   *   2) GET {url} com Bearer -> os bytes
   */
  async downloadMedia(mediaId: string): Promise<{ bytes: Uint8Array; mimeType: string }> {
    const metaRes = await fetch(`${GRAPH_BASE}/${mediaId}`, {
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
    });
    const meta = await metaRes.json();
    if (!metaRes.ok || !meta?.url) {
      throw new Error(`WhatsApp media lookup error: ${JSON.stringify(meta)}`);
    }
    const fileRes = await fetch(meta.url, {
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
    });
    if (!fileRes.ok) {
      throw new Error(`WhatsApp media download error: ${fileRes.status}`);
    }
    const bytes = new Uint8Array(await fileRes.arrayBuffer());
    return { bytes, mimeType: (meta.mime_type as string) ?? "application/octet-stream" };
  },
};
