// src/hooks/useSettings.js
//
// Configuração chave/valor (tabela `settings`). Leitura liberada a
// qualquer papel; escrita só admin (RLS). Usado para o modo de
// atendimento (IA/manual) e o ajuste de segunda-feira — coisas que
// precisam ser as mesmas para todos os sócios.

import { settingsService } from "../services/settingsService";
import { useSupabaseQuery } from "./useSupabaseQuery";
import { useRealtimeTable } from "./useRealtimeTable";
import { useAsyncAction } from "./useAsyncAction";

export function useSettings() {
  const query = useSupabaseQuery(() => settingsService.getAll(), []);
  useRealtimeTable("settings", () => query.refetch());

  const setKey = useAsyncAction(settingsService.set);
  const after = async (p) => { const r = await p; await query.refetch(); return r; };

  const settings = query.data ?? {};

  return {
    settings,
    loading: query.loading,
    error: query.error,
    refetch: query.refetch,

    attendanceMode: settings.attendance_mode?.mode ?? "ia",
    mondayAdjustment: settings.monday_adjustment ?? { active: true, hours: 1 },

    setAttendanceMode: (mode) => after(setKey.run("attendance_mode", { mode })),
    setMondayAdjustment: ({ active, hours }) => after(setKey.run("monday_adjustment", { active, hours })),
    saving: setKey.loading,
  };
}
