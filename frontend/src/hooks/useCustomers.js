// src/hooks/useCustomers.js
import { useState } from "react";
import { customersService } from "../services/customersService";
import { useSupabaseQuery } from "./useSupabaseQuery";
import { useRealtimeTable } from "./useRealtimeTable";
import { useAsyncAction } from "./useAsyncAction";

export function useCustomers() {
  const [search, setSearch] = useState("");
  const query = useSupabaseQuery(() => customersService.list({ search }), [search]);
  useRealtimeTable("customers", () => query.refetch());

  const updateNotes = useAsyncAction(customersService.updateNotes);

  return {
    customers: query.data ?? [],
    loading: query.loading,
    error: query.error,
    search, setSearch,
    refetch: query.refetch,
    updateNotes: async (id, notes) => { const r = await updateNotes.run(id, notes); await query.refetch(); return r; },
  };
}

export function useCustomerHistory(customerId) {
  const query = useSupabaseQuery(() => customersService.getHistory(customerId), [customerId], { enabled: !!customerId });
  useRealtimeTable("reservations", () => query.refetch());
  return { history: query.data ?? [], loading: query.loading, error: query.error };
}
