// src/hooks/useVehicles.js
import { useMemo } from "react";
import { vehiclesService } from "../services/vehiclesService";
import { useSupabaseQuery } from "./useSupabaseQuery";
import { useRealtimeTable } from "./useRealtimeTable";
import { useAsyncAction } from "./useAsyncAction";

export function useVehicles() {
  const query = useSupabaseQuery(() => vehiclesService.list(), []);
  useRealtimeTable("vehicles", () => query.refetch());

  const setDefault = useAsyncAction(vehiclesService.setDefault);
  const update = useAsyncAction(vehiclesService.update);

  const defaultVehicle = useMemo(() => (query.data ?? []).find((v) => v.is_default) ?? null, [query.data]);

  return {
    vehicles: query.data ?? [],
    defaultVehicle,
    loading: query.loading,
    error: query.error,
    setDefault: async (id) => { const r = await setDefault.run(id); await query.refetch(); return r; },
    updateVehicle: async (id, fields) => { const r = await update.run(id, fields); await query.refetch(); return r; },
  };
}

export function useDrivers() {
  const query = useSupabaseQuery(() => vehiclesService.listDrivers(), []);
  useRealtimeTable("drivers", () => query.refetch());

  const add = useAsyncAction(vehiclesService.addDriver);
  const update = useAsyncAction(vehiclesService.updateDriver);
  const remove = useAsyncAction(vehiclesService.removeDriver);

  return {
    drivers: query.data ?? [],
    loading: query.loading,
    addDriver: async (fields) => { const r = await add.run(fields); await query.refetch(); return r; },
    updateDriver: async (id, fields) => { const r = await update.run(id, fields); await query.refetch(); return r; },
    removeDriver: async (id) => { const r = await remove.run(id); await query.refetch(); return r; },
  };
}
