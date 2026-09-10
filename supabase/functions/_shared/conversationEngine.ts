// supabase/functions/_shared/conversationEngine.ts
//
// Continua sendo uma máquina de estados — isso não mudou. O que mudou:
// mensagens de TEXTO LIVRE (não clique de botão) agora passam primeiro
// pelo nluService, que só extrai campos (data/quantidade/ponto/bairro/
// intenção). Esses campos são usados para PULAR perguntas cujo campo já
// foi dito (ex.: cliente manda "quero 2 passagens de ida dia 5 saindo da
// rodoviária" e o bot já entende os 4 campos de uma vez) — mas cada
// campo extraído passa pela MESMA validação de banco que passaria se o
// cliente tivesse clicado botão por botão (checkAvailability, lista de
// route_points, preço por bairro). O LLM nunca decide se cabe, nunca
// decide o preço — só entende o que a pessoa quis dizer.

import { whatsappService, WhatsappServiceError } from "./whatsappService.ts";
import { whatsappClient } from "./whatsappClient.ts";
import { interpretMessage, type ExtractedIntent } from "./nluService.ts";
import { supabaseAdmin } from "./supabaseAdmin.ts";

type IncomingMessage = {
  from: string;
  waMessageId: string;
  text?: string;
  interactiveId?: string;
  media?: { mediaId: string; mimeType?: string; caption?: string; kind: "image" | "document" };
  raw: unknown;
};

const MENU_ROWS = [
  { id: "menu_ida", title: "Ida", description: "São Luís → Pirapemas / Cantanhede" },
  { id: "menu_volta", title: "Volta", description: "Pirapemas / Cantanhede → São Luís" },
  { id: "menu_frete", title: "Frete", description: "Encomenda para outra cidade" },
  { id: "menu_encomenda", title: "Enviar encomenda", description: "Envio de item, sem passageiro" },
  { id: "menu_cancelar", title: "Cancelar reserva", description: "Ver e cancelar reservas ativas" },
  { id: "menu_alterar", title: "Alterar reserva", description: "Mudar desembarque, ponto ou data" },
  { id: "menu_pagamento", title: "Status de pagamento", description: "Ver se meu pagamento foi confirmado" },
  { id: "menu_atendente", title: "Falar com atendente", description: "Sair do atendimento automático" },
];

const RESERVATION_STEPS = ["awaiting_date", "awaiting_route_point", "awaiting_detail", "awaiting_quantity", "awaiting_dropoff", "awaiting_name", "awaiting_payment"];

