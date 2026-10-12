/**
 * Product-policy defaults — the four blocking product decisions (Q1/Q2, Didit, A-06) encoded as
 * documented, tunable constants so the code that depends on them can ship. These are LAUNCH
 * ASSUMPTIONS chosen to be reasonable, not final policy; product/finance should confirm each and can
 * change a value here in one place. Every consumer imports from this module — no magic numbers.
 *
 * Sources: packages/design/HANDOFF.md (admin A-06 assumptions, Didit ≥0.85), BACKLOG-PLAN.md
 * (Q1 corridor, Q2 reliability), RIDER-JOURNEY-AUDIT.md (R-01 reliability).
 */

import { percentOf, roundToCents } from "./money";
import { NATIONWIDE_REACH_M } from "./service-area";

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
 * KYC (Didit) face-match auto-decision threshold, score in [0,1]. ≥ autoApprove → auto-verify; < needsReview →
 * auto-decline. Didit reports face-match similarity on 0–100 (extractDiditScore divides by 100), and this can
 * only tighten Didit's own verdict, never loosen it (decideDiditKyc, IR26-07).
 *
 * KYC-R26-12 (owner 2026-10-12: "even the In Review to be fully automatic"): the two values are EQUAL, so there
 * is no hold-for-a-human band — the one cut is 0.60, the same line as the live Didit workflow's face-match
 * review threshold (60/100), which now routes its own review cases to Declined. The old 0.85 band held riders
 * Didit had already approved for a second, manual review.
 */
export const KYC_THRESHOLDS = {
  autoApprove: 0.6,
  needsReview: 0.6,
} as const;

/**
 * Q1 — Harare's centre and the old pilot disc. **Not the service-area rule any more:** where we serve is
 * `isInServiceArea` (service-area.ts: all of Zimbabwe — owner 2026-10-12, D-99). This constant remains the
 * default map/search centre only.
 */
export const SERVICE_CORRIDOR = {
  centerLat: -17.8292,
  centerLng: 31.0522,
  radiusKm: 25,
} as const;

/**
 * Rider commission — the revenue model (CONCEPT §6). Lynia takes a **percentage of the amount the rider
 * earns** on each completed job — a parcel's agreed fare, or a restaurant/shop/pharmacy job's delivery
 * fee (see {@link jobCommissionBasis}) — deducted from the rider's side, never a customer surcharge.
 *
 * COLLECTION MODEL = **prepaid per-ride**: the rider pre-funds a commission account; when a job
 * completes, {@link perRideCommission} is deducted from that balance. It is the ONLY commission model —
 * it fully replaces the earlier post-paid weekly cash-settlement engine (removed: no more
 * `SETTLEMENT`/`commissionOn`, no weekly billing, refund-netting, record-payment or overdue auto-pause).
 *
 * **Owner policy (2026-10-12): 10%, after the rider's first 10 completed jobs.** Every job type counts
 * toward the 10 and every job type is charged. There is NO minimum wallet balance; instead a rider can't
 * take a job whose commission is more than their balance ({@link canCoverJobCommission}) — checked when
 * they bid on a parcel, when the customer picks them, and when they accept a food/shop dispatch.
 */
