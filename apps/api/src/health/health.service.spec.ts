import { describe, expect, it, vi } from "vitest";
import { loadEnv } from "../config/env";
import type { Env } from "../config/env";
import { HealthService } from "./health.service";
import type { PrismaService } from "../prisma/prisma.service";

// No REDIS_URL → the Redis leg reports "skipped", so these tests isolate the DB-ping behaviour.
const noRedisEnv: Env = loadEnv({ DATABASE_URL: "postgresql://localhost/lynia" } as NodeJS.ProcessEnv);

function serviceWith(ping: () => Promise<boolean>): HealthService {
  const prisma = { ping } as unknown as PrismaService;
  return new HealthService(prisma, noRedisEnv);
}

describe("HealthService.check — DB liveness (DS15-08)", () => {
  it("reports db:true and status ok when the DB ping succeeds", async () => {
    const report = await serviceWith(async () => true).check();
    expect(report).toMatchObject({ status: "ok", db: true, redis: "skipped" });
  });

  it("reports db:false and status degraded when the ping resolves false", async () => {
    const report = await serviceWith(async () => false).check();
    expect(report).toMatchObject({ status: "degraded", db: false });
  });

  it("times out a hanging DB ping and reports unhealthy FAST instead of waiting on the pool", async () => {
    vi.useFakeTimers();
    try {
      // A pool-exhausted acquisition: prisma.ping() never resolves within the probe's budget. The health
      // check must NOT hang with it — the DB_PING_TIMEOUT race trips and marks the instance unhealthy.
      const hanging = () => new Promise<boolean>(() => {});
      const svc = serviceWith(hanging);
      const checkPromise = svc.check();
      // Advance past the DB ping timeout (2s) so the race rejects and check() resolves degraded.
      await vi.advanceTimersByTimeAsync(2_000);
      const report = await checkPromise;
      expect(report).toMatchObject({ status: "degraded", db: false });
    } finally {
      vi.useRealTimers();
    }
  });
});
