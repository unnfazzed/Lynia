import type { StartRole } from "../auth/session";
import { riderModeAvailable } from "../rider-mode";

/**
 * Where a signed-in, profile-complete account goes after sign-in (verify.tsx for a returning user,
 * profile/setup.tsx after a brand-new account names itself): the saved role's home, or the role fork
 * for an account that hasn't picked one yet (RIDER-JOURNEY-AUDIT R0-4, R3).
 *
 * On the customer-only iPhone app (src/rider-mode.ts) there is no fork to show: a new account goes
 * through the same first-run permission priming the fork's "customer" choice leads to (role.tsx),
 * and a saved rider role is treated as customer.
 */
export function signedInDestination(chosen: StartRole | null): "/rider" | "/home" | "/role" | "/permissions?next=/home" {
  if (!riderModeAvailable()) return chosen ? "/home" : "/permissions?next=/home";
  return chosen === "rider" ? "/rider" : chosen ? "/home" : "/role";
}
