// supabase/functions/_shared/whatsappService.ts
//
// Esta é a camada pedida explicitamente: "criar uma camada de serviço
// chamada whatsappService". Regras que este arquivo segue à risca:
//
//   1) NUNCA responde preço, horário, vaga ou status de pagamento sem
//      antes ter lido isso de uma tabela/view do banco nesta mesma
//      chamada. Não há nenhum valor "chumbado" no código.
//   2) NUNCA confirma pagamento sozinho — no máximo registra que um
//      comprovante foi recebido (proof_received=true), o que é
//      diferente de status='pago' (isso continua sendo decisão humana,
//      do papel financeiro, dentro do painel).
//   3) Toda ação que MUDA dado (criar/confirmar/cancelar/mover reserva,
//      transferir para humano) grava em audit_logs com o usuário de
//      sistema "Bot WhatsApp" — nunca some sem rastro.
//   4) Antes de qualquer ação que muda dado, checa o modo de
//      atendimento efetivo da conversa. Se estiver em HUMANO, a função
//      lança WhatsappServiceError e a ação não acontece.

import { supabaseAdmin, getBotUserId } from "./supabaseAdmin.ts";
import { whatsappClient } from "./whatsappClient.ts";

export class WhatsappServiceError extends Error {
  code: string;
  constructor(message: string, code = "WHATSAPP_SERVICE_ERROR") {
    super(message);
    this.name = "WhatsappServiceError";
    this.code = code;
  }
}

async function logAiAction(entityTable: string, entityId: string | null, action: string, afterData: unknown) {
  const botId = await getBotUserId();
  await supabaseAdmin.from("audit_logs").insert({
    entity_table: entityTable,
    entity_id: entityId,
    action,
    after_data: afterData,
    performed_by: botId,
  });
}

/** Lança erro se a conversa estiver em modo HUMANO — chamar isso no início de toda ação que muda dado. */
async function assertAiIsAllowedToAct(conversationId: string) {
  const { data, error } = await supabaseAdmin.rpc("fn_effective_attendance_mode", { p_conversation_id: conversationId });
  if (error) throw new WhatsappServiceError(`Falha ao checar modo de atendimento: ${error.message}`);
  if (data !== "ia") {
    throw new WhatsappServiceError("Conversa está em atendimento humano — a IA não pode agir aqui.", "HUMAN_MODE_ACTIVE");
  }
}

