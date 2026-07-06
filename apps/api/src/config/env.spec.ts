import { describe, expect, it } from "vitest";
import { loadEnv } from "./env";

// Minimal valid source: only DATABASE_URL is required (everything else has a default or is optional).
const base = { DATABASE_URL: "postgresql://localhost/lynia" } as NodeJS.ProcessEnv;

// A minimal source that satisfies EVERY production boot-guard, so a test can flip one field to prove
// that guard fires in isolation. REDIS_URL + a strong unique JWT secret; OTP/KYC left at safe values.
const prodBase = {
  ...base,
  NODE_ENV: "production",
  REDIS_URL: "redis://localhost:6379",
  JWT_SIGNING_SECRET: "a-very-long-unique-production-secret-value-32+",
  OTP_CHANNEL: "whatsapp",
  KYC_PROVIDER: "didit",
} as NodeJS.ProcessEnv;

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

describe("loadEnv — production REDIS_URL boot-guard", () => {
  it("rejects production without REDIS_URL (in-memory OTP/rate-limit store is per-instance)", () => {
    expect(() => loadEnv({ ...base, NODE_ENV: "production" })).toThrow(/Invalid environment configuration/);
    expect(() => loadEnv({ ...base, NODE_ENV: "production" })).toThrow(/REDIS_URL/);
  });

  it("accepts a fully-configured production environment", () => {
    const env = loadEnv(prodBase);
    expect(env.NODE_ENV).toBe("production");
    expect(env.REDIS_URL).toBe("redis://localhost:6379");
  });

  it("keeps REDIS_URL optional in development", () => {
    const env = loadEnv({ ...base, NODE_ENV: "development" });
    expect(env.REDIS_URL).toBeUndefined();
  });

  it("keeps REDIS_URL optional in test", () => {
    const env = loadEnv({ ...base, NODE_ENV: "test" });
    expect(env.REDIS_URL).toBeUndefined();
  });
});

describe("loadEnv — production JWT-secret boot-guard", () => {
  it("rejects the shipped dev-default secret in production", () => {
    expect(() =>
      loadEnv({ ...prodBase, JWT_SIGNING_SECRET: "dev-insecure-secret-change-me-please" }),
    ).toThrow(/JWT_SIGNING_SECRET/);
  });

  it("rejects a too-short secret (<32 chars) in production", () => {
    expect(() => loadEnv({ ...prodBase, JWT_SIGNING_SECRET: "short-secret-0123456789" })).toThrow(
      /JWT_SIGNING_SECRET/,
    );
  });

  it("accepts a strong unique secret in production", () => {
    const env = loadEnv(prodBase);
    expect(env.JWT_SIGNING_SECRET.length).toBeGreaterThanOrEqual(32);
  });

  it("allows the dev default outside production", () => {
    // The default is only dangerous in prod; dev/test/CI must keep working with it.
    const env = loadEnv({ ...base, NODE_ENV: "development" });
    expect(env.JWT_SIGNING_SECRET).toBe("dev-insecure-secret-change-me-please");
  });

  it("rejects a weak JWT_SIGNING_SECRET_PREVIOUS in production when set", () => {
    expect(() => loadEnv({ ...prodBase, JWT_SIGNING_SECRET_PREVIOUS: "too-short" })).toThrow(
      /JWT_SIGNING_SECRET_PREVIOUS/,
    );
  });

  it("rejects a weak TOKEN_HASH_SECRET in production when set", () => {
    expect(() => loadEnv({ ...prodBase, TOKEN_HASH_SECRET: "too-short" })).toThrow(/TOKEN_HASH_SECRET/);
  });

  it("accepts strong rotation + hash secrets in production", () => {
    const env = loadEnv({
      ...prodBase,
      JWT_SIGNING_SECRET_PREVIOUS: "another-strong-previous-secret-0123456789",
      TOKEN_HASH_SECRET: "a-strong-dedicated-hash-secret-0123456789",
    });
    expect(env.TOKEN_HASH_SECRET).toBeDefined();
  });
});

describe("loadEnv — production launch-hygiene boot-guards", () => {
  it("rejects OTP_CHANNEL=console in production", () => {
    expect(() => loadEnv({ ...prodBase, OTP_CHANNEL: "console" })).toThrow(/OTP_CHANNEL/);
  });

  it("rejects a non-empty OTP_TEST_PHONES in production", () => {
    expect(() => loadEnv({ ...prodBase, OTP_TEST_PHONES: "+263770000011" })).toThrow(/OTP_TEST_PHONES/);
  });

  it("rejects the auto-passing KYC stub in production (auto mode)", () => {
    expect(() => loadEnv({ ...prodBase, KYC_PROVIDER: "stub", KYC_MODE: "auto" })).toThrow(/KYC_PROVIDER/);
  });

  it("allows the KYC stub in production under manual review", () => {
    const env = loadEnv({ ...prodBase, KYC_PROVIDER: "stub", KYC_MODE: "manual" });
    expect(env.KYC_PROVIDER).toBe("stub");
    expect(env.KYC_MODE).toBe("manual");
  });

  it("keeps all these permissive in development (default source boots)", () => {
    const env = loadEnv({ ...base, OTP_CHANNEL: "console", OTP_TEST_PHONES: "+263770000011" });
    expect(env.OTP_CHANNEL).toBe("console");
  });
});
