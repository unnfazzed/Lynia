import { Inject, Injectable, Logger } from "@nestjs/common";
import type { ServerKycPendingState } from "./kyc-pending-state";
import { KYC_VENDOR, type KycVendor } from "./kyc-vendor";

/**
 * How long a derived pending-state is reused before the vendor is asked again.
 *
 * The rider board polls `/auth/me` every 5s while a check is pending (an unverified rider is sitting
 * on the gate watching for it to clear), so an uncached read would put 12 outbound calls per minute
 * per waiting rider on the vendor — for a value that changes at human speed. 15s keeps the screen
 * responsive (worst case one stale poll) at one vendor call per 15s per rider.
 */
export const KYC_PENDING_STATE_TTL_MS = 15_000;

/** Ceiling on cached entries, so a burst of onboarding riders can't grow this map without bound. */
const MAX_ENTRIES = 5_000;

interface CacheEntry {
  state: ServerKycPendingState;
  expiresAt: number;
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
  private readonly inFlight = new Map<string, Promise<ServerKycPendingState>>();

  constructor(@Inject(KYC_VENDOR) private readonly vendor: KycVendor) {}

  /**
   * The pending state for a live session ref, or `unfinished` when it cannot be established.
   * Call ONLY for a rider whose `kycStatus` is actually `pending` — the state is meaningless
   * otherwise, and asking wastes a vendor call on a rider who is already through the gate.
   */
  async get(ref: string | null | undefined): Promise<ServerKycPendingState> {
    if (!ref || !this.vendor.pendingState) return "unfinished";

    const now = Date.now();
    const hit = this.cache.get(ref);
    if (hit && hit.expiresAt > now) return hit.state;

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

  private async load(ref: string): Promise<ServerKycPendingState> {
    let state: ServerKycPendingState = "unfinished";
    try {
      // Non-null asserted by the `get` guard above; re-read so a vendor swap mid-flight can't NPE.
      state = (await this.vendor.pendingState?.(ref)) ?? "unfinished";
    } catch (err) {
      // The vendor contract says this never throws; if one ever does, that is its bug, not a reason
      // to fail the rider's profile read.
      this.logger.debug(`pendingState threw, defaulting to unfinished: ${err instanceof Error ? err.message : String(err)}`);
      state = "unfinished";
    }
    // A failed read is cached too, deliberately: it stops a vendor outage turning every 5s poll into
    // another outbound attempt, and it costs at most one TTL of staleness once the vendor recovers.
    this.remember(ref, state);
    return state;
  }

  private remember(ref: string, state: ServerKycPendingState): void {
    const now = Date.now();
    if (this.cache.size >= MAX_ENTRIES) {
      for (const [k, v] of this.cache) if (v.expiresAt <= now) this.cache.delete(k);
      // Still full after dropping the expired: evict oldest-inserted (Map preserves insertion order)
      // until there is room. Approximate, and that is fine — the worst case is one extra vendor call.
      while (this.cache.size >= MAX_ENTRIES) {
        const oldest = this.cache.keys().next();
        if (oldest.done) break;
        this.cache.delete(oldest.value);
      }
    }
    this.cache.set(ref, { state, expiresAt: now + KYC_PENDING_STATE_TTL_MS });
  }
}
