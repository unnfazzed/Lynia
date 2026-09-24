import { describe, expect, it, vi } from "vitest";
import { loadEnv } from "../config/env";
import type { Env } from "../config/env";
import { HealthService } from "./health.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { OfferExpiryService } from "../matching/offer-expiry.service";
import type { OrderLifecycleService } from "../orders/order-lifecycle.service";

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

/** Stub queue owner — only the `pingQueue()` slice HealthService reads. */
function queueOwner<T>(result: () => Promise<boolean | "skipped">): T {
  return { pingQueue: result } as unknown as T;
}

function serviceWithQueues(
  offerExpiry: () => Promise<boolean | "skipped">,
  orderLifecycle: () => Promise<boolean | "skipped">,
): HealthService {
  const prisma = { ping: async () => true } as unknown as PrismaService;
  return new HealthService(
    prisma,
    noRedisEnv,
    queueOwner<OfferExpiryService>(offerExpiry),
    queueOwner<OrderLifecycleService>(orderLifecycle),
  );
}

/**
 * E6 regression. `redis` pings a separate TLS-aware client, so on a TLS-only Redis it read `true` while
 * BullMQ's own connections were dead. `queues` pings each queue's OWN client and any `false` degrades.
 */
describe("HealthService.check — BullMQ queue health (E6)", () => {
  it("reports both queues true and status ok when each queue's own client answers PONG", async () => {
    const report = await serviceWithQueues(async () => true, async () => true).check();
    expect(report).toMatchObject({ status: "ok", queues: { offerExpiry: true, orderLifecycle: true } });
  });

  it("a dead offer-expiry queue degrades status even though db and redis are fine", async () => {
    const report = await serviceWithQueues(async () => false, async () => true).check();
    expect(report).toMatchObject({ status: "degraded", db: true, queues: { offerExpiry: false, orderLifecycle: true } });
  });

  it("a dead order-lifecycle queue degrades status", async () => {
    const report = await serviceWithQueues(async () => true, async () => false).check();
    expect(report).toMatchObject({ status: "degraded", queues: { offerExpiry: true, orderLifecycle: false } });
  });

  it("no REDIS_URL → both queues 'skipped' and status stays ok", async () => {
    const report = await serviceWithQueues(async () => "skipped", async () => "skipped").check();
    expect(report).toMatchObject({ status: "ok", queues: { offerExpiry: "skipped", orderLifecycle: "skipped" } });
  });

  it("unwired queue owners (unit harness) report 'skipped'", async () => {
    const report = await serviceWith(async () => true).check();
    expect(report.queues).toEqual({ offerExpiry: "skipped", orderLifecycle: "skipped" });
  });
});
