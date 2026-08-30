// OpenTelemetry (Web) — camada base de tracing. Exporta via OTLP/HTTP para
// o backend escolhido (Grafana Tempo, Honeycomb, Datadog, etc.).
// No-op se VITE_OTEL_EXPORTER_OTLP_ENDPOINT não estiver definido.

import { context, trace } from "@opentelemetry/api";
import { ZoneContextManager } from "@opentelemetry/context-zone";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { getWebAutoInstrumentations } from "@opentelemetry/auto-instrumentations-web";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchSpanProcessor, WebTracerProvider } from "@opentelemetry/sdk-trace-web";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import { isEnabled, obs } from "./config.js";

let tracer = trace.getTracer(obs.serviceName);
let started = false;

function parseHeaders(raw) {
  // "k1=v1,k2=v2" -> { k1: "v1", k2: "v2" }
  return Object.fromEntries(
    raw
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => {
        const i = p.indexOf("=");
        return [p.slice(0, i), p.slice(i + 1)];
      }),
  );
}

export function initOtel() {
  if (started || !isEnabled.otel()) return;
  started = true;

  const provider = new WebTracerProvider({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: obs.serviceName,
      [ATTR_SERVICE_VERSION]: obs.release,
      "deployment.environment": obs.environment,
    }),
    spanProcessors: [
      new BatchSpanProcessor(
        new OTLPTraceExporter({
          url: obs.otel.endpoint,
          headers: obs.otel.headers ? parseHeaders(obs.otel.headers) : undefined,
        }),
      ),
    ],
  });

  provider.register({ contextManager: new ZoneContextManager() });
  registerInstrumentations({ instrumentations: [getWebAutoInstrumentations()] });
  tracer = trace.getTracer(obs.serviceName);
}

/**
 * Envolve uma função crítica num span. Sempre funciona: se o OTel estiver
 * desligado, só executa a função.
 */
export async function withSpan(name, fn, attributes = {}) {
  if (!started) return fn();
  const span = tracer.startSpan(name, { attributes });
  try {
    return await context.with(trace.setSpan(context.active(), span), fn);
  } catch (err) {
    span.recordException(err);
    span.setStatus({ code: 2, message: String(err?.message || err) });
    throw err;
  } finally {
    span.end();
  }
}