export async function handleIncomingMessage(msg: IncomingMessage) {
  const conversation = await whatsappService.resolveConversation(msg.from);
  if (await whatsappService.wasAlreadyProcessed(msg.waMessageId)) return;

  await whatsappService.logMessage(conversation.id, "inbound", {
    waMessageId: msg.waMessageId,
    type: msg.media ? msg.media.kind : msg.interactiveId ? "interactive" : "text",
    content: msg.raw,
  });

  // Comprovante Pix (imagem/documento) — issue #8. Arquiva a mídia e liga
  // ao pagamento pendente, em QUALQUER modo (não é a IA decidindo nada).
  if (msg.media) {
    await handleProofUpload(conversation, msg);
    return;
  }

  const { data: mode } = await supabaseAdmin.rpc("fn_effective_attendance_mode", { p_conversation_id: conversation.id });
  if (mode !== "ia") return; // HUMANO: só loga, equipe responde direto pelo WhatsApp Business

  let state = conversation.state ?? { step: "idle" };
  const to = msg.from;

  try {
    if (msg.interactiveId) {
      await route(conversation, state, msg.interactiveId, msg);
      return;
    }

    const text = (msg.text ?? "").trim();
    if (!text) return;
    if (text.toLowerCase() === "menu") { await route(conversation, state, "menu", msg); return; }

    const validRoutePoints = await whatsappService.listRoutePoints(state.direction ?? "ida");
    const validRoutePointsBoth = state.direction
      ? validRoutePoints
      : [...(await whatsappService.listRoutePoints("ida")), ...(await whatsappService.listRoutePoints("volta"))];

    const extraction = await interpretMessage({
      text,
      today: new Date().toISOString().slice(0, 10),
      validRoutePoints: validRoutePointsBoth.map((p: any) => ({ code: p.code, name: p.name, direction: p.direction })),
      conversationSummary: `etapa atual: ${state.step ?? "idle"}${state.direction ? `, direção já escolhida: ${state.direction}` : ""}`,
    });

    await whatsappService.logMessage(conversation.id, "inbound", { type: "text", content: { extraction }, intent: extraction.intent });

    state = mergeExtraction(state, extraction, validRoutePointsBoth);

    if (["cancelar", "atendente", "pagamento", "frete", "encomenda"].includes(extraction.intent) && extraction.confidence !== "baixa") {
      await route(conversation, state, `menu_${extraction.intent === "cancelar" ? "cancelar" : extraction.intent}`, msg);
      return;
    }

    if ((state.step ?? "idle") === "idle" || state.step === "awaiting_menu") {
      if (extraction.intent === "reservar" && extraction.direction) {
        state = { ...state, step: "awaiting_date", direction: extraction.direction, type: "passagem" };
        await advanceReservationFlow(conversation, state, to);
        return;
      }
      if (extraction.intent === "alterar") { await route(conversation, state, "menu_alterar", msg); return; }
      await route(conversation, { ...state, step: "idle" }, "menu", msg);
      return;
    }

    if (RESERVATION_STEPS.includes(state.step)) { await advanceReservationFlow(conversation, state, to); return; }

    // Alteração de reserva: os passos que esperam texto livre (novo
    // desembarque / nova data) entram direto no fluxo determinístico.
    if (state.step === "awaiting_alter_dropoff" || state.step === "awaiting_alter_date") {
      await route(conversation, state, text, msg);
      return;
    }

    await sendText(conversation.id, to, "Pode escolher uma das opções que te mostrei? Se preferir, digite *menu* para recomeçar.");
  } catch (err) {
    if (err instanceof WhatsappServiceError && err.code === "HUMAN_MODE_ACTIVE") return;
    console.error("Erro no conversationEngine:", err);
    await whatsappService.transferToHuman(conversation.id, `Erro inesperado: ${String(err)}`);
    await sendText(conversation.id, to, "Tive um problema para continuar — já chamei alguém da equipe para te ajudar. 🙏");
  }
}

function mergeExtraction(state: any, ex: ExtractedIntent, validPoints: any[]) {
  const next = { ...state };
  if (ex.direction) next.direction = ex.direction;
  if (ex.trip_date) next.tripDate = ex.trip_date;
  if (ex.quantity && ex.quantity > 0) next.quantity = ex.quantity;
  if (ex.route_point_code) {
    const match = validPoints.find((p) => p.code === ex.route_point_code && (!next.direction || p.direction === next.direction));
    if (match) { next.routePointCode = match.code; next.routePointName = match.name; next.routePointPrice = match.price; next.routePointRequiresDetail = match.requires_detail; }
  }
  if (ex.neighborhood) next.pickupNeighborhood = ex.neighborhood;
  if (ex.pickup_detail) next.pickupDetail = ex.pickup_detail;
  if (ex.dropoff_location) next.dropoffLocation = ex.dropoff_location;
  if (ex.payment_method) next.paymentMethod = ex.payment_method;
  return next;
}