export const COMMISSION = {
  /** How commission is collected. `prepaid_per_ride` = deducted per completed ride from a pre-funded balance. */
  model: "prepaid_per_ride" as const,
  /**
   * DEFAULT commission rate as a percentage of the amount the rider earns per job — the bundled fallback
   * the mobile app reads OFFLINE, and the server's rate when `COMMISSION_RATE_PCT` is unset (owner
   * 2026-10-12: 10%). **This is never the
   * authoritative rate at runtime:** the server resolves the live rate from the `COMMISSION_RATE_PCT`
   * env override ({@link resolveCommissionRatePct}) and hands it to every client in the `/wallet/config`
   * payload (design decision 2A — server-authoritative rate). The "flip" (0 → e.g. 10) is that env
   * change, not a code deploy. Nothing else in the codebase may hardcode a percentage — read the
   * resolved rate instead.
   */
  ratePct: 10,
  /**
   * Minimum commission-account balance (USD) to stay online — **0: there is no minimum** (owner
   * 2026-10-12). Going online is never refused for the balance; the per-job check
   * ({@link canCoverJobCommission}) stops a rider taking a job whose commission is more than they hold.
   * Still served to clients as `CommissionConfig.floor`, so an app build that warns below the floor only
   * warns on a negative balance.
   */
  lowBalanceBlockBelow: 0,
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
   * WD-012 (docs/KNOWN_BUGS.md DOC-16-04 / docs/archive/FRAUD-REVIEW.md P0-2): the COMMISSION-BASIS floor, as a
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
  /**
   * Commission-free first jobs (owner 2026-10-12: 10; was 5, the Calm Mint v2 R1/R3 "5 of 5" drawing,
   * ledger D-55 → D-70). A rider's first `freeFirstJobs` COMPLETED jobs — parcel or merchant, both count —
   * carry no commission debit, and while any remain the per-job balance check does not apply, so a newly
   * verified rider at a $0 balance can work straight away.
   * Derived from `Rider.tripsCount` (incremented once per completed job, never on a cancel/undelivered),
   * so it needs no extra state — see {@link freeJobsLeft}.
   */
  freeFirstJobs: 10,
} as const;

/**
 * Commission-free jobs the rider still has, from their completed-job count. Never negative; a
 * non-finite/negative count (data anomaly) reads as 0 trips — i.e. the full allowance — only for the
 * DISPLAY/gate; the debit path re-reads `tripsCount` under the rider row lock.
 */
export function freeJobsLeft(tripsCount: number | null | undefined): number {
  const n = typeof tripsCount === "number" && Number.isFinite(tripsCount) && tripsCount > 0 ? Math.floor(tripsCount) : 0;
  return Math.max(0, COMMISSION.freeFirstJobs - n);
}

/**
 * Whether the job that just brought the rider's completed count to `tripsCountAfter` is one of their
 * commission-free first jobs (the 1st…`freeFirstJobs`th completion). Called by the per-ride debit with
 * the POST-increment count read inside the completion transaction.
 */
export function isFreeJob(tripsCountAfter: number): boolean {
  return Number.isFinite(tripsCountAfter) && tripsCountAfter >= 1 && tripsCountAfter <= COMMISSION.freeFirstJobs;
}

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
  return percentOf(amountPaid, ratePct);
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
  const floor = roundToCents(suggestedFare * COMMISSION.basisFloorPct);
  return Math.max(agreedFare, floor);
}

/**
 * The amount a job's commission is charged on. A parcel is billed on its agreed fare, floored by
 * {@link commissionBasis}; a restaurant / shop / pharmacy job on its delivery fee — the rider's fare on
 * that order (`foodOrderMoney().riderFare`), never the goods total the rider only carries back to the
 * venue. Null when the figure it needs is missing (a data anomaly): the caller skips the charge.
 */
export function jobCommissionBasis(job: {
  orderType: string;
  agreedFare: number | null | undefined;
  suggestedFare?: number | null;
  deliveryFee?: number | null;
}): number | null {
  if (job.orderType === "merchant") {
    if (job.deliveryFee == null || !Number.isFinite(job.deliveryFee)) return null;
    return roundToCents(Math.max(0, job.deliveryFee));
  }
  if (job.agreedFare == null || !Number.isFinite(job.agreedFare)) return null;
  return commissionBasis(job.agreedFare, job.suggestedFare);
}

/**
 * Owner rule (2026-10-12): a rider can't take a job whose commission is more than their wallet balance.
 * True when commission is off, when the job is one of the rider's commission-free first jobs (they have
 * free jobs left before taking it), or when the balance covers the commission. `tripsCount` is the
 * rider's completed jobs BEFORE this one.
 */
