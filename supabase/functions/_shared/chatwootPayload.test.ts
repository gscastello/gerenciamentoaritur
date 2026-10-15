import { assertEquals } from "jsr:@std/assert";
import { extrairMensagemDeCliente } from "./chatwootPayload.ts";

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

Deno.test("message_type numérico 0 (versões antigas) também é entrada", () => {
  assertEquals(extrairMensagemDeCliente({ ...base(), message_type: 0 })?.chatwootMessageId, 901);
});
