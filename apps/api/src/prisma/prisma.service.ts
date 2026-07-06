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
    await this.$connect();
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
