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
 * FRAUD P0-3 — undelivered-abandonment velocity guard. `markUndelivered(refused|wrong_address)` carries
 * no reliability penalty (those aren't the rider's fault), which a bad actor can exploit to abandon or
 * keep parcels for free. We deliberately DON'T punish the one-off legitimate failure; instead we
 * auto-`on_hold` a rider (for a human to review) only when their RECENT undelivered rate is abnormally
 * high — enough incidents in the window AND a high fraction of their finished hand-offs. NOTE (product):
 * tune the window / floor / rate here.
 */
export const UNDELIVERED_ABUSE = {
  /** Rolling window (days) the counts are measured over. */
  windowDays: 14,
  /** Minimum undelivered count in the window before the guard can trip (spares a brand-new rider's 1/1). */
  minCount: 3,
  /** AND at least this fraction of recent finished hand-offs (undelivered + completed) were undelivered. */
  rate: 0.5,
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
 * Rider commission — the revenue model (CONCEPT §6). Lynia takes a **percentage of the amount paid**
 * on each completed parcel delivery (per ride, inDrive-style, deducted from the rider's side — not a
 * customer surcharge).
 *
 * COLLECTION MODEL = **prepaid per-ride**: the rider pre-funds a commission account; when a ride
 * completes, {@link perRideCommission} is deducted from that balance. When the balance falls below
 * {@link COMMISSION.lowBalanceBlockBelow} the rider is gated from going online until they top up. This
 * is the ONLY commission model — it fully replaces the earlier post-paid weekly cash-settlement engine
 * (removed: no more `SETTLEMENT`/`commissionOn`, no weekly billing, refund-netting, record-payment or
 * overdue auto-pause). A prepaid float suits a cash, low-trust market: no per-rider credit risk, no
 * weekly collection/chasing, no negative balances.
 *
 * **ratePct is 0 for the launch period** (~6–8 months): riders keep the full agreed fare while the
 * pilot builds supply/demand/liquidity. Nothing is deducted at 0%. Product/finance calibrate the real
 * take-rate on corridor data before switching it on — change it here, in one place.
 *
 * SCOPE: the prepaid **wallet itself (balance ledger, top-ups, payment rails) is NOT built yet** — see
 * docs/plans/2026-biker-prepaid-commission.md. These constants define the rate and gating policy so
 * the deduction logic and UI copy can be written against a single source of truth ahead of that build.
 */
export const COMMISSION = {
  /** How commission is collected. `prepaid_per_ride` = deducted per completed ride from a pre-funded balance. */
  model: "prepaid_per_ride" as const,
  /** Commission as a percentage of the amount paid per ride. 0 during the launch period (nothing deducted). */
  ratePct: 0,
  /**
   * Minimum commission-account balance (USD) to stay online. Below this the rider is prompted to top up
   * and blocked from accepting new rides so the balance can't go negative. Unconfirmed assumption — tune.
   */
  lowBalanceBlockBelow: 2,
  /** Suggested minimum top-up (USD) — a floor for the (deferred) top-up flow. Unconfirmed assumption. */
  minTopUp: 5,
} as const;

/**
 * Commission owed on a single completed ride: {@link COMMISSION.ratePct} of the amount paid, 2dp.
 * At the launch rate (0%) this is 0, so no balance is touched. This is the per-ride amount the prepaid
 * account is debited by when the wallet ships.
 */
export function perRideCommission(amountPaid: number): number {
  return Math.round(amountPaid * (COMMISSION.ratePct / 100) * 100) / 100;
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
