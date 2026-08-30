// RUM operacional. Escolher UM: Datadog RUM ou New Relic Browser
// (AGENTS.md §4). Config presente para os dois; ativa por env.
// New Relic Browser normalmente entra por snippet no HTML / loader do
// agente — aqui deixamos só o gancho e o aviso.

import { isEnabled, obs } from "./config.js";

let started = false;

export async function initRum() {
  if (started) return;

  if (isEnabled.datadog()) {
    started = true;
    const { datadogRum } = await import("@datadog/browser-rum");
    datadogRum.init({
      applicationId: obs.datadog.applicationId,
      clientToken: obs.datadog.clientToken,
      site: obs.datadog.site,
      service: obs.serviceName,
      env: obs.environment,
      version: obs.release,
      sessionSampleRate: 100,
      sessionReplaySampleRate: 20,
      trackUserInteractions: true,
      trackResources: true,
      trackLongTasks: true,
      defaultPrivacyLevel: "mask-user-input",
    });
    return;
  }

  if (isEnabled.newRelic()) {
    started = true;
    console.info(
      "[obs] New Relic Browser selecionado — injete o loader do agente no index.html " +
        "com a licenseKey e o applicationId (ver docs New Relic Browser).",
    );
  }
}

/** Métrica/ação de negócio para o dashboard operacional. */
export function trackAction(name, attributes = {}) {
  if (isEnabled.datadog() && globalThis.DD_RUM) {
    globalThis.DD_RUM.addAction(name, attributes);
  }
}
