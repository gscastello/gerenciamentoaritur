// src/services/assistenteService.js
//
// Assistente da equipe (issue #288): conversa com a Edge Function `assistente`,
// que consulta o app com as permissões de quem está logado e só PROPÕE
// gravações. Gravar é outra chamada (`executar`), feita pelo toque em
// "Confirmar" no cartão da proposta.

import { ServiceError, supabase } from "../lib/supabaseClient";

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

  /** Grava uma proposta (criar, mudar ou cancelar) depois do "Confirmar". */
  async executar(acao) {
    const data = await chamar({ modo: "executar", acao });
    return data.message ?? "Feito.";
  },
};
