import { metrics } from "@opentelemetry/api";
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import { afterEach, describe, expect, it } from "vitest";
import { bucketAppVersion, MetricsService } from "./metrics.service";

/**
 * MetricsService is NoopMeter-safe: with no MeterProvider registered, metrics.getMeter() returns the
 * NoopMeter, so every instrument no-ops and no record throws. When a real provider IS registered, the
 * lazily-created instruments bind to it and their data flows through — which is exactly why lazy
 * creation matters (the review's #1 gap: eager construction would pin every instrument to the Noop).
 */

afterEach(() => {
  // Reset the global provider so each test starts from the NoopMeter baseline.
  metrics.disable();
});

describe("MetricsService — NoopMeter safety (no provider registered)", () => {
  it("every record/inc method is a no-op that never throws with no MeterProvider", () => {
    metrics.disable(); // ensure the global provider is the Noop
    const m = new MetricsService();
    expect(() => {
      m.recordOfferLatency(120);
      m.recordPositionEmit(80);
      m.recordMatchSelect(150, "assigned");
      m.recordMatchSelect(150, "taken");
      m.recordBroadcastNearby(90, "redis");
      m.recordBroadcastNearby(90, "pg");
      m.recordOtpVerify(300, "ok");
      m.recordOtpVerify(300, "invalid");
      m.recordHttp("/orders", "POST", "2xx", 42);
      m.incOffersMade("created");
      m.incOffersMade("conflict");
      // Client RUM record paths are no-ops under the Noop too (fire-and-forget must never throw).
      m.recordClientSample("position_glass", 500, "customer", "1.4");
      m.recordClientSample("offer_glass", 500, "customer", "other");
      m.recordClientSample("board_glass", 500, "rider", "1.4");
      m.recordClientSample("apifetch", 500, "rider", "1.4");
      m.incClientDropped(3, "rider");
    }).not.toThrow();
  });

  it("startTimer returns a closure yielding a non-negative elapsed-ms number", () => {
    const m = new MetricsService();
    const done = m.startTimer();
    const elapsed = done();
    expect(typeof elapsed).toBe("number");
    expect(elapsed).toBeGreaterThanOrEqual(0);
  });
});

