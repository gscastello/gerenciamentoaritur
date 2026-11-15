// src/hooks/useAvisos.js
//
// Avisos aos passageiros de uma viagem (issue #432): o que já foi enviado e a ação de enviar.

import { useCallback } from "react";
import { avisosService } from "../services/avisosService.js";
import { useAsyncAction } from "./useAsyncAction.js";
import { useSupabaseQuery } from "./useSupabaseQuery.js";

export function useAvisos(data, direcao, { enabled = true } = {}) {
  const query = useSupabaseQuery(() => avisosService.listar(data, direcao), [data, direcao], {
    enabled: enabled && !!data && !!direcao,
  });
  const envio = useAsyncAction(avisosService.enviar);
  const enviar = useCallback(
    async (itens) => {
      const resultados = await envio.run(itens);
      await query.refetch();
      return resultados;
    },
    [envio, query],
  );
  return {
    avisos: query.data ?? [],
    loading: query.loading,
    error: query.error,
    enviando: envio.loading,
    erroDoEnvio: envio.error,
    enviar,
  };
}
