// Sentry — captura de erros do front, com release tagging por deploy.
// No-op se VITE_SENTRY_DSN não estiver definido.

import * as Sentry from "@sentry/react";
import { isEnabled, obs } from "./config.js";

let started = false;

export function initSentry() {
  if (started || !isEnabled.sentry()) return;
  started = true;

  Sentry.init({
    dsn: obs.sentry.dsn,
    environment: obs.environment,
    release: obs.release,
    tracesSampleRate: obs.sentry.tracesSampleRate,
    replaysSessionSampleRate: obs.sentry.replaysSessionSampleRate,
    replaysOnErrorSampleRate: obs.sentry.replaysSessionSampleRate ? 1.0 : 0,
    integrations: [Sentry.browserTracingIntegration()],
  });
}

/** Usado pelo ErrorBoundary do app. */
export function reportError(error, context) {
  if (isEnabled.sentry()) {
    Sentry.captureException(error, context ? { extra: context } : undefined);
  } else {
    // Em dev sem Sentry, ainda queremos ver o erro no console.
    console.error("[obs] erro não reportado (Sentry desligado):", error, context);
  }
}

export { Sentry };
