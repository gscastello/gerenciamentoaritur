// src/services/reservationsService.js
//
// Toda escrita que afeta ocupação de vaga passa por uma função RPC
// (supabase-rpc-functions.sql), nunca por INSERT/UPDATE direto — isso
// garante que a checagem de capacidade do banco (trigger
// fn_check_trip_capacity) sempre participa da mesma transação.
// Leitura é feita direto nas tabelas via SELECT (RLS decide o que cada
// papel enxerga).

import { supabase, getCurrentUserId, ServiceError } from "../lib/supabaseClient";

// `trip:trips!inner` é obrigatório para que `.eq("trip.trip_date", ...)`
// funcione como filtro — sem o !inner o PostgREST ignora o filtro do
// recurso aninhado e devolve reservas de todos os dias.
const RESERVATION_SELECT = `
  id, trip_id, customer_id, type, status, route_point_id,
  pickup_neighborhood, pickup_detail, street, reference_point, dropoff_location,
  quantity, unit_price, total_price, payment_method, pending_reason, extra_data,
  created_at, updated_at, created_by, updated_by,
  customer:customers ( id, name, phone ),
  route_point:route_points ( id, code, name, base_time ),
  trip:trips!inner ( id, trip_date, direction, capacity ),
  passengers:reservation_passengers ( id, seq, passenger_name, status ),
  payments ( id, amount, method, status, paid_at, proof_received )
`;

// Para pendências (que podem não ter viagem definida ainda), o join com
// trips não pode ser !inner — senão frete/encomenda sem trip_id somem.
const RESERVATION_SELECT_NO_INNER = RESERVATION_SELECT.replace("trips!inner", "trips");

async function handle(promise, { context }) {
  const { data, error } = await promise;
  if (error) {
    throw new ServiceError(`${context}: ${error.message}`, {
      cause: error,
      retryable: isNetworkish(error),
      code: error.code,
    });
  }
  return data;
}
function isNetworkish(error) {
  return /fetch|network|timeout/i.test(error.message || "");
}

