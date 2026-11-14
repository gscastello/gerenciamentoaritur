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
// Trabalhos por evento:
//   1) ESPELHO — grava em whatsapp_conversations o status da conversa no
//      Chatwoot, quem falou por último e a prévia: é o que alimenta a fila
//      do painel "Atendimento" do app (sem guardar token do Chatwoot no
//      navegador).
//   2) BOT — se for mensagem de cliente, roda o motor de reservas.
//   3) RASCUNHO — conversa transferida para a equipe no modo IA: prepara a reserva
//      para ela lançar com um toque (issue #254). No manual, só o "Agendado ☑️" lê.
//   4) AGENDADO ☑️ — a equipe confirmou na conversa com a marca combinada pelo
//      dono: a reserva preparada é lançada (issue #257). Vale em qualquer modo,
//      inclusive no sombra (dono, 10/11): a marca da equipe é a confirmação.
//   5) TESTE — nota privada "#testar [mensagem]" da equipe: o bot escreve, numa nota
//      privada, a resposta que daria (issue #278). Qualquer modo; nada vai ao cliente.
// Modo sombra (issue #278): observa e aprende — não gera resposta nem reserva
// preparada (é o que custa), mas lança o que a equipe marcar com "Agendado ☑️"
// (dono, 10/11). Para ver o que o bot sabe, use o #testar.
//
// Sempre responde 200 depois de autenticar: o Chatwoot reenvia em 429/500 e
// o timeout dele é de ~5 s, então o processamento roda em segundo plano.

import { aprenderSePreciso } from "../_shared/aprendizadoRun.ts";
import { runWithBotContext } from "../_shared/botContext.ts";
import { chatwootClient } from "../_shared/chatwootClient.ts";
import { extrairAtividade, extrairMensagemDeCliente, extrairPedidoDeTeste } from "../_shared/chatwootPayload.ts";
import { responderComAgente } from "../_shared/agente.ts";
import { assinaturaChatwootValida } from "../_shared/chatwootSignature.ts";
import { handleIncomingMessage } from "../_shared/conversationEngine.ts";
import { registrarObservacao } from "../_shared/observacoes.ts";
import { ehMarcaDeAgendado, ehMarcaDeCorrecao } from "../_shared/rascunhoPuro.ts";
import { revisarPelaMarca } from "../_shared/revisor.ts";
import {
  atualizarReservasAConfirmar,
  lancarPeloAgendado,
  prepararRascunhoDeReserva,
  relerAgendadoPendente,
} from "../_shared/rascunhoReserva.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { whatsappService } from "../_shared/whatsappService.ts";

const WEBHOOK_SECRET = Deno.env.get("CHATWOOT_WEBHOOK_SECRET") ?? "";
const INBOX_ID = Number(Deno.env.get("CHATWOOT_INBOX_ID") ?? "0");

// Evento nomeado (AGENTS.md §4): uma linha JSON por evento tratado.
function evento(nome: string, dados: Record<string, unknown>) {
  console.log(JSON.stringify({ evento: nome, ...dados }));
}

