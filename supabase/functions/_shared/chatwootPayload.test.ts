import { assertEquals } from "jsr:@std/assert";
import {
  contatosCompartilhados,
  extrairAtividade,
  extrairMensagemDeCliente,
  extrairPedidoDeTeste,
  textoComContatos,
} from "./chatwootPayload.ts";

const base = () => ({
  event: "message_created",
  id: 901,
  content: "Oi, queria ir pra Pirapemas amanhã",
  message_type: "incoming",
  private: false,
  sender: { id: 7, name: "Maria", phone_number: "+5598981012388" },
  conversation: { id: 55, status: "pending", inbox_id: 146985 },
  inbox: { id: 146985 },
});

Deno.test("mensagem de cliente é extraída com telefone em E.164 sem +", () => {
  assertEquals(extrairMensagemDeCliente(base(), 146985), {
    chatwootMessageId: 901,
    chatwootConversationId: 55,
    statusConversa: "pending",
    telefone: "5598981012388",
    texto: "Oi, queria ir pra Pirapemas amanhã",
    anexo: undefined,
  });
});

Deno.test("mensagem enviada pela equipe/bot (outgoing) é ignorada", () => {
  assertEquals(extrairMensagemDeCliente({ ...base(), message_type: "outgoing" }), null);
});

Deno.test("nota privada é ignorada", () => {
  assertEquals(extrairMensagemDeCliente({ ...base(), private: true }), null);
});

Deno.test("outros eventos (status, atualização) são ignorados", () => {
  assertEquals(extrairMensagemDeCliente({ ...base(), event: "conversation_status_changed" }), null);
  assertEquals(extrairMensagemDeCliente({ ...base(), event: "message_updated" }), null);
});

Deno.test("mensagem de outra caixa de entrada é ignorada", () => {
  assertEquals(extrairMensagemDeCliente({ ...base(), inbox: { id: 999 }, conversation: { id: 55, inbox_id: 999 } }, 146985), null);
});

Deno.test("sem filtro de caixa configurado, qualquer caixa passa", () => {
  assertEquals(extrairMensagemDeCliente({ ...base(), inbox: { id: 999 } }, 0)?.chatwootConversationId, 55);
});

Deno.test("sem telefone do remetente não há como responder: ignorada", () => {
  assertEquals(extrairMensagemDeCliente({ ...base(), sender: { id: 7 } }), null);
});

Deno.test("telefone pode vir de conversation.meta.sender", () => {
  const b = { ...base(), sender: undefined, conversation: { id: 55, meta: { sender: { phone_number: "+5598999990000" } } } };
  assertEquals(extrairMensagemDeCliente(b)?.telefone, "5598999990000");
});

Deno.test("anexos: áudio, imagem e arquivo", () => {
  const com = (file_type: string) => ({ ...base(), content: "", attachments: [{ file_type, data_url: "https://x/y" }] });
  assertEquals(extrairMensagemDeCliente(com("audio"))?.anexo, { url: "https://x/y", tipo: "audio" });
  assertEquals(extrairMensagemDeCliente(com("image"))?.anexo, { url: "https://x/y", tipo: "image" });
  assertEquals(extrairMensagemDeCliente(com("file"))?.anexo, { url: "https://x/y", tipo: "document" });
  assertEquals(extrairMensagemDeCliente(com("image"))?.texto, undefined);
});

Deno.test("anexo WebP é figurinha, não imagem/comprovante", () => {
  const com = (a: Record<string, unknown>) => ({ ...base(), content: "", attachments: [a] });
  const sticker = { url: "https://x/y.webp?sig=1", tipo: "sticker" };
  assertEquals(extrairMensagemDeCliente(com({ file_type: "image", data_url: "https://x/y.webp?sig=1" }))?.anexo, sticker);
  assertEquals(
    extrairMensagemDeCliente(com({ file_type: "image", extension: "webp", data_url: "https://x/y" }))?.anexo,
    { url: "https://x/y", tipo: "sticker" },
  );
  // foto de verdade continua imagem
  assertEquals(extrairMensagemDeCliente(com({ file_type: "image", data_url: "https://x/y.jpg" }))?.anexo, {
    url: "https://x/y.jpg", tipo: "image",
  });
});

