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
