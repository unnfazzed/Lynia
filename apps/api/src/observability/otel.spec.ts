import { describe, expect, it } from "vitest";
import { buildOtelSdk } from "./otel";

/** Recursively find the first OTLP `url` string ending in /v1/metrics under a reader/exporter tree.
 *  The exporter's URL sits behind version-dependent private transports, so we walk rather than assume. */
function findOtlpUrl(node: unknown, seen = new Set<unknown>(), depth = 0): string | undefined {
  if (depth > 12 || node === null || typeof node !== "object" || seen.has(node)) return undefined;
  seen.add(node);
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === "url" && typeof value === "string" && value.endsWith("/v1/metrics")) return value;
    if (typeof value === "object") {
      const found = findOtlpUrl(value, seen, depth + 1);
      if (found) return found;
    }
  }
  return undefined;
}

describe("buildOtelSdk — OTLP exporter wiring (D7)", () => {
  it("is a no-op (null) when no endpoint is configured", async () => {
    expect(await buildOtelSdk("lynia-api")).toBeNull();
    expect(await buildOtelSdk("lynia-api", undefined)).toBeNull();
  });

  it("builds a NodeSDK when an OTLP endpoint is set (constructed, not started)", async () => {
    const sdk = await buildOtelSdk("lynia-api", "http://collector:4318");
    expect(sdk).not.toBeNull();
    expect(sdk?.constructor.name).toBe("NodeSDK");
  });

  it("wires a metric reader whose OTLP exporter targets the endpoint's /v1/metrics", async () => {
    const sdk = await buildOtelSdk("lynia-api", "http://collector:4318");
    expect(sdk).not.toBeNull();
    // The metrics live on the SAME NodeSDK as traces. Assert a single metric reader is configured and
    // its OTLP exporter URL is the /v1/metrics sibling of the /v1/traces trace exporter. The exporter's
    // URL is buried under version-dependent private transports, so search the reader tree for it rather
    // than hard-coding the (fragile) nesting path.
    const config = (sdk as unknown as { _configuration: { metricReader?: unknown; metricReaders?: unknown[] } })
      ._configuration;
    const readers = config.metricReaders ?? (config.metricReader ? [config.metricReader] : []);
    expect(readers.length).toBe(1);
    expect(findOtlpUrl(readers[0])).toBe("http://collector:4318/v1/metrics");
  });

  it("sets OTEL_SERVICE_NAME for the env resource detector when unset", async () => {
    delete process.env.OTEL_SERVICE_NAME;
    await buildOtelSdk("svc-under-test", "http://collector:4318");
    expect(process.env.OTEL_SERVICE_NAME).toBe("svc-under-test");
  });
});
