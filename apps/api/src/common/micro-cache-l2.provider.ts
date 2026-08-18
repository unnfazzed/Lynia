import { Global, Inject, Injectable, Logger, Module, type OnModuleDestroy } from "@nestjs/common";
import type IORedis from "ioredis";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import type { MicroCacheL2 } from "./micro-cache";
import { createRedisClient, REDIS_FAIL_FAST } from "./redis";

/**
 * The ONE shared Redis L2 for every read-through micro-cache (deferred-item D6,
 * docs/plans/2026-08-17-customer-journey-load-perf-fixes.md "NOT in scope" → pulled forward by
 * owner instruction 2026-08-18). Extracted verbatim from OrdersService's private copy so
 * MerchantService's photo-URL cache could share it WITHOUT growing a second lazy Redis client —
 * the second copy was exactly the drift trap the withTimeout dedupe (D1) just closed elsewhere.
 *
 * With the L2 on, the 2-3 Cloud Run instances share warm entries — which for the merchant photo
 * cache is the cross-instance half of "byte-stable signed URLs": without it each instance minted
 * its own URL per window, so a phone bouncing between instances still saw ~3 variants per photo
 * and the JSON ETag hit rate was per-instance.
 *
 * Semantics unchanged from the OrdersService original, line for line:
 *  - Gated on `MICRO_CACHE_REDIS_L2 === "true"` AND `REDIS_URL`; otherwise resolves null and no
 *    client is ever created.
 *  - Its OWN client, deliberately not TrackingService's — that one carries the live-position/
 *    waitlist planes and must never queue behind cache traffic.
 *  - LC-C01 fail-fast options: a Redis blip degrades to L1-only immediately (MicroCache treats
 *    every L2 command as best-effort) instead of hanging a coalesced flight until reconnect.
 *  - Lazily created on first resolve, quit on shutdown.
 */
@Injectable()
export class MicroCacheL2Provider implements OnModuleDestroy {
  private readonly logger = new Logger(MicroCacheL2Provider.name);
  private client: IORedis | null = null;
  private started = false;

  constructor(@Inject(ENV) private readonly env?: Env) {}

  /** Resolve the shared L2 adapter, or null when not enabled/configured. Call per flight (the
   *  MicroCache `l2` option is a thunk) so the adapter can appear after boot without re-wiring. */
  resolve(): MicroCacheL2 | null {
    if (this.env?.MICRO_CACHE_REDIS_L2 !== "true" || !this.env.REDIS_URL) return null;
    if (!this.started) {
      this.started = true;
      this.client = createRedisClient(this.env.REDIS_URL, REDIS_FAIL_FAST);
      this.client.on("error", (err: Error) => this.logger.warn(`micro-cache L2 redis error: ${err.message}`));
    }
    const client = this.client;
    if (!client) return null;
    return {
      get: (key) => client.get(key),
      set: async (key, value, ttlMs) => {
        await client.set(key, value, "PX", Math.max(1, Math.round(ttlMs)));
      },
    };
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) await this.client.quit().catch(() => {});
  }
}

/** @Global so any service can inject the provider TS-optionally without per-module wiring —
 *  the same registration convention as ConfigModule's ENV and ObservabilityModule's metrics. */
@Global()
@Module({ providers: [MicroCacheL2Provider], exports: [MicroCacheL2Provider] })
export class MicroCacheL2Module {}
