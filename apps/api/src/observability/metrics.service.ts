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
import type { ClientMetricEvent } from "@lynia/shared";
import { type Attributes, type Counter, type Histogram, type Meter, metrics } from "@opentelemetry/api";

const METER_NAME = "lynia-api";

/** Explicit-bucket histogram instruments (buckets bound via Views in otel.ts). */
type HistogramName =
  | "offer_received_latency_ms"
  | "position_emit_latency_ms"
  | "match_select_duration_ms"
  | "broadcast_nearby_duration_ms"
  | "otp_verify_duration_ms"
  | "http_request_duration_ms"
  // Client RUM (glass-to-glass + client-measured REST). WIDER buckets than server metrics — these
  // include network + render (see otel.ts). ms is clamped to [0, 60000] on record (never trust the wire).
  | "client_position_glass_latency_ms"
  | "client_offer_glass_latency_ms"
  | "client_board_glass_latency_ms"
  | "client_apifetch_latency_ms";

/** Counter instruments. */
type CounterName = "match_select_total" | "offers_made_total" | "client_samples_dropped_total";

/** Fixed label vocabularies — NEVER accept ids/phones/lat-lng/raw-urls as labels (cardinality). */
export type MatchSelectOutcome = "assigned" | "taken" | "unavailable" | "not_open" | "forbidden" | "error";
export type BroadcastSource = "redis" | "pg";
export type OtpVerifyResult = "ok" | "invalid" | "expired" | "locked" | "error";
export type OffersMadeOutcome = "created" | "conflict" | "forbidden" | "error";
export type StatusClass = "2xx" | "3xx" | "4xx" | "5xx";
/** Client-supplied role. Bounded → safe as a label; the appVersion is bucketed separately (see below). */
export type ClientRole = "rider" | "customer";

/** Client latency ceiling (ms). Zod already caps `ms` at 60s; we re-clamp so a bug/tamper can't leak. */
const CLIENT_MS_MAX = 60_000;

/**
 * Hard cap on distinct `version` label values ever emitted. `bucketAppVersion` bounds the *format*
 * (`major.minor`) but NOT the value space — `major`/`minor` are unbounded digit runs, so an
 * authenticated attacker could mint thousands of well-formed buckets ("1.1"…"99999.99999") and blow up
 * the time-series budget. This cap bounds the label at runtime: the first N buckets seen are kept; every
 * later NEW bucket collapses to "other". Cardinality is therefore ≤ N+1 no matter what the client sends.
 */
const MAX_CLIENT_VERSIONS = 16;

/**
 * Map each client event enum → its FIXED histogram instrument name. An explicit object (not string
 * concatenation) so a renamed/added event is a compile error here, never a silently-drifting metric name.
 */
const CLIENT_EVENT_HISTOGRAM: Record<ClientMetricEvent, HistogramName> = {
  position_glass: "client_position_glass_latency_ms",
  offer_glass: "client_offer_glass_latency_ms",
  board_glass: "client_board_glass_latency_ms",
  apifetch: "client_apifetch_latency_ms",
};

/**
 * Coerce a client-supplied `appVersion` to a bounded `major.minor` bucket (e.g. "1.4.2" → "1.4").
 * P0 cardinality guard: the raw version is NEVER used as a label — only this bucketed value is. Anything
 * that doesn't start with `major.minor` (garbage, undefined, "beta") collapses to "other". Pure + tested.
 */
export function bucketAppVersion(v?: string): string {
  const m = v?.match(/^(\d+)\.(\d+)/);
  return m ? `${m[1]}.${m[2]}` : "other";
}

@Injectable()
export class MetricsService {
  /** Lazily-created + cached instruments, keyed by instrument name. */
  private readonly instruments = new Map<string, Histogram | Counter>();

  /** Distinct client `version` buckets admitted as labels so far (see {@link MAX_CLIENT_VERSIONS}). */
  private readonly seenVersions = new Set<string>();

  /**
   * Runtime cardinality cap on the client `version` label. `"other"` is always allowed; a known bucket
   * is always allowed; a NEW bucket is admitted only while under the cap, otherwise it collapses to
   * `"other"`. This is the enforcement that {@link bucketAppVersion}'s format-check alone can't give.
   */
  private boundVersion(bucket: string): string {
    if (bucket === "other" || this.seenVersions.has(bucket)) return bucket;
    if (this.seenVersions.size >= MAX_CLIENT_VERSIONS) return "other";
    this.seenVersions.add(bucket);
    return bucket;
  }

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

  /**
   * Record one client RUM latency sample into its per-event histogram. `versionBucket` MUST already be
   * the bucketed value from {@link bucketAppVersion} — this method never sees a raw appVersion. `ms` is
   * clamped to [0, 60000] defensively (Zod caps it on the wire, but the meter never trusts the wire).
   */
  recordClientSample(event: ClientMetricEvent, ms: number, role: ClientRole, versionBucket: string): void {
    const clamped = Math.min(Math.max(ms, 0), CLIENT_MS_MAX);
    const version = this.boundVersion(versionBucket);
    this.histogram(CLIENT_EVENT_HISTOGRAM[event]).record(clamped, { role, version });
  }

  /** Client-reported count of skew-poisoned samples it discarded before sending (labelled by role only). */
  incClientDropped(count: number, role: ClientRole): void {
    this.counter("client_samples_dropped_total").add(count, { role });
  }
}

/** App-wide metrics provider. @Global so every module can inject MetricsService without importing it. */
@Global()
@Module({
  providers: [MetricsService],
  exports: [MetricsService],
})
export class ObservabilityModule {}
