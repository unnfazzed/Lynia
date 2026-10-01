import type { Me } from "../api/auth";
import type { BecomeState } from "../ui/rider/kit";

/**
 * Where a customer stands on the way to riding — the Become-a-rider card's state, or `toggle` once
 * they are a rider (verified, or verified-then-expired: the expired-ID wall lives on the rider side).
 */
export function becomeStateFor(me: Me): BecomeState | "toggle" {
  const r = me.rider;
  if (!r) return "none";
  if (r.kycStatus === "verified" || r.kycStatus === "expired") return "toggle";
  if (r.kycStatus === "failed") return "failed";
  // Pending: in the vendor's hands (or manual review) is a wait; anything else is the rider's move.
  return r.kycPendingState === "in_flight" || r.kycMode === "manual" ? "review" : "progress";
}

