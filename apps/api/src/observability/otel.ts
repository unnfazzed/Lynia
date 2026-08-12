/**
 * OpenTelemetry bootstrap — portable observability (D7). Tracing is exported over OTLP/HTTP to
 * whatever OTEL_EXPORTER_OTLP_ENDPOINT points at, so the collector is the only thing that differs
 * between monitoring backends — no vendor SDK lock-in.
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
  // Metrics ride the SAME NodeSDK (D7). Loaded lazily alongside traces so a no-endpoint dev/test boot
  // never pulls the metrics tree. Traces stay BatchSpanProcessor (NodeSDK default) — never inline export.
  const { PeriodicExportingMetricReader, AggregationType } = await import("@opentelemetry/sdk-metrics");
  const { OTLPMetricExporter } = await import("@opentelemetry/exporter-metrics-otlp-http");

  const base = endpoint.replace(/\/+$/, "");

  // Explicit latency buckets per histogram (ms). The buckets are chosen around each metric's p95 SLO
  // so histogram_quantile has resolution where the alert threshold sits (see docs/OBSERVABILITY.md).
  const histogramBuckets: Record<string, number[]> = {
    position_emit_latency_ms: [50, 100, 200, 300, 500, 750, 1000],
    offer_received_latency_ms: [250, 500, 1000, 1500, 2000, 3000, 5000],
    match_select_duration_ms: [50, 100, 200, 300, 500, 1000],
    broadcast_nearby_duration_ms: [50, 100, 200, 300, 400, 600, 1000],
    otp_verify_duration_ms: [100, 250, 500, 800, 1200, 2000],
    http_request_duration_ms: [50, 100, 250, 500, 1000, 2000, 5000],
    // Client RUM (glass-to-glass + REST). WIDER than server buckets: these span network + render, so a
    // 1–3s tail is normal on mobile and needs resolution the server buckets don't carry.
    client_position_glass_latency_ms: [100, 250, 500, 1000, 2000, 3000, 5000, 10000],
    client_offer_glass_latency_ms: [100, 250, 500, 1000, 2000, 3000, 5000, 10000],
    client_board_glass_latency_ms: [100, 250, 500, 1000, 2000, 3000, 5000, 10000],
    client_apifetch_latency_ms: [50, 100, 250, 500, 1000, 2000, 5000, 10000],
    // Cold start. Buckets sit where the DECISIONS are, not on a round-number ladder: 1s is "instant"
    // on a mid handset, 2s is the target for the low-end fleet this app is built for, 4s is where the
    // font gate's own timeout would land, and everything past 8s is the class the owner reported.
    // Resolution below 500ms would be wasted — no launch has ever been that fast here.
    client_boot_paint_ms: [500, 1000, 1500, 2000, 3000, 4000, 6000, 8000, 12000],
    client_boot_home_ms: [500, 1000, 1500, 2000, 3000, 4000, 6000, 8000, 12000],
    // Rail-confirmation lag (money, not request latency): a mobile-money confirm is seconds→minutes,
    // and a late confirm on an already-expired intent is legitimately hours — 5s out to 1h.
    topup_confirm_lag_ms: [5000, 15000, 30000, 60000, 120000, 300000, 600000, 1800000, 3600000],
  };

  return new NodeSDK({
    traceExporter: new OTLPTraceExporter({ url: `${base}/v1/traces` }),
    instrumentations: [new HttpInstrumentation()],
    // OTLP push (no scrape endpoint); the exporter targets the SAME collector as traces at /v1/metrics.
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({ url: `${base}/v1/metrics` }),
        exportIntervalMillis: 15_000,
      }),
    ],
    // One View per histogram binds its explicit buckets by instrument name (sdk-metrics 2.x uses
    // ViewOptions objects with AggregationType.EXPLICIT_BUCKET_HISTOGRAM, not the legacy View class).
    views: Object.entries(histogramBuckets).map(([instrumentName, boundaries]) => ({
      instrumentName,
      aggregation: { type: AggregationType.EXPLICIT_BUCKET_HISTOGRAM, options: { boundaries } },
    })),
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
