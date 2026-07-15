import { COMMISSION, KycStatus, RiderAccountStatus } from "@lynia/shared";

/**
 * The rider online-gate — pure functions, NO Nest/service dependencies. Extracted from rider.service so
 * that TrackingService (and matching/offers) can consume `onlineRefusalReason` WITHOUT importing
 * rider.service: rider.service imports TrackingService, so the reverse edge formed a fragile
 * import cycle (a re-ordering of imports left TrackingService undefined at RiderService's DI metadata).
 * Keeping the gate here breaks that cycle at the root. rider.service re-exports these for its callers.
 */

/** A rider may go online only once KYC has passed (CONCEPT §5d gating). Pure for unit tests. */
export function canGoOnline(kycStatus: string): boolean {
  return kycStatus === KycStatus.VERIFIED;
}

/** Why a rider was refused going online — a machine-readable tag the app keys off to show the right
 *  state (verify your ID / account banned / suspended / on hold / on cooldown / top up to keep riding). */
export type OnlineRefusal =
  | "kyc"
  | "kyc_expired"
  | "banned"
  | "suspended"
  | "on_hold"
  | "cooldown"
  | "out_of_area"
  | "commission_low_balance";

/** The commission side of the gate: whether commission is switched on (rate > 0) and the rider's
 *  current prepaid balance. Optional on the rider input so existing call sites (matching/offers/
 *  tracking board-eligibility) compile unchanged — those evaluate standing only. The authoritative
 *  go-online path (rider.service.setOnline) supplies these so the low-balance block is enforced. At
 *  rate 0 (`commissionActive` false/absent) the commission branch never fires — the pilot is untouched. */
export interface CommissionGateInput {
  /** True only when the resolved commission rate is > 0 (the flip has happened). */
  commissionActive?: boolean;
  /** The rider's prepaid commission balance (USD); undefined when not loaded by this call site. */
  commissionBalance?: number;
}

/**
 * The online-gate (Q2): the FIRST failed precondition, or null when the rider may go online. A rider
 * goes online only when KYC is verified, the account is `active` (admin-owned — read here, never
 * written), reliability is not `on_hold`, any no-show cooldown has elapsed, and — once commission is
 * switched on — the prepaid balance is at or above the floor. Pure for unit tests.
 *
 * A `banned` account is reported as its own `banned` reason (a terminal, non-appealable state) so the
 * app shows the right copy — it is checked before the catch-all `suspended` branch, which then only
 * ever fires for a genuine suspension. The commission branch is LAST (the standing reasons are more
 * fundamental) and fires only when commission is active AND a balance was supplied AND it is below the
 * floor — so a call site that doesn't load the balance, or the whole 0% launch period, is never gated.
 */
export function onlineRefusalReason(
  rider: {
    kycStatus: string;
    accountStatus: string;
    onHold: boolean;
    cooldownUntil: Date | null;
  } & CommissionGateInput,
  now: Date = new Date(),
): OnlineRefusal | null {
  // A lapsed ID (1·b2) gets its own reason before the generic KYC branch, so a rider who was verified
  // and later expired sees the distinct "re-verify your ID" state, not the first-time "verify" copy.
  if (rider.kycStatus === KycStatus.EXPIRED) return "kyc_expired";
  if (!canGoOnline(rider.kycStatus)) return "kyc";
  if (rider.accountStatus === RiderAccountStatus.BANNED) return "banned";
  if (rider.accountStatus !== RiderAccountStatus.ACTIVE) return "suspended";
  if (rider.onHold) return "on_hold";
  if (rider.cooldownUntil && rider.cooldownUntil > now) return "cooldown";
  // Prepaid commission floor (design Flow 2): only once commission is switched on AND this call site
  // loaded the balance. Literal guard — at ratePct 0 `commissionActive` is false, so a $0 launch
  // balance below the floor never blocks the pilot.
  if (rider.commissionActive && rider.commissionBalance != null && rider.commissionBalance < COMMISSION.lowBalanceBlockBelow) {
    return "commission_low_balance";
  }
  return null;
}

/** Rider-facing copy per refusal reason. The structured `reason` (not this string) is the contract. */
export const REFUSAL_MESSAGE: Record<OnlineRefusal, string> = {
  kyc: "Rider is not verified yet",
  kyc_expired: "Your ID has expired — re-verify to keep riding",
  banned: "Your rider account has been banned",
  suspended: "Your rider account is suspended",
  on_hold: "Your account is on hold — contact support to get back on the road",
  cooldown: "On cooldown after repeated cancellations — try again later",
  out_of_area: "You're outside the service area — go online from inside the Harare corridor",
  commission_low_balance: "Top up your commission balance to keep riding",
};
