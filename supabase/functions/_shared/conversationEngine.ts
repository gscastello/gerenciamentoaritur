// supabase/functions/_shared/conversationEngine.ts
//
// Máquina de estados guiada por menus/botões do WhatsApp. Cada "step"
// só avança depois de uma consulta ao banco (via whatsappService) —
// isso é o que torna estruturalmente impossível a IA inventar vaga,
// preço, horário ou confirmação de pagamento: ela nunca gera esses
// valores, só exibe o que veio da query.

import { whatsappService, WhatsappServiceError } from "./whatsappService.ts";
import { whatsappClient } from "./whatsappClient.ts";

type IncomingMessage = {
  from: string;            // telefone em E.164
  waMessageId: string;
  text?: string;           // mensagem de texto livre
  interactiveId?: string;  // id do botão/item de lista clicado
  raw: unknown;
};

const MENU_ROWS = [
  { id: "menu_ida", title: "Ida", description: "São Luís → Pirapemas / Cantanhede" },
  { id: "menu_volta", title: "Volta", description: "Pirapemas / Cantanhede → São Luís" },
  { id: "menu_frete", title: "Frete", description: "Encomenda para outra cidade" },
  { id: "menu_encomenda", title: "Enviar encomenda", description: "Envio de item, sem passageiro" },
  { id: "menu_cancelar", title: "Cancelar reserva", description: "Ver e cancelar reservas ativas" },
  { id: "menu_alterar", title: "Alterar reserva", description: "Mudar data/ponto de uma reserva" },
  { id: "menu_pagamento", title: "Status de pagamento", description: "Ver se meu pagamento foi confirmado" },
  { id: "menu_atendente", title: "Falar com atendente", description: "Sair do atendimento automático" },
];

export async function handleIncomingMessage(msg: IncomingMessage) {
  const conversation = await whatsappService.resolveConversation(msg.from);

  // idempotência: se este wa_message_id já foi processado, não faz nada de novo
  if (await whatsappService.wasAlreadyProcessed(msg.waMessageId)) return;

  await whatsappService.logMessage(conversation.id, "inbound", {
    waMessageId: msg.waMessageId,
    type: msg.interactiveId ? "interactive" : "text",
    content: msg.raw,
  });

  // modo HUMANO: a IA só loga e sai — a equipe responde direto pelo WhatsApp Business
  const { data: mode } = await import("./supabaseAdmin.ts").then(({ supabaseAdmin }) =>
    supabaseAdmin.rpc("fn_effective_attendance_mode", { p_conversation_id: conversation.id })
  );
  if (mode !== "ia") return;

  const state = conversation.state ?? { step: "idle" };
  const input = msg.interactiveId ?? (msg.text ?? "").trim();

  try {
    await route(conversation, state, input, msg);
  } catch (err) {
    if (err instanceof WhatsappServiceError && err.code === "HUMAN_MODE_ACTIVE") return;
    console.error("Erro no conversationEngine:", err);
    await whatsappService.transferToHuman(conversation.id, `Erro inesperado: ${String(err)}`);
    await sendText(conversation.id, msg.from, "Tive um problema para continuar — já chamei alguém da equipe para te ajudar. 🙏");
  }
}

async function sendText(conversationId: string, to: string, text: string) {
  await whatsappService.reply(conversationId, to, () => whatsappClient.sendText(to, text), { type: "text", content: { text } });
}

