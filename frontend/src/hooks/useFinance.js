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

/** Só leitura — usado pro "lucro real anual" do Dashboard (não faz sentido
 * lançar/editar uma entrada "do ano", sempre é de um dia específico). */
export function useFinanceYear(year) {
  const query = useSupabaseQuery(() => financeService.listByYear(year), [year], { enabled: !!year });
  useRealtimeTable(["financial_entries", "fuel_records", "maintenance"], () => query.refetch());

  return {
    entries: query.data ?? [],
    loading: query.loading,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useFinanceMonth(year, month) {
  const query = useSupabaseQuery(() => financeService.listByMonth(year, month), [year, month], { enabled: !!year && !!month });
  // financial_entries também recebe as despesas de combustível/manutenção
  // via trigger do banco — escutamos as três tabelas para o calendário
  // reagir sem refresh.
  useRealtimeTable(["financial_entries", "fuel_records", "maintenance"], () => query.refetch());

  const add = useAsyncAction(financeService.addManualEntry);
  const update = useAsyncAction(financeService.update);
  const remove = useAsyncAction(financeService.softDelete);

  return {
    entries: query.data ?? [],
    loading: query.loading,
    error: query.error,
    refetch: query.refetch,
    addEntry: async (fields) => { const r = await add.run(fields); await query.refetch(); return r; },
    updateEntry: async (id, fields) => { const r = await update.run(id, fields); await query.refetch(); return r; },
    removeEntry: async (id) => { const r = await remove.run(id); await query.refetch(); return r; },
  };
}
