import type { Me } from "../api/auth";
import { isKycLocked, kycLaunchForGate, type KycLaunchMark } from "./gates";
import type { BecomeState } from "../ui/rider/kit";

/**
 * Where a customer stands on the way to riding — the Become-a-rider card's state, or `toggle` once
 * they are a rider (verified, or verified-then-expired: the expired-ID wall lives on the rider side).
 */
export function becomeStateFor(me: Me, launch: KycLaunchMark | null = null, now: number = Date.now()): BecomeState | "toggle" {
  const r = me.rider;
  if (!r) return "none";
  if (r.kycStatus === "verified" || r.kycStatus === "expired") return "toggle";
  // R-10: both tries used — the card must not offer "Try again" (the server refuses a third); support.
  if (r.kycStatus === "failed") return isKycLocked(r.kycAttempts) ? "locked" : "failed";
  // Pending: in the vendor's hands, held for a human review (R-3) or manual review is a wait; anything
  // else is the rider's move. A check this phone just COMPLETED (the stored launch mark, src/kyc/launch-hint)
  // is in the vendor's hands too while the vendor still reads it "In Progress" — the same hold the board
  // applies (gates.ts kycLaunchForGate), so the card doesn't ask them to finish a check they finished.
  if (kycLaunchForGate(launch, now, r) === "completed") return "review";
  return r.kycPendingState === "in_flight" || r.kycHeld || r.kycMode === "manual" ? "review" : "progress";
}

/**
 * R1 → board without the wait: the `["me"]` the board should read the moment Become a rider registered
 * the account, built from the `POST /riders/become` answer — so Become navigates at once instead of
 * awaiting a fresh `/auth/me` (which reads the ID-check vendor and can take seconds). The real `/auth/me`
 * replaces it as soon as it lands. Null when there is nothing to build on (no cached `me`) — then the caller
 * re-reads first, as before. An existing rider record is kept (only its KYC fields refresh).
 */
export function withRiderStub(
  me: Me | undefined,
  res: { kycStatus: NonNullable<Me["rider"]>["kycStatus"]; mode: "auto" | "manual" },
  launched: "completed" | "cancelled" | "failed" | null = null,
): Me | null {
  if (!me) return null;
  // A completed launch is with the vendor — the same patch the board's own retry applies.
  const inFlight = launched === "completed" ? { kycPendingState: "in_flight" as const, kycHeld: false } : {};
  if (me.rider) return { ...me, rider: { ...me.rider, kycStatus: res.kycStatus, kycMode: res.mode, ...inFlight } };
  return {
    ...me,
    rider: {
      bikeReg: null,
      kycStatus: res.kycStatus,
      kycMode: res.mode,
      kycPendingState: null,
      ratingAvg: 0,
      ratingCount: 0,
      tripsCount: 0,
      isOnline: false,
      ...inFlight,
    },
  };
}

