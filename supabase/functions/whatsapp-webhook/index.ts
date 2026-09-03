// supabase/functions/whatsapp-webhook/index.ts
//
// Endpoint público que a Meta chama. Dois métodos:
//   GET  -> handshake de verificação (obrigatório para ativar o webhook no painel da Meta)
//   POST -> mensagens recebidas de verdade
//
// Deploy: supabase functions deploy whatsapp-webhook --no-verify-jwt
// (--no-verify-jwt porque quem chama é a Meta, não um usuário logado do
// seu app. A autenticação do POST é a ASSINATURA HMAC da Meta
// (X-Hub-Signature-256) conferida com o WHATSAPP_APP_SECRET — sem isso
// qualquer um que descubra a URL poderia injetar mensagens falsas.)

import { handleIncomingMessage } from "../_shared/conversationEngine.ts";

const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN")!;
const APP_SECRET = Deno.env.get("WHATSAPP_APP_SECRET") ?? "";

/** Confere o header X-Hub-Signature-256 (sha256=<hex>) contra o corpo cru. */
async function assinaturaValida(rawBody: string, header: string | null): Promise<boolean> {
  if (!APP_SECRET) {
    console.error("WHATSAPP_APP_SECRET não configurado — rejeitando POST do webhook.");
    return false;
  }
  if (!header?.startsWith("sha256=")) return false;
  const esperado = header.slice("sha256=".length);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(APP_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const calculado = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  // comparação de tempo constante
  if (calculado.length !== esperado.length) return false;
  let diff = 0;
  for (let i = 0; i < calculado.length; i++) diff |= calculado.charCodeAt(i) ^ esperado.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method === "POST") {
    const raw = await req.text();
    if (!(await assinaturaValida(raw, req.headers.get("x-hub-signature-256")))) {
      return new Response("Invalid signature", { status: 401 });
    }

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return new Response("Bad Request", { status: 400 });
    }

    // formato padrão do webhook da Cloud API: entry[].changes[].value.messages[]
    try {
      // biome-ignore lint/suspicious/noExplicitAny: payload externo da Meta
      const entries = (body as any)?.entry ?? [];
      for (const entry of entries) {
        for (const change of entry.changes ?? []) {
          const messages = change.value?.messages ?? [];
          for (const m of messages) {
            const from = m.from as string; // já vem em E.164 sem "+"
            const waMessageId = m.id as string;
            const text = m.text?.body as string | undefined;
            const interactiveId =
              m.interactive?.list_reply?.id ?? m.interactive?.button_reply?.id ?? m.button?.payload;
            await handleIncomingMessage({ from, waMessageId, text, interactiveId, raw: m });
          }
        }
      }
    } catch (err) {
      // NUNCA retornar erro 5xx para a Meta por um problema de negócio —
      // ela reenvia agressivamente e pode gerar duplicidade. Logamos e
      // respondemos 200 mesmo assim; o erro real fica registrado.
      console.error("Erro processando webhook:", err);
    }
    return new Response("EVENT_RECEIVED", { status: 200 });
  }

  return new Response("Method Not Allowed", { status: 405 });
});
