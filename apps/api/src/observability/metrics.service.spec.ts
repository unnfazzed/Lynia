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
      m.recordTopupConfirmLag(60_000, "ecocash");
      m.registerQueueDepthObserver("offer-expiry", async () => {
        throw new Error("sampler must never run under the Noop");
      });
      m.unregisterQueueDepthObserver("offer-expiry");
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

describe("MetricsService — queue depth/age gauges (registerQueueDepthObserver)", () => {
  function withProvider() {
    const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
    const reader = new PeriodicExportingMetricReader({ exporter, exportIntervalMillis: 60_000 });
    const provider = new MeterProvider({ readers: [reader] });
    metrics.setGlobalMeterProvider(provider);
    return { exporter, reader, provider };
  }

  function metricsByName(exporter: InMemoryMetricExporter) {
    return new Map(
      exporter
        .getMetrics()
        .flatMap((rm) => rm.scopeMetrics)
        .flatMap((sm) => sm.metrics)
        .map((md) => [md.descriptor.name, md] as const),
    );
  }

  const SAMPLE = { waiting: 4, active: 1, delayed: 9, failed: 2, paused: 0, oldestOverdueMs: 30_000 };

  it("observes queue_jobs{queue,state} and queue_oldest_overdue_ms{queue} from the registered sampler", async () => {
    const { exporter, reader, provider } = withProvider();
    const m = new MetricsService();
    m.registerQueueDepthObserver("offer-expiry", async () => SAMPLE);

    await reader.forceFlush();
    const byName = metricsByName(exporter);

    const jobs = byName.get("queue_jobs")!;
    expect(jobs).toBeDefined();
    const byState = new Map(jobs.dataPoints.map((dp) => [dp.attributes.state, dp] as const));
    expect(byState.get("waiting")!.value).toBe(4);
    expect(byState.get("active")!.value).toBe(1);
    expect(byState.get("delayed")!.value).toBe(9);
    expect(byState.get("failed")!.value).toBe(2);
    expect(byState.get("paused")!.value).toBe(0);
    // Every point carries the fixed {queue, state} label pair — never a job id.
    expect(byState.get("waiting")!.attributes).toEqual({ queue: "offer-expiry", state: "waiting" });

    const overdue = byName.get("queue_oldest_overdue_ms")!;
    expect(overdue.dataPoints[0]!.value).toBe(30_000);
    expect(overdue.dataPoints[0]!.attributes).toEqual({ queue: "offer-expiry" });

    await provider.shutdown();
  });

  it("a throwing sampler skips its observation for the cycle (no point, no crash) while others still report", async () => {
    const { exporter, reader, provider } = withProvider();
    const m = new MetricsService();
    m.registerQueueDepthObserver("offer-expiry", async () => {
      throw new Error("redis down");
    });
    m.registerQueueDepthObserver("rating-autoclose", async () => SAMPLE);

    await reader.forceFlush();
    const byName = metricsByName(exporter);
    const queues = new Set(byName.get("queue_jobs")!.dataPoints.map((dp) => dp.attributes.queue));
    // The healthy queue reported; the broken one is ABSENT — never a fabricated 0.
    expect(queues).toEqual(new Set(["rating-autoclose"]));

    await provider.shutdown();
  });

  it("unregister stops the sampler being called on later collections (shutdown-safe)", async () => {
    const { reader, provider } = withProvider();
    const m = new MetricsService();
    let calls = 0;
    m.registerQueueDepthObserver("offer-expiry", async () => {
      calls++;
      return SAMPLE;
    });

    await reader.forceFlush();
    expect(calls).toBe(1);

    m.unregisterQueueDepthObserver("offer-expiry");
    await reader.forceFlush();
    expect(calls).toBe(1); // not called again — a collection can't race a closed queue

    await provider.shutdown();
  });
});

describe("MetricsService — topup_confirm_lag_ms", () => {
  function withProvider() {
    const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
    const reader = new PeriodicExportingMetricReader({ exporter, exportIntervalMillis: 60_000 });
    const provider = new MeterProvider({ readers: [reader] });
    metrics.setGlobalMeterProvider(provider);
    return { exporter, reader, provider };
  }

  it("records with the bounded rail label; an unexpected rail collapses to 'other'; negatives clamp to 0", async () => {
    const { exporter, reader, provider } = withProvider();
    const m = new MetricsService();

    m.recordTopupConfirmLag(90_000, "ecocash");
    m.recordTopupConfirmLag(5_000, "not-a-rail"); // must NOT mint a label value
    m.recordTopupConfirmLag(-100, "innbucks"); // clock skew — clamps to 0

    await reader.forceFlush();
    const hist = exporter
      .getMetrics()
      .flatMap((rm) => rm.scopeMetrics)
      .flatMap((sm) => sm.metrics)
      .find((md) => md.descriptor.name === "topup_confirm_lag_ms")!;
    expect(hist).toBeDefined();

    const byRail = new Map(hist.dataPoints.map((dp) => [dp.attributes.rail, dp] as const));
    expect(new Set(byRail.keys())).toEqual(new Set(["ecocash", "other", "innbucks"]));
    expect((byRail.get("ecocash")!.value as { sum: number }).sum).toBe(90_000);
    expect((byRail.get("innbucks")!.value as { min: number }).min).toBe(0); // clamped, never negative

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
