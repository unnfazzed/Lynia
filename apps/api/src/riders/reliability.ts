import { RELIABILITY, UndeliveredReason } from "@lynia/shared";

/** The two Rider columns the reliability engine reads + writes (Q2). Pure so it unit-tests cleanly
 *  and both order-lifecycle and rider cancel can reuse the exact same maths in-transaction. */
export interface ReliabilityState {
  reliabilityScore: number;
  onHold: boolean;
}

/**
 * Apply a reliability delta to a rider's score with clamp + `on_hold` hysteresis (Q2).
 *
 * NOTE(Q2): every weight/threshold lives in packages/shared/src/policy.ts `RELIABILITY` — no magic
 * numbers here. The score is clamped to [MIN, MAX]. `onHold` uses hysteresis so it can't flap at the
 * boundary: it TRIPS when the new score < ON_HOLD_BELOW and only CLEARS at >= ON_HOLD_CLEAR_AT;
 * between those two bounds the previous flag is sticky.
 */
export function applyReliabilityDelta(current: ReliabilityState, delta: number): ReliabilityState {
  const reliabilityScore = Math.min(RELIABILITY.MAX, Math.max(RELIABILITY.MIN, current.reliabilityScore + delta));
  let onHold = current.onHold;
  if (reliabilityScore < RELIABILITY.ON_HOLD_BELOW) onHold = true;
  else if (reliabilityScore >= RELIABILITY.ON_HOLD_CLEAR_AT) onHold = false;
  return { reliabilityScore, onHold };
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