async function advanceReservationFlow(conversation: any, state: any, to: string) {
  if (!state.direction) { await sendMenu(conversation.id, to); return; }
  if (!state.tripDate) {
    await whatsappService.updateConversationState(conversation.id, { ...state, step: "awaiting_date" });
    await sendText(conversation.id, to, "Para qual data? (ex: 05/09 ou 2026-09-05)");
    return;
  }

  const availability = await whatsappService.checkAvailability(state.tripDate, state.direction);
  if (availability.available !== null && availability.available <= 0 && !state.waitlistOffered) {
    await whatsappService.updateConversationState(conversation.id, { ...state, step: "awaiting_menu", waitlistOffered: true });
    await whatsappService.reply(conversation.id, to,
      () => whatsappClient.sendButtons(to, `A viagem de ${state.direction} em ${state.tripDate} está lotada. Quer entrar na lista de espera?`,
        [{ id: "espera_sim", title: "Sim, entrar" }, { id: "espera_nao", title: "Não, obrigado" }]),
      { type: "interactive", content: { availability } });
    return;
  }

  if (!state.routePointCode) {
    const points = await whatsappService.listRoutePoints(state.direction);
    await whatsappService.updateConversationState(conversation.id, { ...state, step: "awaiting_route_point" });
    await whatsappService.reply(conversation.id, to,
      () => whatsappClient.sendList(to, "Local de embarque", `Restam ${availability.available ?? "algumas"} vaga(s). Qual ponto?`, "Escolher",
        points.map((p: any) => ({ id: `ponto_${p.code}`, title: p.name, description: p.base_time }))),
      { type: "interactive", content: { points: points.map((p: any) => p.code) } });
    return;
  }

  if (state.routePointRequiresDetail && !state.routePointPrice) {
    if (state.routePointCode === "busca" && state.pickupNeighborhood) {
      const price = await whatsappService.getNeighborhoodPrice(state.pickupNeighborhood);
      if (price === null) {
        await whatsappService.transferToHuman(conversation.id, `Bairro não reconhecido: ${state.pickupNeighborhood}`);
        await sendText(conversation.id, to, "Não encontrei esse bairro na nossa lista — vou te conectar com um atendente para confirmar o valor certinho.");
        return;
      }
      state = { ...state, routePointPrice: price };
    } else if (!state.pickupDetail) {
      await whatsappService.updateConversationState(conversation.id, { ...state, step: "awaiting_detail" });
      await sendText(conversation.id, to, state.routePointCode === "busca" ? "Qual o seu bairro?" : "Pode me passar mais detalhes desse local?");
      return;
    }
  } else if (!state.routePointPrice) {
    const points = await whatsappService.listRoutePoints(state.direction);
    const match = points.find((p: any) => p.code === state.routePointCode);
    state = { ...state, routePointPrice: match?.price ?? null };
  }

  if (!state.quantity) {
    await whatsappService.updateConversationState(conversation.id, { ...state, step: "awaiting_quantity" });
    await sendText(conversation.id, to, `Valor por passagem: R$ ${state.routePointPrice}. Quantas passagens você quer?`);
    return;
  }

  if (!state.dropoffLocation) {
    await whatsappService.updateConversationState(conversation.id, { ...state, step: "awaiting_dropoff" });
    await sendText(conversation.id, to, "Onde você vai ficar (local de desembarque)?");
    return;
  }

  if (!state.customerName) {
    const customer = await whatsappService.identifyCustomer(to);
    if (!customer) {
      await whatsappService.updateConversationState(conversation.id, { ...state, step: "awaiting_name" });
      await sendText(conversation.id, to, "Não te achei no cadastro ainda — qual seu nome completo?");
      return;
    }
    state = { ...state, customerName: customer.name };
  }

  if (!state.paymentMethod) {
    await whatsappService.updateConversationState(conversation.id, { ...state, step: "awaiting_payment" });
    await askPayment(conversation.id, to, state);
    return;
  }

  await finalizeReservation(conversation, state, to);
}

