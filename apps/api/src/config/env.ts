import { z } from "zod";

/** Validated environment. Secrets are injected as env at deploy (D7: no managed-identity lock-in). */
export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).optional(),
  CLOUD_PROVIDER: z.enum(["azure", "gcp"]).default("azure"),
  STORAGE_BUCKET: z.string().default("lynia-media"),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  OTEL_SERVICE_NAME: z.string().default("lynia-api"),
  // --- Auth (lane B) ---
  JWT_SIGNING_SECRET: z.string().min(16).default("dev-insecure-secret-change-me-please"),
  ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(2_592_000),
  OTP_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  // E4: WhatsApp default, SMS behind a flag (schedule insurance vs BSP delay).
  OTP_CHANNEL: z.enum(["whatsapp", "sms"]).default("whatsapp"),
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
