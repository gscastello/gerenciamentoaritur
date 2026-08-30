// src/hooks/usePayments.js
import { paymentsService } from "../services/paymentsService";
import { useSupabaseQuery } from "./useSupabaseQuery";
import { useRealtimeTable } from "./useRealtimeTable";
import { useAsyncAction } from "./useAsyncAction";

export function usePayments(reservationId) {
  const query = useSupabaseQuery(() => paymentsService.listByReservation(reservationId), [reservationId], { enabled: !!reservationId });
  useRealtimeTable("payments", () => query.refetch());

  const create = useAsyncAction(paymentsService.create);
  const markPaid = useAsyncAction(paymentsService.markPaid);
  const markProof = useAsyncAction(paymentsService.markProofReceived);

  return {
    payments: query.data ?? [],
    loading: query.loading,
    error: query.error,
    addPayment: async (fields) => { const r = await create.run(fields); await query.refetch(); return r; },
    markPaid: async (id) => { const r = await markPaid.run(id); await query.refetch(); return r; },
    markProofReceived: async (id, received) => { const r = await markProof.run(id, received); await query.refetch(); return r; },
  };
}

export function usePendingPayments(tripDate) {
  const query = useSupabaseQuery(() => paymentsService.listPendingForDate(tripDate), [tripDate], { enabled: !!tripDate });
  useRealtimeTable("payments", () => query.refetch());
  return { pendingPayments: query.data ?? [], loading: query.loading, error: query.error };
}
