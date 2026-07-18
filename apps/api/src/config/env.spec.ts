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
  PII_ENCRYPTION_KEY: "a-very-long-unique-production-pii-key-value-32+",
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

describe("loadEnv — broadcast reach overrides", () => {
  it("coerces valid numeric overrides", () => {
    const env = loadEnv({ ...base, BROADCAST_BASE_RADIUS_M: "3000", BROADCAST_HEARTBEAT_MAX_AGE_MS: "60000" });
    expect(env.BROADCAST_BASE_RADIUS_M).toBe(3000);
    expect(env.BROADCAST_HEARTBEAT_MAX_AGE_MS).toBe(60000);
  });

  it("treats an empty value as absent (deploy injects '' when the var is unset)", () => {
    const env = loadEnv({ ...base, BROADCAST_BASE_RADIUS_M: "", BROADCAST_HEARTBEAT_MAX_AGE_MS: "" });
    expect(env.BROADCAST_BASE_RADIUS_M).toBeUndefined();
    expect(env.BROADCAST_HEARTBEAT_MAX_AGE_MS).toBeUndefined();
  });

  it("rejects a malformed override at boot (fails loud, no silent fallback)", () => {
    expect(() => loadEnv({ ...base, BROADCAST_BASE_RADIUS_M: "five-km" })).toThrow(/Invalid environment configuration/);
    expect(() => loadEnv({ ...base, BROADCAST_HEARTBEAT_MAX_AGE_MS: "-10" })).toThrow(/Invalid environment configuration/);
  });
});

describe("loadEnv — commission wallet", () => {
  it("reveals the wallet by default (visible from launch, even at 0% commission)", () => {
    const env = loadEnv({ ...base });
    expect(env.WALLET_REVEAL).toBe("true");
    expect(env.COMMISSION_RATE_PCT).toBeUndefined();
  });
  it("still accepts an explicit kill-switch to hide it", () => {
    expect(loadEnv({ ...base, WALLET_REVEAL: "false" }).WALLET_REVEAL).toBe("false");
  });
});

describe("loadEnv — production REDIS_URL boot-guard", () => {
  it("rejects production without REDIS_URL (in-memory OTP/rate-limit store is per-instance)", () => {
    expect(() => loadEnv({ ...base, NODE_ENV: "production" })).toThrow(/Invalid environment configuration/);
    expect(() => loadEnv({ ...base, NODE_ENV: "production" })).toThrow(/REDIS_URL/);
  });

  it("rejects production when JWT_SIGNING_SECRET is unset/default (the repo default is public)", () => {
    // Preserved from main (PR #108): the unset case falls back to the default and must be rejected.
    expect(() =>
      loadEnv({ ...base, NODE_ENV: "production", REDIS_URL: "redis://localhost:6379" }),
    ).toThrow(/JWT_SIGNING_SECRET/);
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

describe("loadEnv — production PII-encryption-key boot-guard", () => {
  it("rejects the dev-default PII key in production (encrypting under a public key ≈ plaintext)", () => {
    expect(() =>
      loadEnv({ ...prodBase, PII_ENCRYPTION_KEY: "dev-insecure-pii-key-change-me-please" }),
    ).toThrow(/PII_ENCRYPTION_KEY/);
  });

  it("rejects a too-short PII key (<32 chars) in production", () => {
    expect(() => loadEnv({ ...prodBase, PII_ENCRYPTION_KEY: "short-pii-key-0123456789" })).toThrow(
      /PII_ENCRYPTION_KEY/,
    );
  });

  it("accepts a strong unique PII key in production", () => {
    expect(loadEnv(prodBase).PII_ENCRYPTION_KEY).toBe("a-very-long-unique-production-pii-key-value-32+");
  });

  it("keeps the PII key optional (defaulted) outside production", () => {
    expect(loadEnv(base).PII_ENCRYPTION_KEY).toBe("dev-insecure-pii-key-change-me-please");
  });
});

describe("loadEnv — production launch-hygiene boot-guards", () => {
  it("rejects OTP_CHANNEL=console in production", () => {
    expect(() => loadEnv({ ...prodBase, OTP_CHANNEL: "console" })).toThrow(/OTP_CHANNEL/);
  });

  it("rejects OTP_CHANNEL=sms in production (SmsOtpSender is an unimplemented stub)", () => {
    expect(() => loadEnv({ ...prodBase, OTP_CHANNEL: "sms" })).toThrow(/OTP_CHANNEL/);
  });

  it("allows OTP_CHANNEL=bird in production (BirdOtpSender is real — it fails loud at send if unconfigured)", () => {
    // Unlike the sms stub, bird actually delivers; a misconfig 503s at send + is caught by the release
    // workflow, so it boots green like the whatsapp channel rather than being rejected here.
    const env = loadEnv({ ...prodBase, OTP_CHANNEL: "bird" });
    expect(env.OTP_CHANNEL).toBe("bird");
    expect(env.BIRD_BASE_URL).toBe("https://api.bird.com");
    expect(env.BIRD_BRAND_NAME).toBe("LyniaGo");
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

  it("enforces the hygiene guards when APP_ENV=production is set explicitly", () => {
    expect(() => loadEnv({ ...prodBase, APP_ENV: "production", OTP_CHANNEL: "console" })).toThrow(/OTP_CHANNEL/);
  });
});

describe("loadEnv — staging tier (APP_ENV=staging, prod-shaped with QA bypasses)", () => {
  const stagingBase = { ...prodBase, APP_ENV: "staging" } as NodeJS.ProcessEnv;

  it("allows the vendor-free QA config (console OTP + test phones + auto stub KYC) on staging", () => {
    const env = loadEnv({
      ...stagingBase,
      OTP_CHANNEL: "console",
      OTP_TEST_PHONES: "+263770000011,+263770000012",
      KYC_PROVIDER: "stub",
      KYC_MODE: "auto",
      PUSH_PROVIDER: "noop",
    });
    expect(env.APP_ENV).toBe("staging");
    expect(env.OTP_CHANNEL).toBe("console");
    expect(env.KYC_PROVIDER).toBe("stub");
  });

  it("still rejects a weak/default JWT secret on staging (secret guards are tier-independent)", () => {
    expect(() => loadEnv({ ...stagingBase, JWT_SIGNING_SECRET: undefined })).toThrow(/JWT_SIGNING_SECRET/);
  });

  it("still rejects a weak PII key on staging", () => {
    expect(() => loadEnv({ ...stagingBase, PII_ENCRYPTION_KEY: "short" })).toThrow(/PII_ENCRYPTION_KEY/);
  });

  it("still requires REDIS_URL on staging", () => {
    expect(() => loadEnv({ ...stagingBase, REDIS_URL: undefined })).toThrow(/REDIS_URL/);
  });

  it("defaults APP_ENV to production so an unset tier can never relax the hygiene guards", () => {
    const env = loadEnv(prodBase);
    expect(env.APP_ENV).toBe("production");
    expect(() => loadEnv({ ...prodBase, OTP_CHANNEL: "console" })).toThrow(/OTP_CHANNEL/);
  });

  it("rejects an unknown APP_ENV value", () => {
    expect(() => loadEnv({ ...prodBase, APP_ENV: "qa" })).toThrow(/Invalid environment configuration/);
  });
});