async function finalizeReservation(conversation: any, state: any, to: string) {
  try {
    // issue #6: embarque/desembarque menciona cidade fora de São Luís /
    // Cantanhede / Pirapemas? A reserva nasce pendente (não ocupa vaga) e a
    // equipe é avisada; o ponto de embarque "outro" também cai aqui.
    const cidadeFora = await whatsappService.mencionaCidadeIntermediaria([
      state.dropoffLocation, state.pickupDetail, state.pickupNeighborhood,
    ]);
    const fora = !!cidadeFora || state.routePointCode === "outro";
    const pendingReason = fora
      ? `Trajeto fora da área padrão${cidadeFora ? ` (menciona "${cidadeFora}")` : ""} — aguardando confirmação manual.`
      : null;

    const result = await whatsappService.createReservation(conversation.id, {
      tripDate: state.tripDate, direction: state.direction, customerName: state.customerName, customerPhone: to,
      routePointCode: state.routePointCode, quantity: state.quantity, unitPrice: state.routePointPrice,
      paymentMethod: state.paymentMethod, pickupNeighborhood: state.pickupNeighborhood ?? null,
      pickupDetail: state.pickupDetail ?? null, dropoffLocation: state.dropoffLocation,
      status: fora ? "pendente" : "confirmada",
      pendingReason,
    });
    await whatsappService.updateConversationState(conversation.id, { step: "idle" });
    if (result.status === "pendente") {
      await whatsappService.enqueueAreaReviewAlert(result.reservation_id, {
        motivo: pendingReason, cidade: cidadeFora, dropoff: state.dropoffLocation ?? null,
        pickup_detail: state.pickupDetail ?? null, telefone: to,
      });
      await sendText(conversation.id, to, "Recebemos sua solicitação! Esse trajeto está fora da nossa área padrão — vamos confirmar a disponibilidade e te avisamos por aqui. 🙏");
    } else {
      let text = `Reserva confirmada! ✅ ${state.quantity}x passagem, R$ ${state.routePointPrice} cada.`;
      if (state.paymentMethod === "pix") text += "\n\nChave Pix: 98981012388 — A O Castelo Transporte e Turismo.\nSe pagar por Pix, envie o comprovante aqui mesmo.";
      await sendText(conversation.id, to, text);
    }
  } catch (err) {
    if (err instanceof WhatsappServiceError && err.code === "RESERVATION_REJECTED") {
      await whatsappService.updateConversationState(conversation.id, { step: "idle" });
      await whatsappService.reply(conversation.id, to,
        () => whatsappClient.sendButtons(to, "Essa viagem lotou enquanto conversávamos. Quer entrar na lista de espera?",
          [{ id: "espera_sim", title: "Sim, entrar" }, { id: "espera_nao", title: "Não, obrigado" }]),
        { type: "interactive", content: { error: err.message } });
      return;
    }
    throw err;
  }
}

async function sendText(conversationId: string, to: string, text: string) {
  await whatsappService.reply(conversationId, to, () => whatsappClient.sendText(to, text), { type: "text", content: { text } });
}

/** Comprovante Pix recebido como mídia (issue #8). */
async function handleProofUpload(conversation: any, msg: IncomingMessage) {
  const to = msg.from;
  try {
    const result = await whatsappService.receivePaymentProof(to, {
      mediaId: msg.media!.mediaId,
      mimeType: msg.media!.mimeType,
      caption: msg.media!.caption,
      waMessageId: msg.waMessageId,
    });
    if (result.matched) {
      await sendText(conversation.id, to,
        "Comprovante recebido! 🧾 Nossa equipe confere o pagamento e confirma a sua reserva por aqui. Obrigado!");
    } else {
      await whatsappService.transferToHuman(conversation.id, "Comprovante recebido sem reserva Pix pendente para associar.");
      await sendText(conversation.id, to,
        "Recebi seu comprovante, mas não achei uma reserva com Pix pendente no seu número. Já pedi para um atendente conferir. 🙏");
    }
  } catch (err) {
    console.error("Erro ao processar comprovante:", err);
    await whatsappService.transferToHuman(conversation.id, `Falha ao processar comprovante: ${String(err)}`);
    await sendText(conversation.id, to,
      "Recebi seu comprovante, mas tive um problema para registrar. Um atendente vai conferir manualmente. 🙏");
  }
}

async function sendMenu(conversationId: string, to: string) {
  await whatsappService.updateConversationState(conversationId, { step: "awaiting_menu" });
  await whatsappService.reply(conversationId, to,
    () => whatsappClient.sendList(to, "Rota Pirapemas", "Oi! Como posso ajudar hoje?", "Ver opções", MENU_ROWS),
    { type: "interactive", content: { menu: MENU_ROWS.map((r) => r.id) } });
}

