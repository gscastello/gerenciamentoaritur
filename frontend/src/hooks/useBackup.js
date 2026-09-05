// src/hooks/useBackup.js
//
// Backup completo (database/17-backup-completo.sql). `historico` é só
// metadados (o payload de cada backup pode ser grande — busca sob
// demanda com `buscarPayload`). `gerarAgora` dispara rpc_generate_backup
// e já devolve o jsonb inteiro pra oferecer o download na hora.

import { useCallback } from "react";
import { backupService } from "../services/backupService";
import { useAsyncAction } from "./useAsyncAction";
import { useSupabaseQuery } from "./useSupabaseQuery";

export function useBackup() {
  const query = useSupabaseQuery(() => backupService.list(30), []);
  const gerar = useAsyncAction(backupService.generateNow);

  const gerarAgora = useCallback(async () => {
    const payload = await gerar.run();
    await query.refetch();
    return payload;
  }, [gerar, query]);

  return {
    historico: query.data ?? [],
    loading: query.loading,
    error: query.error,
    refetch: query.refetch,
    gerarAgora,
    gerando: gerar.loading,
    buscarPayload: backupService.getById,
  };
}
