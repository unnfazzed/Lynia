import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { OFFER_WINDOW_MS } from "@lynia/shared";
import { Queue, Worker } from "bullmq";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { MatchingService } from "./matching.service";

const QUEUE_NAME = "offer-expiry";

// OFFER_WINDOW_MS now lives in @lynia/shared (the client renders the countdown from it). Re-exported
// so existing importers of this module keep working.
export { OFFER_WINDOW_MS };

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

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly matching: MatchingService,
  ) {}

  onModuleInit(): void {
    const url = this.env.REDIS_URL;
    if (!url) {
      this.logger.warn("REDIS_URL not set — offer expiry is disabled (orders will not auto-expire)");
      return;
    }
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
  }

  /**
   * Schedule the window-expiry transition. jobId = orderId makes the job idempotent, so a retry
   * (or a duplicate schedule) can never fire the expiry CAS twice (ET1).
   */
  async schedule(orderId: string, delayMs: number = OFFER_WINDOW_MS): Promise<void> {
    if (!this.queue) return;
    await this.queue.add(
      "expire",
      { orderId },
      { delay: delayMs, jobId: orderId, removeOnComplete: true, removeOnFail: 100 },
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }
}
