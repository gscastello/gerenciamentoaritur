// src/hooks/useVehicles.js
import { useMemo } from "react";
import { vehiclesService } from "../services/vehiclesService";
import { useAsyncAction } from "./useAsyncAction";
import { useRealtimeTable } from "./useRealtimeTable";
import { useSupabaseQuery } from "./useSupabaseQuery";

export function useVehicles() {
  const query = useSupabaseQuery(() => vehiclesService.list(), []);
  useRealtimeTable("vehicles", () => query.refetch());

  const setDefault = useAsyncAction(vehiclesService.setDefault);
  const update = useAsyncAction(vehiclesService.update);
  const add = useAsyncAction(vehiclesService.addVehicle);
  const remove = useAsyncAction(vehiclesService.removeVehicle);

  const defaultVehicle = useMemo(
    () => (query.data ?? []).find((v) => v.is_default) ?? null,
    [query.data],
  );

  return {
    vehicles: query.data ?? [],
    defaultVehicle,
    loading: query.loading,
    error: query.error,
    setDefault: async (id) => {
      const r = await setDefault.run(id);
      await query.refetch();
      return r;
    },
    updateVehicle: async (id, fields) => {
      const r = await update.run(id, fields);
      await query.refetch();
      return r;
    },
    addVehicle: async (fields) => {
      const r = await add.run(fields);
      await query.refetch();
      return r;
    },
    removeVehicle: async (id) => {
      const r = await remove.run(id);
      await query.refetch();
      return r;
    },
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
    addDriver: async (fields) => {
      const r = await add.run(fields);
      await query.refetch();
      return r;
    },
    updateDriver: async (id, fields) => {
      const r = await update.run(id, fields);
      await query.refetch();
      return r;
    },
    removeDriver: async (id) => {
      const r = await remove.run(id);
      await query.refetch();
      return r;
    },
  };
}
