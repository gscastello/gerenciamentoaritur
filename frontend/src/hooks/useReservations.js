// src/hooks/useReservations.js
//
// Este é o hook mais crítico do app: é ele quem sustenta a Agenda, a
// Lista do Dia e o resultado do fluxo de Reservar. A garantia de "duas
// pessoas não ocupam a mesma vaga" NÃO mora aqui — mora na trigger do
// banco (fn_check_trip_capacity, chamada dentro das funções RPC do
// reservationsService). Este hook só:
//   1) busca o estado atual do banco (nunca inventa/estima localmente);
//   2) reage a mudanças em tempo real feitas por QUALQUER atendente;
//   3) expõe ações que, se recusadas pelo banco, devolvem um erro claro
//      para a tela mostrar (ex.: oferecer lista de espera).

import { useCallback, useMemo } from "react";
import { reservationsService } from "../services/reservationsService";
import { paymentsService } from "../services/paymentsService";
import { useSupabaseQuery } from "./useSupabaseQuery";
import { useRealtimeTable } from "./useRealtimeTable";
import { useAsyncAction } from "./useAsyncAction";

export function useReservations(tripDate) {
  const dayQuery = useSupabaseQuery(
    () => reservationsService.listByDate(tripDate),
    [tripDate],
    { enabled: !!tripDate }
  );
  const pendingQuery = useSupabaseQuery(() => reservationsService.listPending(), []);

  // qualquer mudança em reservas/passageiros de QUALQUER atendente
  // reexecuta as duas consultas — é assim que o segundo atendente vê a
  // tela do primeiro atualizar sozinha, sem precisar apertar nada.
  useRealtimeTable(["reservations", "reservation_passengers"], () => {
    dayQuery.refetch();
    pendingQuery.refetch();
  });

  const create = useAsyncAction(reservationsService.create);
  const confirm = useAsyncAction(reservationsService.confirm);
  const cancel = useAsyncAction(reservationsService.cancel);
  const setPassengersStatus = useAsyncAction(reservationsService.setPassengersStatus);
  const move = useAsyncAction(reservationsService.move);
  const updateDetails = useAsyncAction(reservationsService.updateDetails);

  // atualização otimista é deliberadamente EVITADA aqui: como a decisão
  // de "cabe ou não cabe" é do banco, mostrar uma reserva "confirmada"
  // na tela antes de o banco confirmar poderia enganar o atendente sobre
  // uma vaga que talvez não exista mais. Preferimos o pequeno atraso de
  // esperar a resposta da RPC + o refetch via realtime.
  const createReservation = useCallback(
    async (payload) => {
      const result = await create.run(payload);
      await dayQuery.refetch();
      await pendingQuery.refetch();
      return result;
    },
    [create, dayQuery, pendingQuery]
  );

  const confirmReservation = useCallback(
    async (id, opts) => { const r = await confirm.run(id, opts); await dayQuery.refetch(); await pendingQuery.refetch(); return r; },
    [confirm, dayQuery, pendingQuery]
  );
  const cancelReservation = useCallback(
    async (id) => { const r = await cancel.run(id); await dayQuery.refetch(); await pendingQuery.refetch(); return r; },
    [cancel, dayQuery, pendingQuery]
  );
  const markPassengers = useCallback(
    async (id, status) => { const r = await setPassengersStatus.run(id, status); await dayQuery.refetch(); return r; },
    [setPassengersStatus, dayQuery]
  );
  const moveReservation = useCallback(
    async (id, target) => { const r = await move.run(id, target); await dayQuery.refetch(); return r; },
    [move, dayQuery]
  );
  const editReservation = useCallback(
    async (id, fields) => { const r = await updateDetails.run(id, fields); await dayQuery.refetch(); return r; },
    [updateDetails, dayQuery]
  );

  const reservations = useMemo(() => dayQuery.data ?? [], [dayQuery.data]);
  const pending = useMemo(() => pendingQuery.data ?? [], [pendingQuery.data]);

  return {
    reservations,
    pending,
    loading: dayQuery.loading || pendingQuery.loading,
    error: dayQuery.error || pendingQuery.error,
    refetch: () => { dayQuery.refetch(); pendingQuery.refetch(); },

    createReservation,
    confirmReservation,
    cancelReservation,
    markPassengers,
    moveReservation,
    editReservation,

    // estados individuais de cada ação, para a UI desabilitar botões certos
    actionState: {
      creating: create.loading, createError: create.error,
      confirming: confirm.loading, confirmError: confirm.error,
      cancelling: cancel.loading,
      updatingStatus: setPassengersStatus.loading,
      moving: move.loading, moveError: move.error,
      editing: updateDetails.loading,
    },
  };
}

