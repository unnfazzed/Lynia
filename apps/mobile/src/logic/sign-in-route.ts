import type { StartRole } from "../auth/session";
import { riderModeAvailable } from "../rider-mode";

/** The rider path picked on C1 ("Want to earn? Ride with LyniaGo"), carried through phone → code → name. */
export type SignInIntent = "rider" | null;

export function parseSignInIntent(v: unknown): SignInIntent {
  return v === "rider" ? "rider" : null;
}

/**
 * The role a signed-in account starts as (Calm Mint v2, ledger D-55): there is no role choice screen
 * any more — everyone starts as a customer unless they took the rider path on C1, and a saved role
 * always wins. On the customer-only iPhone app (src/rider-mode.ts) it is always customer.
 */
export function startRoleFor(chosen: StartRole | null, intent: SignInIntent): StartRole {
  if (!riderModeAvailable()) return "customer";
  return chosen ?? (intent === "rider" ? "rider" : "customer");
}

/**
 * Where a signed-in, profile-complete account goes (verify.tsx for a returning user, profile/setup.tsx
 * after a new account names itself). A customer lands on Home — location and notifications are asked
 * in context there (README §3), so there is no priming detour. A rider still primes location and job
 * alerts first: a rider without them cannot take work.
 */
export function signedInDestination(chosen: StartRole | null, intent: SignInIntent = null): "/rider" | "/home" | "/permissions?next=/rider" {
  const role = startRoleFor(chosen, intent);
  if (role === "customer") return "/home";
  return chosen === "rider" ? "/rider" : "/permissions?next=/rider";
}
