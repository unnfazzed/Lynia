import IORedis, { type RedisOptions } from "ioredis";

/**
 * Tiny shared factory for an IORedis client. `maxRetriesPerRequest: null` mirrors the BullMQ
 * connections so a Redis blip degrades gracefully rather than throwing per-command. Callers own
 * the returned client's lifecycle (quit() on shutdown).
 *
 * TLS: a `rediss://` URL (Memorystore `transit_encryption_mode = SERVER_AUTHENTICATION`, gated behind
 * the `redis_tls_enabled` Terraform var) makes ioredis negotiate TLS automatically. When the managed
 * server CA isn't in the system trust store, provide it via `REDIS_CA_CERT` (PEM) and it is pinned
 * here. Plain `redis://` is unchanged, so this is a no-op until TLS is explicitly rolled out.
 */
export function createRedisClient(url: string): IORedis {
  const options: RedisOptions = { maxRetriesPerRequest: null };
  if (url.startsWith("rediss://")) {
    const ca = process.env.REDIS_CA_CERT;
    options.tls = ca ? { ca: [ca] } : {};
  }
  return new IORedis(url, options);
}
