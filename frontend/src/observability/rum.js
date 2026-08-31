// RUM operacional (Datadog RUM ou New Relic Browser) — issue #3.
//
// Igual ao otel.js: o contrato fica pronto, a fiação real (SDK + conta +
// dashboards) é a issue #3. Sem isso o build não depende de um pacote de
// RUM específico antes da decisão de qual usar.

import { isEnabled } from "./config.js";

let started = false;

export async function initRum() {
  if (started) return;
  if (isEnabled.datadog() || isEnabled.newRelic()) {
    started = true;
    console.info(
      "[obs] RUM configurado por env — instalar o SDK (Datadog RUM ou New Relic Browser) na issue #3.",
    );
  }
}

/** Ação/métrica de negócio para o dashboard operacional. No-op até a issue #3. */
export function trackAction(name, attributes = {}) {
  if (import.meta.env?.DEV) console.debug("[rum]", name, attributes);
}
