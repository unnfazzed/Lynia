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
 * RH-01 (DEEP-SWEEP-2026-07-13) — WHY a rider is currently `on_hold`, persisted so the score
 * hysteresis in `applyReliabilityDelta` can tell the two hold kinds apart:
 *  - `reliability` — a SCORE-based hold (score dropped below {@link RELIABILITY.ON_HOLD_BELOW}). It is
 *    meant to self-recover: once the score climbs back to {@link RELIABILITY.ON_HOLD_CLEAR_AT} the hold
 *    clears automatically.
 *  - `velocity` — the FRAUD P0-3 velocity/fraud hold (#198), set independently of the score (fires even
 *    when the reason carries no penalty). It must NOT self-clear on a score recovery — only an explicit
 *    admin clear-hold releases it — otherwise the next completion/rating recovery silently un-holds an
 *    abusive rider (the RH-01 self-clear bug).
 * `null` (column absent) means the rider is not held, OR a legacy `on_hold` row from before this column
 * existed — those keep the pre-RH-01 behaviour (score-clearable). Stored as the string value in
 * `riders.held_reason`; keep in lockstep with the Prisma `String?` column.
 */
export const HeldReason = {
  RELIABILITY: "reliability",
  VELOCITY: "velocity",
} as const;
/** A persisted hold reason, or `null` when the rider is not held (or a legacy pre-column hold). */
export type HeldReason = (typeof HeldReason)[keyof typeof HeldReason] | null;

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
  /**
   * DEFAULT commission rate as a percentage of the amount paid per ride — the bundled fallback the
   * mobile app reads OFFLINE. `0` during the launch period (nothing deducted). **This is never the
   * authoritative rate at runtime:** the server resolves the live rate from the `COMMISSION_RATE_PCT`
   * env override ({@link resolveCommissionRatePct}) and hands it to every client in the `/wallet/config`
   * payload (design decision 2A — server-authoritative rate). The "flip" (0 → e.g. 10) is that env
   * change, not a code deploy. Nothing else in the codebase may hardcode a percentage — read the
   * resolved rate instead.
   */
  ratePct: 0,
  /**
   * Minimum commission-account balance (USD) to stay online. Below this a rider on a >0% rate is
   * prompted to top up and blocked from going online (the gate stops the NEXT ride, never a parcel
   * already delivered). Unconfirmed assumption — tune before the flip.
   */
  lowBalanceBlockBelow: 2,
  /** Minimum top-up (USD) — the floor for the top-up flow, and the per-active-rider grace credit size. */
  minTopUp: 5,
  /** Maximum top-up (USD) per request — clamps a single prepaid deposit. */
  maxTopUp: 50,
  /**
   * Grace / starting credit (USD) granted once per active rider at the flip, so flip day doesn't
   * instantly gate the whole fleet offline at a $0 balance below the floor. Equals {@link COMMISSION.minTopUp}.
   */
  graceCredit: 5,
  /**
   * WD-012 (docs/KNOWN_BUGS.md DOC-16-04 / docs/FRAUD-REVIEW.md P0-2): the COMMISSION-BASIS floor, as a
   * fraction of `suggestedFare` (the system's own fair-price anchor — see pricing.ts). `agreedFare` is
   * copied verbatim from the rider's `offeredFare`, whose only bound is "positive, ≤ 100000, 2dp" — a
   * colluding customer+rider pair could agree the real fare off-app and record a near-zero `offeredFare`
   * to owe near-zero commission once the rate is live (dormant only while `ratePct` is 0). Commission is
   * billed on `max(agreedFare, basisFloorPct × suggestedFare)` — see {@link commissionBasis} — so the
   * rider still keeps/pays the real `agreedFare`; only the commission CALCULATION is floored. Chosen
   * conservatively (well below typical accepted-bid range) so genuine negotiated discounts are never
   * penalized — tune before the flip.
   */
  basisFloorPct: 0.5,
} as const;

/** Env var a deploy sets to override {@link COMMISSION.ratePct} at runtime — the "flip" operation. */
export const COMMISSION_RATE_PCT_ENV = "COMMISSION_RATE_PCT";

