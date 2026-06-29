/**
 * OpenTelemetry bootstrap — portable observability (D7). Tracing is exported over OTLP/HTTP to
 * whatever OTEL_EXPORTER_OTLP_ENDPOINT points at, so the collector is the only thing that differs
 * between Cloud Monitoring and Azure Monitor — no vendor SDK lock-in.
 *
 * The SDK is loaded lazily and only when an endpoint is configured: with no endpoint this is a
 * no-op and the (heavy) SDK tree never loads — keeping dev/test boot light, as before.
 */
import { diag, DiagConsoleLogger, DiagLogLevel } from "@opentelemetry/api";
import type { NodeSDK } from "@opentelemetry/sdk-node";

let started = false;
let sdkRef: NodeSDK | undefined;

/**
 * Build a configured NodeSDK when an OTLP endpoint is set, else null. Construction only — it does
 * NOT start()/connect, so it is safe to unit-test without a live collector. Service name is carried
 * via OTEL_SERVICE_NAME (the SDK's env resource detector reads it), which main.ts already sets.
 */
export async function buildOtelSdk(serviceName: string, endpoint?: string): Promise<NodeSDK | null> {
  if (!endpoint) return null;
  // Make sure the resource service.name resolves even if the env var wasn't exported explicitly.
  process.env.OTEL_SERVICE_NAME ||= serviceName;

  const { NodeSDK } = await import("@opentelemetry/sdk-node");
  const { OTLPTraceExporter } = await import("@opentelemetry/exporter-trace-otlp-http");
  const { HttpInstrumentation } = await import("@opentelemetry/instrumentation-http");

  return new NodeSDK({
    traceExporter: new OTLPTraceExporter({ url: `${endpoint.replace(/\/+$/, "")}/v1/traces` }),
    instrumentations: [new HttpInstrumentation()],
  });
}

export async function initObservability(serviceName: string, endpoint?: string): Promise<void> {
  if (started) return;
  started = true;
  if (process.env.NODE_ENV !== "production") {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ERROR);
  }

  const sdk = await buildOtelSdk(serviceName, endpoint);
  if (!sdk) return;

  sdk.start();
  sdkRef = sdk;
  // Cloud Run sends SIGTERM on scale-down; flush the last span batch so it isn't dropped.
  process.once("SIGTERM", () => void sdkRef?.shutdown().catch(() => undefined));
}
