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

import { executarComandoDoPiloto, pilotoVale } from "../_shared/piloto.ts";
import { comandoDoPiloto } from "../_shared/pilotoPuro.ts";
import { contatoInterno } from "../_shared/contatosInternos.ts";
import { registrarPresencaSePedida } from "../_shared/presenca.ts";
import { aprenderSePreciso } from "../_shared/aprendizadoRun.ts";
import { runWithBotContext } from "../_shared/botContext.ts";
import { chatwootClient } from "../_shared/chatwootClient.ts";
import {
  AUDIO_SEM_TRANSCRICAO,
  anexosComTranscricao,
  audiosSemTexto,
  audiosTranscritos,
  extrairAtividade,
  extrairMensagemDeCliente,
  extrairPedidoDeTeste,
  textoComContatos,
  transcricaoRepetida,
} from "../_shared/chatwootPayload.ts";
import { transcreverAudio, transcricaoPropriaLigada } from "../_shared/transcricao.ts";
import { responderComAgente } from "../_shared/agente.ts";
import { assinaturaChatwootValida } from "../_shared/chatwootSignature.ts";
import { handleIncomingMessage } from "../_shared/conversationEngine.ts";
import { registrarObservacao } from "../_shared/observacoes.ts";
import { MENSAGEM_ILEGIVEL, ehMarcaDeAgendado, ehMarcaDeCorrecao, textoEditado } from "../_shared/rascunhoPuro.ts";
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

/** Trabalho que continua depois da resposta ao Chatwoot (o timeout dele é de ~5 s). */
function emSegundoPlano(p: Promise<unknown>) {
  const seguro = p.catch((err) => evento("bot_erro", { etapa: "segundo_plano", erro: String(err).slice(0, 300) }));
  // deno-lint-ignore no-explicit-any
  const runtime = (globalThis as any).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(seguro);
}

/** Tempo para a transcrição do Chatwoot chegar antes de o bot transcrever sozinho (ela leva 4–11 s). */
const ESPERA_DO_CHATWOOT_MS = 12_000;

/**
 * O Chatwoot não transcreveu o áudio (o crédito do Captain acabou em 22/11 — issue #482): o bot
 * baixa e transcreve. O texto segue o mesmo caminho da transcrição do Chatwoot (message_updated):
 * troca a observação no lugar e, se for do cliente, passa pelo que uma mensagem de texto passa.
 */
// biome-ignore lint/suspicious/noExplicitAny: payload externo do Chatwoot
async function transcreverSeOChatwootNaoTranscrever(body: any) {
  const audios = audiosSemTexto(body?.attachments);
  if (!audios.length || body.private || !transcricaoPropriaLigada()) return;
  const tipo = body.message_type;
  const doCliente = tipo === "incoming" || tipo === 0;
  const daEquipe = (tipo === "outgoing" || tipo === 1) && body.sender?.type !== "agent_bot";
  if (!doCliente && !daEquipe) return;
  await new Promise((r) => setTimeout(r, ESPERA_DO_CHATWOOT_MS));
  const { data: obs } = await supabaseAdmin
    .from("bot_observations")
    .select("content")
    .eq("chatwoot_message_id", Number(body.id))
    .maybeSingle();
  // sem observação (não é desta caixa) ou o Chatwoot já transcreveu: nada a fazer
  if (!obs || !String(obs.content ?? "").includes(AUDIO_SEM_TRANSCRICAO)) return;
  const textos = new Map<number, string>();
  for (const a of audios) {
    const t = await transcreverAudio(a.url, a.tipo, Number(body.conversation?.id));
    if (t) textos.set(a.indice, t);
  }
  if (!textos.size) return;
  await processar({ ...body, event: "message_updated", attachments: anexosComTranscricao(body.attachments, textos) });
}

