// src/services/reservationsService.js
//
// Toda escrita que afeta ocupação de vaga passa por uma função RPC
// (supabase-rpc-functions.sql), nunca por INSERT/UPDATE direto — isso
// garante que a checagem de capacidade do banco (trigger
// fn_check_trip_capacity) sempre participa da mesma transação.
// Leitura é feita direto nas tabelas via SELECT (RLS decide o que cada
// papel enxerga).

import { supabase, getCurrentUserId, ServiceError, isRetryableError } from "../lib/supabaseClient";

// A leitura da UI passa pela view `v_reservations_flat`, que já entrega o
// objeto "achatado" com os MESMOS nomes de campo que o App.jsx usa
// (data, direcao, pontoId, bairro, nome, telefone, quantidade, valorUnit,
// valorTotal, pagamento, status, tipo, motivoPendente, pago,
// comprovanteRecebido, temEmbarcado, criadoEm…). Assim a camada de UI não
// precisa remapear nada. A escrita continua indo pelas funções RPC
// (rpc_create_reservation etc.), nunca por INSERT/UPDATE direto, para que
// a checagem de capacidade do banco participe da mesma transação.
const FLAT_SELECT = "*";

async function handle(promise, { context }) {
  const { data, error } = await promise;
  if (error) {
    throw new ServiceError(`${context}: ${error.message}`, {
      cause: error,
      retryable: isRetryableError(error),
      code: error.code,
    });
  }
  return data;
}
export const reservationsService = {
  /** Reservas de um dia (ambas as direções), já achatadas para a UI. */
  async listByDate(tripDate) {
    return handle(
      supabase
        .from("v_reservations_flat")
        .select(FLAT_SELECT)
        .eq("data", tripDate)
        .order("criadoEm", { ascending: true }),
      { context: "listByDate" }
    );
  },

  /**
   * Reservas num intervalo de datas [from, to] — usado pelas telas que
   * varrem várias datas (Passageiros/CRM, Dashboard, previsão de demanda).
   */
  async listWindow(fromDate, toDate) {
    return handle(
      supabase
        .from("v_reservations_flat")
        .select(FLAT_SELECT)
        // inclui também as linhas sem data (frete/encomenda, que nascem sem
        // viagem) — senão elas nunca apareceriam na Agenda.
        .or(`data.is.null,and(data.gte.${fromDate},data.lte.${toDate})`)
        .order("criadoEm", { ascending: true }),
      { context: "listWindow" }
    );
  },

  /**
   * Pendências (pendente/espera) — inclui frete/encomenda, que nascem
   * com status 'pendente'. Não amarradas ao dia selecionado.
   */
  async listPending() {
    return handle(
      supabase
        .from("v_reservations_flat")
        .select(FLAT_SELECT)
        .in("status", ["pendente", "espera"])
        .order("criadoEm", { ascending: true }),
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
      throw new ServiceError(`create: ${error.message}`, { cause: error, retryable: isRetryableError(error) });
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
    if (error) throw new ServiceError(`confirm: ${error.message}`, { cause: error, retryable: isRetryableError(error) });
    if (!data?.success) throw new ServiceError(data?.message || "Não foi possível confirmar.", { retryable: false });
    return data;
  },

  async cancel(reservationId) {
    const actor = await getCurrentUserId();
    const { data, error } = await supabase.rpc("rpc_cancel_reservation", {
      p_reservation_id: reservationId,
      p_actor: actor,
    });
    if (error) throw new ServiceError(`cancel: ${error.message}`, { cause: error, retryable: isRetryableError(error) });
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
    if (error) throw new ServiceError(`setPassengersStatus: ${error.message}`, { cause: error, retryable: isRetryableError(error) });
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
    if (error) throw new ServiceError(`move: ${error.message}`, { cause: error, retryable: isRetryableError(error) });
    if (!data?.success) throw new ServiceError(data?.message || "Não há vaga na viagem de destino.", { retryable: false });
    return data;
  },

  /** Edição de campos que NÃO afetam ocupação (desembarque, forma de pagamento, rua…). */
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

  /**
   * Muda a quantidade de passageiros. Passa pela trigger de capacidade
   * (via rpc_set_reservation_quantity) — se aumentar além da vaga, a RPC
   * devolve success:false e nada é gravado.
   */
  async setQuantity(reservationId, quantity) {
    const actor = await getCurrentUserId();
    const { data, error } = await supabase.rpc("rpc_set_reservation_quantity", {
      p_reservation_id: reservationId,
      p_quantity: quantity,
      p_actor: actor,
    });
    if (error) throw new ServiceError(`setQuantity: ${error.message}`, { cause: error, retryable: isRetryableError(error) });
    if (!data?.success) throw new ServiceError(data?.message || "Não foi possível mudar a quantidade (viagem pode estar lotada).", { retryable: false });
    return data;
  },

  /** Atualiza nome/telefone do cliente da reserva (tabela customers). */
  async updateCustomerContact(customerId, { name, phone }) {
    const actor = await getCurrentUserId();
    const patch = { updated_by: actor };
    if (name != null) patch.name = name;
    if (phone != null) patch.phone = phone;
    return handle(
      supabase.from("customers").update(patch).eq("id", customerId).select().single(),
      { context: "updateCustomerContact" }
    );
  },
};
