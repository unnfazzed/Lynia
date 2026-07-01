import { metrics } from "@opentelemetry/api";
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import { afterEach, describe, expect, it } from "vitest";
import { MetricsService } from "./metrics.service";

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
});
