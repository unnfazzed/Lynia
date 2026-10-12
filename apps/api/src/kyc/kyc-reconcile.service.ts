import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit, Optional } from "@nestjs/common";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { MetricsService } from "../observability/metrics.service";
import { RiderService } from "../riders/rider.service";
import { classifyDiditSession, mapDiditStatus } from "./didit";
import { applyDiditDecision } from "./didit-decision";
import { KycPendingStateService } from "./kyc-pending-state.service";
import { KYC_VENDOR, type KycVendor } from "./kyc-vendor";

/** How often the lost-webhook reconciler runs. A lost terminal webhook used to strand a rider `pending`
 *  forever; ten minutes is invisible next to that, and cheap at the batch size below. */
export const KYC_RECONCILE_INTERVAL_MS = 10 * 60 * 1000;
/** A check is only reconciled once its row has been quiet this long — well past the webhook's own delivery
 *  and retry window, so the sweep backstops a LOST webhook rather than racing a late one. */
export const KYC_RECONCILE_MIN_AGE_MS = 15 * 60 * 1000;
/** Vendor decision reads per tick. Bounded so a backlog can't fan out into hundreds of outbound calls at
 *  once; the oldest-first order and the back-off below walk the rest of the backlog on later ticks. */
export const KYC_RECONCILE_BATCH = 25;
/** The ID-expiry sweep (KYC-R26-08). Daily-ish is all the precision a document's expiry DAY needs; six hours
 *  keeps a deploy (which restarts the in-process timer) from ever pushing it past a day. */
export const KYC_ID_EXPIRY_INTERVAL_MS = 6 * 60 * 60 * 1000;
/** A read that decided nothing (the rider is mid-check, or the vendor didn't answer) is not re-read for this
 *  long, doubling per miss up to {@link KYC_RECONCILE_MAX_BACKOFF_MS} — so a check the rider abandoned
 *  half-way doesn't hold the head of the oldest-first queue and cost a vendor read every tick forever. */
export const KYC_RECONCILE_BACKOFF_MS = KYC_RECONCILE_INTERVAL_MS;
export const KYC_RECONCILE_MAX_BACKOFF_MS = 6 * 60 * 60 * 1000;
/** After the poll applied (or tried) a session's decision, the same session is not applied from a poll again
 *  for this long. The poll reads at most once per pending-state TTL anyway; this is the single-flight's tail. */
export const KYC_POLL_APPLY_COOLDOWN_MS = 60_000;
/** A pending check older than this is logged at warn by each tick (the gauge carries the exact age). */
const KYC_OLDEST_PENDING_WARN_MS = 6 * 60 * 60 * 1000;
/** Ceiling on the back-off / cooldown maps, so a burst of riders can't grow them without bound. */
const MAX_TRACKED = 5_000;

/**
 * KYC-R26-03 lost-webhook reconciliation + KYC-R26-08 ID-expiry sweep.
 *
 * Reconcile: a rider whose terminal Didit webhook never arrived (a delivery that exhausted its retries, a
 * secret rotation window, an outage on our side) sat `pending` forever — the vendor had decided, we never
 * heard. Two readers now catch it, and both apply the verdict through the SAME `applyDiditDecision` path the
 * webhook takes — face-match bands (score extracted from the decision payload), document dedupe/adoption, the
 * held-for-review store, Abandoned/Expired recorded as dead sessions (credentials cleared so the next retry
 * mints), and the R26-01/02 guards:
 *
 *  - the SWEEP: every {@link KYC_RECONCILE_INTERVAL_MS} it reads Didit's decision (`GET /v3/session/{id}/decision/`)
 *    for a bounded batch of checks pending on a session nobody resolved, quiet for {@link KYC_RECONCILE_MIN_AGE_MS},
 *    oldest-waiting first. A read that decides nothing backs off (in memory, per session) instead of being
 *    re-read every tick;
 *  - the POLL: the rider's own `/auth/me` already reads the session's decision while they wait on the gate
 *    (KycPendingStateService). When that read sees a DECIDED status (Approved / Declined / Kyc Expired / In
 *    Review) on a rider still `pending`, the verdict is applied from that same body — no second vendor call —
 *    fire-and-forget, single-flight per session with a short cooldown. The rider no longer waits up to a sweep
 *    interval for a decision Didit made seconds ago.
 *
 * Only in `didit` + `auto` mode, with a vendor that can read decisions.
 *
 * Multi-instance: no leader lock, deliberately — the same choice as OfferExpiryService's reconciler. Every
 * write this makes is idempotent at the row: applyKycResult takes the rider row lock, a repeat outcome is a
 * no-op (KYC-R26-01), a human decision is never overturned (KYC-R26-02), and the held/vendor-status writes are
 * guarded on the check still being undecided. Two instances (or the poll and the webhook) applying together
 * cost a duplicate read, never a double decision. Each instance starts at a random offset.
 *
 * Never throws out of a timer or a poll: each tick is wrapped whole, and each rider inside it.
 */
