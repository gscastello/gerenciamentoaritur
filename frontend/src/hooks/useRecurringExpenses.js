// src/hooks/useRecurringExpenses.js
//
// Templates de custo recorrente (aba Gestão Operacional). A tela reage em
// tempo real: mudou um template ou o job gerou um lançamento novo, a
// lista se atualiza sozinha.

import { recurringExpensesService } from "../services/recurringExpensesService";
import { useAsyncAction } from "./useAsyncAction";
import { useRealtimeTable } from "./useRealtimeTable";
import { useSupabaseQuery } from "./useSupabaseQuery";

export function useRecurringExpenses() {
  const query = useSupabaseQuery(() => recurringExpensesService.list(), []);
  useRealtimeTable(["recurring_expense_templates", "financial_entries"], () => query.refetch());

  const add = useAsyncAction(recurringExpensesService.create);
  const update = useAsyncAction(recurringExpensesService.update);
  const remove = useAsyncAction(recurringExpensesService.remove);
  const gerar = useAsyncAction(recurringExpensesService.runNow);

  return {
    templates: query.data ?? [],
    loading: query.loading,
    error: query.error,
    refetch: query.refetch,
    addTemplate: async (fields) => {
      const r = await add.run(fields);
      await query.refetch();
      return r;
    },
    updateTemplate: async (id, fields) => {
      const r = await update.run(id, fields);
      await query.refetch();
      return r;
    },
    removeTemplate: async (id) => {
      const r = await remove.run(id);
      await query.refetch();
      return r;
    },
    gerarAgora: async () => {
      const r = await gerar.run();
      await query.refetch();
      return r;
    },
    salvando: add.loading || update.loading || remove.loading,
    gerando: gerar.loading,
  };
}
