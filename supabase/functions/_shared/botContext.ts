// supabase/functions/_shared/botContext.ts
//
// Contexto da conversa em atendimento, disponível pra qualquer camada sem
// ter que passar parâmetro por todo o motor de reservas (que foi escrito
// com o telefone como único identificador). Escopo por requisição via
// AsyncLocalStorage — o isolate da Edge Function atende várias conversas
// ao mesmo tempo, então uma variável global misturaria uma com a outra.

import { AsyncLocalStorage } from "node:async_hooks";

export type BotContext = {
  /** id da conversa no Chatwoot (pra onde as respostas vão). */
  chatwootConversationId: number;
  /** id da linha em whatsapp_conversations. */
  conversationId: string;
  /** Modo sombra: respostas viram nota privada e nada é gravado no negócio. */
  shadow: boolean;
};

const storage = new AsyncLocalStorage<BotContext>();

export function runWithBotContext<T>(ctx: BotContext, fn: () => Promise<T>): Promise<T> {
  return storage.run(ctx, fn);
}

export function getBotContext(): BotContext | undefined {
  return storage.getStore();
}