Deno.test("message_type numérico 0 (versões antigas) também é entrada", () => {
  assertEquals(extrairMensagemDeCliente({ ...base(), message_type: 0 })?.chatwootMessageId, 901);
});

const conversa = (extra = {}) => ({
  id: 55,
  status: "open",
  inbox_id: 146985,
  meta: { sender: { id: 7, name: "😎 Maria Top", phone_number: "+5598981012388" } },
  ...extra,
});

Deno.test("atividade: mensagem do cliente", () => {
  const a = extrairAtividade({ event: "message_created", id: 1, content: "Oi!", message_type: "incoming", private: false,
    sender: { id: 7, name: "😎 Maria Top", phone_number: "+5598981012388" }, conversation: conversa() }, 146985);
  assertEquals(a, { chatwootConversationId: 55, telefone: "5598981012388", nomeContato: "😎 Maria Top", contatoId: 7,
    status: "open", autor: "cliente", previa: "Oi!", texto: "Oi!", mensagemId: 1 });
});

Deno.test("atividade: resposta da equipe vs. do bot (contato vem da conversa)", () => {
  const msg = (type: string) => ({ event: "message_created", id: 2, content: "Já te ajudo", message_type: "outgoing", private: false,
    sender: { id: 3, type }, conversation: conversa() });
  assertEquals(extrairAtividade(msg("user"))?.autor, "equipe");
  assertEquals(extrairAtividade(msg("agent_bot"))?.autor, "bot");
  assertEquals(extrairAtividade(msg("user"))?.telefone, "5598981012388");
});

Deno.test("atividade: nota privada e mensagem de atividade são ignoradas", () => {
  const base = { event: "message_created", id: 3, content: "x", message_type: "outgoing", sender: { type: "user" }, conversation: conversa() };
  assertEquals(extrairAtividade({ ...base, private: true }), null);
  assertEquals(extrairAtividade({ ...base, private: false, message_type: "activity" }), null);
});

Deno.test("atividade: mudança de status com a conversa na raiz ou aninhada", () => {
  assertEquals(extrairAtividade({ event: "conversation_status_changed", ...conversa({ status: "pending" }) })?.status, "pending");
  assertEquals(extrairAtividade({ event: "conversation_resolved", conversation: conversa({ status: "resolved" }) })?.status, "resolved");
});

Deno.test("atividade: prévia de anexo e limite de tamanho", () => {
  const com = (file_type: string, content = "") => extrairAtividade({ event: "message_created", id: 4, content, message_type: "incoming",
    attachments: [{ file_type, data_url: "https://x" }], sender: { id: 7, phone_number: "+5598981012388" }, conversation: conversa() });
  assertEquals(com("audio")?.previa, "[áudio]");
  assertEquals(com("image")?.previa, "[imagem]");
  assertEquals(com("image", "a".repeat(500))?.previa?.length, 140);
});

Deno.test("atividade: outra caixa de entrada e eventos desconhecidos são ignorados", () => {
  assertEquals(extrairAtividade({ event: "conversation_opened", ...conversa({ inbox_id: 999 }) }, 146985), null);
  assertEquals(extrairAtividade({ event: "webwidget_triggered", ...conversa() }), null);
});

Deno.test("atividade: carrega o texto inteiro e o id da mensagem (modo sombra observa)", () => {
  const longo = `${"Resposta longa do atendente. ".repeat(20)}`.trim();
  const a = extrairAtividade({ event: "message_created", id: 77, content: longo, message_type: "outgoing", private: false,
    sender: { id: 3, type: "user" }, conversation: conversa() });
  assertEquals(a?.autor, "equipe");
  assertEquals(a?.mensagemId, 77);
  assertEquals(a?.texto, longo);
  assertEquals((a?.previa ?? "").length <= 140, true);
});