describe("MetricsService — with a real in-memory MeterProvider", () => {
  function withProvider() {
    const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
    const reader = new PeriodicExportingMetricReader({ exporter, exportIntervalMillis: 60_000 });
    const provider = new MeterProvider({ readers: [reader] });
    metrics.setGlobalMeterProvider(provider);
    return { exporter, reader, provider };
  }

  it("records don't throw and produce the FIXED instrument names with the fixed label set", async () => {
    const { exporter, reader, provider } = withProvider();
    const m = new MetricsService();

    m.recordOfferLatency(120);
    m.recordPositionEmit(80);
    m.recordMatchSelect(150, "assigned");
    m.recordBroadcastNearby(90, "redis");
    m.recordOtpVerify(300, "ok");
    m.recordHttp("/orders", "POST", "2xx", 42);
    m.incOffersMade("created");

    await reader.forceFlush();
    const collected = exporter.getMetrics();
    const names = collected
      .flatMap((rm) => rm.scopeMetrics)
      .flatMap((sm) => sm.metrics)
      .map((md) => md.descriptor.name);

    // Every instrument we recorded into shows up under its fixed name.
    for (const name of [
      "offer_received_latency_ms",
      "position_emit_latency_ms",
      "match_select_duration_ms",
      "match_select_total",
      "broadcast_nearby_duration_ms",
      "otp_verify_duration_ms",
      "http_request_duration_ms",
      "offers_made_total",
    ]) {
      expect(names).toContain(name);
    }

    // Labels are the fixed set — the HTTP histogram carries {route, method, status_class} only.
    const http = collected
      .flatMap((rm) => rm.scopeMetrics)
      .flatMap((sm) => sm.metrics)
      .find((md) => md.descriptor.name === "http_request_duration_ms");
    const httpAttrs = http!.dataPoints[0]!.attributes;
    expect(httpAttrs).toEqual({ route: "/orders", method: "POST", status_class: "2xx" });

    await provider.shutdown();
  });

  it("lazily creates and CACHES each instrument (same instance reused across records)", () => {
    withProvider();
    const m = new MetricsService();
    // Reach into the private cache to prove the second record reuses the first instrument.
    const cache = (m as unknown as { instruments: Map<string, unknown> }).instruments;
    expect(cache.size).toBe(0); // nothing created until first record (lazy)

    m.recordPositionEmit(10);
    const first = cache.get("position_emit_latency_ms");
    expect(first).toBeDefined();
    expect(cache.size).toBe(1);

    m.recordPositionEmit(20);
    expect(cache.get("position_emit_latency_ms")).toBe(first); // reused, not recreated
    expect(cache.size).toBe(1);
  });

  it("recordClientSample maps each event to its fixed histogram with {role, version} labels", async () => {
    const { exporter, reader, provider } = withProvider();
    const m = new MetricsService();

    m.recordClientSample("position_glass", 800, "customer", "1.4");
    m.recordClientSample("offer_glass", 800, "customer", "1.4");
    m.recordClientSample("board_glass", 800, "rider", "1.4");
    m.recordClientSample("apifetch", 800, "rider", "1.4");
    m.incClientDropped(5, "rider");

    await reader.forceFlush();
    const collected = exporter.getMetrics();
    const byName = new Map(
      collected
        .flatMap((rm) => rm.scopeMetrics)
        .flatMap((sm) => sm.metrics)
        .map((md) => [md.descriptor.name, md] as const),
    );

    for (const name of [
      "client_position_glass_latency_ms",
      "client_offer_glass_latency_ms",
      "client_board_glass_latency_ms",
      "client_apifetch_latency_ms",
      "client_samples_dropped_total",
    ]) {
      expect(byName.has(name)).toBe(true);
    }

    // A glass histogram carries only the bounded {role, version} label set — never a raw appVersion/id.
    const posAttrs = byName.get("client_position_glass_latency_ms")!.dataPoints[0]!.attributes;
    expect(posAttrs).toEqual({ role: "customer", version: "1.4" });
    // The dropped counter is labelled by role only.
    const dropped = byName.get("client_samples_dropped_total")!;
    expect(dropped.dataPoints[0]!.attributes).toEqual({ role: "rider" });

    await provider.shutdown();
  });

  it("recordClientSample clamps ms into [0, 60000] before recording (never trusts the wire)", async () => {
    const { exporter, reader, provider } = withProvider();
    const m = new MetricsService();

    m.recordClientSample("apifetch", -50, "rider", "1.4"); // → clamped up to 0
    m.recordClientSample("apifetch", 999_999, "rider", "1.4"); // → clamped down to 60000

    await reader.forceFlush();
    const hist = exporter
      .getMetrics()
      .flatMap((rm) => rm.scopeMetrics)
      .flatMap((sm) => sm.metrics)
      .find((md) => md.descriptor.name === "client_apifetch_latency_ms");
    // sum reflects the clamped values (0 + 60000), proving neither the negative nor the overflow leaked.
    const point = hist!.dataPoints[0]! as { value: { sum: number; min: number; max: number } };
    expect(point.value.sum).toBe(60_000);
    expect(point.value.min).toBe(0);
    expect(point.value.max).toBe(60_000);

    await provider.shutdown();
  });

  it("caps distinct client version labels at runtime (well-formed-but-adversarial → 'other')", async () => {
    const { exporter, reader, provider } = withProvider();
    const m = new MetricsService();

    // An attacker sends 100 DISTINCT, schema-valid major.minor versions. bucketAppVersion bounds the
    // format but not the value space, so without the runtime cap this would mint 100 label values.
    for (let i = 0; i < 100; i++) {
      m.recordClientSample("apifetch", 100, "rider", bucketAppVersion(`1.${i}`));
    }

    await reader.forceFlush();
    const hist = exporter
      .getMetrics()
      .flatMap((rm) => rm.scopeMetrics)
      .flatMap((sm) => sm.metrics)
      .find((md) => md.descriptor.name === "client_apifetch_latency_ms");
    const versions = new Set(hist!.dataPoints.map((dp) => dp.attributes.version));
    // ≤ 16 admitted buckets + the "other" sink — never 100. Cardinality is bounded regardless of input.
    expect(versions.size).toBeLessThanOrEqual(17);
    expect(versions.has("other")).toBe(true);

    await provider.shutdown();
  });
});

describe("bucketAppVersion — bounded major.minor label (P0 cardinality guard)", () => {
  it("extracts major.minor from a well-formed version", () => {
    expect(bucketAppVersion("1.4.2")).toBe("1.4");
    expect(bucketAppVersion("1.4")).toBe("1.4");
    expect(bucketAppVersion("12.30.0-beta.1")).toBe("12.30");
  });

  it("collapses anything non-conforming to 'other'", () => {
    expect(bucketAppVersion("garbage")).toBe("other");
    expect(bucketAppVersion("v1.4")).toBe("other"); // must start with digits
    expect(bucketAppVersion("1")).toBe("other"); // needs both major AND minor
    expect(bucketAppVersion("")).toBe("other");
    expect(bucketAppVersion(undefined)).toBe("other");
  });
});