async function route(conversation: any, state: any, input: string, msg: IncomingMessage) {
  const to = msg.from;
  const step = state.step ?? "idle";

  // "menu"/"oi"/qualquer coisa no estado inicial → mostra o menu
  if (step === "idle" || input === "menu") {
    await whatsappService.updateConversationState(conversation.id, { step: "awaiting_menu" });
    await whatsappService.reply(
      conversation.id, to,
      () => whatsappClient.sendList(to, "Rota Pirapemas", "Oi! Como posso ajudar hoje?", "Ver opções", MENU_ROWS),
      { type: "interactive", content: { menu: MENU_ROWS.map((r) => r.id) } }
    );
    return;
  }

  if (step === "awaiting_menu") return handleMenuChoice(conversation, input, to);
  if (step === "awaiting_date") return handleDateInput(conversation, input, to);
  if (step === "awaiting_route_point") return handleRoutePointChoice(conversation, state, input, to);
  if (step === "awaiting_detail") return handleDetailInput(conversation, state, input, to);
  if (step === "awaiting_quantity") return handleQuantityInput(conversation, state, input, to);
  if (step === "awaiting_dropoff") return handleDropoffInput(conversation, state, input, to);
  if (step === "awaiting_name") return handleNameInput(conversation, state, input, to);
  if (step === "awaiting_payment") return handlePaymentChoice(conversation, state, input, to, msg);
  if (step === "awaiting_cancel_choice") return handleCancelChoice(conversation, input, to);

  // qualquer estado não reconhecido: mais seguro transferir do que tentar adivinhar
  await whatsappService.transferToHuman(conversation.id, "Estado de conversa não reconhecido.");
  await sendText(conversation.id, to, "Vou te encaminhar para um atendente. 🙋");
}

async function handleMenuChoice(conversation: any, input: string, to: string) {
  if (input === "menu_ida" || input === "menu_volta") {
    const direction = input === "menu_ida" ? "ida" : "volta";
    await whatsappService.updateConversationState(conversation.id, { step: "awaiting_date", direction, type: "passagem" });
    await sendText(conversation.id, to, "Para qual data? (formato AAAA-MM-DD, ex: 2026-09-05)");
    return;
  }
  if (input === "menu_frete" || input === "menu_encomenda") {
    await whatsappService.transferToHuman(conversation.id, input === "menu_frete" ? "Pedido de frete" : "Pedido de encomenda");
    await sendText(conversation.id, to, "Perfeito — vou te conectar com nossa equipe para combinar os detalhes e o valor. 📦");
    return;
  }
  if (input === "menu_cancelar" || input === "menu_alterar") {
    const customer = await whatsappService.identifyCustomer(to);
    if (!customer) {
      await sendText(conversation.id, to, "Não encontrei reservas no seu número ainda. Se já reservou com outro contato, me avise por aqui.");
      return;
    }
    const reservations = await whatsappService.listCustomerReservations(customer.id);
    if (!reservations?.length) {
      await sendText(conversation.id, to, "Você não tem reservas ativas no momento.");
      return;
    }
    const rows = reservations.slice(0, 10).map((r: any) => ({
      id: `res_${r.id}`,
      title: `${r.trip?.direction === "ida" ? "Ida" : "Volta"} ${r.trip?.trip_date ?? ""}`,
      description: `${r.route_point?.name ?? ""} · ${r.status}`,
    }));
    await whatsappService.updateConversationState(conversation.id, {
      step: "awaiting_cancel_choice",
      action: input === "menu_cancelar" ? "cancelar" : "alterar",
      customerId: customer.id,
    });
    await whatsappService.reply(
      conversation.id, to,
      () => whatsappClient.sendList(to, "Suas reservas", "Qual delas?", "Escolher", rows),
      { type: "interactive", content: { rows: rows.map((r) => r.id) } }
    );
    return;
  }
  if (input === "menu_pagamento") {
    const customer = await whatsappService.identifyCustomer(to);
    const reservations = customer ? await whatsappService.listCustomerReservations(customer.id) : [];
    if (!reservations?.length) {
      await sendText(conversation.id, to, "Não encontrei reservas para checar pagamento.");
      return;
    }
    let text = "Status de pagamento das suas reservas:\n";
    for (const r of reservations) {
      const payments = await whatsappService.checkPaymentStatus(r.id);
      const status = payments?.[0]?.status ?? "sem registro de pagamento";
      text += `\n• ${r.trip?.direction} ${r.trip?.trip_date}: ${status}`;
    }
    await sendText(conversation.id, to, text);
    return;
  }
  if (input === "menu_atendente") {
    await whatsappService.transferToHuman(conversation.id, "Cliente pediu atendente.");
    await sendText(conversation.id, to, "Combinado — um atendente humano assume a conversa a partir daqui. 🙋");
    return;
  }

  await sendText(conversation.id, to, "Não entendi essa opção — digite *menu* para ver as opções de novo.");
}