export function canCoverJobCommission(args: { ratePct: number; tripsCount: number | null | undefined; balance: number; commission: number }): boolean {
  if (!isCommissionActive(args.ratePct)) return true;
  if (freeJobsLeft(args.tripsCount) > 0) return true;
  return args.commission <= args.balance;
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
 * DS20-03: how long a rider is cooled-down (blocked from going online) once they hit
 * {@link RIDER_STRIKE_LIMIT} on EITHER strike axis — a 3rd cancel-strike (order-lifecycle) or a 3rd
 * dispute-strike (issues). Both write `riders.cooldownUntil`, so they must source the SAME duration
 * from here: previously each hardcoded `2 * 60 * 60 * 1000` independently, and if either drifted the
 * shorter one firing second would silently TRUNCATE a longer cooldown the other just set. The single
 * constant + the "cooldown never shortens" write guard at both sites keep the two axes consistent.
 */
export const RIDER_STRIKE_COOLDOWN_MS = 2 * 60 * 60 * 1000;

/**
 * DS20-01: the single stuck-order threshold — apps/api's ops-dashboard aggregate and per-order detail
 * badge both import {@link STUCK_AFTER_MS} (derived from this) so they can't drift to different minute
 * values (they did once: 25 vs 20). WD-028: the admin console's own "needs attention" row copy is a
 * separate app/deployable that can't import server-side constants directly, but it must still describe
 * the SAME threshold — hardcoding the minute figure there let it drift stale (25+) after the API side
 * was corrected to 20. Both now read this one number.
 */
export const STUCK_AFTER_MINUTES = 20;

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
 * Broadcast reach policy — which online riders a new order is announced to. The radius is a pure function of
 * order age ({@link broadcastRadiusAtMs}), NOT persisted state, so the FCM push, the rider board, and the
 * customer-facing supply count all derive the same disc and can never disagree.
 *
 * **Nationwide (owner, 2026-10-12, ledger D-99):** "Bikers can get any order despite their location. Bikers
 * can bid from anywhere. It's up to the user to decide who they want." Every online rider in Zimbabwe is
 * pushed every new order and sees it on the board, nearest first, from the first second — so the base reach
 * is the whole country and there is nothing left to widen. The 5 → 8 → 12 km widening schedule is retired;
 * `expansion` stays as the (empty) hook a future narrower reach would use. Steps must sit inside the 90 s
 * offer window (contracts OFFER_WINDOW_MS) — a step at or past the window is never scheduled.
 */
export const BROADCAST = {
  /** Initial broadcast radius (metres) around the pickup at order creation: all of Zimbabwe. */
  baseRadiusM: NATIONWIDE_REACH_M,
  /** Widening schedule: at `atMs` after creation the reach becomes `radiusM` (monotonic). Empty: the base
   *  reach is already nationwide. */
  expansion: [] as readonly { readonly atMs: number; readonly radiusM: number }[],
  /** Hard cap — never broadcast beyond the country we serve. */
  maxRadiusM: NATIONWIDE_REACH_M,
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
 *  schedule, capped at {@link BROADCAST.maxRadiusM}. */
export function broadcastRadiusAtMs(ageMs: number, baseRadiusM: number = BROADCAST.baseRadiusM): number {
  let r = baseRadiusM;
  for (const step of BROADCAST.expansion) {
    if (ageMs >= step.atMs && step.radiusM > r) r = step.radiusM;
  }
  return Math.min(r, BROADCAST.maxRadiusM);
}

/**
 * Server-side pickup ETA for a bid (owner, 2026-10-12). Since D-99 a rider anywhere in the country can bid,
 * and the ETA the rider app sends is a tapped chip (5/10/15/20 min) nothing checks, yet it carries a fifth of
 * the best-match ranking. The API keeps the larger of the rider's claim and this straight-line estimate, so
 * the ETA the customer reads (and ranks on) can't be shorter than the distance allows.
 */
export const PICKUP_ETA = {
  /** Average motorbike speed across town, straight-line km per hour (deliberately conservative). */
  kmPerHour: 25,
  /** Getting going: gear on, out of the yard. */
  startMinutes: 2,
  /** Ceiling on the stored estimate (a full day) — beyond it the number stops meaning anything. */
  maxMinutes: 24 * 60,
} as const;

/** Minutes for a rider `distanceM` (straight line) from the pickup to get there. */
export function estimatePickupEtaMinutes(distanceM: number): number {
  if (!Number.isFinite(distanceM) || distanceM <= 0) return PICKUP_ETA.startMinutes;
  const minutes = PICKUP_ETA.startMinutes + Math.ceil((distanceM / 1000 / PICKUP_ETA.kmPerHour) * 60);
  return Math.min(minutes, PICKUP_ETA.maxMinutes);
}
