import { describe, expect, it } from "vitest";
import { buildOtelSdk } from "./otel";

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

  it("sets OTEL_SERVICE_NAME for the env resource detector when unset", async () => {
    delete process.env.OTEL_SERVICE_NAME;
    await buildOtelSdk("svc-under-test", "http://collector:4318");
    expect(process.env.OTEL_SERVICE_NAME).toBe("svc-under-test");
  });
});
