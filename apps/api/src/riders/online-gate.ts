import { KycStatus, RiderAccountStatus } from "@lynia/shared";

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
 *  state (verify your ID / account banned / suspended / on hold / on cooldown). */
export type OnlineRefusal = "kyc" | "kyc_expired" | "banned" | "suspended" | "on_hold" | "cooldown" | "out_of_area";

/**
 * The online-gate (Q2): the FIRST failed precondition, or null when the rider may go online. A rider
 * goes online only when KYC is verified, the account is `active` (admin-owned — read here, never
 * written), reliability is not `on_hold`, and any no-show cooldown has elapsed. Pure for unit tests.
 *
 * A `banned` account is reported as its own `banned` reason (a terminal, non-appealable state) so the
 * app shows the right copy — it is checked before the catch-all `suspended` branch, which then only
 * ever fires for a genuine suspension.
 */
export function onlineRefusalReason(
  rider: { kycStatus: string; accountStatus: string; onHold: boolean; cooldownUntil: Date | null },
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
  return null;
}

/** Rider-facing copy per refusal reason. The structured `reason` (not this string) is the contract. */
export const REFUSAL_MESSAGE: Record<OnlineRefusal, string> = {
  kyc: "Rider is not verified yet",
  kyc_expired: "Your ID has expired — re-verify to keep riding",
  banned: "Your rider account has been banned",
  suspended: "Your rider account is suspended",
  on_hold: "You're on hold — complete deliveries to raise your reliability score",
  cooldown: "On cooldown after repeated cancellations — try again later",
  out_of_area: "You're outside the service area — go online from inside the Harare corridor",
};
