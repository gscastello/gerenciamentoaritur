// Eventos de negócio nomeados. Regra do AGENTS.md §4: função crítica emite
// evento nomeado, não só log solto. Um ponto único para: span OTel +
// breadcrumb Sentry + ação RUM.

import { Sentry } from "./sentry.js";
import { isEnabled } from "./config.js";
import { withSpan } from "./otel.js";
import { trackAction } from "./rum.js";

export const EVENTS = {
  RESERVA_CONFIRMADA: "reserva.confirmada",
  RESERVA_PENDENTE: "reserva.pendente",
  VAGAS_CALCULADAS: "vagas.calculadas",
  WHATSAPP_WEBHOOK: "whatsapp.webhook.recebido",
  DIAGNOSTICO_AUTOCORRECAO: "diagnostico.autocorrecao",
  VIAGEM_INICIADA: "viagem.iniciada",
  VIAGEM_FINALIZADA: "viagem.finalizada",
};

/** Registra um evento de negócio pontual (sem duração). */
export function emit(name, attributes = {}) {
  if (isEnabled.sentry()) {
    Sentry.addBreadcrumb({ category: "negocio", message: name, data: attributes, level: "info" });
  }
  trackAction(name, attributes);
  if (import.meta.env?.DEV) console.debug("[event]", name, attributes);
}

/**
 * Executa uma operação crítica como um span nomeado e emite o evento
 * correspondente ao terminar. Use nas funções que não podem falhar em
 * silêncio (confirmar reserva, calcular vagas, processar webhook).
 */
export async function instrument(name, fn, attributes = {}) {
  const result = await withSpan(name, fn, attributes);
  emit(name, attributes);
  return result;
}
