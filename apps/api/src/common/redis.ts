import { Logger } from "@nestjs/common";
import IORedis, { type RedisOptions } from "ioredis";

const logger = new Logger("Redis");

/**
 * Tiny shared factory for an IORedis client. `maxRetriesPerRequest: null` mirrors the BullMQ
 * connections so a Redis blip degrades gracefully rather than throwing per-command. Callers own
 * the returned client's lifecycle (quit() on shutdown).
 *
 * TLS: a `rediss://` URL (Memorystore `transit_encryption_mode = SERVER_AUTHENTICATION`, gated behind
 * the `redis_tls_enabled` Terraform var) makes ioredis negotiate TLS automatically. When the managed
 * server CA isn't in the system trust store, provide it via `REDIS_CA_CERT` (PEM) and it is pinned
 * here. Plain `redis://` is unchanged, so this is a no-op until TLS is explicitly rolled out.
 *
 * DS15-01: an ioredis client is a plain Node EventEmitter. A connection error (timeout, ECONNRESET,
 * Memorystore failover) it emits with NO `error` listener throws "Unhandled 'error' event"
 * synchronously → uncaughtException → main.ts exits the whole instance on a mere Redis blip, even
 * though every call site already try/catches individual Redis COMMANDS expecting graceful degradation.
 * We attach a baseline `error` listener HERE so every current AND future caller is covered by default —
 * matching the DS-02 (BullMQ) / DS-04 (health) "log and keep serving" convention. EventEmitter allows
 * multiple listeners, so a caller can still layer its own contextual `.on("error")` on top; this is
 * only the safety net that guarantees the event is never unhandled.
 */
export function createRedisClient(url: string): IORedis {
  const options: RedisOptions = { maxRetriesPerRequest: null };
  if (url.startsWith("rediss://")) {
    const ca = process.env.REDIS_CA_CERT;
    options.tls = ca ? { ca: [ca] } : {};
  }
  const client = new IORedis(url, options);
  // Baseline listener: keeps a connection error off the unhandled-`error` crash path for EVERY caller,
  // including any future one that forgets its own handler. Logs and keeps serving — the per-command
  // try/catch at each call site already handles graceful degradation while Redis is down.
  client.on("error", (err: Error) => logger.warn(`redis client error: ${err.message}`));
  return client;
}
