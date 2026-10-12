import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { WalletService } from "./wallet.service";

/** How often the sweep runs. The approve window is 90 s, so a lost webhook costs the biker at most this. */
export const TOPUP_RECONCILE_INTERVAL_MS = 60_000;
/** Rail lookups per tick, so a backlog can't fan out into a burst of calls to Paynow. */
export const TOPUP_RECONCILE_BATCH = 20;

/**
 * The lost-webhook backstop for Paynow top-ups (the KycReconcileService pattern). Every minute it asks
 * Paynow about recent unsettled top-ups ({@link WalletService.topupsToReconcile}) and applies the answer:
 * a payment whose status update never arrived is credited, a final refusal is declined, and a still-pending
 * intent whose window lapsed is moved to `expired`. Before this, expiry only happened when the app polled,
 * so a top-up from an app the OS had killed sat `pending` in the database forever.
 *
 * Only with `PAYMENT_RAIL=paynow`. No leader lock: every write is a CAS at the row and crediting is
 * exactly-once, so two instances sweeping together cost a duplicate lookup, never a double credit. Never
 * throws out of the timer: each tick and each top-up inside it is wrapped.
 */
@Injectable()
export class TopupReconcileService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TopupReconcileService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(
    private readonly wallet: WalletService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onModuleInit(): void {
    if (this.env.PAYMENT_RAIL !== "paynow") return;
    this.timer = setInterval(() => void this.sweep(), TOPUP_RECONCILE_INTERVAL_MS);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** One tick. Returns what it did, for tests and the log. Never throws. */
  async sweep(now: Date = new Date()): Promise<{ checked: number; credited: number; declined: number }> {
    const tally = { checked: 0, credited: 0, declined: 0 };
    if (this.env.PAYMENT_RAIL !== "paynow" || this.running) return tally;
    this.running = true;
    try {
      const ids = await this.wallet.topupsToReconcile(now, TOPUP_RECONCILE_BATCH);
      for (const id of ids) {
        tally.checked++;
        try {
          const outcome = await this.wallet.reconcileTopup(id);
          if (outcome === "credited") tally.credited++;
          if (outcome === "declined") tally.declined++;
        } catch (err) {
          this.logger.warn(`top-up ${id}: Paynow lookup failed (${(err as Error).message}); retried next tick`);
        }
      }
      if (tally.credited || tally.declined) this.logger.log(`top-up sweep: ${JSON.stringify(tally)}`);
    } catch (err) {
      this.logger.error(`top-up sweep failed: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
    return tally;
  }
}
