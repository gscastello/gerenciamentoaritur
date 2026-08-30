// src/hooks/useTrips.js
//
// Expõe a ocupação (v_trip_occupancy) de um dia. É a mesma consulta que
// alimenta a Agenda e o "restam N vagas" da tela de Reservar. Como a
// view lê direto de reservation_passengers, ela reflete qualquer escrita
// de qualquer atendente/motorista assim que o realtime disparar o
// refetch — mas, de novo: isso é só EXIBIÇÃO. A trigger do banco é quem
// realmente impede overbooking, mesmo que esta tela esteja um instante
// desatualizada entre o evento e o refetch.

import { useCallback, useMemo } from "react";
import { tripsService } from "../services/tripsService";
import { useSupabaseQuery } from "./useSupabaseQuery";
import { useRealtimeTable } from "./useRealtimeTable";
import { useAsyncAction } from "./useAsyncAction";

export function useTrips(tripDate) {
  const query = useSupabaseQuery(() => tripsService.getDayOverview(tripDate), [tripDate], { enabled: !!tripDate });

  useRealtimeTable(["trips", "reservation_passengers"], () => query.refetch());

  const start = useAsyncAction(tripsService.startTrip);
  const finish = useAsyncAction(tripsService.finishTrip);

  const byDirection = useMemo(() => {
    const map = { ida: null, volta: null };
    (query.data ?? []).forEach((row) => { map[row.direction] = row; });
    return map;
  }, [query.data]);

  const startTrip = useCallback(async (tripId, opts) => { const r = await start.run(tripId, opts); await query.refetch(); return r; }, [start, query]);
  const finishTrip = useCallback(async (tripId, opts) => { const r = await finish.run(tripId, opts); await query.refetch(); return r; }, [finish, query]);

  return {
    trips: query.data ?? [],
    byDirection,
    loading: query.loading,
    error: query.error,
    refetch: query.refetch,
    startTrip, finishTrip,
    actionState: { starting: start.loading, finishing: finish.loading },
  };
}
