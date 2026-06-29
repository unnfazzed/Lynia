import { z } from "zod";

/** Validated environment. Secrets are injected as env at deploy (D7: no managed-identity lock-in). */
export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).optional(),
  // Cloud chosen: GCP (2026-06-27). Azure impl retained behind the adapters as the portability proof (D7).
  CLOUD_PROVIDER: z.enum(["azure", "gcp"]).default("gcp"),
  STORAGE_BUCKET: z.string().default("lynia-media"),
  // GCS signing: project id for the Storage client. Signing creds come from ADC on Cloud Run
  // (the attached SA + IAM signBlob), so no private key lives in env.
  GCP_STORAGE_PROJECT_ID: z.string().optional(),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
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
  // --- KYC (lane E) ---
  // auto = submit to the vendor; manual = leave pending for admin review (T7 backstop).
  KYC_MODE: z.enum(["auto", "manual"]).default("auto"),
  KYC_CALLBACK_SECRET: z.string().optional(),
  // Didit verifies Zimbabwean national IDs. Default "stub" keeps CI/tests vendor-free.
  KYC_PROVIDER: z.enum(["stub", "didit"]).default("stub"),
  DIDIT_API_KEY: z.string().optional(),
  DIDIT_WORKFLOW_ID: z.string().optional(),
  DIDIT_WEBHOOK_SECRET: z.string().optional(),
  DIDIT_CALLBACK_URL: z.string().url().optional(),
  DIDIT_BASE_URL: z.string().url().default("https://verification.didit.me"),
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