/**
 * Variante usada pelo App.jsx enquanto ele ainda orquestra um único array
 * de reservas para várias abas (Agenda, Lista, Passageiros, Dashboard).
 * Busca uma JANELA de datas [from, to] da view achatada e devolve, além
 * dos dados, as mesmas ações de escrita do useReservations — todas com o
 * refetch da janela já ligado. Realtime mantém tudo sincronizado entre
 * dispositivos. Ver docs/APP-INTEGRATION-PLAN.md (issue #10, fase 1).
 */
export function useReservationsWindow(fromDate, toDate) {
  const query = useSupabaseQuery(
    () => reservationsService.listWindow(fromDate, toDate),
    [fromDate, toDate],
    { enabled: !!fromDate && !!toDate }
  );

  useRealtimeTable(
    ["reservations", "reservation_passengers", "payments", "trips"],
    () => query.refetch()
  );

  const create = useAsyncAction(reservationsService.create);
  const confirm = useAsyncAction(reservationsService.confirm);
  const cancel = useAsyncAction(reservationsService.cancel);
  const setPassengersStatus = useAsyncAction(reservationsService.setPassengersStatus);
  const move = useAsyncAction(reservationsService.move);
  const updateDetails = useAsyncAction(reservationsService.updateDetails);
  const setQty = useAsyncAction(reservationsService.setQuantity);
  const updateContact = useAsyncAction(reservationsService.updateCustomerContact);
  const setPaid = useAsyncAction(paymentsService.setPaidForReservation);
  const setProof = useAsyncAction(paymentsService.setProofForReservation);

  const after = useCallback(async (p) => { const r = await p; await query.refetch(); return r; }, [query]);

  return {
    reservations: query.data ?? [],
    loading: query.loading,
    error: query.error,
    refetch: query.refetch,

    createReservation: useCallback((payload) => after(create.run(payload)), [after, create]),
    confirmReservation: useCallback((id, opts) => after(confirm.run(id, opts)), [after, confirm]),
    cancelReservation: useCallback((id) => after(cancel.run(id)), [after, cancel]),
    markPassengers: useCallback((id, status) => after(setPassengersStatus.run(id, status)), [after, setPassengersStatus]),
    moveReservation: useCallback((id, target) => after(move.run(id, target)), [after, move]),
    editReservation: useCallback((id, fields) => after(updateDetails.run(id, fields)), [after, updateDetails]),
    setQuantity: useCallback((id, qty) => after(setQty.run(id, qty)), [after, setQty]),
    updateContact: useCallback((customerId, fields) => after(updateContact.run(customerId, fields)), [after, updateContact]),
    setPaid: useCallback((args) => after(setPaid.run(args)), [after, setPaid]),
    setProof: useCallback((args) => after(setProof.run(args)), [after, setProof]),

    actionState: {
      creating: create.loading,
      confirming: confirm.loading,
      cancelling: cancel.loading,
      updatingStatus: setPassengersStatus.loading,
      moving: move.loading,
      editing: updateDetails.loading,
      lastError:
        create.error || confirm.error || cancel.error || setPassengersStatus.error ||
        move.error || updateDetails.error || setPaid.error || setProof.error || null,
    },
  };
}
