// src/services/listaDesembarqueService.js
//
// Lista de desembarque anotada na viagem (issue #383, database/106). Ler é a
// tabela; salvar é a RPC, que JUNTA as linhas com as do banco (linha por linha,
// vale a mais recente) e devolve a lista final.

import { ServiceError, supabase } from "../lib/supabaseClient";

function isNetworkish(error) {
  return /fetch|network|timeout/i.test(error?.message || "");
}

export const listaDesembarqueService = {
  async ler(data, direcao) {
    const { data: rows, error } = await supabase
      .from("listas_desembarque")
      .select("linhas")
      .eq("trip_date", data)
      .eq("direction", direcao)
      .limit(1)
      // na estrada o sinal some: sem novas tentativas automáticas e no máximo 5 s; a
      // tela fica com a cópia do aparelho e o hook tenta de novo quando a rede volta
      .retry(false)
      .abortSignal(AbortSignal.timeout(5000));
    if (error)
      throw new ServiceError(`lerListaDesembarque: ${error.message}`, {
        cause: error,
        retryable: isNetworkish(error),
      });
    return rows?.[0]?.linhas ?? [];
  },

  async salvar(data, direcao, linhas) {
    const { data: final, error } = await supabase.rpc("rpc_salvar_lista_desembarque", {
      p_data: data,
      p_direcao: direcao,
      p_linhas: linhas,
    });
    if (error)
      throw new ServiceError(`salvarListaDesembarque: ${error.message}`, {
        cause: error,
        retryable: isNetworkish(error),
      });
    return Array.isArray(final) ? final : [];
  },
};