/** Espelha no banco o que aconteceu na conversa (fila do painel de atendimento). Devolve o id da conversa. */
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
  return conversation.id as string;
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
  // teste do dono: nota privada "#testar …" (issue #278)
  const teste = extrairPedidoDeTeste(body, INBOX_ID);
  if (teste) {
    await testarBot(teste);
    return;
  }
  // o que o Chatwoot entrega como anexo (card de contato, issue #268): tipos e campos, sem conteúdo
  if (body?.event === "message_created" && Array.isArray(body.attachments) && body.attachments.length) {
    evento("bot_anexo_recebido", {
      conversa: body.conversation?.id ?? null,
      tipo_mensagem: body.message_type ?? null,
      tipos: body.attachments.map((a: { file_type?: string }) => a?.file_type ?? null),
      campos: Object.keys(body.attachments[0] ?? {}),
    });
  }
  const atividade = extrairAtividade(body, INBOX_ID);
  const conversaEspelhada = atividade ? await espelhar(atividade) : undefined;

  const { data: cfg } = await supabaseAdmin.from("settings").select("value").eq("key", "attendance_mode").maybeSingle();
  const modo: string = cfg?.value?.mode ?? "ia";

  // O bot OBSERVA as conversas em QUALQUER modo (ia, manual ou sombra): o que o
  // cliente escreveu, o que o atendente respondeu (pelo celular ou pelo Chatwoot)
  // e o que o próprio bot enviou. É assim que ele aprende como os clientes falam,
  // como a equipe atende e agenda e como a empresa funciona (issue #218).
  let observou = false;
  if (atividade?.autor && atividade.texto && conversaEspelhada) {
    await registrarObservacao({
      conversationId: conversaEspelhada,
      chatwootConversationId: atividade.chatwootConversationId,
      chatwootMessageId: atividade.mensagemId,
      author: atividade.autor,
      content: atividade.texto,
    });
    observou = true;
  }

  // a equipe confirmou com "Agendado ☑️": lança a reserva preparada (a marca é a confirmação manual)
  if (
    atividade?.autor === "equipe" &&
    atividade.texto &&
    atividade.mensagemId &&
    conversaEspelhada &&
    ehMarcaDeAgendado(atividade.texto)
  ) {
    // em qualquer modo, inclusive no sombra: a marca da equipe é a confirmação (dono, 10/11)
    await lancarPeloAgendado({
      conversationId: conversaEspelhada,
      chatwootConversationId: atividade.chatwootConversationId,
      mensagemId: atividade.mensagemId,
      telefone: atividade.telefone,
    });
  }

  // a equipe pediu "Atualizado ☑️": as reservas do cliente ficam como a conversa combinou, NA HORA (issue #410).
  // Sem reserva futura, a marca vale como Agendado ☑️ (lança o que foi pedido).
  if (
    atividade?.autor === "equipe" &&
    atividade.texto &&
    atividade.mensagemId &&
    conversaEspelhada &&
    ehMarcaDeCorrecao(atividade.texto)
  ) {
    const r = await revisarPelaMarca({ telefone: atividade.telefone, chatwootConversationId: atividade.chatwootConversationId });
    if (r.semReserva) {
      await lancarPeloAgendado({
        conversationId: conversaEspelhada,
        chatwootConversationId: atividade.chatwootConversationId,
        mensagemId: atividade.mensagemId,
        telefone: atividade.telefone,
      });
    }
  }

  // o cliente completou depois do Agendado ☑️ (dia, quantidade…) e ele não tinha lançado: tenta de novo (issue #286)
  if (atividade?.autor === "cliente" && atividade.texto && conversaEspelhada) {
    await relerAgendadoPendente({
      conversationId: conversaEspelhada,
      chatwootConversationId: atividade.chatwootConversationId,
      telefone: atividade.telefone,
    });
    // reserva feita "como está" pelo Agendado e o cliente completou (outro dia da volta, endereço, cidade)
    await atualizarReservasAConfirmar({
      conversationId: conversaEspelhada,
      chatwootConversationId: atividade.chatwootConversationId,
      telefone: atividade.telefone,
    });
  }

  const m = extrairMensagemDeCliente(body, INBOX_ID);
  if (!m) {
    // sem resposta pendente: pode aprender já
    if (observou) await aprenderSePreciso();
    return;
  }

  const conversation = await whatsappService.resolveConversation(m.telefone);

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

  // Conversa transferida para a equipe no modo IA: deixa a reserva preparada (nada é reservado aqui).
  // No manual e no sombra o bot só lê a conversa quando a equipe escreve "Agendado ☑️" (issues #278 e #286).
  if (m.texto && modo === "ia" && conversation.attendance_mode === "humano") {
    await prepararRascunhoDeReserva({
      conversationId: conversation.id,
      chatwootConversationId: m.chatwootConversationId,
      mensagemId: m.chatwootMessageId,
      telefone: m.telefone,
    });
  }

  // depois de responder ao cliente, para o aprendizado não atrasar o atendimento
  if (observou) await aprenderSePreciso();
}

/**
 * Teste do dono (issue #278): o atendente de IA lê a conversa e escreve numa nota
 * privada o que responderia — com a pergunta da nota como próxima mensagem do
 * cliente, se houver. Roda como sombra: nada é enviado, gravado ou aprendido.
 */
async function testarBot(t: NonNullable<ReturnType<typeof extrairPedidoDeTeste>>) {
  const conversation = await whatsappService.resolveConversation(t.telefone);
  evento("bot_teste_pedido", { conversa: t.chatwootConversationId, com_pergunta: !!t.pergunta });
  await runWithBotContext(
    { chatwootConversationId: t.chatwootConversationId, conversationId: conversation.id, shadow: true, teste: true },
    () =>
      responderComAgente(
        { conversationId: conversation.id, telefone: t.telefone, waMessageId: "cw-0" },
        { teste: { pergunta: t.pergunta } },
      ),
  ).catch(async (err) => {
    evento("bot_erro", { onde: "teste", conversa: t.chatwootConversationId, erro: String(err).slice(0, 300) });
    await chatwootClient
      .postMessage(t.chatwootConversationId, `🧪 [TESTE] Não consegui responder: ${String(err).slice(0, 200)}`, { private: true })
      .catch(() => {});
  });
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
