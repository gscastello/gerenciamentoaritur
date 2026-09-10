// src/hooks/useErrorLog.js

import { errorLogService } from "../services/errorLogService";
import { useSupabaseQuery } from "./useSupabaseQuery";

export function useErrorLog({ enabled = true } = {}) {
  const query = useSupabaseQuery(() => errorLogService.list({ limit: 50 }), [enabled], { enabled });
  return {
    erros: query.data ?? [],
    loading: query.loading,
    error: query.error,
    recarregar: query.refetch,
  };
}
