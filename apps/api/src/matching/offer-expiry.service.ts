import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { Queue, Worker } from "bullmq";
import IORedis, { type Redis } from "ioredis";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { MatchingService } from "./matching.service";

const QUEUE_NAME = "offer-expiry";

/** Offer window length (CONCEPT §9 — placeholder; tune on real corridor supply). */
export const OFFER_WINDOW_MS = 90_000;

interface ExpiryJob {
  orderId: string;
}

@Injectable()
export class OfferExpiryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OfferExpiryService.name);
  private queue?: Queue<ExpiryJob>;
  private worker?: Worker<ExpiryJob>;
  private connections: Redis[] = [];

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly matching: MatchingService,
  ) {}

  onModuleInit(): void {
    if (!this.env.REDIS_URL) {
      this.logger.warn("REDIS_URL not set — offer expiry is disabled (orders will not auto-expire)");
      return;
    }
    const mkConn = (): Redis => {
      const c = new IORedis(this.env.REDIS_URL as string, { maxRetriesPerRequest: null });
      this.connections.push(c);
      return c;
    };

    this.queue = new Queue<ExpiryJob>(QUEUE_NAME, { connection: mkConn() });
    this.worker = new Worker<ExpiryJob>(
      QUEUE_NAME,
      async (job) => this.matching.expireOrder(job.data.orderId),
      { connection: mkConn() },
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
    for (const c of this.connections) c.disconnect();
  }
}