Deno.test("atividade: mensagem só com anexo não tem texto para observar", () => {
  const a = extrairAtividade({ event: "message_created", id: 78, content: "", message_type: "outgoing", private: false,
    sender: { id: 3, type: "user" }, attachments: [{ file_type: "image", data_url: "https://x/y.jpg" }], conversation: conversa() });
  assertEquals(a?.texto, undefined);
  assertEquals(a?.previa, "[imagem]");
});

Deno.test("atividade: nota privada (inclusive o rascunho do bot) nunca é observada", () => {
  const a = extrairAtividade({ event: "message_created", id: 79, content: "🤖 [SOMBRA] ...", message_type: "outgoing", private: true,
    sender: { id: 3, type: "agent_bot" }, conversation: conversa() });
  assertEquals(a, null);
});

const CARD = {
  file_type: "contact",
  fallback_title: "+55 98 98888-7777",
  meta: { firstName: "Maria", lastName: "Silva" },
};

Deno.test("card de contato do WhatsApp vira nome e telefone (issue #268)", () => {
  assertEquals(contatosCompartilhados([CARD]), [{ nome: "Maria Silva", telefone: "5598988887777" }]);
  assertEquals(contatosCompartilhados([{ file_type: "contact", fallback_title: "98988887777" }]), [
    { nome: null, telefone: "98988887777" },
  ]);
  // sem número de verdade, imagem ou nada: ignora
  assertEquals(contatosCompartilhados([{ file_type: "contact", fallback_title: "Phone number is not available" }]), []);
  assertEquals(contatosCompartilhados([{ file_type: "image", data_url: "x" }]), []);
  assertEquals(contatosCompartilhados(undefined), []);
});

Deno.test("card de contato entra no texto da mensagem do cliente e da atividade", () => {
  assertEquals(textoComContatos("", [CARD]), "[contato compartilhado: Maria Silva — 5598988887777]");
  assertEquals(textoComContatos("O contato do passageiro", [CARD]), "O contato do passageiro [contato compartilhado: Maria Silva — 5598988887777]");
  assertEquals(textoComContatos("oi", []), "oi");
  assertEquals(textoComContatos("  ", []), undefined);

  const body = {
    event: "message_created",
    message_type: "incoming",
    id: 77,
    content: null,
    attachments: [CARD],
    conversation: { id: 214, status: "open", meta: { sender: { phone_number: "+559884227729" } } },
    sender: { phone_number: "+559884227729" },
  };
  const m = extrairMensagemDeCliente(body);
  assertEquals(m?.texto, "[contato compartilhado: Maria Silva — 5598988887777]");
  assertEquals(m?.anexo, undefined);
  assertEquals(extrairAtividade(body)?.texto, "[contato compartilhado: Maria Silva — 5598988887777]");
});

Deno.test("teste do dono: nota privada #testar da equipe (issue #278)", () => {
  const nota = (content: string, extra: Record<string, unknown> = {}) => ({
    event: "message_created",
    message_type: "outgoing",
    private: true,
    content,
    sender: { type: "user" },
    conversation: { id: 77, inbox_id: 1, meta: { sender: { phone_number: "+5598988887777" } } },
    ...extra,
  });
  assertEquals(extrairPedidoDeTeste(nota("#testar tem vaga amanhã pra Cantanhede?"), 1), {
    chatwootConversationId: 77,
    telefone: "5598988887777",
    pergunta: "tem vaga amanhã pra Cantanhede?",
  });
  assertEquals(extrairPedidoDeTeste(nota("#TESTE"), 1)?.pergunta, null);
  assertEquals(extrairPedidoDeTeste(nota("# testar: quanto custa?"), 1)?.pergunta, "quanto custa?");
  // pública não conta (iria para o cliente); nota do próprio bot também não
  assertEquals(extrairPedidoDeTeste(nota("#testar oi", { private: false }), 1), null);
  assertEquals(extrairPedidoDeTeste(nota("#testar oi", { sender: { type: "agent_bot" } }), 1), null);
  // só no começo da nota; outra caixa não conta
  assertEquals(extrairPedidoDeTeste(nota("vou #testar depois"), 1), null);
  assertEquals(extrairPedidoDeTeste(nota("#testar oi"), 2), null);
  assertEquals(extrairPedidoDeTeste(nota("#testarei"), 1), null);
});
