import { Inject, Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import type IORedis from "ioredis";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { createRedisClient } from "../common/redis";
import { PrismaService } from "../prisma/prisma.service";

export interface HealthReport {
  status: "ok" | "degraded";
  db: boolean;
  redis: boolean | "skipped";
  provider: Env["CLOUD_PROVIDER"];
}

/** Cap on how long the health ping waits for Redis. The shared client uses `maxRetriesPerRequest:
 *  null`, so a command issued while Redis is unreachable would otherwise queue indefinitely and hang
 *  the probe — race it against this so a dead Redis reports `false` fast. */
const REDIS_PING_TIMEOUT_MS = 2_000;

@Injectable()
export class HealthService implements OnModuleDestroy {
  private readonly logger = new Logger(HealthService.name);
  // DS-04: one long-lived Redis client, created lazily and reused across every /healthz hit. The old
  // code did `new Redis(...)` + connect + disconnect PER request on an unauthenticated, unthrottled
  // route, so a flood forced a fresh TCP connection each time (fd / Redis `maxclients` / connect-storm
  // pressure that degrades real traffic). A single reused client removes the per-request connect and
  // its ping still reflects real connectivity.
  private client?: IORedis;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async check(): Promise<HealthReport> {
    const db = await this.prisma.ping();
    const redis = await this.pingRedis();
    const status = db && redis !== false ? "ok" : "degraded";
    return { status, db, redis, provider: this.env.CLOUD_PROVIDER };
  }

  private getClient(): IORedis | null {
    if (!this.env.REDIS_URL) return null;
    if (!this.client) {
      this.client = createRedisClient(this.env.REDIS_URL);
      // Keep the shared client's connection errors off the unhandled-`error` path (they'd otherwise
      // only surface via ioredis' silent logger) and never let one crash the probe.
      this.client.on("error", (err) => this.logger.warn(`health redis client error: ${err.message}`));
    }
    return this.client;
  }

  private async pingRedis(): Promise<boolean | "skipped"> {
    const client = this.getClient();
    if (!client) return "skipped";
    try {
      const pong = await Promise.race([
        client.ping(),
        new Promise<never>((_, reject) => {
          const t = setTimeout(() => reject(new Error("redis ping timeout")), REDIS_PING_TIMEOUT_MS);
          t.unref?.();
        }),
      ]);
      return pong === "PONG";
    } catch (err) {
      this.logger.warn(`Redis ping failed: ${(err as Error).message}`);
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.quit().catch(() => {
      /* shutting down — a failed quit is not actionable */
    });
    this.client = undefined;
  }
}