async function askPayment(conversationId: string, to: string, state: any) {
  const total = (state.routePointPrice ?? 0) * (state.quantity ?? 1);
  await whatsappService.reply(conversationId, to,
    () => whatsappClient.sendButtons(to, `Total: R$ ${total} (${state.quantity}x R$ ${state.routePointPrice}). Como prefere pagar?`,
      [{ id: "pag_dinheiro", title: "Dinheiro" }, { id: "pag_pix", title: "Pix" }]),
    { type: "interactive", content: { total } });
}

// =====================================================================
// Fluxo por clique de botão/lista — determinístico, sem NLU (não precisa:
// o id do botão já É a informação, sem ambiguidade nenhuma pra extrair)
// =====================================================================
async function route(conversation: any, state: any, input: string, msg: IncomingMessage) {
  const to = msg.from;
  const step = state.step ?? "idle";

  if (step === "idle" || input === "menu") { await sendMenu(conversation.id, to); return; }
  if (step === "awaiting_menu") return handleMenuChoice(conversation, state, input, to);
  if (step === "awaiting_route_point") return handleRoutePointChoice(conversation, state, input, to);
  if (step === "awaiting_detail") return handleDetailInput(conversation, state, input, to);
  if (step === "awaiting_quantity") return handleQuantityInput(conversation, state, input, to);
  if (step === "awaiting_dropoff") return handleDropoffInput(conversation, state, input, to);
  if (step === "awaiting_name") return handleNameInput(conversation, state, input, to);
  if (step === "awaiting_payment") return handlePaymentChoice(conversation, state, input, to);
  if (step === "awaiting_cancel_choice") return handleCancelChoice(conversation, state, input, to);
  if (step === "awaiting_alter_field") return handleAlterFieldChoice(conversation, state, input, to);
  if (step === "awaiting_alter_point") return handleAlterPointChoice(conversation, state, input, to);
  if (step === "awaiting_alter_dropoff") return handleAlterDropoffInput(conversation, state, input, to);
  if (step === "awaiting_alter_date") return handleAlterDateInput(conversation, state, input, to);
  if (step === "awaiting_date") {
    const withDate = { ...state, tripDate: normalizeDate(input) };
    await whatsappService.updateConversationState(conversation.id, withDate);
    await advanceReservationFlow(conversation, withDate, to);
    return;
  }

  await whatsappService.transferToHuman(conversation.id, "Estado de conversa não reconhecido.");
  await sendText(conversation.id, to, "Vou te encaminhar para um atendente. 🙋");
}

function normalizeDate(input: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
  const m = input.match(/^(\d{2})\/(\d{2})(?:\/(\d{4}))?$/);
  if (m) { const year = m[3] ?? String(new Date().getFullYear()); return `${year}-${m[2]}-${m[1]}`; }
  return input;
}

