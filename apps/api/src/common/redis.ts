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

/** TLS options for a `rediss://` URL (pinning `REDIS_CA_CERT` when set), `undefined` for plain
 *  `redis://`. Shared by {@link createRedisClient} and {@link bullmqConnectionFromUrl}. */
function tlsFor(url: string): { ca?: string[] } | undefined {
  if (!url.startsWith("rediss://")) return undefined;
  const ca = process.env.REDIS_CA_CERT;
  return ca ? { ca: [ca] } : {};
}

/**
 * C2 — BullMQ connection options from a Redis URL. Plain ioredis options (structurally typed) so
 * BullMQ owns its connections, avoiding cross-version ioredis instance mismatches between the api and
 * bullmq's bundled copy. `maxRetriesPerRequest: null` is a BullMQ Worker requirement.
 *
 * Unlike ioredis' own URL parsing, host/port options carry no scheme, so `rediss://` must set `tls`
 * explicitly — the two former `connectionFromUrl` copies dropped it, leaving offer expiry and rating
 * auto-close unable to connect to a TLS-only Redis (Azure Managed Redis) while `/healthz`, which uses
 * {@link createRedisClient}, stayed green. Plain `redis://` output is unchanged (no `tls` key).
 * Credentials are percent-decoded: WHATWG `URL` re-encodes `=` in userinfo, and Azure access keys are
 * base64 (often `=`-padded). A GCP AUTH string (UUID) decodes to itself.
 */
export function bullmqConnectionFromUrl(url: string) {
  const u = new URL(url);
  const tls = tlsFor(url);
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 6379,
    username: u.username ? decodeURIComponent(u.username) : undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    maxRetriesPerRequest: null,
    ...(tls ? { tls } : {}),
  };
}

export function createRedisClient(url: string, opts?: RedisClientOptions): IORedis {
  const options: RedisOptions = { maxRetriesPerRequest: null };
  if (opts?.commandTimeoutMs != null) options.commandTimeout = opts.commandTimeoutMs;
  if (opts?.enableOfflineQueue === false) options.enableOfflineQueue = false;
  const tls = tlsFor(url);
  if (tls) options.tls = tls;
  const client = new IORedis(url, options);
  // Baseline listener: keeps a connection error off the unhandled-`error` crash path for EVERY caller,
  // including any future one that forgets its own handler. Logs and keeps serving — the per-command
  // try/catch at each call site already handles graceful degradation while Redis is down.
  client.on("error", (err: Error) => logger.warn(`redis client error: ${err.message}`));
  return client;
}

/** Budget for a BullMQ queue's health PING — matches the health probe's `REDIS_PING_TIMEOUT_MS`. */
export const QUEUE_PING_TIMEOUT_MS = 2_000;

/** The slice of a BullMQ Queue {@link pingQueueClient} reads (structural, so specs stub it without
 *  bullmq). BullMQ 6 exposes the queue's OWN connection as `getBackend().client`, resolving once it is
 *  ready. Its `IRedisClient` type omits `ping`, but the ioredis adapter is a Proxy that forwards every
 *  raw ioredis command, so `ping()` is there at runtime. */
export interface PingableQueue {
  getBackend(): { readonly client: Promise<object> };
}

/**
 * E6 — liveness of a BullMQ queue's own Redis connection, for `/healthz`. `"skipped"` when the queue
 * was never built (no `REDIS_URL`). The whole client acquisition + PING is raced against the budget:
 * BullMQ connections use `maxRetriesPerRequest: null`, and `client` itself waits for `ready`, so a
 * dead or TLS-misconfigured Redis would otherwise hang the probe rather than report `false`. Never
 * throws.
 */
export async function pingQueueClient(
  queue: PingableQueue | undefined,
  timeoutMs: number = QUEUE_PING_TIMEOUT_MS,
): Promise<boolean | "skipped"> {
  if (!queue) return "skipped";
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const pong = await Promise.race([
      (async () => ((await queue.getBackend().client) as { ping(): Promise<string> }).ping())(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("queue ping timeout")), timeoutMs);
        timer.unref?.();
      }),
    ]);
    return pong === "PONG";
  } catch (err) {
    logger.warn(`queue ping failed: ${(err as Error).message}`);
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
