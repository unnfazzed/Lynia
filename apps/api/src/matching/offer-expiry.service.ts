import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { OFFER_WINDOW_MS } from "@lynia/shared";
import { Queue, Worker } from "bullmq";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { MatchingService } from "./matching.service";

const QUEUE_NAME = "offer-expiry";

// OFFER_WINDOW_MS now lives in @lynia/shared (the client renders the countdown from it). Re-exported
// so existing importers of this module keep working.
export { OFFER_WINDOW_MS };

/** Max additive jitter (ms) spread over the base window. */
const JITTER_MAX_MS = 10_000;

/** How often the DB-driven reconciler sweeps for orders stuck `open_for_offers` past their window.
 *  Deliberately much tighter than order-lifecycle's 15-minute rating-window sweep: the auction
 *  countdown freezing at 0:00 is the single most anxious moment in the customer journey, so a lost
 *  BullMQ job here shouldn't leave it frozen for a quarter of an hour. */
const RECONCILE_INTERVAL_MS = 2 * 60 * 1000;
/** A little grace past the window (covers the primary job's own jitter) before the reconciler treats
 *  an `open_for_offers` order as stuck rather than just about to expire on schedule. */
const RECONCILE_GRACE_MS = OFFER_WINDOW_MS + JITTER_MAX_MS + 15_000;

/**
 * Expiry delay with ADDITIVE-ONLY jitter (0–10s) on top of the base window. Bursts of orders created
 * together otherwise fire their expiry CAS transactions simultaneously (thundering herd). The jitter
 * MUST never subtract: the customer-facing countdown renders `createdAt + OFFER_WINDOW_MS`, so the job
 * must never fire BEFORE the countdown hits zero. (Math.random is fine here — this is the API service,
 * not a workflow script.)
 */
export function jitteredDelayMs(): number {
  return OFFER_WINDOW_MS + Math.floor(Math.random() * JITTER_MAX_MS);
}

/** Plain ioredis options (structurally typed) so BullMQ owns its connections — avoids
 *  cross-version ioredis instance mismatches between the api and bullmq's bundled copy. */
function connectionFromUrl(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 6379,
    username: u.username || undefined,
    password: u.password || undefined,
    maxRetriesPerRequest: null,
  };
}

@Injectable()
export class OfferExpiryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OfferExpiryService.name);
  private queue?: Queue;
  private worker?: Worker;
  private sweep?: ReturnType<typeof setInterval>;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly matching: MatchingService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    const url = this.env.REDIS_URL;
    if (url) {
      const connection = connectionFromUrl(url);

      this.queue = new Queue(QUEUE_NAME, { connection });
      this.worker = new Worker(
        QUEUE_NAME,
        async (job) => this.matching.expireOrder(job.data.orderId as string),
        { connection },
      );
      this.worker.on("failed", (job, err) =>
        this.logger.error(`expiry job ${job?.id ?? "?"} failed: ${err.message}`),
      );
      this.logger.log("Offer-expiry worker started");
    } else {
      this.logger.warn("REDIS_URL not set — relying on the DB reconciler to auto-expire open_for_offers orders");
    }

    // DB-driven reconciler (does NOT depend on Redis or the queue succeeding). A single failed
    // expiry job used to be a hard stop — BullMQ defaults to 1 attempt, and there was no other path
    // that ever revisited an order past its window, so it could sit `open_for_offers` forever with the
    // customer's countdown frozen at 0:00. This mirrors order-lifecycle's reconcileStaleDeliveries.
    void this.reconcileStaleOffers();
    this.sweep = setInterval(() => void this.reconcileStaleOffers(), RECONCILE_INTERVAL_MS);
    this.sweep.unref?.();
  }

  /**
   * Schedule the window-expiry transition. jobId = orderId makes the job idempotent, so a retry
   * (or a duplicate schedule) can never fire the expiry CAS twice (ET1). `attempts`/`backoff` give a
   * transient DB/Redis blip a few chances before falling back to the reconciler sweep below.
   */
  async schedule(orderId: string, delayMs: number = jitteredDelayMs()): Promise<void> {
    if (!this.queue) return;
    await this.queue.add(
      "expire",
      { orderId },
      {
        delay: delayMs,
        jobId: orderId,
        removeOnComplete: true,
        removeOnFail: 100,
        attempts: 3,
        backoff: { type: "exponential", delay: 5_000 },
      },
    );
  }

  /** Expire every order still `open_for_offers` well past its window. Idempotent via expireOrder's
   *  own CAS (`status: "open_for_offers"` in the WHERE clause), so racing the primary job is safe. */
  async reconcileStaleOffers(): Promise<{ expired: number }> {
    let expired = 0;
    // Fire-and-forget from onModuleInit (boot + 2-min interval), so the WHOLE body — the findMany
    // included, not just the per-order loop — must be guarded (F-12): an un-caught rejection here
    // escapes the `void` call site and, with no unhandledRejection handler, crashes the process
    // fleet-wide. Mirrors the tracking.gateway disconnect-flush guard. On a top-level failure we log
    // and fall through to the zero result, keeping the { expired } return-shape contract intact.
    try {
      const cutoff = new Date(Date.now() - RECONCILE_GRACE_MS);
      const stale = await this.prisma.order.findMany({
        where: { status: "open_for_offers", createdAt: { lt: cutoff } },
        select: { id: true },
        take: 500,
      });
      for (const o of stale) {
        try {
          if ((await this.matching.expireOrder(o.id)).expired) expired++;
        } catch (err) {
          this.logger.error(`reconcile failed for order ${o.id}: ${(err as Error).message}`);
        }
      }
      if (expired > 0) this.logger.log(`Reconciler expired ${expired} stale open_for_offers order(s)`);
    } catch (err) {
      this.logger.error(`reconcileStaleOffers sweep failed: ${(err as Error).message}`);
    }
    return { expired };
  }

  async onModuleDestroy(): Promise<void> {
    if (this.sweep) clearInterval(this.sweep);
    await this.worker?.close();
    await this.queue?.close();
  }
}
