// src/hooks/useMaintenanceTypes.js
import { useCallback } from "react";
import { maintenanceTypesService } from "../services/maintenanceTypesService";
import { useAsyncAction } from "./useAsyncAction";
import { useRealtimeTable } from "./useRealtimeTable";
import { useSupabaseQuery } from "./useSupabaseQuery";

export function useMaintenanceTypes() {
  const query = useSupabaseQuery(() => maintenanceTypesService.list(), []);
  useRealtimeTable("maintenance_types", () => query.refetch());

  const createAcao = useAsyncAction(maintenanceTypesService.create);
  const setActiveAcao = useAsyncAction(maintenanceTypesService.setActive);

  const todos = query.data ?? [];

  const criar = useCallback(
    async (label) => {
      const r = await createAcao.run(label);
      await query.refetch();
      return r;
    },
    [createAcao, query],
  );
  const pausar = useCallback(
    async (id, active) => {
      const r = await setActiveAcao.run(id, active);
      await query.refetch();
      return r;
    },
    [setActiveAcao, query],
  );

  return {
    tipos: todos.filter((t) => t.active),
    todos,
    loading: query.loading,
    error: query.error,
    salvando: createAcao.loading || setActiveAcao.loading,
    criar,
    pausar,
  };
}
