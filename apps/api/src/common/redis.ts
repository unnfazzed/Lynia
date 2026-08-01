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
export interface RedisClientOptions {
  /** Reject a command that gets no reply within this many ms (ioredis `commandTimeout`). Catches the
   *  connected-but-hung case. Unset = ioredis default (no per-command timeout). */
  commandTimeoutMs?: number;
  /** When `false`, reject a command issued while DISCONNECTED instead of queuing it (ioredis
   *  `enableOfflineQueue`). Unset/true = ioredis default (queue until reconnect). */
  enableOfflineQueue?: boolean;
}

/**
 * LC-C01 — the fail-fast profile for REQUEST-PATH clients. With the factory's `maxRetriesPerRequest:
 * null` (mirrored from BullMQ) and the default `enableOfflineQueue: true`, a command issued while
 * Memorystore is unreachable is queued and NEVER rejected, so an awaited Redis call on the request
 * path hangs until reconnect — pinning a Cloud Run concurrency slot up to the 3600s request timeout,
 * so a single-node (BASIC-tier) Memorystore restart cascades into instance saturation and the
 * callers' own "best-effort / falls back" try/catch never runs. `enableOfflineQueue: false` makes a
 * command rejected fast while disconnected (the fallback fires); `commandTimeout` catches the
 * connected-but-hung case. 2 s matches the health probe's existing `REDIS_PING_TIMEOUT_MS` and is far
 * above any healthy command. Apply ONLY to request-path clients (OTP/rate-limit, MicroCache L2,
 * tracking geo/position) — the Socket.IO pub/sub adapter keeps the default offline-queuing because its
 * cross-instance semantics differ. Not used by BullMQ (it builds its own connections).
 */
export const REDIS_FAIL_FAST: RedisClientOptions = { commandTimeoutMs: 2_000, enableOfflineQueue: false };

export function createRedisClient(url: string, opts?: RedisClientOptions): IORedis {
  const options: RedisOptions = { maxRetriesPerRequest: null };
  if (opts?.commandTimeoutMs != null) options.commandTimeout = opts.commandTimeoutMs;
  if (opts?.enableOfflineQueue === false) options.enableOfflineQueue = false;
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
