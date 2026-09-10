// src/hooks/usePendencias.js
//
// Fila de pendências de atendimento — carrega, atualiza sozinha via
// Realtime e expõe a contagem + ações (abrir, resolver).

import { useCallback } from "react";
import { pendenciasService } from "../services/pendenciasService";
import { useSupabaseQuery } from "./useSupabaseQuery";
import { useRealtimeTable } from "./useRealtimeTable";
import { useAsyncAction } from "./useAsyncAction";

export function usePendencias({ enabled = true } = {}) {
  const query = useSupabaseQuery(() => pendenciasService.list(), [enabled], { enabled });
  const abrirA = useAsyncAction(pendenciasService.abrir);
  const resolverA = useAsyncAction(pendenciasService.resolver);

  useRealtimeTable("support_tickets", () => query.refetch(), { enabled });

  const lista = query.data ?? [];

  const abrir = useCallback(
    async (payload) => {
      await abrirA.run(payload);
      query.refetch();
    },
    [abrirA, query],
  );
  const resolver = useCallback(
    async (id) => {
      await resolverA.run(id);
      query.refetch();
    },
    [resolverA, query],
  );

  return {
    pendencias: lista,
    total: lista.length,
    loading: query.loading,
    error: query.error,
    abrir,
    resolver,
    recarregar: query.refetch,
  };
}
