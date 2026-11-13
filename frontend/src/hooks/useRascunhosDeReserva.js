// src/hooks/useRascunhosDeReserva.js
//
// Reservas prontas para lançar (issue #254): a lista que o bot prepara a partir
// das conversas do WhatsApp. Atualiza sozinha via Realtime — quando um sócio
// lança a reserva, o gatilho do banco fecha o rascunho e some para todos.

import { useCallback, useMemo } from "react";
import { todayStr } from "../domain/format.js";
import { rascunhoAindaValeLancar } from "../domain/rascunhoReserva.js";
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

  // viagem de hoje que já saiu não é mais "pronta para lançar" (issue #357)
  const rascunhos = useMemo(() => {
    const hora = new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Fortaleza",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date());
    return (q.data ?? []).filter((r) => rascunhoAindaValeLancar(r, todayStr(), hora));
  }, [q.data]);

  return {
    rascunhos,
    loading: q.loading,
    error: q.error,
    recarregar: q.refetch,
    descartar,
  };
}
