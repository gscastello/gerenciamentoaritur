// supabase/functions/_shared/contatosInternos.ts
//
// Taxistas, equipe e família (issue #532): o bot nunca escreve para eles e não lê as conversas deles como se
// fossem de clientes. Os números ficam em `contatos_internos` (database/139). Na falha da consulta, o contato
// é tratado como cliente comum: uma falha no banco não pode calar o bot para os passageiros.

import { supabaseAdmin } from "./supabaseAdmin.ts";

const VALIDADE_MS = 5 * 60 * 1000;
const memoria = new Map<string, { interno: boolean; ate: number }>();

async function consultar(chave: string, funcao: string, args: Record<string, unknown>): Promise<boolean> {
  const agora = Date.now();
  const guardado = memoria.get(chave);
  if (guardado && guardado.ate > agora) return guardado.interno;
  const { data, error } = await supabaseAdmin.rpc(funcao, args);
  if (error) {
    console.log(JSON.stringify({ evento: "bot_aviso", aviso: "contato_interno_nao_conferido", erro: error.message.slice(0, 200) }));
    return false;
  }
  memoria.set(chave, { interno: data === true, ate: agora + VALIDADE_MS });
  return data === true;
}

/** O telefone é de taxista, equipe ou família? */
export async function contatoInterno(telefone: string | null | undefined): Promise<boolean> {
  const t = String(telefone ?? "").replace(/\D/g, "");
  return t.length >= 10 ? await consultar(`t:${t}`, "fn_contato_interno", { p_phone: t }) : false;
}

/** A conversa do Chatwoot é com um contato interno? */
export async function conversaInterna(chatwootConversationId: number): Promise<boolean> {
  return chatwootConversationId > 0
    ? await consultar(`c:${chatwootConversationId}`, "fn_conversa_interna", { p_chatwoot_conversation_id: chatwootConversationId })
    : false;
}
