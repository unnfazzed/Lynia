/**
 * Latency/SLO metrics (METRICS ONLY — no custom spans). A single injectable that owns every
 * instrument the app records into, exposed via typed record methods with FIXED label sets.
 *
 * NoopMeter safety (the review's #1 gap): if instruments are created at construction and the real
 * MeterProvider isn't registered yet, they bind to the NoopMeter FOREVER and silently emit nothing.
 * MITIGATION: instruments are created LAZILY on first record and cached — the meter is resolved via
 * `metrics.getMeter("lynia-api")` from @opentelemetry/api AT THAT MOMENT. initObservability() runs
 * before Nest DI, so the real provider is already registered by the first record; lazy-create removes
 * the ordering coupling entirely. With no OTLP endpoint the API returns a NoopMeter and every record
 * is a cheap no-op that never throws.
 */
import { Global, Injectable, Module } from "@nestjs/common";
import { type Attributes, type Counter, type Histogram, type Meter, metrics } from "@opentelemetry/api";

const METER_NAME = "lynia-api";

/** Explicit-bucket histogram instruments (buckets bound via Views in otel.ts). */
type HistogramName =
  | "offer_received_latency_ms"
  | "position_emit_latency_ms"
  | "match_select_duration_ms"
  | "broadcast_nearby_duration_ms"
  | "otp_verify_duration_ms"
  | "http_request_duration_ms";

/** Counter instruments. */
type CounterName = "match_select_total" | "offers_made_total";

/** Fixed label vocabularies — NEVER accept ids/phones/lat-lng/raw-urls as labels (cardinality). */
export type MatchSelectOutcome = "assigned" | "taken" | "unavailable" | "not_open" | "forbidden" | "error";
export type BroadcastSource = "redis" | "pg";
export type OtpVerifyResult = "ok" | "invalid" | "expired" | "locked" | "error";
export type OffersMadeOutcome = "created" | "conflict" | "forbidden" | "error";
export type StatusClass = "2xx" | "3xx" | "4xx" | "5xx";

@Injectable()
export class MetricsService {
  /** Lazily-created + cached instruments, keyed by instrument name. */
  private readonly instruments = new Map<string, Histogram | Counter>();

  /** Resolve the meter lazily (deferred so instruments bind to the real provider, not the Noop). */
  private meter(): Meter {
    return metrics.getMeter(METER_NAME);
  }

  private histogram(name: HistogramName): Histogram {
    const cached = this.instruments.get(name) as Histogram | undefined;
    if (cached) return cached;
    const h = this.meter().createHistogram(name, { unit: "ms" });
    this.instruments.set(name, h);
    return h;
  }

  private counter(name: CounterName): Counter {
    const cached = this.instruments.get(name) as Counter | undefined;
    if (cached) return cached;
    const c = this.meter().createCounter(name);
    this.instruments.set(name, c);
    return c;
  }

  /** Start a wall-clock timer; the returned closure yields elapsed milliseconds. */
  startTimer(): () => number {
    const started = performance.now();
    return () => performance.now() - started;
  }

  // --- Typed record methods (all units ms; all safe under a NoopMeter → no-op, no throw). ---

  recordOfferLatency(ms: number): void {
    this.histogram("offer_received_latency_ms").record(ms);
  }

  recordPositionEmit(ms: number): void {
    // Highest-frequency path (per rider fix). No labels, so pass no attributes at all — zero-alloc.
    this.histogram("position_emit_latency_ms").record(ms);
  }

  recordMatchSelect(ms: number, outcome: MatchSelectOutcome): void {
    const attrs: Attributes = { outcome };
    this.histogram("match_select_duration_ms").record(ms, attrs);
    this.counter("match_select_total").add(1, attrs);
  }

  recordBroadcastNearby(ms: number, source: BroadcastSource): void {
    this.histogram("broadcast_nearby_duration_ms").record(ms, { source });
  }

  recordOtpVerify(ms: number, result: OtpVerifyResult): void {
    this.histogram("otp_verify_duration_ms").record(ms, { result });
  }

  recordHttp(route: string, method: string, statusClass: StatusClass, ms: number): void {
    this.histogram("http_request_duration_ms").record(ms, {
      route,
      method,
      status_class: statusClass,
    });
  }

  incOffersMade(outcome: OffersMadeOutcome): void {
    this.counter("offers_made_total").add(1, { outcome });
  }
}

/** App-wide metrics provider. @Global so every module can inject MetricsService without importing it. */
@Global()
@Module({
  providers: [MetricsService],
  exports: [MetricsService],
})
export class ObservabilityModule {}