/**
 * Resolve the effective commission rate (%) from an optional env override, clamped to a sane [0,100]
 * and defaulting to {@link COMMISSION.ratePct} when unset/blank/invalid. This is the ONE place the
 * "flip" is interpreted — the API calls it at startup and serves the result to every client, so a
 * malformed override can never silently charge a wrong rate. A negative or non-numeric value falls
 * back to the launch default rather than throwing (fail-safe: never accidentally over-charge).
 *
 * WD-010: rounded to 2dp — `CommissionLedger.ratePct` is `Decimal(5,2)`, so an override with more
 * precision (e.g. an ops typo like "12.345") would otherwise be served to clients/used in the per-ride
 * calculation at full precision while silently truncating on write to each ride's receipt row.
 */
export function resolveCommissionRatePct(raw: string | number | undefined | null): number {
  if (raw === undefined || raw === null || raw === "") return COMMISSION.ratePct;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 0) return COMMISSION.ratePct;
  return Math.round(Math.min(100, n) * 100) / 100;
}

/** Whether commission is switched on — a strictly positive rate. At 0 nothing is debited and the
 *  low-balance gate must never fire (see the gate guard in the API online-gate). */
export function isCommissionActive(ratePct: number): boolean {
  return ratePct > 0;
}

/**
 * Commission owed on a single completed ride: `ratePct` of the amount paid, 2dp. At the launch rate
 * (0%) this is 0, so no balance is touched. Pass the resolved server rate (never assume the bundled
 * constant); it defaults to {@link COMMISSION.ratePct} only for callers that predate the flip override.
 */
export function perRideCommission(amountPaid: number, ratePct: number = COMMISSION.ratePct): number {
  return Math.round(amountPaid * (ratePct / 100) * 100) / 100;
}

/**
 * WD-012: the commission BASIS for a ride — `max(agreedFare, {@link COMMISSION.basisFloorPct} ×
 * suggestedFare)`. `suggestedFare` is `null`/`undefined`/non-finite/non-positive for a data anomaly (or
 * a legacy order predating the field) — falls back to the raw `agreedFare` unfloored rather than
 * throwing, matching {@link perRideCommission}'s fail-safe posture (never block a completion). Pass the
 * result into {@link perRideCommission} in place of the raw fare; never the raw fare directly once a
 * `suggestedFare` is available.
 */
