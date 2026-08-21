import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

/** Default connection-pool size when `DATABASE_CONNECTION_LIMIT` is unset. Set explicitly (rather than
 *  leaning on the driver's cpu-derived default) so pool behaviour is deterministic across Cloud Run
 *  instance sizes — E6. Graceful shutdown is already handled by onModuleDestroy + enableShutdownHooks. */
const DEFAULT_CONNECTION_LIMIT = "10";
/** Default wait-for-connection timeout (ms) when neither the URL nor `DATABASE_POOL_TIMEOUT` sets one.
 *  Prisma's old query engine fast-failed a pool-acquire at 10s; node-postgres' `Pool` default is `0`
 *  (wait forever), so under pool exhaustion requests would queue indefinitely and Cloud Run would pile
 *  up hung requests instead of shedding load. Restore the fast-fail explicitly — E6. */
const DEFAULT_POOL_ACQUIRE_TIMEOUT_MS = 10_000;

/**
 * Pool options for the pg driver adapter (Prisma 7 — the engine's `connection_limit`/`pool_timeout`
 * URL params no longer apply; pg's `max`/`connectionTimeoutMillis` are their equivalents). The same
 * precedence as the old URL rewrite: a value already in the URL wins, then the env var, then the
 * deterministic default. `pool_timeout` was seconds; connectionTimeoutMillis is ms. An unparseable
 * URL falls back to defaults so a bad value can never block boot.
 */
export function poolConfig(url: string): { connectionString: string; max: number; connectionTimeoutMillis: number } {
  const out: { connectionString: string; max: number; connectionTimeoutMillis: number } = {
    connectionString: url,
    max: Number(process.env.DATABASE_CONNECTION_LIMIT ?? DEFAULT_CONNECTION_LIMIT),
    // Explicit default so an unconfigured pool fast-fails on acquire rather than waiting forever (pg's
    // `connectionTimeoutMillis` default of 0). Overridden below when the URL / env sets pool_timeout.
    connectionTimeoutMillis: DEFAULT_POOL_ACQUIRE_TIMEOUT_MS,
  };
  try {
    const u = new URL(url);
    const limit = u.searchParams.get("connection_limit");
    if (limit) out.max = Number(limit);
    const timeout = u.searchParams.get("pool_timeout") ?? process.env.DATABASE_POOL_TIMEOUT;
    if (timeout) out.connectionTimeoutMillis = Number(timeout) * 1000;
  } catch {
    // keep defaults
  }
  return out;
}

/** Attempts for the FIRST connection at boot, inclusive of the initial try. Opening a brand-new
 *  physical connection is exactly what `connectionTimeoutMillis` bounds (pg-pool destroys the socket
 *  and raises `Connection terminated due to connection timeout`), and on Cloud Run that first connect
 *  races instance start: the `/cloudsql/<instance>` socket is not always ready the moment the
 *  container is. That is a TRANSIENT — one retry turns a dead instance into a slightly slower boot —
 *  whereas a genuinely unreachable database still fails, just after a bounded delay. */
const CONNECT_ATTEMPTS = 3;
/** First backoff; doubles per attempt (500ms, 1s). Short on purpose — this sits in the boot path. */
const CONNECT_RETRY_BASE_MS = 500;

function defaultSleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    t.unref?.();
  });
}

/**
 * Run `connect`, retrying a failure with exponential backoff up to {@link CONNECT_ATTEMPTS} tries.
 * Rethrows the LAST error once the attempts are spent, so a real outage still fails the boot loudly
 * (main.ts turns that into a non-zero exit) rather than being papered over. Exported for testing;
 * `sleep` is injectable so tests need no timers.
 */
export async function connectWithRetry(
  connect: () => Promise<unknown>,
  opts: {
    attempts?: number;
    baseDelayMs?: number;
    onRetry?: (attempt: number, err: Error) => void;
    sleep?: (ms: number) => Promise<void>;
  } = {},
): Promise<void> {
  const attempts = opts.attempts ?? CONNECT_ATTEMPTS;
  const baseDelayMs = opts.baseDelayMs ?? CONNECT_RETRY_BASE_MS;
  const sleep = opts.sleep ?? defaultSleep;
  for (let attempt = 1; ; attempt++) {
    try {
      await connect();
      return;
    } catch (err) {
      if (attempt >= attempts) throw err;
      opts.onRetry?.(attempt, err instanceof Error ? err : new Error(String(err)));
      await sleep(baseDelayMs * 2 ** (attempt - 1));
    }
  }
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const url = process.env.DATABASE_URL;
    // Prisma 7 always wants a driver adapter. pg's Pool is lazy — it opens nothing until the first
    // query — so constructing with an empty config when DATABASE_URL is absent keeps unit tests and
    // tooling that never touch the DB working exactly as before.
    super({ adapter: new PrismaPg(url ? poolConfig(url) : {}) });
  }

  async onModuleInit(): Promise<void> {
    await connectWithRetry(() => this.$connect(), {
      onRetry: (attempt, err) =>
        this.logger.warn(`Prisma connect attempt ${attempt} failed (${err.message}) — retrying`),
    });
    this.logger.log("Prisma connected");
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Lightweight liveness check for /healthz. */
  async ping(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch (err) {
      this.logger.error("Prisma ping failed", err as Error);
      return false;
    }
  }
}
