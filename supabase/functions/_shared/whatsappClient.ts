// supabase/functions/_shared/whatsappClient.ts
//
// Camada mais baixa de envio. O número de WhatsApp está conectado ao
// Chatwoot Cloud por Coexistência (a conexão com a Meta é dele), então
// toda saída passa pela API do Chatwoot — não há mais chamada direta à
// Graph API. Mantém as mesmas assinaturas de antes (sendText/sendList/
// sendButtons) pra o motor de reservas não mudar.
//
// O Chatwoot não documenta botões/listas interativos do WhatsApp pra bot,
// então opções vão como texto numerado (ver opcoes.ts); as opções
// oferecidas ficam em whatsapp_conversations.last_options pra resolver a
// resposta do cliente ("1", "volta") no id que o motor espera.
//
// Modo sombra: em vez de mandar ao cliente, a resposta vira nota privada
// no Chatwoot — o dono confere o que o bot diria.

import { getBotContext } from "./botContext.ts";
import { chatwootClient } from "./chatwootClient.ts";
import { formatarOpcoes, type Opcao } from "./opcoes.ts";
import { supabaseAdmin } from "./supabaseAdmin.ts";

async function enviar(texto: string, opcoes: Opcao[] | null) {
  const ctx = getBotContext();
  if (!ctx) throw new Error("Envio fora do contexto de uma conversa do Chatwoot.");

  const { error } = await supabaseAdmin
    .from("whatsapp_conversations")
    .update({ last_options: opcoes })
    .eq("id", ctx.conversationId);
  if (error) console.error("Falha ao guardar as opções oferecidas:", error.message);

  if (ctx.shadow) {
    return chatwootClient.postMessage(
      ctx.chatwootConversationId,
      `🤖 [SOMBRA] Resposta que o bot enviaria:\n\n${texto}`,
      { private: true },
    );
  }
  return chatwootClient.postMessage(ctx.chatwootConversationId, texto);
}

export const whatsappClient = {
  // `to` (telefone) ficou na assinatura por compatibilidade; o destino vem
  // do contexto da conversa do Chatwoot.
  sendText(_to: string, body: string) {
    return enviar(body, null);
  },

  /** Lista de opções (até 10 itens) — menu, pontos de embarque, reservas. */
  sendList(_to: string, _header: string, bodyText: string, _buttonLabel: string, rows: Opcao[]) {
    return enviar(formatarOpcoes(bodyText, rows), rows);
  },

  /** Poucas opções (sim/não, formas de pagamento). */
  sendButtons(_to: string, bodyText: string, buttons: { id: string; title: string }[]) {
    return enviar(formatarOpcoes(bodyText, buttons), buttons);
  },

  /** Modelos aprovados (lembretes fora da janela de 24h) ainda não saem pelo Chatwoot. */
  sendTemplate(_to: string, _templateName: string, _languageCode: string, _components: unknown[] = []): Promise<never> {
    return Promise.reject(new Error("Envio de modelos (templates) pelo Chatwoot ainda não foi implementado."));
  },

  /** O Chatwoot entrega o anexo como URL pública (attachments[].data_url). */
  async downloadMedia(url: string): Promise<{ bytes: Uint8Array; mimeType: string }> {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`Falha ao baixar o anexo do Chatwoot: ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    return { bytes, mimeType: res.headers.get("content-type") ?? "application/octet-stream" };
  },
};
