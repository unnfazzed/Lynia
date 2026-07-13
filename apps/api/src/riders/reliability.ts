import { HeldReason, RELIABILITY, UNDELIVERED_ABUSE, UndeliveredReason } from "@lynia/shared";

/** The Rider columns the reliability engine reads + writes (Q2). Pure so it unit-tests cleanly and
 *  both order-lifecycle and rider cancel can reuse the exact same maths in-transaction. `heldReason`
 *  (RH-01) records WHY the rider is held so the score hysteresis never releases a velocity/fraud hold. */
export interface ReliabilityState {
  reliabilityScore: number;
  onHold: boolean;
  heldReason: HeldReason;
}

/**
 * Apply a reliability delta to a rider's score with clamp + `on_hold` hysteresis (Q2).
 *
 * NOTE(Q2): every weight/threshold lives in packages/shared/src/policy.ts `RELIABILITY` — no magic
 * numbers here. The score is clamped to [MIN, MAX]. `onHold` uses hysteresis so it can't flap at the
 * boundary: it TRIPS when the new score < ON_HOLD_BELOW and only CLEARS at >= ON_HOLD_CLEAR_AT;
 * between those two bounds the previous flag is sticky.
 *
 * RH-01 (DEEP-SWEEP-2026-07-13): `heldReason` distinguishes a self-recovering score hold from the FRAUD
 * P0-3 velocity/fraud hold (#198). On a TRIP we stamp `reliability` but never DOWNGRADE an existing
 * `velocity` hold. On the CLEAR branch we release ONLY when the hold is NOT `velocity` — a velocity hold
 * must survive score recovery and be lifted solely by an explicit admin clear-hold, otherwise the next
 * completion/rating recovery silently un-holds an abusive rider whose penalty-free reasons kept the
 * score high (the RH-01 self-clear bug). A legacy `null` hold stays score-clearable, as before.
 */
export function applyReliabilityDelta(current: ReliabilityState, delta: number): ReliabilityState {
  const reliabilityScore = Math.min(RELIABILITY.MAX, Math.max(RELIABILITY.MIN, current.reliabilityScore + delta));
  let onHold = current.onHold;
  let heldReason = current.heldReason;
  if (reliabilityScore < RELIABILITY.ON_HOLD_BELOW) {
    onHold = true;
    // A score-driven trip. Don't clobber an already-set velocity/fraud hold down to "reliability".
    heldReason = heldReason ?? HeldReason.RELIABILITY;
  } else if (reliabilityScore >= RELIABILITY.ON_HOLD_CLEAR_AT) {
    // RH-01: score-hysteresis clears a "reliability" (or legacy null) hold only. A "velocity" hold is
    // score-independent (#198) and must NOT evaporate on recovery — only admin clear-hold releases it.
    if (heldReason !== HeldReason.VELOCITY) {
      onHold = false;
      heldReason = null;
    }
  }
  return { reliabilityScore, onHold, heldReason };
}

/**
 * Reliability penalty (a POSITIVE magnitude) for a failed hand-off (`markUndelivered`), keyed off the
 * reason (Q2):
 *  - `breakdown` → a post-pickup rider bail/mechanical failure → `postPickupCancel` (the parcel was
 *    already on the bike — the worst kind of drop).
 *  - `unreachable` → the recipient was a no-show at the door → `noShow`.
 *  - `refused` / `wrong_address` → not the rider's fault (recipient refused, or the customer gave a
 *    bad address) → no reliability hit.
 * Returns 0 (no delta) for the not-rider-fault reasons.
 */
export function undeliveredPenalty(reason: string): number {
  if (reason === UndeliveredReason.BREAKDOWN) return RELIABILITY.PENALTY.postPickupCancel;
  if (reason === UndeliveredReason.UNREACHABLE) return RELIABILITY.PENALTY.noShow;
  return 0;
}

/**
 * FRAUD P0-3 velocity guard: should this rider be auto-held for review given their recent hand-off
 * history? Trips only when there are ENOUGH undelivered incidents in the window (`minCount` — so a
 * brand-new rider's single failure can't trip it) AND they are a HIGH FRACTION of finished hand-offs
 * (`rate` — so a high-volume rider with a few genuine failures is spared). The penalty-free
 * `refused`/`wrong_address` reasons don't dent the score, so this rate check is the only thing that ever
 * catches a rider serially abandoning parcels for free. Pure so it unit-tests cleanly; the caller passes
 * the two counts (the current undelivered already included). `completedCount` is the window denominator.
 */
export function shouldFlagUndeliveredVelocity(undeliveredCount: number, completedCount: number): boolean {
  if (undeliveredCount < UNDELIVERED_ABUSE.minCount) return false;
  const total = undeliveredCount + completedCount;
  if (total === 0) return false;
  return undeliveredCount / total >= UNDELIVERED_ABUSE.rate;
}
