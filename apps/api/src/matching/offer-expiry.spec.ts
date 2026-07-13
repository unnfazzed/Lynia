import { BROADCAST, OFFER_WINDOW_MS } from "@lynia/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../config/env";
import type { PrismaService } from "../prisma/prisma.service";
import type { MatchingService } from "./matching.service";
import { OfferExpiryService, jitteredDelayMs } from "./offer-expiry.service";

const JITTER_MAX_MS = 10_000;

// Replace BullMQ so onModuleInit can run without a live Redis: the Queue/Worker constructors are
// captured, letting the worker-dispatch test grab the processor closure Worker was built with.
vi.mock("bullmq", () => ({
  // Function expressions (not arrows) so the mocks are `new`-able like the real classes.
  Queue: vi.fn(function () {
    return { on: vi.fn(), add: vi.fn(), close: vi.fn() };
  }),
  Worker: vi.fn(function () {
    return { on: vi.fn(), close: vi.fn() };
  }),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("jitteredDelayMs — additive-only jitter", () => {
  it("adds nothing when random() is 0 (never fires before the countdown hits zero)", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(jitteredDelayMs()).toBe(OFFER_WINDOW_MS);
  });

  it("adds at most just under 10s when random() approaches 1", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999999);
    const delay = jitteredDelayMs();
    expect(delay).toBeGreaterThanOrEqual(OFFER_WINDOW_MS);
    expect(delay).toBeLessThan(OFFER_WINDOW_MS + JITTER_MAX_MS);
  });

  it("is always additive-only across the full random range", () => {
    for (const r of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 0.999999]) {
      vi.spyOn(Math, "random").mockReturnValue(r);
      const delay = jitteredDelayMs();
      // Additive-only: never below the base window (the countdown renders createdAt + OFFER_WINDOW_MS).
      expect(delay).toBeGreaterThanOrEqual(OFFER_WINDOW_MS);
      expect(delay).toBeLessThan(OFFER_WINDOW_MS + JITTER_MAX_MS);
      vi.restoreAllMocks();
    }
  });
});

describe("OfferExpiryService.schedule", () => {
  function makeService() {
    const add = vi.fn().mockResolvedValue(undefined);
    const env = { REDIS_URL: "redis://localhost:6379" } as Env;
    const service = new OfferExpiryService(env, {} as MatchingService, {} as PrismaService);
    // Inject a fake BullMQ queue (onModuleInit is not run — no real Redis in unit tests).
    (service as unknown as { queue: { add: typeof add } }).queue = { add };
    return { service, add };
  }

  it("schedules with a jittered delay in [OFFER_WINDOW_MS, OFFER_WINDOW_MS + 10000) and jobId = orderId, with retry/backoff", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const { service, add } = makeService();

    await service.schedule("order-123");

    const [name, data, opts] = add.mock.calls[0];
    expect(name).toBe("expire");
    expect(data).toEqual({ orderId: "order-123" });
    expect(opts.jobId).toBe("order-123");
    expect(opts.delay).toBeGreaterThanOrEqual(OFFER_WINDOW_MS);
    expect(opts.delay).toBeLessThan(OFFER_WINDOW_MS + JITTER_MAX_MS);
    // A transient DB/Redis blip on the primary job used to be a hard stop (BullMQ defaults to 1
    // attempt) with no other path revisiting the order — retry/backoff plus the reconciler sweep
    // are the fix; this asserts the job itself now gets a few chances first.
    expect(opts.attempts).toBe(3);
    expect(opts.backoff).toEqual({ type: "exponential", delay: 5_000 });
  });

  it("enqueues one widening-broadcast tick per in-window expansion step, idempotent jobIds, no retries", async () => {
    const { service, add } = makeService();

    await service.schedule("order-123");

    const expandCalls = add.mock.calls.filter(([name]) => name === "expand");
    const inWindow = BROADCAST.expansion.filter((s) => s.atMs < OFFER_WINDOW_MS);
    expect(expandCalls).toHaveLength(inWindow.length);
    for (const [i, step] of inWindow.entries()) {
      const [, data, opts] = expandCalls[i];
      expect(data).toEqual({ orderId: "order-123", step: i });
      // jobId idempotency: a duplicate schedule (create replay / announceOpenOrder) can't double-tick.
      expect(opts.jobId).toBe(`expand:order-123:${i}`);
      expect(opts.delay).toBe(step.atMs);
      // Ticks are best-effort — no attempts/backoff; a lost one is covered by the next tick's
      // sent-set difference. Only the correctness-critical expire job retries.
      expect(opts.attempts).toBeUndefined();
    }
  });

  it("never enqueues an expansion step at/past the offer window (it could not fire while open)", async () => {
    const { service, add } = makeService();

    await service.schedule("order-123");

    for (const [name, , opts] of add.mock.calls) {
      if (name === "expand") expect(opts.delay).toBeLessThan(OFFER_WINDOW_MS);
    }
  });

  it("never schedules a delay below OFFER_WINDOW_MS even when random() is 0", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { service, add } = makeService();

    await service.schedule("order-abc");

    expect(add.mock.calls[0][2].delay).toBe(OFFER_WINDOW_MS);
  });

  it("no-ops when the queue is not initialised (REDIS_URL unset)", async () => {
    const env = { REDIS_URL: undefined } as Env;
    const service = new OfferExpiryService(env, {} as MatchingService, {} as PrismaService);
    await expect(service.schedule("order-x")).resolves.toBeUndefined();
  });
});