export function commissionBasis(agreedFare: number, suggestedFare: number | null | undefined): number {
  if (suggestedFare == null || !Number.isFinite(suggestedFare) || suggestedFare <= 0) return agreedFare;
  const floor = Math.round(suggestedFare * COMMISSION.basisFloorPct * 100) / 100;
  return Math.max(agreedFare, floor);
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

/**
 * Customer trust tier for reputation weighting (FRAUD P1-6 residual / KB-IDENTITY-BINDING, demand side).
 *
 * The per-pair cap ({@link OrderLifecycleService.rate}) already stops ONE colluding customer+rider pair
 * from farming a rider's reputation. The remaining vector is MANY DISTINCT customer accounts each rating
 * a rider once — cheap because identity is phone-only (a SIM per sock-puppet; see the open
 * `KB-IDENTITY-BINDING` item for the identity-cost side). This tier de-weaponises that: a customer's
 * rating only moves a rider's public aggregate (ratingAvg/ratingCount) AND the rider's reliability score
 * once the customer is *established* — i.e. has completed at least this many orders as a customer. Below
 * the threshold the rating is still recorded (history + the one-per-order unique + ops visibility) but
 * carries ZERO weight in BOTH directions, which also closes the mirror Sybil-DOWNVOTE attack (spinning up
 * fresh accounts to 1-star a competitor's rider). Combined effect: to move a rider's reputation you now
 * need many DISTINCT and ESTABLISHED customers — each sock-puppet must first complete real deliveries,
 * which is the friction that makes the farm uneconomic.
 */
export const CUSTOMER_TRUST = {
  /** Completed orders (as a customer) required before this customer's ratings carry reputation weight. */
  minCompletedOrders: 3,
} as const;

/** Whether a customer with this many prior completed orders is "established" enough for their rating to
 *  carry weight toward a rider's public aggregate + reliability (FRAUD P1-6 residual). */
export function customerRatingCarriesWeight(priorCompletedOrders: number): boolean {
  return priorCompletedOrders >= CUSTOMER_TRUST.minCompletedOrders;
}

/**
 * Broadcast reach policy — which online riders a new order is announced to, and how that reach
 * widens while the offer window runs. The radius is a pure function of order age
 * ({@link broadcastRadiusAtMs}), NOT persisted state, so the FCM push, the rider board, and the
 * customer-facing supply count all derive the same disc and can never disagree.
 *
 * Expansion steps must sit inside the 90 s offer window (contracts OFFER_WINDOW_MS) — a step at or
 * past the window is never scheduled. `maxRadiusM` is the Q1 service corridor: broadcasting past the
 * area we deliver in would only advertise orders no rider may accept.
 */
export const BROADCAST = {
  /** Initial broadcast radius (metres) around the pickup at order creation. */
  baseRadiusM: 5_000,
  /** Widening schedule: at `atMs` after creation the reach becomes `radiusM` (monotonic). */
  expansion: [
    { atMs: 30_000, radiusM: 8_000 },
    { atMs: 60_000, radiusM: 12_000 },
  ],
  /** Hard cap — never broadcast beyond the service corridor. */
  maxRadiusM: SERVICE_CORRIDOR.radiusKm * 1000,
  /**
   * A rider whose last heartbeat is older than this is a ghost (app killed with `isOnline` stuck
   * true) — excluded from broadcast pushes and the supply count. Deliberately looser than matching's
   * 30 s offer-selection gate: the idle rider home screen beats every 20 s, so 120 s = 6 missed
   * beats before we stop counting them.
   */
  heartbeatMaxAgeMs: 120_000,
  /**
   * FCM-broadcast-audience heartbeat cutoff — deliberately MUCH looser than {@link BROADCAST.heartbeatMaxAgeMs}.
   * The foreground JS heartbeat (every 20 s) does NOT fire while the app is backgrounded/suspended, so a
   * genuinely-online rider with the app pocketed stops beating ~120 s after backgrounding. The strict
   * cutoff above is right for the customer-facing "riders nearby" count and the offer-selection gate (they
   * must reflect live/responsive riders), but wrong for the FCM channel — a push is precisely the thing
   * that can WAKE a backgrounded app (DS13-02 deliberately keeps the backgrounded rider in the geo index
   * for exactly this reason). A push to a truly-dead device is harmless waste; a missed push to a live
   * pocketed rider is lost supply. So the FCM broadcast audience uses this permissive window instead.
   */
  heartbeatMaxAgeMsForPush: 15 * 60_000,
  /** Env var a deploy can set to override {@link BROADCAST.baseRadiusM}; the constant is the default. */
  baseRadiusEnv: "BROADCAST_BASE_RADIUS_M",
  /** Env var a deploy can set to override {@link BROADCAST.heartbeatMaxAgeMs}. */
  heartbeatMaxAgeEnv: "BROADCAST_HEARTBEAT_MAX_AGE_MS",
  /** Env var a deploy can set to override {@link BROADCAST.heartbeatMaxAgeMsForPush}. */
  heartbeatMaxAgeForPushEnv: "BROADCAST_HEARTBEAT_MAX_AGE_FOR_PUSH_MS",
} as const;

/** Broadcast radius (metres) for an order `ageMs` old — base, stepped up per the expansion
 *  schedule, capped at the service corridor. */
export function broadcastRadiusAtMs(ageMs: number, baseRadiusM: number = BROADCAST.baseRadiusM): number {
  let r = baseRadiusM;
  for (const step of BROADCAST.expansion) {
    if (ageMs >= step.atMs && step.radiusM > r) r = step.radiusM;
  }
  return Math.min(r, BROADCAST.maxRadiusM);
}