// biome-ignore lint/suspicious/noExplicitAny: payload externo do Chatwoot
async function processar(body: any, opcoes: { transcricao?: boolean } = {}) {
  // teste do dono: nota privada "#testar …" (issue #278)
  const teste = extrairPedidoDeTeste(body, INBOX_ID);
  if (teste) {
    await testarBot(teste);
    return;
  }
  // a equipe para ou religa o atendente de IA com uma nota privada (issue #537)
  const comando = body?.event === "message_created" && body.private === true && body.sender?.type !== "agent_bot" ? comandoDoPiloto(body.content) : null;
  if (comando) {
    const resposta = await executarComandoDoPiloto(comando, String(body.sender?.name ?? "equipe").slice(0, 60));
    evento("bot_piloto_comando", { comando });
    await chatwootClient.postMessage(Number(body.conversation?.id), resposta, { private: true }).catch(() => {});
    return;
  }
  // o que o Chatwoot entrega como anexo (card de contato, issue #268): tipos e campos, sem conteúdo
  if (body?.event === "message_created" && Array.isArray(body.attachments) && body.attachments.length) {
    evento("bot_anexo_recebido", {
      conversa: body.conversation?.id ?? null,
      tipo_mensagem: body.message_type ?? null,
      tipos: body.attachments.map((a: { file_type?: string }) => a?.file_type ?? null),
      campos: Object.keys(body.attachments[0] ?? {}),
      // o Chatwoot está transcrevendo os áudios? (issue #460)
      audios_transcritos: audiosTranscritos(body.attachments),
    });
    // áudio sem texto: se o Chatwoot não transcrever em alguns segundos, o bot transcreve (issue #482)
    if (!opcoes.transcricao) emSegundoPlano(transcreverSeOChatwootNaoTranscrever(body));
  }
  // mensagem EDITADA pelo cliente ou pela equipe (issue #417): o texto novo entra na conversa.
  // A transcrição do áudio também chega assim, segundos depois (issue #460).
  const textoAtualizado = body?.event === "message_updated" && !body.private
    ? textoComContatos(typeof body.content === "string" ? body.content : undefined, body.attachments)
    : undefined;
  if (textoAtualizado) {
    const tipo = body.message_type;
    const autor = tipo === "incoming" || tipo === 0 ? "cliente" : tipo === "outgoing" || tipo === 1 ? (body.sender?.type === "agent_bot" ? null : "equipe") : null;
    const conv = Number(body.conversation?.id);
    if (autor && conv) {
      const { data: original } = await supabaseAdmin
        .from("bot_observations")
        .select("id, conversation_id, content")
        .eq("chatwoot_message_id", Number(body.id))
        .maybeSingle();
      // o áudio chegou sem transcrição e agora ela veio: troca no lugar (não é edição do cliente)
      if (original && String(original.content ?? "").includes(AUDIO_SEM_TRANSCRICAO) && !textoAtualizado.includes(AUDIO_SEM_TRANSCRICAO)) {
        await supabaseAdmin.from("bot_observations").update({ content: textoAtualizado }).eq("id", original.id);
        evento("bot_audio_transcrito", { conversa: conv, autor });
        // o que o cliente FALOU segue o caminho de uma mensagem de texto dele (issue #470): resposta do
        // atendente no modo ia, releitura do Agendado pendente, reserva "a confirmar", SIM/NÃO da viagem
        if (autor === "cliente") {
          await processar({ ...body, event: "message_created", content: textoAtualizado, attachments: [] }, { transcricao: true });
        }
        return;
      }
      // o bot já transcreveu e o Chatwoot mandou a dele depois: não é edição do cliente (issue #482)
      if (original && transcricaoRepetida(original.content, body.attachments)) return;
      if (original && original.content !== textoAtualizado) {
        await registrarObservacao({
          conversationId: original.conversation_id ?? undefined,
          chatwootConversationId: conv,
          author: autor,
          content: textoEditado(textoAtualizado),
        });
        evento("bot_mensagem_editada", { conversa: conv, autor });
      }
    }
    return;
  }
  const atividade = extrairAtividade(body, INBOX_ID);
  const conversaEspelhada = atividade ? await espelhar(atividade) : undefined;
  // mensagem do cliente sem texto nem anexo: o bot não lê esse tipo — registra para não sumir (issue #417)
  if (
    atividade?.autor === "cliente" && !atividade.texto && conversaEspelhada &&
    !(Array.isArray(body.attachments) && body.attachments.length)
  ) {
    evento("bot_mensagem_sem_texto", {
      conversa: atividade.chatwootConversationId,
      campos: Object.keys(body ?? {}),
      atributos: Object.keys(body?.content_attributes ?? {}),
      tipo_conteudo: body?.content_type ?? null,
    });
    await registrarObservacao({
      conversationId: conversaEspelhada,
      chatwootConversationId: atividade.chatwootConversationId,
      chatwootMessageId: atividade.mensagemId,
      author: "cliente",
      content: MENSAGEM_ILEGIVEL,
    });
  }

  // taxista, equipe ou família (issue #532): a conversa aparece para a equipe e o "Agendado ☑️" vale, mas o
  // bot não observa, não responde, não abre pendência e não aprende com ela
  const interno = await contatoInterno(atividade?.telefone);
  if (interno && atividade && !(atividade.autor === "equipe" && atividade.texto && (ehMarcaDeAgendado(atividade.texto) || ehMarcaDeCorrecao(atividade.texto)))) {
    evento("bot_contato_interno", { conversa: atividade.chatwootConversationId, autor: atividade.autor ?? null });
    return;
  }

  const { data: cfg } = await supabaseAdmin.from("settings").select("value").eq("key", "attendance_mode").maybeSingle();
  const modo: string = cfg?.value?.mode ?? "ia";
  // piloto do atendente de IA (issue #537): no modo sombra, responde SÓ aos passageiros da lista
  const noPiloto = modo === "sombra" && atividade?.autor === "cliente" && !interno && (await pilotoVale(atividade.telefone ?? ""));

  // O bot OBSERVA as conversas em QUALQUER modo (ia, manual ou sombra): o que o
  // cliente escreveu, o que o atendente respondeu (pelo celular ou pelo Chatwoot)
  // e o que o próprio bot enviou. É assim que ele aprende como os clientes falam,
  // como a equipe atende e agenda e como a empresa funciona (issue #218).
  let observou = false;
  if (opcoes.transcricao) {
    observou = true; // a observação do áudio já foi trocada pela transcrição, no lugar
  } else if (!interno && atividade?.autor && atividade.texto && conversaEspelhada) {
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

  // resposta ao "você confirma a viagem?" pedido pela equipe (issue #434): registra e agradece; a
  // mensagem já foi observada, nada mais responde a ela
  if (atividade?.autor === "cliente" && atividade.texto && conversaEspelhada) {
    const tratada = await registrarPresencaSePedida({
      telefone: atividade.telefone,
      texto: atividade.texto,
      chatwootConversationId: atividade.chatwootConversationId,
    }).catch((e) => {
      evento("bot_erro", { etapa: "presenca", erro: String(e).slice(0, 300) });
      return false;
    });
    if (tratada) return;
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
    { chatwootConversationId: m.chatwootConversationId, conversationId: conversation.id, shadow: modo === "sombra" && !noPiloto, piloto: noPiloto },
    () =>
      handleIncomingMessage({
        from: m.telefone,
        // a transcrição é outra entrada da mesma mensagem: o áudio (cw-<id>) já foi registrado
        waMessageId: `cw-${m.chatwootMessageId}${opcoes.transcricao ? "-transcricao" : ""}`,
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