describe("OfferExpiryService worker dispatch", () => {
  it("routes 'expand' jobs to expandBroadcast and everything else (incl. legacy jobs) to expireOrder", async () => {
    const { Worker } = await import("bullmq");
    const expireOrder = vi.fn().mockResolvedValue({ expired: true });
    const expandBroadcast = vi.fn().mockResolvedValue(undefined);
    const env = { REDIS_URL: "redis://localhost:6379" } as Env;
    const service = new OfferExpiryService(
      env,
      { expireOrder, expandBroadcast } as unknown as MatchingService,
      { order: { findMany: vi.fn().mockResolvedValue([]) } } as unknown as PrismaService,
    );
    service.onModuleInit();
    try {
      const processor = (Worker as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1)![1];

      await processor({ name: "expand", data: { orderId: "o-1", step: 1 } });
      expect(expandBroadcast).toHaveBeenCalledWith("o-1", 1);
      expect(expireOrder).not.toHaveBeenCalled();

      await processor({ name: "expire", data: { orderId: "o-1" } });
      // Legacy in-flight jobs (enqueued before "expand" existed, name "expire"/anything else) must
      // still expire — the default branch is expire, not a throw, so a deploy can't strand them.
      await processor({ name: "unknown-legacy", data: { orderId: "o-2" } });
      expect(expireOrder).toHaveBeenNthCalledWith(1, "o-1");
      expect(expireOrder).toHaveBeenNthCalledWith(2, "o-2");
    } finally {
      await service.onModuleDestroy();
    }
  });
});

describe("OfferExpiryService.reconcileStaleOffers", () => {
  it("expires every order still open_for_offers past the reconcile grace window, tolerating per-order failures", async () => {
    const env = { REDIS_URL: undefined } as Env;
    const findMany = vi.fn().mockResolvedValue([{ id: "stale-1" }, { id: "stale-2" }, { id: "stale-3" }]);
    const expireOrder = vi
      .fn()
      .mockResolvedValueOnce({ expired: true })
      .mockRejectedValueOnce(new Error("db blip"))
      .mockResolvedValueOnce({ expired: false }); // already handled by the primary job — CAS no-op
    const service = new OfferExpiryService(
      env,
      { expireOrder } as unknown as MatchingService,
      { order: { findMany } } as unknown as PrismaService,
    );

    const result = await service.reconcileStaleOffers();

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: "open_for_offers" }) }),
    );
    expect(expireOrder).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ expired: 1 });
  });

  it("resolves (never rejects) and returns zero when the findMany itself rejects — F-12 fire-and-forget guard", async () => {
    const env = { REDIS_URL: undefined } as Env;
    const findMany = vi.fn().mockRejectedValue(new Error("db down"));
    const expireOrder = vi.fn();
    const service = new OfferExpiryService(
      env,
      { expireOrder } as unknown as MatchingService,
      { order: { findMany } } as unknown as PrismaService,
    );

    // The sweep runs fire-and-forget from onModuleInit (`void this.reconcileStaleOffers()`), so a
    // rejecting findMany would escape as an unhandledRejection and, with no handler, crash the process
    // fleet-wide. The whole body is guarded, so it must RESOLVE to the zero result, never reject.
    await expect(service.reconcileStaleOffers()).resolves.toEqual({ expired: 0 });
    expect(expireOrder).not.toHaveBeenCalled();
  });
});