export const reservationsService = {
  /** Lista as reservas de um dia (ambas as direções), já com joins prontos para a UI. */
  async listByDate(tripDate) {
    return handle(
      supabase
        .from("reservations")
        .select(RESERVATION_SELECT)
        .is("deleted_at", null)
        .eq("trip.trip_date", tripDate)
        .order("created_at", { ascending: true }),
      { context: "listByDate" }
    );
  },

  /**
   * Pendências (pendente/espera) — inclui frete/encomenda, que nascem
   * com status 'pendente'. Não amarradas ao dia selecionado. Sem !inner
   * no join de trips porque frete/encomenda podem não ter viagem ainda.
   */
  async listPending() {
    return handle(
      supabase
        .from("reservations")
        .select(RESERVATION_SELECT_NO_INNER)
        .is("deleted_at", null)
        .in("status", ["pendente", "espera"]),
      { context: "listPending" }
    );
  },

  /**
   * Cria uma reserva (passagem, frete ou encomenda). NUNCA calcula vaga
   * localmente para decidir se pode confirmar — quem decide é a trigger
   * de capacidade dentro da função RPC. O retorno indica se foi aceita.
   */
  async create(payload) {
    const actor = await getCurrentUserId();
    if (!actor) throw new ServiceError("Usuário não autenticado.", { retryable: false });

    const { data, error } = await supabase.rpc("rpc_create_reservation", {
      p_trip_date: payload.tripDate,
      p_direction: payload.direction,
      p_customer_name: payload.customerName,
      p_customer_phone: payload.customerPhone,
      p_type: payload.type ?? "passagem",
      p_route_point_code: payload.routePointCode ?? null,
      p_quantity: payload.quantity ?? 1,
      p_unit_price: payload.unitPrice ?? 0,
      p_payment_method: payload.paymentMethod ?? "dinheiro",
      p_pickup_neighborhood: payload.pickupNeighborhood ?? null,
      p_pickup_detail: payload.pickupDetail ?? null,
      p_street: payload.street ?? null,
      p_reference_point: payload.referencePoint ?? null,
      p_dropoff_location: payload.dropoffLocation ?? null,
      p_pending_reason: payload.pendingReason ?? null,
      p_status: payload.status ?? "confirmada",
      p_extra_data: payload.extraData ?? {},
      p_whatsapp_source_message_id: payload.whatsappSourceMessageId ?? null,
      p_created_by: actor,
    });
    if (error) {
      throw new ServiceError(`create: ${error.message}`, { cause: error, retryable: isNetworkish(error) });
    }
    // a função RPC nunca lança exceção de negócio pro cliente — ela devolve
    // { success:false, message } quando a capacidade foi excedida.
    if (!data?.success) {
      throw new ServiceError(data?.message || "Não foi possível criar a reserva.", {
        retryable: false, // nunca reexecutar automaticamente um "capacidade excedida"
        code: "CAPACITY_OR_BUSINESS_RULE",
      });
    }
    return data; // { success, reservation_id, status, message }
  },

  /** Confirma uma reserva pendente/em espera — só aqui a vaga é de fato reservada. */
  async confirm(reservationId, { routePointCode } = {}) {
    const actor = await getCurrentUserId();
    const { data, error } = await supabase.rpc("rpc_confirm_reservation", {
      p_reservation_id: reservationId,
      p_route_point_code: routePointCode ?? null,
      p_actor: actor,
    });
    if (error) throw new ServiceError(`confirm: ${error.message}`, { cause: error, retryable: isNetworkish(error) });
    if (!data?.success) throw new ServiceError(data?.message || "Não foi possível confirmar.", { retryable: false });
    return data;
  },

  async cancel(reservationId) {
    const actor = await getCurrentUserId();
    const { data, error } = await supabase.rpc("rpc_cancel_reservation", {
      p_reservation_id: reservationId,
      p_actor: actor,
    });
    if (error) throw new ServiceError(`cancel: ${error.message}`, { cause: error, retryable: isNetworkish(error) });
    return data;
  },

  /** status: 'embarcado' | 'nao_compareceu' */
  async setPassengersStatus(reservationId, status) {
    const actor = await getCurrentUserId();
    const { data, error } = await supabase.rpc("rpc_set_passengers_status", {
      p_reservation_id: reservationId,
      p_status: status,
      p_actor: actor,
    });
    if (error) throw new ServiceError(`setPassengersStatus: ${error.message}`, { cause: error, retryable: isNetworkish(error) });
    if (!data?.success) throw new ServiceError(data?.message || "Não foi possível atualizar o status.", { retryable: false });
    return data;
  },

  /** Realoca a reserva para outra viagem/ponto — valida capacidade no destino. */
  async move(reservationId, { tripDate, direction, routePointCode }) {
    const actor = await getCurrentUserId();
    const { data, error } = await supabase.rpc("rpc_move_reservation", {
      p_reservation_id: reservationId,
      p_new_trip_date: tripDate,
      p_new_direction: direction,
      p_new_route_point_code: routePointCode,
      p_actor: actor,
    });
    if (error) throw new ServiceError(`move: ${error.message}`, { cause: error, retryable: isNetworkish(error) });
    if (!data?.success) throw new ServiceError(data?.message || "Não há vaga na viagem de destino.", { retryable: false });
    return data;
  },

  /** Edição de campos que NÃO afetam ocupação (nome, telefone, desembarque, forma de pagamento). */
  async updateDetails(reservationId, fields) {
    const actor = await getCurrentUserId();
    return handle(
      supabase
        .from("reservations")
        .update({ ...fields, updated_by: actor })
        .eq("id", reservationId)
        .select()
        .single(),
      { context: "updateDetails" }
    );
  },
};
