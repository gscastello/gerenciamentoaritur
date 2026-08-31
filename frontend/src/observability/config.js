// Leitura central da configuração de observabilidade. Tudo vem de env
// (Vite: import.meta.env.VITE_*). Nada é obrigatório — cada camada só liga
// se a chave dela existir. Sem chave => no-op silencioso (dev/local).
//
// Preencha em frontend/.env (veja frontend/.env.example). Issue #3.

const env = import.meta.env ?? {};

export const obs = {
  environment: env.VITE_OBSERVABILITY_ENV || env.MODE || "development",
  release: env.VITE_RELEASE || "dev",
  serviceName: "rota-pirapemas-frontend",

  sentry: {
    dsn: env.VITE_SENTRY_DSN || "",
    tracesSampleRate: Number(env.VITE_SENTRY_TRACES_SAMPLE_RATE ?? 0.2),
    replaysSessionSampleRate: Number(env.VITE_SENTRY_REPLAYS_SAMPLE_RATE ?? 0),
  },

  otel: {
    endpoint: env.VITE_OTEL_EXPORTER_OTLP_ENDPOINT || "",
    headers: env.VITE_OTEL_EXPORTER_OTLP_HEADERS || "",
  },

  datadog: {
    applicationId: env.VITE_DATADOG_APPLICATION_ID || "",
    clientToken: env.VITE_DATADOG_CLIENT_TOKEN || "",
    site: env.VITE_DATADOG_SITE || "datadoghq.com",
  },

  newRelic: {
    // Ativado só se Datadog estiver desligado — escolher UM (AGENTS.md §4).
    licenseKey: env.VITE_NEWRELIC_LICENSE_KEY || "",
    applicationId: env.VITE_NEWRELIC_APPLICATION_ID || "",
  },
};

export const isEnabled = {
  sentry: () => Boolean(obs.sentry.dsn),
  otel: () => Boolean(obs.otel.endpoint),
  datadog: () => Boolean(obs.datadog.clientToken && obs.datadog.applicationId),
  newRelic: () => Boolean(obs.newRelic.licenseKey) && !isEnabled.datadog(),
};
