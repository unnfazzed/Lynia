/**
 * OpenTelemetry bootstrap — portable observability (D7). The exporter is swapped per cloud
 * via OTEL_EXPORTER_OTLP_ENDPOINT, so no Azure-App-Insights-SDK or GCP-specific lock-in.
 *
 * Lane A wires the seam and a no-op-safe init; the OTLP SDK exporters are added when the
 * first real spans/metrics land (later lanes). Keeping @opentelemetry/api only here keeps
 * the dependency surface light.
 */
import { diag, DiagConsoleLogger, DiagLogLevel } from "@opentelemetry/api";

let started = false;

export function initObservability(serviceName: string, endpoint?: string): void {
  if (started) return;
  started = true;
  if (process.env.NODE_ENV !== "production") {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ERROR);
  }
  // TODO(lane D+): attach NodeSDK + OTLP exporter when endpoint is configured.
  // The exporter target is the only thing that differs between Azure Monitor and Cloud Monitoring.
  if (endpoint) {
    // eslint-disable-next-line no-console
    console.log(`[otel] ${serviceName} → ${endpoint} (exporter wiring deferred)`);
  }
}
