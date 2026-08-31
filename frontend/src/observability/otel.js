// OpenTelemetry (Web) — camada de tracing.
//
// A fiação real com o SDK do OTel (WebTracerProvider + OTLP exporter +
// auto-instrumentations) é a issue #3: precisa de versões travadas e teste
// contra um backend OTLP de verdade. As APIs do `@opentelemetry/*` mudaram
// bastante entre 1.x e 2.x (ex.: `resourceFromAttributes` vs `new Resource`),
// então em vez de deixar o build quebrando com uma versão errada, este
// arquivo mantém só o contrato (`initOtel`, `withSpan`) como no-op seguro.
//
// `withSpan(name, fn)` sempre funciona: com OTel desligado, só executa a
// função. Quando a issue #3 ligar o SDK, o span passa a ser criado de
// verdade sem mudar quem chama.

import { isEnabled } from "./config.js";

let started = false;

export function initOtel() {
  if (started || !isEnabled.otel()) return;
  started = true;
  // TODO(#3): carregar o SDK do OTel via import() dinâmico aqui, com as
  // versões de @opentelemetry/* travadas no package.json e testado contra
  // o endpoint OTLP real.
  console.info("[obs] OTLP endpoint definido — a instrumentação real entra na issue #3.");
}

/**
 * Envolve uma operação crítica num span nomeado. Enquanto o SDK não está
 * ligado, apenas executa a função (sem custo, sem risco).
 */
export async function withSpan(_name, fn, _attributes = {}) {
  return fn();
}
