import { Inject, Injectable, Logger } from "@nestjs/common";
import { classifyDiditSession, type DiditSessionClass } from "./didit";
import type { ServerKycPendingState } from "./kyc-pending-state";
import { KYC_VENDOR, type KycVendor } from "./kyc-vendor";

/**
 * How long a derived pending-state is reused before the vendor is asked again.
 *
 * The rider board polls `/auth/me` while a check is pending (an unverified rider is sitting on the gate
 * watching for it to clear), so an uncached read would put an outbound call on the vendor per poll per
 * waiting rider — for a value that changes at human speed. 15s keeps the screen responsive (worst case
 * one stale poll) at one vendor call per 15s per rider. The cache is also invalidated when the state is
 * known to have moved (a launch starts or completes, a webhook lands — R-4), so the TTL only bounds the
 * cost, never how long a known change goes unseen.
 */
export const KYC_PENDING_STATE_TTL_MS = 15_000;

/** Ceiling on cached entries, so a burst of onboarding riders can't grow this map without bound. */
const MAX_ENTRIES = 5_000;

/** The cached answer: the session's class (held / dead are the R-1 / R-3 refinements of the two states). */
interface CacheEntry {
  cls: DiditSessionClass;
  expiresAt: number;
}

/** The two-value pending state older apps read, from the finer class. */
export function pendingStateOf(cls: DiditSessionClass): ServerKycPendingState {
  // A held check is still "with the vendor" for an app that can't draw the hold (the additive `kycHeld`
  // flag is the new app's signal); a dead session is the rider's move — the next tap mints a fresh one.
  return cls === "in_flight" || cls === "held" ? "in_flight" : "unfinished";
}

/**
 * Derives `rider.kycPendingState` (P0-1 / D6) and shields the vendor from the gate screen's poll.
 *
 * Two properties this exists for, neither of which belongs inline in `getProfile`:
 *
 *   1. **Coalescing + TTL.** See {@link KYC_PENDING_STATE_TTL_MS}. Concurrent callers for the same
 *      session share one outbound call rather than each starting their own.
 *   2. **Fail-soft.** This sits on the rider's own profile read. Every failure path — no vendor
 *      support, a vendor throw, a missing ref — resolves to `unfinished`, the documented safe
 *      default: a needless "Finish verifying" tap costs one tap, while withholding the resume from
 *      a rider who cancelled strands them behind the gate with nothing to press.
 */
@Injectable()
export class KycPendingStateService {
  private readonly logger = new Logger(KycPendingStateService.name);
  private readonly cache = new Map<string, CacheEntry>();
  /** Sessions with a call already out — joined rather than duplicated. */
  private readonly inFlight = new Map<string, Promise<DiditSessionClass>>();

  constructor(@Inject(KYC_VENDOR) private readonly vendor: KycVendor) {}

  /**
   * The pending state for a live session ref, or `unfinished` when it cannot be established.
   * Call ONLY for a rider whose `kycStatus` is actually `pending` — the state is meaningless
   * otherwise, and asking wastes a vendor call on a rider who is already through the gate.
   */
  async get(ref: string | null | undefined): Promise<ServerKycPendingState> {
    return pendingStateOf(await this.read(ref));
  }

  /**
   * The session's class (in_flight / unfinished / held / dead), cached and coalesced exactly like `get`.
   * Both share one cache entry per ref, so it is one vendor call per rider per TTL whichever is asked.
   */
  async read(ref: string | null | undefined): Promise<DiditSessionClass> {
    if (!ref || (!this.vendor.sessionStatus && !this.vendor.pendingState)) return "unfinished";

    const now = Date.now();
    const hit = this.cache.get(ref);
    if (hit && hit.expiresAt > now) return hit.cls;

    const existing = this.inFlight.get(ref);
    if (existing) return existing;

    const call = this.load(ref);
    this.inFlight.set(ref, call);
    try {
      return await call;
    } finally {
      this.inFlight.delete(ref);
    }
  }

  /**
   * Forget the cached answer for a session, so the next read asks the vendor (R-4). Called when the
   * session's state is known to have moved: a launch starts or completes, or a decision lands.
   */
  invalidate(ref: string | null | undefined): void {
    if (!ref) return;
    this.cache.delete(ref);
  }

  /**
   * A signed status webhook for this session just arrived — the vendor's own word. Cache its class as the
   * fresh answer rather than asking the vendor again for what it just told us.
   */
  prime(ref: string | null | undefined, vendorStatus: string): void {
    if (!ref) return;
    this.remember(ref, classifyDiditSession(vendorStatus));
  }

  private async load(ref: string): Promise<DiditSessionClass> {
    let cls: DiditSessionClass = "unfinished";
    try {
      if (this.vendor.sessionStatus) {
        cls = classifyDiditSession(await this.vendor.sessionStatus(ref));
      } else {
        // A vendor with only the two-value read: it can't say held or dead, so it never does.
        cls = (await this.vendor.pendingState?.(ref)) ?? "unfinished";
      }
    } catch (err) {
      // The vendor contract says this never throws; if one ever does, that is its bug, not a reason
      // to fail the rider's profile read.
      this.logger.debug(`pending-state read threw, defaulting to unfinished: ${err instanceof Error ? err.message : String(err)}`);
      cls = "unfinished";
    }
    // A failed read is cached too, deliberately: it stops a vendor outage turning every poll into
    // another outbound attempt, and it costs at most one TTL of staleness once the vendor recovers.
    this.remember(ref, cls);
    return cls;
  }

  private remember(ref: string, cls: DiditSessionClass): void {
    const now = Date.now();
    if (this.cache.size >= MAX_ENTRIES && !this.cache.has(ref)) {
      for (const [k, v] of this.cache) if (v.expiresAt <= now) this.cache.delete(k);
      // Still full after dropping the expired: evict oldest-inserted (Map preserves insertion order)
      // until there is room. Approximate, and that is fine — the worst case is one extra vendor call.
      while (this.cache.size >= MAX_ENTRIES) {
        const oldest = this.cache.keys().next();
        if (oldest.done) break;
        this.cache.delete(oldest.value);
      }
    }
    this.cache.set(ref, { cls, expiresAt: now + KYC_PENDING_STATE_TTL_MS });
  }
}
