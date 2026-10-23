// src/hooks/useReservationBackups.js
//
// Backup diário das reservas do dia (database/60). `dias` é só metadados;
// o retrato de um dia vem sob demanda (`buscarRetrato`).

import { useCallback } from "react";
import { reservationBackupsService } from "../services/reservationBackupsService";
import { useAsyncAction } from "./useAsyncAction";
import { useSupabaseQuery } from "./useSupabaseQuery";

export function useReservationBackups() {
  const query = useSupabaseQuery(() => reservationBackupsService.list(60), []);
  const rodar = useAsyncAction(reservationBackupsService.runNow);

  const fazerAgora = useCallback(
    async (date = null) => {
      const r = await rodar.run(date);
      await query.refetch();
      return r;
    },
    [rodar, query],
  );

  return {
    dias: query.data ?? [],
    loading: query.loading,
    error: query.error,
    fazerAgora,
    fazendo: rodar.loading,
    buscarRetrato: reservationBackupsService.getById,
  };
}
