// supabase/functions/chatwoot-bot/index.ts
//
// Receptor do Agent Bot do Chatwoot — substitui o webhook direto da Meta.
// O número de WhatsApp está no Chatwoot Cloud (Coexistência); ele avisa
// esta função a cada evento e o bot responde pela API REST do Chatwoot.
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
// Dois trabalhos por evento:
//   1) ESPELHO — grava em whatsapp_conversations o status da conversa no
//      Chatwoot, quem falou por último e a prévia: é o que alimenta a fila
//      do painel "Atendimento" do app (sem guardar token do Chatwoot no
//      navegador).
//   2) BOT — se for mensagem de cliente, roda o motor de reservas.
//
// Sempre responde 200 depois de autenticar: o Chatwoot reenvia em 429/500 e
// o timeout dele é de ~5 s, então o processamento roda em segundo plano.

import { aprenderSePreciso } from "../_shared/aprendizadoRun.ts";
import { runWithBotContext } from "../_shared/botContext.ts";
import { chatwootClient } from "../_shared/chatwootClient.ts";
import { extrairAtividade, extrairMensagemDeCliente } from "../_shared/chatwootPayload.ts";
import { assinaturaChatwootValida } from "../_shared/chatwootSignature.ts";
import { handleIncomingMessage } from "../_shared/conversationEngine.ts";
import { registrarObservacao } from "../_shared/observacoes.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { whatsappService } from "../_shared/whatsappService.ts";

const WEBHOOK_SECRET = Deno.env.get("CHATWOOT_WEBHOOK_SECRET") ?? "";
const INBOX_ID = Number(Deno.env.get("CHATWOOT_INBOX_ID") ?? "0");

// Evento nomeado (AGENTS.md §4): uma linha JSON por evento tratado.
function evento(nome: string, dados: Record<string, unknown>) {
  console.log(JSON.stringify({ evento: nome, ...dados }));
}

/** Espelha no banco o que aconteceu na conversa (fila do painel de atendimento). */
async function espelhar(a: NonNullable<ReturnType<typeof extrairAtividade>>) {
  const conversation = await whatsappService.resolveConversation(a.telefone);
  const patch: Record<string, unknown> = { chatwoot_conversation_id: a.chatwootConversationId };
  if (a.status) patch.chatwoot_status = a.status;
  if (a.nomeContato) patch.chatwoot_contact_name = a.nomeContato;
  if (a.contatoId) patch.chatwoot_contact_id = a.contatoId;
  if (a.autor) {
    patch.last_message_by = a.autor;
    patch.last_message_preview = a.previa ?? null;
    patch.last_message_at = new Date().toISOString();
  }
  const { error } = await supabaseAdmin.from("whatsapp_conversations").update(patch).eq("id", conversation.id);
  if (error) console.error("Falha ao espelhar a conversa do Chatwoot:", error.message);
}

/**
 * O nome do perfil do WhatsApp costuma ser apelido ou fictício ("😎 Maria Top").
 * O bot NUNCA o usa pra cadastrar ninguém (pergunta o nome ao cliente). Aqui,
 * se o cliente já está no cadastro, o contato no Chatwoot passa a mostrar o
 * nome do CADASTRO. Melhor esforço; no modo sombra nada é escrito no Chatwoot.
 */
async function alinharNomeDoContato(telefone: string, contatoId?: number, nomeAtual?: string) {
  if (!contatoId) return;
  const cliente = await whatsappService.identifyCustomer(telefone);
  const nome = cliente?.name?.trim();
  if (!nome || nome === nomeAtual) return;
  try {
    await chatwootClient.atualizarContato(contatoId, { name: nome });
    evento("bot_contato_renomeado", { contato: contatoId });
  } catch (err) {
    evento("bot_aviso", { aviso: "nao_renomeou_contato", erro: String(err).slice(0, 200) });
  }
}

// biome-ignore lint/suspicious/noExplicitAny: payload externo do Chatwoot
async function processar(body: any) {
  const atividade = extrairAtividade(body, INBOX_ID);
  if (atividade) await espelhar(atividade);

  const { data: cfg } = await supabaseAdmin.from("settings").select("value").eq("key", "attendance_mode").maybeSingle();
  const modo: string = cfg?.value?.mode ?? "ia";

  // Modo sombra OBSERVA: guarda o que o atendente respondeu (pelo celular ou pelo
  // Chatwoot) para o bot aprender como a equipe atende e agenda (issue #218).
  if (modo === "sombra" && atividade?.autor === "equipe" && atividade.texto) {
    const conversa = await whatsappService.resolveConversation(atividade.telefone);
    await registrarObservacao({
      conversationId: conversa.id,
      chatwootConversationId: atividade.chatwootConversationId,
      chatwootMessageId: atividade.mensagemId,
      author: "equipe",
      content: atividade.texto,
    });
    await aprenderSePreciso();
  }

  const m = extrairMensagemDeCliente(body, INBOX_ID);
  if (!m) return;

  const conversation = await whatsappService.resolveConversation(m.telefone);

  if (modo === "sombra" && m.texto) {
    await registrarObservacao({
      conversationId: conversation.id,
      chatwootConversationId: m.chatwootConversationId,
      chatwootMessageId: m.chatwootMessageId,
      author: "cliente",
      content: m.texto,
    });
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

  if (modo !== "sombra") await alinharNomeDoContato(m.telefone, atividade?.contatoId, atividade?.nomeContato);

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