async function handleDateInput(conversation: any, input: string, to: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    await sendText(conversation.id, to, "Data inválida. Use o formato AAAA-MM-DD, ex: 2026-09-05.");
    return;
  }
  const state = conversation.state;
  const availability = await whatsappService.checkAvailability(input, state.direction);
  if (availability.available !== null && availability.available <= 0) {
    await whatsappService.updateConversationState(conversation.id, { ...state, step: "awaiting_menu", tripDate: input, waitlist: true });
    await whatsappService.reply(
      conversation.id, to,
      () => whatsappClient.sendButtons(to, `A viagem de ${state.direction} em ${input} está lotada. Quer entrar na lista de espera?`, [
        { id: "espera_sim", title: "Sim, entrar" }, { id: "espera_nao", title: "Não, obrigado" },
      ]),
      { type: "interactive", content: { availability } }
    );
    return;
  }

  const points = await whatsappService.listRoutePoints(state.direction);
  const rows = points.map((p: any) => ({ id: `ponto_${p.code}`, title: p.name, description: p.base_time }));
  await whatsappService.updateConversationState(conversation.id, { ...state, step: "awaiting_route_point", tripDate: input });
  await whatsappService.reply(
    conversation.id, to,
    () => whatsappClient.sendList(to, "Local de embarque", `Restam ${availability.available ?? "algumas"} vaga(s). Qual ponto?`, "Escolher", rows),
    { type: "interactive", content: { points: rows.map((r) => r.id) } }
  );
}

async function handleRoutePointChoice(conversation: any, state: any, input: string, to: string) {
  const code = input.replace("ponto_", "");
  const points = await whatsappService.listRoutePoints(state.direction);
  const point = points.find((p: any) => p.code === code);
  if (!point) { await sendText(conversation.id, to, "Não reconheci esse ponto — digite *menu* para recomeçar."); return; }

  const next = { ...state, step: "awaiting_quantity", routePointCode: point.code, routePointPrice: point.price };
  if (point.requires_detail) {
    await whatsappService.updateConversationState(conversation.id, { ...next, step: "awaiting_detail" });
    await sendText(conversation.id, to, point.detail_label ?? "Pode me passar mais detalhes?");
    return;
  }
  await whatsappService.updateConversationState(conversation.id, next);
  await sendText(conversation.id, to, "Quantas passagens? (número)");
}

async function handleDetailInput(conversation: any, state: any, input: string, to: string) {
  let price = state.routePointPrice;
  const patch: Record<string, unknown> = {};
  if (state.routePointCode === "busca") {
    price = await whatsappService.getNeighborhoodPrice(input);
    patch.pickupNeighborhood = input;
    if (price === null) {
      await whatsappService.transferToHuman(conversation.id, `Bairro não reconhecido: ${input}`);
      await sendText(conversation.id, to, "Não encontrei esse bairro na nossa lista — vou te conectar com um atendente para confirmar o valor certinho.");
      return;
    }
  } else if (state.routePointCode === "br") {
    patch.pickupDetail = input;
  } else {
    patch.pickupDetail = input;
  }
  await whatsappService.updateConversationState(conversation.id, { ...state, ...patch, routePointPrice: price, step: "awaiting_quantity" });
  await sendText(conversation.id, to, `Valor por passagem: R$ ${price}. Quantas passagens você quer?`);
}

async function handleQuantityInput(conversation: any, state: any, input: string, to: string) {
  const qty = parseInt(input, 10);
  if (!qty || qty < 1) { await sendText(conversation.id, to, "Me manda só o número de passagens, ex: 2"); return; }
  await whatsappService.updateConversationState(conversation.id, { ...state, quantity: qty, step: "awaiting_dropoff" });
  await sendText(conversation.id, to, "Onde você vai ficar (local de desembarque)?");
}

