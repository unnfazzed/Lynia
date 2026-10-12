import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { RiderService } from "../riders/rider.service";
import { classifyDiditSession, mapDiditStatus } from "./didit";
import { applyDiditDecision } from "./didit-decision";
import { KYC_VENDOR, type KycVendor } from "./kyc-vendor";

/** How often the lost-webhook reconciler runs. A lost terminal webhook used to strand a rider `pending`
 *  forever; ten minutes is invisible next to that, and cheap at the batch size below. */
export const KYC_RECONCILE_INTERVAL_MS = 10 * 60 * 1000;
/** A check is only reconciled once its row has been quiet this long — well past the webhook's own delivery
 *  and retry window, so the sweep backstops a LOST webhook rather than racing a late one. */
export const KYC_RECONCILE_MIN_AGE_MS = 15 * 60 * 1000;
/** Vendor decision reads per tick. Bounded so a backlog can't fan out into hundreds of outbound calls at
 *  once; the keyset cursor walks the rest of the backlog on later ticks. */
export const KYC_RECONCILE_BATCH = 25;
/** The ID-expiry sweep (KYC-R26-08). Daily-ish is all the precision a document's expiry DAY needs; six hours
 *  keeps a deploy (which restarts the in-process timer) from ever pushing it past a day. */
export const KYC_ID_EXPIRY_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * KYC-R26-03 lost-webhook reconciliation + KYC-R26-08 ID-expiry sweep.
 *
 * Reconcile: a rider whose terminal Didit webhook never arrived (a delivery that exhausted its retries, a
 * secret rotation window, an outage on our side) sat `pending` forever — the vendor had decided, we never
 * heard. Every {@link KYC_RECONCILE_INTERVAL_MS} this reads Didit's decision (`GET /v3/session/{id}/decision/`)
 * for a bounded batch of checks that are pending on a session nobody resolved and have been quiet for
 * {@link KYC_RECONCILE_MIN_AGE_MS}, and applies any verdict through the SAME `applyDiditDecision` path the
 * webhook takes — face-match bands (score extracted from the decision payload), document dedupe/adoption, the
 * held-for-review store, Abandoned/Expired recorded as dead sessions (credentials cleared so the next retry
 * mints), and the R26-01/02 guards. Only in `didit` + `auto` mode, with a vendor that can read decisions.
 *
 * Multi-instance: no leader lock, deliberately — the same choice as OfferExpiryService's reconciler. Every
 * write this makes is idempotent at the row: applyKycResult takes the rider row lock, a repeat outcome is a
 * no-op (KYC-R26-01), and the held/vendor-status writes are guarded on the check still being undecided. Two
 * instances sweeping together cost duplicate (free) decision reads, never a double decision. Each instance
 * starts at a random offset so they don't sweep in lockstep.
 *
 * Never throws out of a timer: each tick is wrapped whole, and each rider inside it.
 */
@Injectable()
export class KycReconcileService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KycReconcileService.name);
  private reconcileTimer?: ReturnType<typeof setInterval>;
  private expiryTimer?: ReturnType<typeof setInterval>;
  private startTimer?: ReturnType<typeof setTimeout>;
  /** Keyset cursor over pending riders (profileId); wraps to the start when a page comes back short. */
  private cursor: string | null = null;
  private running = false;

  constructor(
    private readonly riders: RiderService,
    @Inject(KYC_VENDOR) private readonly vendor: KycVendor,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private get reconcileEnabled(): boolean {
    return this.env.KYC_PROVIDER === "didit" && this.env.KYC_MODE === "auto" && typeof this.vendor.sessionDecision === "function";
  }

  onModuleInit(): void {
    // Random start offset (≤ 1 min) so several instances don't sweep in lockstep.
    this.startTimer = setTimeout(() => {
      void this.reconcileLostWebhooks();
      void this.sweepExpiredIds();
    }, Math.floor(Math.random() * 60_000));
    this.startTimer.unref?.();
    this.reconcileTimer = setInterval(() => void this.reconcileLostWebhooks(), KYC_RECONCILE_INTERVAL_MS);
    this.reconcileTimer.unref?.();
    this.expiryTimer = setInterval(() => void this.sweepExpiredIds(), KYC_ID_EXPIRY_INTERVAL_MS);
    this.expiryTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.startTimer) clearTimeout(this.startTimer);
    if (this.reconcileTimer) clearInterval(this.reconcileTimer);
    if (this.expiryTimer) clearInterval(this.expiryTimer);
  }

  /** One reconcile tick. Returns what it did, for tests and the log. Never throws. */
  async reconcileLostWebhooks(now: Date = new Date()): Promise<{ checked: number; applied: number }> {
    let checked = 0;
    let applied = 0;
    if (!this.reconcileEnabled || this.running) return { checked, applied };
    this.running = true;
    try {
      const page = await this.riders.kycReconcileCandidates(new Date(now.getTime() - KYC_RECONCILE_MIN_AGE_MS), KYC_RECONCILE_BATCH, this.cursor);
      this.cursor = page.length < KYC_RECONCILE_BATCH ? null : page[page.length - 1]!.profileId;
      for (const c of page) {
        checked++;
        try {
          if (await this.reconcileOne(c.kycRef, c.kycVendorStatus)) applied++;
        } catch (err) {
          this.logger.error(`KYC reconcile failed for session ${c.kycRef}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      if (applied > 0) this.logger.log(`KYC reconcile: applied ${applied} vendor result(s) whose webhook never arrived (KYC-R26-03)`);
    } catch (err) {
      this.logger.error(`KYC reconcile sweep failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.running = false;
    }
    return { checked, applied };
  }

  /**
   * Read one session's decision and apply it when it says something the row doesn't know yet. The decision
   * body is PII: it is passed straight to the shared path's extractors and never logged or kept.
   */
  private async reconcileOne(kycRef: string, storedStatus: string | null): Promise<boolean> {
    const raw = await this.vendor.sessionDecision?.(kycRef);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
    const body = raw as Record<string, unknown>;
    const status = typeof body.status === "string" && body.status.trim() ? body.status : null;
    if (!status) return false;
    const terminal = mapDiditStatus(status) !== "pending";
    const cls = classifyDiditSession(status);
    // Still in the rider's or the vendor's hands (Not Started, In Progress, Resubmitted…): nothing was lost.
    if (!terminal && cls !== "dead" && cls !== "held") return false;
    // A held / dead status we already recorded: nothing new to write (and no reason to bump the row).
    if (!terminal && storedStatus !== null && storedStatus === status) return false;
    // The decision endpoint returns the per-feature results at the TOP level; the webhook nests them under
    // `decision`. Hand the extractors the webhook shape either way.
    const payload = { ...body, decision: body.decision && typeof body.decision === "object" ? body.decision : body };
    const res = await applyDiditDecision(this.riders, this.logger, {
      sessionId: kycRef,
      status,
      payload,
      // The decision endpoint carries no delivery time; the read is when we learned it. kycResolvedAt is
      // null on every candidate, so the monotonic guard has nothing older to protect.
      eventAt: new Date(),
      source: "reconcile",
    });
    return typeof res.updated === "number" ? res.updated > 0 : res.verifiedIdStored === true || res.ignored === true;
  }

  /** One ID-expiry tick (KYC-R26-08). Never throws. */
  async sweepExpiredIds(now: Date = new Date()): Promise<{ expired: number }> {
    try {
      return await this.riders.expireLapsedIds(now);
    } catch (err) {
      this.logger.error(`ID-expiry sweep failed: ${err instanceof Error ? err.message : String(err)}`);
      return { expired: 0 };
    }
  }
}
