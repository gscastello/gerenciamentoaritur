// src/hooks/useFinance.js
import { financeService } from "../services/financeService";
import { useSupabaseQuery } from "./useSupabaseQuery";
import { useRealtimeTable } from "./useRealtimeTable";
import { useAsyncAction } from "./useAsyncAction";

export function useFinanceDay(entryDate) {
  const query = useSupabaseQuery(() => financeService.getDaySummary(entryDate), [entryDate], { enabled: !!entryDate });
  // financial_entries muda sozinho quando fuel_records/maintenance são criados (trigger do banco) —
  // por isso escutamos as três tabelas aqui.
  useRealtimeTable(["financial_entries", "fuel_records", "maintenance"], () => query.refetch());

  const add = useAsyncAction(financeService.addManualEntry);
  const update = useAsyncAction(financeService.update);
  const remove = useAsyncAction(financeService.softDelete);

  return {
    summary: query.data ?? { revenue: 0, expenses: 0, profit: 0, entries: [] },
    loading: query.loading,
    error: query.error,
    addEntry: async (fields) => { const r = await add.run(fields); await query.refetch(); return r; },
    updateEntry: async (id, fields) => { const r = await update.run(id, fields); await query.refetch(); return r; },
    removeEntry: async (id) => { const r = await remove.run(id); await query.refetch(); return r; },
  };
}

export function useFinanceMonth(year, month) {
  const query = useSupabaseQuery(() => financeService.listByMonth(year, month), [year, month], { enabled: !!year && !!month });
  useRealtimeTable(["financial_entries"], () => query.refetch());
  return { entries: query.data ?? [], loading: query.loading, error: query.error };
}