async function handleMenuChoice(conversation: any, state: any, input: string, to: string) {
  if (input === "espera_sim") { await handleWaitlistChoice(conversation, state, to); return; }
  if (input === "menu_ida" || input === "menu_volta") {
    const direction = input === "menu_ida" ? "ida" : "volta";
    const state = { step: "awaiting_date", direction, type: "passagem" };
    await whatsappService.updateConversationState(conversation.id, state);
    await advanceReservationFlow(conversation, state, to);
    return;
  }
  if (input === "menu_frete" || input === "menu_encomenda") {
    await whatsappService.transferToHuman(conversation.id, input === "menu_frete" ? "Pedido de frete" : "Pedido de encomenda");
    await sendText(conversation.id, to, "Perfeito — vou te conectar com nossa equipe para combinar os detalhes e o valor. 📦");
    return;
  }
  if (input === "menu_cancelar" || input === "menu_alterar") {
    const customer = await whatsappService.identifyCustomer(to);
    if (!customer) { await sendText(conversation.id, to, "Não encontrei reservas no seu número ainda."); return; }
    const reservations = await whatsappService.listCustomerReservations(customer.id);
    if (!reservations?.length) { await sendText(conversation.id, to, "Você não tem reservas ativas no momento."); return; }
    const rows = reservations.slice(0, 10).map((r: any) => ({
      id: `res_${r.id}`, title: `${r.trip?.direction === "ida" ? "Ida" : "Volta"} ${r.trip?.trip_date ?? ""}`,
      description: `${r.route_point?.name ?? ""} · ${r.status}`,
    }));
    await whatsappService.updateConversationState(conversation.id, { step: "awaiting_cancel_choice", action: input === "menu_cancelar" ? "cancelar" : "alterar", customerId: customer.id });
    await whatsappService.reply(conversation.id, to, () => whatsappClient.sendList(to, "Suas reservas", "Qual delas?", "Escolher", rows), { type: "interactive", content: { rows: rows.map((r) => r.id) } });
    return;
  }
  if (input === "menu_pagamento") {
    const customer = await whatsappService.identifyCustomer(to);
    const reservations = customer ? await whatsappService.listCustomerReservations(customer.id) : [];
    if (!reservations?.length) { await sendText(conversation.id, to, "Não encontrei reservas para checar pagamento."); return; }
    let text = "Status de pagamento das suas reservas:\n";
    for (const r of reservations) {
      const payments = await whatsappService.checkPaymentStatus(r.id);
      text += `\n• ${r.trip?.direction} ${r.trip?.trip_date}: ${payments?.[0]?.status ?? "sem registro de pagamento"}`;
    }
    await sendText(conversation.id, to, text);
    return;
  }
  if (input === "menu_atendente") {
    await whatsappService.transferToHuman(conversation.id, "Cliente pediu atendente.");
    await sendText(conversation.id, to, "Combinado — um atendente humano assume a conversa a partir daqui. 🙋");
    return;
  }
  if (input === "espera_nao") {
    await sendText(conversation.id, to, "Sem problemas! Digite *menu* quando quiser tentar outra data.");
    return;
  }
  await sendText(conversation.id, to, "Não entendi essa opção — digite *menu* para ver as opções de novo.");
}

/** Cliente aceitou entrar na lista de espera — cria a reserva com status 'espera' (não ocupa vaga). */
async function handleWaitlistChoice(conversation: any, state: any, to: string) {
  const customer = await whatsappService.identifyCustomer(to);
  const result = await whatsappService.createReservation(conversation.id, {
    tripDate: state.tripDate, direction: state.direction, customerName: customer?.name ?? state.customerName ?? "",
    customerPhone: to, routePointCode: state.routePointCode ?? null, quantity: state.quantity ?? 1,
    unitPrice: state.routePointPrice ?? 0, status: "espera",
  });
  await whatsappService.updateConversationState(conversation.id, { step: "idle" });
  await sendText(conversation.id, to, "Você entrou na lista de espera! Avisamos assim que houver vaga. ⏳");
  return result;
}

async function handleRoutePointChoice(conversation: any, state: any, input: string, to: string) {
  const code = input.replace("ponto_", "");
  const points = await whatsappService.listRoutePoints(state.direction);
  const point = points.find((p: any) => p.code === code);
  if (!point) { await sendText(conversation.id, to, "Não reconheci esse ponto — digite *menu* para recomeçar."); return; }
  const next = { ...state, routePointCode: point.code, routePointName: point.name, routePointPrice: point.price, routePointRequiresDetail: point.requires_detail };
  await whatsappService.updateConversationState(conversation.id, next);
  await advanceReservationFlow(conversation, next, to);
}

async function handleDetailInput(conversation: any, state: any, input: string, to: string) {
  const patch: Record<string, unknown> = state.routePointCode === "busca" ? { pickupNeighborhood: input } : { pickupDetail: input };
  const next = { ...state, ...patch };
  await whatsappService.updateConversationState(conversation.id, next);
  await advanceReservationFlow(conversation, next, to);
}

async function handleQuantityInput(conversation: any, state: any, input: string, to: string) {
  const qty = parseInt(input, 10);
  if (!qty || qty < 1) { await sendText(conversation.id, to, "Me manda só o número de passagens, ex: 2"); return; }
  const next = { ...state, quantity: qty };
  await whatsappService.updateConversationState(conversation.id, next);
  await advanceReservationFlow(conversation, next, to);
}

