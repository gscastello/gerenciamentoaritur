// src/hooks/useOperation.js
import { operationService } from "../services/operationService";
import { useSupabaseQuery } from "./useSupabaseQuery";
import { useRealtimeTable } from "./useRealtimeTable";
import { useAsyncAction } from "./useAsyncAction";

export function useFuelRecords(vehicleId, range = {}) {
  const query = useSupabaseQuery(() => operationService.listFuelRecords({ vehicleId, ...range }), [vehicleId, range.from, range.to]);
  useRealtimeTable("fuel_records", () => query.refetch());

  const add = useAsyncAction(operationService.addFuelRecord);
  const update = useAsyncAction(operationService.updateFuelRecord);
  const remove = useAsyncAction(operationService.removeFuelRecord);
  const statsQuery = useSupabaseQuery(() => operationService.getFuelStats(vehicleId, range), [vehicleId, range.from, range.to]);

  return {
    records: query.data ?? [],
    stats: statsQuery.data,
    loading: query.loading || statsQuery.loading,
    error: query.error,
    addRecord: async (fields) => { const r = await add.run(fields); await query.refetch(); await statsQuery.refetch(); return r; },
    updateRecord: async (id, fields) => { const r = await update.run(id, fields); await query.refetch(); await statsQuery.refetch(); return r; },
    removeRecord: async (id) => { const r = await remove.run(id); await query.refetch(); await statsQuery.refetch(); return r; },
  };
}

export function useMaintenance(vehicleId) {
  const query = useSupabaseQuery(() => operationService.listMaintenance(vehicleId), [vehicleId], { enabled: !!vehicleId });
  useRealtimeTable("maintenance", () => query.refetch());

  const add = useAsyncAction(operationService.addMaintenance);
  const remove = useAsyncAction(operationService.removeMaintenance);

  return {
    records: query.data ?? [],
    loading: query.loading,
    error: query.error,
    getStatus: operationService.getMaintenanceStatus,
    addRecord: async (fields) => { const r = await add.run(fields); await query.refetch(); return r; },
    removeRecord: async (id) => { const r = await remove.run(id); await query.refetch(); return r; },
  };
}

export function useOccurrences(tripId) {
  const query = useSupabaseQuery(() => operationService.listOccurrences({ tripId }), [tripId]);
  useRealtimeTable("operational_occurrences", () => query.refetch());
  const add = useAsyncAction(operationService.addOccurrence);
  return {
    occurrences: query.data ?? [],
    loading: query.loading,
    addOccurrence: async (fields) => { const r = await add.run(fields); await query.refetch(); return r; },
  };
}
