import { z } from "zod";

/** The dev/CI default JWT secret. Booting production with this (or any short secret) means tokens are
 *  signed with a publicly-known key → universal forgery, so the production boot-guard rejects it. */
export const INSECURE_JWT_DEFAULT = "dev-insecure-secret-change-me-please";
/** The dev/CI default PII-encryption key. Booting production with it (or any short key) would encrypt
 *  national IDs under a publicly-known key — no better than plaintext — so the prod boot-guard rejects it. */
export const INSECURE_PII_KEY_DEFAULT = "dev-insecure-pii-key-change-me-please";
/** Minimum entropy we require of a production signing secret (bytes ≈ chars for the ASCII secrets we mint). */
const MIN_PROD_SECRET_LEN = 32;

/** Optional URL that treats an empty string as absent. The deploy injects some optional vars with an
 *  empty value when their repo Variable is unset (e.g. `--set-env-vars DIDIT_CALLBACK_URL=`); "" is not
 *  `undefined`, so a bare `.url().optional()` would reject it and crash boot. Coerce "" → undefined. */
const optionalUrl = z.preprocess((v) => (v === "" ? undefined : v), z.string().url().optional());

/** Validated environment. Secrets are injected as env at deploy (D7: no managed-identity lock-in). */
export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  // Explicit Prisma connection-pool tuning (E6). Applied to the datasource URL in PrismaService; both
  // optional — the pool size falls back to a deterministic default and pool_timeout to Prisma's.
  DATABASE_CONNECTION_LIMIT: z.coerce.number().int().positive().optional(),
  DATABASE_POOL_TIMEOUT: z.coerce.number().int().nonnegative().optional(),
  REDIS_URL: z.string().min(1).optional(),
  // Cloud chosen: GCP (2026-06-27). Azure impl retained behind the adapters as the portability proof (D7).
  CLOUD_PROVIDER: z.enum(["azure", "gcp"]).default("gcp"),
  STORAGE_BUCKET: z.string().default("lynia-media"),
  // GCS signing: project id for the Storage client. Signing creds come from ADC on Cloud Run
  // (the attached SA + IAM signBlob), so no private key lives in env.
  GCP_STORAGE_PROJECT_ID: z.string().optional(),
  OTEL_EXPORTER_OTLP_ENDPOINT: optionalUrl,
  OTEL_SERVICE_NAME: z.string().default("lynia-api"),
  // --- Push (lane A4) ---
  // "fcm" sends via firebase-admin (ADC creds on Cloud Run — no key in env); "noop" logs only
  // (dev/test, and prod until the Firebase project + messaging role are provisioned).
  PUSH_PROVIDER: z.enum(["fcm", "noop"]).default("noop"),
  // Optional project override. On Cloud Run ADC supplies the project, so this is usually unset.
  FCM_PROJECT_ID: z.string().optional(),
  // --- Auth (lane B) ---
  JWT_SIGNING_SECRET: z.string().min(16).default(INSECURE_JWT_DEFAULT),
  // Optional previous signing secret, accepted on verify only, for a zero-downtime rotation window
  // (see docs/SECRET-ROTATION.md). Remove it once older access tokens have expired (> ACCESS_TTL).
  JWT_SIGNING_SECRET_PREVIOUS: z.string().min(16).optional(),
  // Optional dedicated key for HMAC-hashing OTP codes + refresh tokens. Separating it from the JWT
  // signing secret lets the signing secret rotate without invalidating stored refresh-token hashes.
  // Defaults to JWT_SIGNING_SECRET when unset (backward-compatible).
  TOKEN_HASH_SECRET: z.string().min(16).optional(),
  // PII at-rest key (LR8): HKDF-derived AES-256-GCM (encrypt national IDs) + HMAC (dedup hash). Same bar
  // as the JWT secret — the dev default / any <32-char key is rejected in production (see boot-guard).
  PII_ENCRYPTION_KEY: z.string().min(16).default(INSECURE_PII_KEY_DEFAULT),
  ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(2_592_000),
  OTP_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  // E4: WhatsApp default, SMS behind a flag (schedule insurance vs BSP delay).
  // "console" logs the code for local/dev testing without any messaging provider.
  OTP_CHANNEL: z.enum(["whatsapp", "sms", "console"]).default("whatsapp"),
  // QA/test only: comma-separated phone numbers for which requestOtp returns the code in its
  // response, so end-to-end signup is testable on a real device with no WhatsApp BSP. ONLY
  // effective on the "console" channel and ONLY for numbers in this list — an arbitrary phone
  // is never exposed, so this is not an account-takeover hole. Empty = exposure off (default).
  // MUST be empty (and OTP_CHANNEL=whatsapp) before real launch — see docs/PILOT-READINESS.md.
  OTP_TEST_PHONES: z.string().default(""),
  // WhatsApp Cloud API (Meta) — only needed when OTP_CHANNEL=whatsapp. ACCESS_TOKEN is the secret.
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_TEMPLATE_NAME: z.string().optional(),
  WHATSAPP_TEMPLATE_LANG: z.string().default("en"),
  WHATSAPP_GRAPH_VERSION: z.string().default("v21.0"),
  // Plain string (not .url()) so an injected empty value can never crash boot (ENG-REVIEW §4).
  WHATSAPP_GRAPH_BASE_URL: z.string().default("https://graph.facebook.com"),
  // Meta "authentication"-category templates carry a one-tap/copy-code button that also takes the
  // code as a parameter; set "false" if your approved template is body-only.
  WHATSAPP_OTP_COPY_CODE_BUTTON: z.enum(["true", "false"]).default("true"),
  // --- KYC (lane E) ---
  // auto = submit to the vendor; manual = leave pending for admin review (T7 backstop).
  KYC_MODE: z.enum(["auto", "manual"]).default("auto"),
  // Didit verifies Zimbabwean national IDs. Default "stub" keeps CI/tests vendor-free.
  KYC_PROVIDER: z.enum(["stub", "didit"]).default("stub"),
  DIDIT_API_KEY: z.string().optional(),
  DIDIT_WORKFLOW_ID: z.string().optional(),
  DIDIT_WEBHOOK_SECRET: z.string().optional(),
  DIDIT_CALLBACK_URL: optionalUrl,
  // Explicit browser-origin allow-list for HTTP + WebSocket CORS (comma-separated). Empty = deny all
  // cross-origin (native mobile clients send no Origin and are unaffected; a stray browser origin is
  // refused). Set to the admin console / any browser client origins in prod. See common/cors.ts.
  CORS_ALLOWED_ORIGINS: z.string().default(""),
  DIDIT_BASE_URL: z.string().url().default("https://verification.didit.me"),
}).superRefine((env, ctx) => {
  // The boot-guards below fail LOUD in production rather than let the API come up in an insecure or
  // half-configured state. Each stays permissive in dev/test so local work and CI are unaffected.
  const reject = (path: string, message: string): void =>
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });

  // Boot-guard: several consumers silently degrade to in-memory without REDIS_URL. Critically the
  // OTP/rate-limit store (auth/otp-store.ts InMemoryOtpStore is per-process), so on multi-instance
  // prod the brute-force cap is multiplied per instance, and the Socket.IO adapter is per-instance.
  if (env.NODE_ENV === "production" && !env.REDIS_URL) {
    reject(
      "REDIS_URL",
      "REDIS_URL is required in production — the in-memory OTP/rate-limit store and Socket.IO adapter are per-instance without it",
    );
  }

  if (env.NODE_ENV === "production") {
    // A publicly-known or low-entropy JWT secret means anyone can forge access tokens (incl. admin).
    // Reject the shipped default and anything below MIN_PROD_SECRET_LEN — a missing Secret Manager
    // value that falls back to the default must NOT boot. The same bar applies to the optional
    // rotation/hash secrets when present, so a weak one can't sneak in through the side door.
    const weakInProd = (value: string): boolean =>
      value === INSECURE_JWT_DEFAULT || value.length < MIN_PROD_SECRET_LEN;
    if (weakInProd(env.JWT_SIGNING_SECRET)) {
      reject(
        "JWT_SIGNING_SECRET",
        `JWT_SIGNING_SECRET must be a unique secret of at least ${MIN_PROD_SECRET_LEN} chars in production (the dev default is rejected) — set it from Secret Manager`,
      );
    }
    if (env.JWT_SIGNING_SECRET_PREVIOUS !== undefined && weakInProd(env.JWT_SIGNING_SECRET_PREVIOUS)) {
      reject("JWT_SIGNING_SECRET_PREVIOUS", `JWT_SIGNING_SECRET_PREVIOUS, when set, must also be a strong secret (>= ${MIN_PROD_SECRET_LEN} chars)`);
    }
    // The PII key encrypts national IDs at rest; the dev default (or a short key) is publicly known, so
    // encrypting under it is no better than plaintext. Require a real key from Secret Manager in prod.
    if (env.PII_ENCRYPTION_KEY === INSECURE_PII_KEY_DEFAULT || env.PII_ENCRYPTION_KEY.length < MIN_PROD_SECRET_LEN) {
      reject(
        "PII_ENCRYPTION_KEY",
        `PII_ENCRYPTION_KEY must be a unique secret of at least ${MIN_PROD_SECRET_LEN} chars in production — set it from Secret Manager`,
      );
    }
    if (env.TOKEN_HASH_SECRET !== undefined && weakInProd(env.TOKEN_HASH_SECRET)) {
      reject("TOKEN_HASH_SECRET", `TOKEN_HASH_SECRET, when set, must also be a strong secret (>= ${MIN_PROD_SECRET_LEN} chars)`);
    }
    // The console channel logs codes and pairs with the devCode escape hatch; never in production.
    if (env.OTP_CHANNEL === "console") {
      reject("OTP_CHANNEL", "OTP_CHANNEL=console is a dev-only channel and must not be used in production");
    }
    // OTP_TEST_PHONES returns the live OTP in the response for listed numbers — a takeover vector if
    // it ever leaks into prod. Must be empty in production (it is only honoured on the console channel,
    // which is itself now rejected above, but this guards it independently as defense in depth).
    if (env.OTP_TEST_PHONES.trim() !== "") {
      reject("OTP_TEST_PHONES", "OTP_TEST_PHONES must be empty in production — it exposes live OTP codes in the response");
    }
    // The stub KYC provider auto-passes verification in auto mode — shipping it to prod would verify
    // every rider without any ID check. Require the real vendor (or manual admin review).
    if (env.KYC_PROVIDER === "stub" && env.KYC_MODE === "auto") {
      reject(
        "KYC_PROVIDER",
        "KYC_PROVIDER=stub auto-passes verification; production must use the real vendor (KYC_PROVIDER=didit) or manual review (KYC_MODE=manual)",
      );
    }
  }
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const fields = JSON.stringify(parsed.error.flatten().fieldErrors);
    throw new Error(`Invalid environment configuration: ${fields}`);
  }
  return parsed.data;
}
