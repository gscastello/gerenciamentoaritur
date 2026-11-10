// src/services/assistenteService.js
//
// Assistente da equipe (issue #288): conversa com a Edge Function `assistente`,
// que consulta o app com as permissões de quem está logado e só PROPÕE
// gravações. Gravar é outra chamada (`executar`), feita pelo toque em
// "Confirmar" no cartão da proposta.

import { ServiceError, getCurrentUserId, supabase } from "../lib/supabaseClient";

async function chamar(body) {
  const { data, error } = await supabase.functions.invoke("assistente", { body });
  if (error) {
    let msg = error.message;
    try {
      const corpo = await error.context?.json?.();
      if (corpo?.message) msg = corpo.message;
    } catch {
      /* usa error.message */
    }
    throw new ServiceError(msg || "O assistente não respondeu.", {
      cause: error,
      retryable: /fetch|network|timeout/i.test(msg || ""),
    });
  }
  if (!data?.success) {
    throw new ServiceError(data?.message || "O assistente não conseguiu atender.", {
      retryable: false,
    });
  }
  return data;
}

export const assistenteService = {
  /** @param {{papel: "usuario"|"assistente", texto: string}[]} mensagens */
  async conversar(mensagens) {
    const data = await chamar({ modo: "conversar", mensagens });
    return { texto: data.texto ?? "", acoes: data.acoes ?? [] };
  },

  /** Chaves pessoais do atalho da Siri (issue #290) de quem está logado. */
  async listarChaves() {
    const uid = await getCurrentUserId();
    const { data, error } = await supabase
      .from("assistente_chaves")
      .select("id, nome, final, created_at, last_used_at")
      .eq("user_id", uid)
      .is("revoked_at", null)
      .order("created_at", { ascending: false });
    if (error)
      throw new ServiceError(`assistente.listarChaves: ${error.message}`, { cause: error });
    return data ?? [];
  },

  /** Gera uma chave nova; o texto volta UMA vez (no banco fica só o hash). */
  async gerarChave(nome) {
    const { data, error } = await supabase.rpc("rpc_criar_chave_assistente", {
      p_nome: nome || "iPhone",
    });
    if (error) throw new ServiceError(`assistente.gerarChave: ${error.message}`, { cause: error });
    if (!data?.success) throw new ServiceError(data?.message || "Não foi possível gerar a chave.");
    return data.chave;
  },

  async revogarChave(id) {
    const { data, error } = await supabase.rpc("rpc_revogar_chave_assistente", { p_id: id });
    if (error)
      throw new ServiceError(`assistente.revogarChave: ${error.message}`, { cause: error });
    if (!data?.success) throw new ServiceError(data?.message || "Não foi possível apagar a chave.");
  },

  /** Grava uma proposta (criar, mudar ou cancelar) depois do "Confirmar". */
  async executar(acao) {
    const data = await chamar({ modo: "executar", acao });
    return data.message ?? "Feito.";
  },
};
