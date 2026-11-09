// src/hooks/useRascunhosDeReserva.js
//
// Reservas prontas para lançar (issue #254): a lista que o bot prepara a partir
// das conversas do WhatsApp. Atualiza sozinha via Realtime — quando um sócio
// lança a reserva, o gatilho do banco fecha o rascunho e some para todos.

import { useCallback } from "react";
import { todayStr } from "../domain/format.js";
import { reservationDraftsService } from "../services/reservationDraftsService";
import { useRealtimeTable } from "./useRealtimeTable";
import { useSupabaseQuery } from "./useSupabaseQuery";

export function useRascunhosDeReserva({ enabled = true } = {}) {
  const q = useSupabaseQuery(() => reservationDraftsService.listarProntos(todayStr()), [enabled], {
    enabled,
  });
  useRealtimeTable("reservation_drafts", () => q.refetch(), { enabled });

  const descartar = useCallback(
    async (id) => {
      await reservationDraftsService.descartar(id);
      await q.refetch();
    },
    [q],
  );

  return {
    rascunhos: q.data ?? [],
    loading: q.loading,
    error: q.error,
    recarregar: q.refetch,
    descartar,
  };
}