async function handleDropoffInput(conversation: any, state: any, input: string, to: string) {
  const next = { ...state, dropoffLocation: input };
  await whatsappService.updateConversationState(conversation.id, next);
  await advanceReservationFlow(conversation, next, to);
}

async function handleNameInput(conversation: any, state: any, input: string, to: string) {
  const next = { ...state, customerName: input };
  await whatsappService.updateConversationState(conversation.id, next);
  await advanceReservationFlow(conversation, next, to);
}

async function handlePaymentChoice(conversation: any, state: any, input: string, to: string) {
  const next = { ...state, paymentMethod: input === "pag_pix" ? "pix" : "dinheiro" };
  await whatsappService.updateConversationState(conversation.id, next);
  await finalizeReservation(conversation, next, to);
}

async function handleCancelChoice(conversation: any, state: any, input: string, to: string) {
  const reservationId = input.replace("res_", "");

  if (state.action === "cancelar") {
    try {
      await whatsappService.cancelReservation(conversation.id, reservationId);
      await sendText(conversation.id, to, "Reserva cancelada. Se precisar remarcar, é só chamar de novo! 👋");
    } finally {
      await whatsappService.updateConversationState(conversation.id, { step: "idle" });
    }
    return;
  }

  // Alterar: relista (a IA nunca "lembra") e abre o menu do que mudar.
  const customer = await whatsappService.identifyCustomer(to);
  const reservations = customer ? await whatsappService.listCustomerReservations(customer.id) : [];
  const alvo = reservations?.find((r: any) => r.id === reservationId);
  if (!alvo) {
    await sendText(conversation.id, to, "Não achei essa reserva. Digite *menu* para recomeçar.");
    await whatsappService.updateConversationState(conversation.id, { step: "idle" });
    return;
  }
  const alter = {
    reservationId,
    tripDate: alvo.trip?.trip_date ?? null,
    direction: alvo.trip?.direction ?? null,
    routePointCode: alvo.route_point?.code ?? null,
  };
  const curto = (s: string) => (s.length > 68 ? `${s.slice(0, 67)}…` : s);
  await whatsappService.updateConversationState(conversation.id, { step: "awaiting_alter_field", alter });
  await whatsappService.reply(conversation.id, to,
    () => whatsappClient.sendList(to, "Alterar reserva", "O que você quer mudar?", "Escolher", [
      { id: "alt_desembarque", title: "Local de desembarque",
        description: curto(alvo.dropoff_location ? `Hoje: ${alvo.dropoff_location}` : "Onde você vai ficar") },
      { id: "alt_ponto", title: "Ponto de embarque",
        description: curto(alvo.route_point?.name ? `Hoje: ${alvo.route_point.name}` : "Onde você embarca") },
      { id: "alt_data", title: "Data da viagem",
        description: curto(alvo.trip?.trip_date ? `Hoje: ${alvo.trip.trip_date}` : "Outro dia") },
      { id: "alt_atendente", title: "Outra mudança", description: "Falar com um atendente" },
    ]),
    { type: "interactive", content: { rows: ["alt_desembarque", "alt_ponto", "alt_data", "alt_atendente"] } });
}