async function handleDropoffInput(conversation: any, state: any, input: string, to: string) {
  const next = { ...state, dropoffLocation: input };
  const customer = await whatsappService.identifyCustomer(to);
  if (!customer) {
    await whatsappService.updateConversationState(conversation.id, { ...next, step: "awaiting_name" });
    await sendText(conversation.id, to, "Não te achei no cadastro ainda — qual seu nome completo?");
    return;
  }
  await whatsappService.updateConversationState(conversation.id, { ...next, step: "awaiting_payment", customerName: customer.name });
  await askPayment(conversation.id, to, next);
}

async function handleNameInput(conversation: any, state: any, input: string, to: string) {
  const next = { ...state, customerName: input, step: "awaiting_payment" };
  await whatsappService.updateConversationState(conversation.id, next);
  await askPayment(conversation.id, to, next);
}

async function askPayment(conversationId: string, to: string, state: any) {
  const total = (state.routePointPrice ?? 0) * (state.quantity ?? 1);
  await whatsappService.reply(
    conversationId, to,
    () => whatsappClient.sendButtons(to, `Total: R$ ${total} (${state.quantity}x R$ ${state.routePointPrice}). Como prefere pagar?`, [
      { id: "pag_dinheiro", title: "Dinheiro" }, { id: "pag_pix", title: "Pix" },
    ]),
    { type: "interactive", content: { total } }
  );
}

async function handlePaymentChoice(conversation: any, state: any, input: string, to: string, msg: IncomingMessage) {
  const paymentMethod = input === "pag_pix" ? "pix" : "dinheiro";
  try {
    const result = await whatsappService.createReservation(conversation.id, {
      tripDate: state.tripDate, direction: state.direction, customerName: state.customerName, customerPhone: to,
      routePointCode: state.routePointCode, quantity: state.quantity, unitPrice: state.routePointPrice,
      paymentMethod, pickupNeighborhood: state.pickupNeighborhood ?? null, pickupDetail: state.pickupDetail ?? null,
      dropoffLocation: state.dropoffLocation, waMessageId: msg.waMessageId,
    });
    await whatsappService.updateConversationState(conversation.id, { step: "idle" });
    if (result.status === "pendente") {
      await sendText(conversation.id, to, "Recebemos sua solicitação! Esse trajeto está fora da nossa área padrão — vamos confirmar a disponibilidade e te avisamos por aqui. 🙏");
    } else {
      let text = `Reserva confirmada! ✅ ${state.quantity}x passagem, R$ ${state.routePointPrice} cada.`;
      if (paymentMethod === "pix") text += "\n\nChave Pix: 98981012388 — A O Castelo Transporte e Turismo.\nSe pagar por Pix, envie o comprovante aqui mesmo.";
      await sendText(conversation.id, to, text);
    }
  } catch (err) {
    if (err instanceof WhatsappServiceError && err.code === "RESERVATION_REJECTED") {
      await whatsappService.updateConversationState(conversation.id, { step: "idle" });
      await whatsappService.reply(
        conversation.id, to,
        () => whatsappClient.sendButtons(to, "Essa viagem lotou enquanto conversávamos. Quer entrar na lista de espera?", [
          { id: "espera_sim", title: "Sim, entrar" }, { id: "espera_nao", title: "Não, obrigado" },
        ]),
        { type: "interactive", content: { error: err.message } }
      );
      return;
    }
    throw err;
  }
}

async function handleCancelChoice(conversation: any, input: string, to: string) {
  const reservationId = input.replace("res_", "");
  const action = conversation.state.action;
  try {
    if (action === "cancelar") {
      await whatsappService.cancelReservation(conversation.id, reservationId);
      await sendText(conversation.id, to, "Reserva cancelada. Se precisar remarcar, é só chamar de novo! 👋");
    } else {
      // alteração: por segurança, o MVP encaminha para atendente em vez de
      // pedir data/ponto novos por texto livre dentro do mesmo fluxo —
      // evita um estado profundo demais sem validação cruzada
      await whatsappService.transferToHuman(conversation.id, `Cliente quer alterar a reserva ${reservationId}`);
      await sendText(conversation.id, to, "Vou te conectar com um atendente para ajustar sua reserva certinho. 🙋");
    }
  } finally {
    await whatsappService.updateConversationState(conversation.id, { step: "idle" });
  }
}
