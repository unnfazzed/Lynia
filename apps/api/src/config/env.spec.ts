import { describe, expect, it } from "vitest";
import { loadEnv } from "./env";

// Minimal valid source: only DATABASE_URL is required (everything else has a default or is optional).
const base = { DATABASE_URL: "postgresql://localhost/lynia" } as NodeJS.ProcessEnv;

describe("loadEnv — optional URL fields", () => {
  it("treats an empty DIDIT_CALLBACK_URL as absent (deploy injects '' when the var is unset)", () => {
    // Regression: an empty string used to fail .url() and crash boot, failing the Cloud Run deploy.
    const env = loadEnv({ ...base, DIDIT_CALLBACK_URL: "" });
    expect(env.DIDIT_CALLBACK_URL).toBeUndefined();
  });

  it("treats an empty OTEL_EXPORTER_OTLP_ENDPOINT as absent", () => {
    const env = loadEnv({ ...base, OTEL_EXPORTER_OTLP_ENDPOINT: "" });
    expect(env.OTEL_EXPORTER_OTLP_ENDPOINT).toBeUndefined();
  });

  it("accepts a valid callback URL", () => {
    const env = loadEnv({ ...base, DIDIT_CALLBACK_URL: "https://lyniago.lyniafinance.com/verified" });
    expect(env.DIDIT_CALLBACK_URL).toBe("https://lyniago.lyniafinance.com/verified");
  });

  it("still rejects a non-empty invalid URL", () => {
    expect(() => loadEnv({ ...base, DIDIT_CALLBACK_URL: "not-a-url" })).toThrow(/Invalid environment configuration/);
  });
});