@Injectable()
export class KycReconcileService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KycReconcileService.name);
  private reconcileTimer?: ReturnType<typeof setInterval>;
  private expiryTimer?: ReturnType<typeof setInterval>;
  private startTimer?: ReturnType<typeof setTimeout>;
  private running = false;
  /** Per session: when the sweep may read it again after a read that decided nothing, and how many misses. */
  private readonly backoff = new Map<string, { until: number; misses: number }>();
  /** Sessions the poll is applying right now (single-flight), and when each may be applied from a poll again. */
  private readonly pollInFlight = new Set<string>();
  private readonly pollCooldown = new Map<string, number>();

  constructor(
    private readonly riders: RiderService,
    @Inject(KYC_VENDOR) private readonly vendor: KycVendor,
    @Inject(ENV) private readonly env: Env,
    // Both always injected in the app (KycModule is imported by RidersModule; ObservabilityModule is @Global).
    // Optional so the positional spec constructions stay valid.
    @Optional() private readonly pendingStates?: KycPendingStateService,
    @Optional() private readonly metrics?: MetricsService,
  ) {}

  private get reconcileEnabled(): boolean {
    return this.env.KYC_PROVIDER === "didit" && this.env.KYC_MODE === "auto" && typeof this.vendor.sessionDecision === "function";
  }

  onModuleInit(): void {
    // The poll's decided reads come here. Registered only when the reconciler runs at all (didit + auto).
    if (this.reconcileEnabled) {
      this.pendingStates?.onDecisionRead((ref, status, decision) => void this.reconcileFromPoll(ref, status, decision));
    }
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
      await this.observeOldestPending(now);
      const page = await this.riders.kycReconcileCandidates(
        new Date(now.getTime() - KYC_RECONCILE_MIN_AGE_MS),
        KYC_RECONCILE_BATCH,
        this.backedOffRefs(now.getTime()),
      );
      for (const c of page) {
        checked++;
        let done = false;
        try {
          done = await this.reconcileOne(c.kycRef, c.kycVendorStatus);
        } catch (err) {
          this.logger.error(`KYC reconcile failed for session ${c.kycRef}: ${err instanceof Error ? err.message : String(err)}`);
        }
        if (done) {
          applied++;
          this.backoff.delete(c.kycRef);
        } else {
          this.backOff(c.kycRef, now.getTime());
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
   * Apply a DECIDED status the rider's own `/auth/me` poll read (KycPendingStateService.onDecisionRead), from
   * that read's body. Fire-and-forget from the poll: never throws, and the poll never waits on it.
   * Single-flight per session, then a {@link KYC_POLL_APPLY_COOLDOWN_MS} cooldown, so a burst of polls can't
   * queue the same decision N times. Returns whether a decision was written (for tests).
   */
  async reconcileFromPoll(kycRef: string, status: string, decision: unknown): Promise<boolean> {
    if (!this.reconcileEnabled) return false;
    const now = Date.now();
    if (this.pollInFlight.has(kycRef) || (this.pollCooldown.get(kycRef) ?? 0) > now) return false;
    this.pollInFlight.add(kycRef);
    try {
      const body = decision && typeof decision === "object" && !Array.isArray(decision) ? (decision as Record<string, unknown>) : { status };
      const res = await this.applyRead(kycRef, { ...body, status }, "poll");
      if (res.decided) this.logger.log(`KYC poll for session ${kycRef}: applied a ${status} whose webhook hadn't arrived`);
      return res.decided;
    } catch (err) {
      this.logger.error(`KYC poll reconcile failed for session ${kycRef}: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    } finally {
      this.pollInFlight.delete(kycRef);
      this.trim(this.pollCooldown, now);
      this.pollCooldown.set(kycRef, Date.now() + KYC_POLL_APPLY_COOLDOWN_MS);
    }
  }

  /**
   * Read one session's decision and apply it when it says something the row doesn't know yet. The decision
   * body is PII: it is passed straight to the shared path's extractors and never logged or kept.
   */
  private async reconcileOne(kycRef: string, storedStatus: string | null): Promise<boolean> {
    const raw = await this.vendor.sessionDecision?.(kycRef);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
    return (await this.applyRead(kycRef, raw as Record<string, unknown>, "sweep", storedStatus)).written;
  }

  /**
   * The shared half of the sweep and the poll: one decision body → applyDiditDecision. `written` is whether
   * anything was recorded (a decision, a dead/held vendor status); `decided` whether a verdict was applied.
   */
  private async applyRead(
    kycRef: string,
    body: Record<string, unknown>,
    via: "sweep" | "poll",
    storedStatus: string | null = null,
  ): Promise<{ written: boolean; decided: boolean }> {
    const none = { written: false, decided: false };
    const status = typeof body.status === "string" && body.status.trim() ? body.status : null;
    if (!status) return none;
    const terminal = mapDiditStatus(status) !== "pending";
    const cls = classifyDiditSession(status);
    // Still in the rider's or the vendor's hands (Not Started, In Progress, Resubmitted…): nothing was lost.
    if (!terminal && cls !== "dead" && cls !== "held") return none;
    // A dead status we already recorded: nothing new to write (and no reason to bump the row). KYC-R26-12: a
    // HELD one (In Review) is no longer left for a human — decideDiditKyc declines it — so it is applied even
    // when the row already recorded it. That is what drains a rider stored as In Review before the decision
    // went fully automatic: no reviewer will ever move that session, so no webhook will come for it.
    if (!terminal && cls !== "held" && storedStatus !== null && storedStatus === status) return none;
    // The decision endpoint returns the per-feature results at the TOP level; the webhook nests them under
    // `decision`. Hand the extractors the webhook shape either way.
    const payload = { ...body, decision: body.decision && typeof body.decision === "object" ? body.decision : body };
    const res = await applyDiditDecision(this.riders, this.logger, {
      sessionId: kycRef,
      status,
      payload,
      // The decision endpoint carries no delivery time; the read is when we learned it. A candidate's
      // kycResolvedAt is null, and a poll only reads a still-pending rider, so the monotonic guard has nothing
      // newer to protect — and the R26-01 repeat guard turns a racing webhook for the same outcome into a no-op.
      eventAt: new Date(),
      source: "reconcile",
      onUnmatched: () => this.metrics?.incKycDecisionUnmatched(via),
    });
    const decided = typeof res.updated === "number" && res.updated > 0;
    if (decided) this.metrics?.incKycReconcileApplied(via);
    return { written: decided || res.verifiedIdStored === true || res.ignored === true, decided };
  }

  /** The sessions the sweep must skip this tick: still backing off after a read that decided nothing. */
  private backedOffRefs(now: number): string[] {
    this.trim(this.backoff, now);
    return [...this.backoff].filter(([, b]) => b.until > now).map(([ref]) => ref);
  }

  private backOff(kycRef: string, now: number): void {
    const misses = (this.backoff.get(kycRef)?.misses ?? 0) + 1;
    const wait = Math.min(KYC_RECONCILE_BACKOFF_MS * 2 ** (misses - 1), KYC_RECONCILE_MAX_BACKOFF_MS);
    this.backoff.set(kycRef, { until: now + wait, misses });
  }

  /** Bound a tracking map: drop expired entries, then the oldest-inserted, until there is room for one more. */
  private trim<V>(map: Map<string, V>, now: number): void {
    if (map.size < MAX_TRACKED) return;
    for (const [k, v] of map) {
      const until = typeof v === "number" ? v : (v as { until: number }).until;
      if (until <= now) map.delete(k);
    }
    while (map.size >= MAX_TRACKED) {
      const oldest = map.keys().next();
      if (oldest.done) break;
      map.delete(oldest.value);
    }
  }

  /** How long the oldest pending check has waited: a gauge every tick, and a warn line once it is hours old. */
  private async observeOldestPending(now: Date): Promise<void> {
    try {
      const since = await this.riders.kycOldestPendingSince();
      const ageMs = since ? Math.max(now.getTime() - since.getTime(), 0) : null;
      this.metrics?.recordKycOldestPendingAge(ageMs === null ? null : Math.round(ageMs / 1000));
      if (ageMs !== null && ageMs > KYC_OLDEST_PENDING_WARN_MS) {
        this.logger.warn(`KYC: the oldest pending check has waited ${Math.round(ageMs / 3_600_000)}h (kyc_oldest_pending_age_seconds)`);
      }
    } catch (err) {
      this.logger.warn(`KYC oldest-pending read failed: ${err instanceof Error ? err.message : String(err)}`);
    }
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
