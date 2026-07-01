import { OFFER_WINDOW_MS } from "@lynia/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../config/env";
import type { MatchingService } from "./matching.service";
import { OfferExpiryService, jitteredDelayMs } from "./offer-expiry.service";

const JITTER_MAX_MS = 10_000;

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
    const service = new OfferExpiryService(env, {} as MatchingService);
    // Inject a fake BullMQ queue (onModuleInit is not run — no real Redis in unit tests).
    (service as unknown as { queue: { add: typeof add } }).queue = { add };
    return { service, add };
  }

  it("schedules with a jittered delay in [OFFER_WINDOW_MS, OFFER_WINDOW_MS + 10000) and jobId = orderId", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const { service, add } = makeService();

    await service.schedule("order-123");

    expect(add).toHaveBeenCalledTimes(1);
    const [name, data, opts] = add.mock.calls[0];
    expect(name).toBe("expire");
    expect(data).toEqual({ orderId: "order-123" });
    expect(opts.jobId).toBe("order-123");
    expect(opts.delay).toBeGreaterThanOrEqual(OFFER_WINDOW_MS);
    expect(opts.delay).toBeLessThan(OFFER_WINDOW_MS + JITTER_MAX_MS);
  });

  it("never schedules a delay below OFFER_WINDOW_MS even when random() is 0", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { service, add } = makeService();

    await service.schedule("order-abc");

    expect(add.mock.calls[0][2].delay).toBe(OFFER_WINDOW_MS);
  });

  it("no-ops when the queue is not initialised (REDIS_URL unset)", async () => {
    const env = { REDIS_URL: undefined } as Env;
    const service = new OfferExpiryService(env, {} as MatchingService);
    await expect(service.schedule("order-x")).resolves.toBeUndefined();
  });
});
