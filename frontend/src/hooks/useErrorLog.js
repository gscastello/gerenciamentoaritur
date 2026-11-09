// src/hooks/useErrorLog.js

import { useCallback } from "react";
import { errorLogService } from "../services/errorLogService";
import { useAsyncAction } from "./useAsyncAction";
import { useSupabaseQuery } from "./useSupabaseQuery";

export function useErrorLog({ enabled = true } = {}) {
  const query = useSupabaseQuery(() => errorLogService.list({ limit: 50 }), [enabled], { enabled });
  const resolveAcao = useAsyncAction(errorLogService.resolve);
  const resolveAllAcao = useAsyncAction(errorLogService.resolveAll);

  const resolver = useCallback(
    async (id) => {
      await resolveAcao.run(id);
      await query.refetch();
    },
    [resolveAcao, query],
  );
  const limparTodos = useCallback(async () => {
    const n = await resolveAllAcao.run();
    await query.refetch();
    return n;
  }, [resolveAllAcao, query]);

  return {
    erros: query.data ?? [],
    loading: query.loading,
    error: query.error,
    recarregar: query.refetch,
    resolver,
    limparTodos,
    resolvendo: resolveAcao.loading || resolveAllAcao.loading,
  };
}
