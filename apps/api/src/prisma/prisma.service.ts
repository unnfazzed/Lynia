import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

/** Default connection-pool size when `DATABASE_CONNECTION_LIMIT` is unset. Set explicitly (rather than
 *  leaning on Prisma's cpu-derived default) so pool behaviour is deterministic across Cloud Run
 *  instance sizes — E6. Graceful shutdown is already handled by onModuleDestroy + enableShutdownHooks. */
const DEFAULT_CONNECTION_LIMIT = "10";

/**
 * Apply an explicit connection-pool config to the datasource URL. `connection_limit` is fixed to a
 * predictable default (overridable via env), and `pool_timeout` is passed through only when set. Any
 * value already present in the URL wins, and an unparseable URL is returned untouched so a bad value
 * can never block boot. Prisma reads these as query params on the Postgres connection string.
 */
export function withPoolConfig(url: string): string {
  try {
    const u = new URL(url);
    if (!u.searchParams.has("connection_limit")) {
      u.searchParams.set("connection_limit", process.env.DATABASE_CONNECTION_LIMIT ?? DEFAULT_CONNECTION_LIMIT);
    }
    const timeout = process.env.DATABASE_POOL_TIMEOUT;
    if (timeout && !u.searchParams.has("pool_timeout")) u.searchParams.set("pool_timeout", timeout);
    return u.toString();
  } catch {
    return url;
  }
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const url = process.env.DATABASE_URL;
    // Only override the datasource when a URL is present, so unit tests that instantiate the service
    // without DATABASE_URL keep Prisma's default env resolution.
    super(url ? { datasources: { db: { url: withPoolConfig(url) } } } : {});
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
