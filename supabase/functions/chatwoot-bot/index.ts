// supabase/functions/chatwoot-bot/index.ts
//
// Receptor do Agent Bot do Chatwoot — substitui o webhook direto da Meta.
// O número de WhatsApp está no Chatwoot Cloud (Coexistência); ele avisa
// esta função a cada mensagem e o bot responde pela API REST do Chatwoot.
//
// Deploy: supabase functions deploy chatwoot-bot --no-verify-jwt
// (--no-verify-jwt porque quem chama é o Chatwoot, não um usuário logado.
// A autenticação é a ASSINATURA HMAC do webhook, conferida com o segredo
// do bot — sem ela qualquer um que descubra a URL injetaria mensagens.)
//
// Secrets (supabase secrets set …):
//   CHATWOOT_WEBHOOK_SECRET  segredo do Agent Bot (aparece ao criar o bot)
//   CHATWOOT_API_TOKEN       token de acesso do Agent Bot
//   CHATWOOT_ACCOUNT_ID      id da conta (ex.: 188239)
//   CHATWOOT_INBOX_ID        id da caixa "Aritur WhatsApp" (ex.: 146985) — opcional, filtra
//   ANTHROPIC_API_KEY        leitura do texto + respostas da base de conhecimento
//
// Sempre responde 200 depois de autenticar: o Chatwoot reenvia em 429/500 e
// o timeout dele é de ~5 s, então o processamento roda em segundo plano.

import { runWithBotContext } from "../_shared/botContext.ts";
import { extrairMensagemDeCliente } from "../_shared/chatwootPayload.ts";
import { chatwootClient } from "../_shared/chatwootClient.ts";
import { assinaturaChatwootValida } from "../_shared/chatwootSignature.ts";
import { handleIncomingMessage } from "../_shared/conversationEngine.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { whatsappService } from "../_shared/whatsappService.ts";

const WEBHOOK_SECRET = Deno.env.get("CHATWOOT_WEBHOOK_SECRET") ?? "";
const INBOX_ID = Number(Deno.env.get("CHATWOOT_INBOX_ID") ?? "0");

// Evento nomeado (AGENTS.md §4): uma linha JSON por mensagem tratada.
function evento(nome: string, dados: Record<string, unknown>) {
  console.log(JSON.stringify({ evento: nome, ...dados }));
}

// biome-ignore lint/suspicious/noExplicitAny: payload externo do Chatwoot
async function processar(body: any) {
  const m = extrairMensagemDeCliente(body, INBOX_ID);
  if (!m) return;

  const { data: cfg } = await supabaseAdmin.from("settings").select("value").eq("key", "attendance_mode").maybeSingle();
  const modo: string = cfg?.value?.mode ?? "ia";

  const conversation = await whatsappService.resolveConversation(m.telefone);
  if (conversation.chatwoot_conversation_id !== m.chatwootConversationId) {
    await supabaseAdmin
      .from("whatsapp_conversations")
      .update({ chatwoot_conversation_id: m.chatwootConversationId })
      .eq("id", conversation.id);
  }

  // Atendimento manual: o bot não responde — mas a conversa precisa aparecer
  // pra equipe (conversas "pendentes" ficam fora da caixa de abertas).
  if (modo === "manual") {
    if (m.statusConversa === "pending") {
      await chatwootClient.setStatus(m.chatwootConversationId, "open").catch((e) => console.error(e));
    }
  } else if (conversation.attendance_mode === "humano" && m.statusConversa === "pending") {
    // Um atendente devolveu a conversa ao bot (status Pendente no Chatwoot).
    await supabaseAdmin.rpc("rpc_return_to_ai", { p_conversation_id: conversation.id, p_actor: null });
  }

  evento("bot_mensagem_recebida", {
    modo,
    conversa: m.chatwootConversationId,
    anexo: m.anexo?.tipo ?? null,
  });

  await runWithBotContext(
    { chatwootConversationId: m.chatwootConversationId, conversationId: conversation.id, shadow: modo === "sombra" },
    () =>
      handleIncomingMessage({
        from: m.telefone,
        waMessageId: `cw-${m.chatwootMessageId}`,
        text: m.texto,
        media: m.anexo ? { mediaId: m.anexo.url, kind: m.anexo.tipo, caption: m.texto } : undefined,
        raw: { chatwoot_message_id: m.chatwootMessageId, content: m.texto ?? null, anexo: m.anexo?.tipo ?? null },
      }),
  );
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const raw = await req.text();
  const autenticado = await assinaturaChatwootValida({
    secret: WEBHOOK_SECRET,
    timestamp: req.headers.get("x-chatwoot-timestamp"),
    signature: req.headers.get("x-chatwoot-signature"),
    rawBody: raw,
  });
  if (!autenticado) return new Response("Invalid signature", { status: 401 });

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  // NUNCA devolver 5xx por problema de negócio: o Chatwoot reenvia e pode
  // duplicar. O erro real fica no log; a idempotência é por id da mensagem.
  const trabalho = processar(body).catch((err) =>
    evento("bot_erro", { erro: String(err), pilha: err instanceof Error ? err.stack : undefined }),
  );
  // biome-ignore lint/suspicious/noExplicitAny: global do runtime de Edge Functions
  const runtime = (globalThis as any).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(trabalho);
  else await trabalho;

  return new Response("ok", { status: 200 });
});
