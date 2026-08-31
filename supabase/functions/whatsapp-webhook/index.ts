// supabase/functions/whatsapp-webhook/index.ts
//
// Endpoint público que a Meta chama. Dois métodos:
//   GET  -> handshake de verificação (obrigatório para ativar o webhook no painel da Meta)
//   POST -> mensagens recebidas de verdade
//
// Deploy: supabase functions deploy whatsapp-webhook --no-verify-jwt
// (--no-verify-jwt porque quem chama é a Meta, não um usuário logado do
// seu app; a segurança aqui é o VERIFY_TOKEN do passo GET + o secret do
// WHATSAPP_TOKEN nunca sair do servidor)

import { handleIncomingMessage } from "../_shared/conversationEngine.ts";

const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN")!;

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
    const body = await req.json();
    // formato padrão do webhook da Cloud API: entry[].changes[].value.messages[]
    try {
      const entries = body?.entry ?? [];
      for (const entry of entries) {
        for (const change of entry.changes ?? []) {
          const messages = change.value?.messages ?? [];
          for (const m of messages) {
            const from = m.from as string; // já vem em E.164 sem "+"
            const waMessageId = m.id as string;
            const text = m.text?.body as string | undefined;
            const interactiveId = m.interactive?.list_reply?.id ?? m.interactive?.button_reply?.id ?? m.button?.payload;
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
