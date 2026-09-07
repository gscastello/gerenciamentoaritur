// src/hooks/useDiagnostics.js
//
// Diagnóstico de reservas no servidor (issue #9). `achados` é a lista viva
// da view v_diagnostico_reservas; `rodar()` dispara o job e devolve o
// resumo ({ corrigidas, novos_alertas, por_tipo }).

import { useCallback } from "react";
import { diagnosticsService } from "../services/diagnosticsService";
import { useAsyncAction } from "./useAsyncAction";
import { useSupabaseQuery } from "./useSupabaseQuery";

export function useDiagnostics() {
  const query = useSupabaseQuery(() => diagnosticsService.listFindings(), []);
  const acao = useAsyncAction(diagnosticsService.runNow);

  const rodar = useCallback(async () => {
    const resumo = await acao.run();
    await query.refetch();
    return resumo;
  }, [acao, query]);

  return {
    achados: query.data ?? [],
    loading: query.loading,
    error: query.error,
    refetch: query.refetch,
    rodar,
    rodando: acao.loading,
  };
}
