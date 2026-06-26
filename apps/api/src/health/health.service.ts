import { Inject, Injectable, Logger } from "@nestjs/common";
import Redis from "ioredis";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";

export interface HealthReport {
  status: "ok" | "degraded";
  db: boolean;
  redis: boolean | "skipped";
  provider: Env["CLOUD_PROVIDER"];
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

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

  private async pingRedis(): Promise<boolean | "skipped"> {
    if (!this.env.REDIS_URL) return "skipped";
    const client = new Redis(this.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
    try {
      await client.connect();
      return (await client.ping()) === "PONG";
    } catch (err) {
      this.logger.warn(`Redis ping failed: ${(err as Error).message}`);
      return false;
    } finally {
      client.disconnect();
    }
  }
}
