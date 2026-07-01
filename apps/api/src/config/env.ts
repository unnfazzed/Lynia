import { z } from "zod";

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
  JWT_SIGNING_SECRET: z.string().min(16).default("dev-insecure-secret-change-me-please"),
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
  KYC_CALLBACK_SECRET: z.string().optional(),
  // Didit verifies Zimbabwean national IDs. Default "stub" keeps CI/tests vendor-free.
  KYC_PROVIDER: z.enum(["stub", "didit"]).default("stub"),
  DIDIT_API_KEY: z.string().optional(),
  DIDIT_WORKFLOW_ID: z.string().optional(),
  DIDIT_WEBHOOK_SECRET: z.string().optional(),
  DIDIT_CALLBACK_URL: optionalUrl,
  DIDIT_BASE_URL: z.string().url().default("https://verification.didit.me"),
}).superRefine((env, ctx) => {
  // Boot-guard: several consumers silently degrade to in-memory without REDIS_URL. Critically the
  // OTP/rate-limit store (auth/otp-store.ts InMemoryOtpStore is per-process), so on multi-instance
  // prod the brute-force cap is multiplied per instance, and the Socket.IO adapter is per-instance.
  // Fail the boot loudly rather than degrade silently. Stays optional in dev/test.
  if (env.NODE_ENV === "production" && !env.REDIS_URL) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["REDIS_URL"],
      message:
        "REDIS_URL is required in production — the in-memory OTP/rate-limit store and Socket.IO adapter are per-instance without it",
    });
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