async function handleAlterFieldChoice(conversation: any, state: any, input: string, to: string) {
  const alter = state.alter ?? {};
  if (input === "alt_atendente") {
    await whatsappService.transferToHuman(conversation.id, `Cliente quer alterar a reserva ${alter.reservationId}`);
    await sendText(conversation.id, to, "Vou te conectar com um atendente para ajustar sua reserva certinho. 🙋");
    await whatsappService.updateConversationState(conversation.id, { step: "idle" });
    return;
  }
  if (input === "alt_desembarque") {
    await whatsappService.updateConversationState(conversation.id, { ...state, step: "awaiting_alter_dropoff" });
    await sendText(conversation.id, to, "Qual o novo local de desembarque? (endereço ou ponto de referência)");
    return;
  }
  if (input === "alt_data") {
    await whatsappService.updateConversationState(conversation.id, { ...state, step: "awaiting_alter_date" });
    await sendText(conversation.id, to, "Para qual data? (ex.: 25/12)");
    return;
  }
  if (input === "alt_ponto") {
    const points = await whatsappService.listRoutePoints(alter.direction ?? "ida");
    const rows = points.map((p: any) => ({
      id: `ponto_${p.code}`, title: p.name, description: (p.base_time ?? "").slice(0, 5),
    }));
    await whatsappService.updateConversationState(conversation.id, { ...state, step: "awaiting_alter_point" });
    await whatsappService.reply(conversation.id, to,
      () => whatsappClient.sendList(to, "Ponto de embarque", "Escolha o novo ponto de embarque:", "Escolher", rows),
      { type: "interactive", content: { rows: rows.map((r: any) => r.id) } });
    return;
  }
  await sendText(conversation.id, to, "Não entendi. Digite *menu* para recomeçar.");
}

async function handleAlterDropoffInput(conversation: any, state: any, input: string, to: string) {
  const alter = state.alter ?? {};
  try {
    await whatsappService.setDropoffLocation(conversation.id, alter.reservationId, input.trim());
    await sendText(conversation.id, to,
      `Pronto! Novo desembarque: *${input.trim()}*. A equipe já foi avisada. ✅`);
  } catch (err) {
    if (err instanceof WhatsappServiceError && err.code === "HUMAN_MODE_ACTIVE") return;
    await whatsappService.transferToHuman(conversation.id,
      `Falha ao mudar o desembarque da reserva ${alter.reservationId}: ${String(err)}`);
    await sendText(conversation.id, to, "Tive um problema para salvar. Um atendente vai ajustar. 🙏");
  } finally {
    await whatsappService.updateConversationState(conversation.id, { step: "idle" });
  }
}

async function handleAlterPointChoice(conversation: any, state: any, input: string, to: string) {
  const alter = state.alter ?? {};
  const code = input.replace("ponto_", "");
  try {
    await whatsappService.moveReservation(conversation.id, alter.reservationId, {
      tripDate: alter.tripDate, direction: alter.direction, routePointCode: code,
    });
    await sendText(conversation.id, to, "Ponto de embarque atualizado! A equipe já foi avisada. ✅");
  } catch (err) {
    if (err instanceof WhatsappServiceError && err.code === "MOVE_REJECTED") {
      await sendText(conversation.id, to, err.message);
    } else if (!(err instanceof WhatsappServiceError && err.code === "HUMAN_MODE_ACTIVE")) {
      await whatsappService.transferToHuman(conversation.id, `Falha ao mudar o ponto: ${String(err)}`);
      await sendText(conversation.id, to, "Tive um problema. Um atendente vai ajustar. 🙏");
    }
  } finally {
    await whatsappService.updateConversationState(conversation.id, { step: "idle" });
  }
}

async function handleAlterDateInput(conversation: any, state: any, input: string, to: string) {
  const alter = state.alter ?? {};
  const date = normalizeDate(input.trim());
  try {
    await whatsappService.moveReservation(conversation.id, alter.reservationId, {
      tripDate: date, direction: alter.direction, routePointCode: alter.routePointCode,
    });
    await sendText(conversation.id, to, `Reserva remarcada para ${input.trim()}. A equipe já foi avisada. ✅`);
  } catch (err) {
    if (err instanceof WhatsappServiceError && err.code === "MOVE_REJECTED") {
      await sendText(conversation.id, to,
        `${err.message} Se quiser, digite *menu* e entre na lista de espera.`);
    } else if (!(err instanceof WhatsappServiceError && err.code === "HUMAN_MODE_ACTIVE")) {
      await whatsappService.transferToHuman(conversation.id, `Falha ao remarcar: ${String(err)}`);
      await sendText(conversation.id, to, "Tive um problema. Um atendente vai ajustar. 🙏");
    }
  } finally {
    await whatsappService.updateConversationState(conversation.id, { step: "idle" });
  }
}