export const whatsappService = {
  // =====================================================================
  // 1) recebimento / log de mensagens
  // =====================================================================
  async resolveConversation(phone: string) {
    const { data: existing } = await supabaseAdmin
      .from("whatsapp_conversations")
      .select("*")
      .eq("phone", phone)
      .is("deleted_at", null)
      .maybeSingle();
    if (existing) return existing;

    const { data: created, error } = await supabaseAdmin
      .from("whatsapp_conversations")
      .insert({ phone, state: { step: "idle" } })
      .select()
      .single();
    if (error) throw new WhatsappServiceError(`Falha ao criar conversa: ${error.message}`);
    return created;
  },

  async logMessage(conversationId: string, direction: "inbound" | "outbound", payload: {
    waMessageId?: string; type?: string; content: unknown; intent?: string;
  }) {
    await supabaseAdmin.from("whatsapp_messages").insert({
      conversation_id: conversationId,
      wa_message_id: payload.waMessageId ?? null,
      direction,
      message_type: payload.type ?? "text",
      content: payload.content,
      intent_detected: payload.intent ?? null,
    });
    await supabaseAdmin.from("whatsapp_conversations").update({
      [direction === "inbound" ? "last_inbound_at" : "last_outbound_at"]: new Date().toISOString(),
    }).eq("id", conversationId);
  },

  async updateConversationState(conversationId: string, state: Record<string, unknown>) {
    await supabaseAdmin.from("whatsapp_conversations").update({ state }).eq("id", conversationId);
  },

  /** Checa se um wa_message_id já foi processado — evita reprocessar reenvio do mesmo webhook (idempotência). */
  async wasAlreadyProcessed(waMessageId: string) {
    if (!waMessageId) return false;
    const { data } = await supabaseAdmin.from("whatsapp_messages").select("id").eq("wa_message_id", waMessageId).maybeSingle();
    return !!data;
  },

  // =====================================================================
  // 2) identificação do cliente pelo telefone
  // =====================================================================
  async identifyCustomer(phone: string) {
    const { data } = await supabaseAdmin.from("customers").select("*").eq("phone", phone).is("deleted_at", null).maybeSingle();
    return data ?? null; // null = cliente novo, ainda não cadastrado
  },

  // =====================================================================
  // 3) consulta de disponibilidade — SEMPRE lida do banco, nunca estimada
  // =====================================================================
  async checkAvailability(tripDate: string, direction: "ida" | "volta") {
    const { data, error } = await supabaseAdmin
      .from("v_trip_occupancy")
      .select("*")
      .eq("trip_date", tripDate)
      .eq("direction", direction)
      .maybeSingle();
    if (error) throw new WhatsappServiceError(`Falha ao consultar disponibilidade: ${error.message}`);
    // se a viagem ainda não existe no banco, a capacidade "provável" vem do veículo padrão —
    // ainda assim é uma leitura real da tabela vehicles, não um número inventado
    if (!data) {
      const { data: defaultVehicle } = await supabaseAdmin.from("vehicles").select("capacity").eq("is_default", true).maybeSingle();
      return { trip_date: tripDate, direction, capacity: defaultVehicle?.capacity ?? null, occupied: 0, available: defaultVehicle?.capacity ?? null, boarded: 0 };
    }
    return data;
  },

  /** Pontos de embarque configurados de verdade (nunca uma lista fixa no código do bot). */
  async listRoutePoints(direction: "ida" | "volta") {
    const { data, error } = await supabaseAdmin
      .from("route_points")
      .select("*")
      .eq("direction", direction)
      .is("deleted_at", null)
      .order("display_order");
    if (error) throw new WhatsappServiceError(`Falha ao consultar pontos: ${error.message}`);
    return data;
  },

  /** Preço de "Buscar em Casa" por bairro — se não achar, retorna null e quem chama deve transferir para humano. */
  async getNeighborhoodPrice(neighborhood: string) {
    const { data } = await supabaseAdmin
      .from("neighborhood_pricing")
      .select("price")
      .ilike("neighborhood", neighborhood.trim())
      .maybeSingle();
    return data?.price ?? null;
  },

  // =====================================================================
  // 4) criação de reserva
  // =====================================================================
  async createReservation(conversationId: string, payload: Record<string, unknown>) {
    await assertAiIsAllowedToAct(conversationId);
    const botId = await getBotUserId();

    const { data, error } = await supabaseAdmin.rpc("rpc_create_reservation", {
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
      p_whatsapp_source_message_id: payload.waMessageId ?? null,
      p_created_by: botId,
    });
    if (error) throw new WhatsappServiceError(`Falha ao criar reserva: ${error.message}`);
    if (!data?.success) throw new WhatsappServiceError(data?.message ?? "Reserva recusada.", "RESERVATION_REJECTED");

    await logAiAction("reservations", data.reservation_id, "create", { origem: "whatsapp", ...payload });
    return data;
  },

  // =====================================================================
  // 5) confirmação
  // =====================================================================
  async confirmReservation(conversationId: string, reservationId: string, routePointCode?: string) {
    await assertAiIsAllowedToAct(conversationId);
    const botId = await getBotUserId();
    const { data, error } = await supabaseAdmin.rpc("rpc_confirm_reservation", {
      p_reservation_id: reservationId, p_route_point_code: routePointCode ?? null, p_actor: botId,
    });
    if (error) throw new WhatsappServiceError(`Falha ao confirmar: ${error.message}`);
    if (!data?.success) throw new WhatsappServiceError(data?.message ?? "Não foi possível confirmar.", "CONFIRM_REJECTED");
    await logAiAction("reservations", reservationId, "status_change", { status: "confirmada", origem: "whatsapp" });
    return data;
  },

  // =====================================================================
  // 6) cancelamento
  // =====================================================================
  async cancelReservation(conversationId: string, reservationId: string) {
    await assertAiIsAllowedToAct(conversationId);
    const botId = await getBotUserId();
    const { data, error } = await supabaseAdmin.rpc("rpc_cancel_reservation", { p_reservation_id: reservationId, p_actor: botId });
    if (error) throw new WhatsappServiceError(`Falha ao cancelar: ${error.message}`);
    await logAiAction("reservations", reservationId, "status_change", { status: "cancelada", origem: "whatsapp" });
    return data;
  },

  // =====================================================================
  // 7) alteração (realocar para outra data/direção/ponto)
  // =====================================================================
  async moveReservation(conversationId: string, reservationId: string, target: { tripDate: string; direction: string; routePointCode: string }) {
    await assertAiIsAllowedToAct(conversationId);
    const botId = await getBotUserId();
    const { data, error } = await supabaseAdmin.rpc("rpc_move_reservation", {
      p_reservation_id: reservationId, p_new_trip_date: target.tripDate, p_new_direction: target.direction,
      p_new_route_point_code: target.routePointCode, p_actor: botId,
    });
    if (error) throw new WhatsappServiceError(`Falha ao alterar: ${error.message}`);
    if (!data?.success) throw new WhatsappServiceError(data?.message ?? "Não há vaga para essa alteração.", "MOVE_REJECTED");
    await logAiAction("reservations", reservationId, "update", { acao: "realocada", origem: "whatsapp", ...target });
    return data;
  },

  /** Reservas ativas do cliente — usado nos fluxos de cancelar/alterar (a IA nunca "lembra" sozinha, sempre relista). */
  async listCustomerReservations(customerId: string) {
    const { data, error } = await supabaseAdmin
      .from("reservations")
      .select("id, status, quantity, total_price, trip:trips(trip_date, direction), route_point:route_points(name)")
      .eq("customer_id", customerId)
      .in("status", ["confirmada", "pendente", "espera"])
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) throw new WhatsappServiceError(`Falha ao listar reservas: ${error.message}`);
    return data;
  },

  // =====================================================================
  // 8) pagamento pendente — SÓ LEITURA; a IA nunca marca como pago
  // =====================================================================
  async checkPaymentStatus(reservationId: string) {
    const { data, error } = await supabaseAdmin.from("payments").select("*").eq("reservation_id", reservationId).is("deleted_at", null);
    if (error) throw new WhatsappServiceError(`Falha ao consultar pagamento: ${error.message}`);
    return data; // a resposta ao cliente deve refletir EXATAMENTE o que está aqui, nunca "eu acho que já foi pago"
  },

  /** Cliente avisa que mandou o comprovante — marca só isso, nunca o status como 'pago' (isso é do financeiro). */
  async markProofReceived(conversationId: string, paymentId: string) {
    await assertAiIsAllowedToAct(conversationId);
    const botId = await getBotUserId();
    const { error } = await supabaseAdmin.from("payments").update({ proof_received: true, updated_by: botId }).eq("id", paymentId);
    if (error) throw new WhatsappServiceError(`Falha ao registrar comprovante: ${error.message}`);
    await logAiAction("payments", paymentId, "update", { proof_received: true, origem: "whatsapp" });
  },

  // =====================================================================
  // 9/10) lembrete de viagem e aviso de motorista a caminho — disparados
  // pelo whatsapp-notifications-dispatcher, não em resposta direta a
  // uma mensagem do cliente (por isso usam template pré-aprovado)
  // =====================================================================
  async dispatchPendingNotifications(limit = 50) {
    const { data: pending, error } = await supabaseAdmin
      .from("notifications")
      .select("*, customer:customers(phone, name)")
      .eq("status", "pendente")
      .eq("channel", "whatsapp")
      .limit(limit);
    if (error) throw new WhatsappServiceError(`Falha ao buscar notificações pendentes: ${error.message}`);

    const results = [];
    for (const n of pending ?? []) {
      try {
        if (!n.customer?.phone) throw new Error("Cliente sem telefone.");
        if (n.template_key === "lembrete_viagem") {
          await whatsappClient.sendTemplate(n.customer.phone, "lembrete_viagem", "pt_BR", [
            { type: "body", parameters: [{ type: "text", text: n.payload?.horario ?? "" }, { type: "text", text: n.payload?.local ?? "" }] },
          ]);
        } else if (n.template_key === "motorista_a_caminho") {
          await whatsappClient.sendTemplate(n.customer.phone, "motorista_a_caminho", "pt_BR", [
            { type: "body", parameters: [{ type: "text", text: n.payload?.local ?? "" }] },
          ]);
        } else {
          await whatsappClient.sendText(n.customer.phone, String(n.payload?.mensagem ?? ""));
        }
        await supabaseAdmin.from("notifications").update({ status: "enviada", sent_at: new Date().toISOString() }).eq("id", n.id);
        results.push({ id: n.id, ok: true });
      } catch (err) {
        await supabaseAdmin.from("notifications").update({ status: "falha", error: String(err) }).eq("id", n.id);
        results.push({ id: n.id, ok: false, error: String(err) });
      }
    }
    return results;
  },

  // =====================================================================
  // 11) transferência para atendente humano
  // =====================================================================
  async transferToHuman(conversationId: string, reason: string) {
    const botId = await getBotUserId();
    const { error } = await supabaseAdmin.rpc("rpc_transfer_to_human", {
      p_conversation_id: conversationId, p_reason: reason, p_actor: botId,
    });
    if (error) throw new WhatsappServiceError(`Falha ao transferir: ${error.message}`);
    // notifica internamente (aparece para admin/atendente no painel via tabela notifications)
    await supabaseAdmin.from("notifications").insert({
      channel: "whatsapp", template_key: "transferencia_interna",
      payload: { conversation_id: conversationId, motivo: reason },
      status: "pendente",
    });
  },

  // =====================================================================
  // Envio de resposta ao cliente + log da mensagem de saída
  // =====================================================================
  async reply(conversationId: string, phone: string, send: () => Promise<unknown>, logPayload: { type?: string; content: unknown; intent?: string }) {
    const result = await send();
    await this.logMessage(conversationId, "outbound", logPayload);
    return result;
  },
};
