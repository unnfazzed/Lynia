/**
 * Product-policy defaults — the four blocking product decisions (Q1/Q2, Didit, A-06) encoded as
 * documented, tunable constants so the code that depends on them can ship. These are LAUNCH
 * ASSUMPTIONS chosen to be reasonable, not final policy; product/finance should confirm each and can
 * change a value here in one place. Every consumer imports from this module — no magic numbers.
 *
 * Sources: packages/design/HANDOFF.md (admin A-06 assumptions, Didit ≥0.85), BACKLOG-PLAN.md
 * (Q1 corridor, Q2 reliability), RIDER-JOURNEY-AUDIT.md (R-01 reliability).
 */

/**
 * Q2 — Rider reliability score. A rider starts at {@link RELIABILITY.START}; events adjust it, and
 * dropping below {@link RELIABILITY.ON_HOLD_BELOW} trips an auto `on_hold` (blocks going online until
 * recovered). Clean deliveries slowly recover it. Pre- vs post-pickup cancels differ: bailing with the
 * parcel already on the bike is worse. NOTE (product Q2): the exact weights + threshold are the
 * decision to confirm — tune here.
 */
export const RELIABILITY = {
  START: 100,
  MIN: 0,
  MAX: 100,
  PENALTY: {
    prePickupCancel: 5,
    postPickupCancel: 15,
    noShow: 15,
    lowRating: 10,
  },
  /** A delivered-trip rating at or below this counts as a low rating. */
  LOW_RATING_AT: 3,
  /** Score strictly below this trips `on_hold` (rider blocked from going online). */
  ON_HOLD_BELOW: 60,
  /** Score at or above this clears `on_hold` again (hysteresis so it doesn't flap at the boundary). */
  ON_HOLD_CLEAR_AT: 70,
  /** Reliability regained per clean completed delivery (slow recovery). */
  RECOVER_PER_COMPLETION: 2,
} as const;

/**
 * KYC (Didit) face-match auto-decision thresholds, score in [0,1]. ≥ autoApprove → auto-verify;
 * [needsReview, autoApprove) → hold for a human reviewer; < needsReview → auto-decline. NOTE
 * (product): confirm the real thresholds and what a human reviewer may override.
 */
export const KYC_THRESHOLDS = {
  autoApprove: 0.85,
  needsReview: 0.6,
} as const;

/**
 * Q1 — Launch service corridor. A single coverage disc for the Harare pilot: an order whose pickup OR
 * drop-off falls outside {@link SERVICE_CORRIDOR.radiusKm} of the centre is out of area. NOTE
 * (product Q1): replace with the real coverage boundary (likely a polygon) before launch.
 */
export const SERVICE_CORRIDOR = {
  centerLat: -17.8292,
  centerLng: 31.0522,
  radiusKm: 25,
} as const;

/**
 * A-06 — Cash settlement engine. Riders collect fares in cash; Lynia bills a weekly commission.
 * ALL of these are unconfirmed assumptions from the design kit — product/finance MUST confirm the
 * rate, cycle, netting and auto-pause before this is treated as policy (surfaced as a caveat in the
 * admin cash console).
 */
export const SETTLEMENT = {
  /** Commission as a percentage of agreed fares on completed orders. */
  commissionPct: 15,
  /** Settlement cadence + the weekday the period closes / payment is due (0=Sun … 5=Fri … 6=Sat). */
  cycle: "weekly" as const,
  settleWeekday: 5,
  /** Refunds owed to customers are netted off the rider's commission before billing. */
  netRefunds: true,
  /** A settlement this many days past its due date auto-pauses (suspends) the rider account. */
  overduePauseDays: 7,
} as const;

/** Compute commission on a gross-fares total using the configured rate. Returns a 2dp number. */
export function commissionOn(grossFares: number): number {
  return Math.round(grossFares * (SETTLEMENT.commissionPct / 100) * 100) / 100;
}

/**
 * Q3 — SOS behaviour on a live trip (R-16/F-13). What the button does: surface the local emergency
 * number, offer the Lynia safety line, log the event + push to ops for follow-up. **RESOLVED 5 Jul 2026**
 * (product decision Q3): both numbers are FINAL, client-side constants so the SOS control works offline —
 * a safety control must never dead-end on the network. `emergencyNumber` is Zimbabwe's 999; `safetyLine`
 * reaches the staffed Lynia safety team and is also the `tel:` target for the "contact support" rows on
 * the rider dead-end/gate states. A deploy can still override the safety line via the `SOS_SAFETY_LINE`
 * env, but the constant is the default (no fallback to the emergency number).
 */
export const SOS_POLICY = {
  emergencyNumber: "999",
  /** Staffed Lynia safety line — the final launch number, dialled as a `tel:` for SOS + support rows. */
  safetyLine: "+263 77 883 1938",
  /** Env var a deploy can set to override {@link SOS_POLICY.safetyLine}; the constant is the default. */
  safetyLineEnv: "SOS_SAFETY_LINE",
  /** Notify ops + the counterparty when an SOS is raised. */
  notifyOps: true,
} as const;

/** Rider strikes that trip an auto-cooldown (mirrors the lifecycle CANCEL_STRIKE_LIMIT). A
 *  `rider_strike` issue resolution increments the strike count toward this. */
export const RIDER_STRIKE_LIMIT = 3;
