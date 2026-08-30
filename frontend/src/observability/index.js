// Bootstrap único de observabilidade. Chamado uma vez em main.jsx, antes
// de renderizar o app. Cada camada é no-op se a env dela não existir.

import { initOtel } from "./otel.js";
import { initRum } from "./rum.js";
import { initSentry } from "./sentry.js";

export function initObservability() {
  initSentry();
  initOtel();
  // RUM é assíncrono (import dinâmico do SDK) — não bloqueia o render.
  initRum().catch((e) => console.warn("[obs] RUM não iniciou:", e));
}

export { reportError } from "./sentry.js";
export { withSpan } from "./otel.js";
export { emit, instrument, EVENTS } from "./events.js";
