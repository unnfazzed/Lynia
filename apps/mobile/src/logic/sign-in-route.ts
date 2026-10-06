import type { StartRole } from "../auth/session";
import { riderModeAvailable } from "../rider-mode";

/** The rider path picked on C1 ("Want to earn? Ride with LyniaGo"), carried through phone → code → name. */
export type SignInIntent = "rider" | null;

export function parseSignInIntent(v: unknown): SignInIntent {
  return v === "rider" ? "rider" : null;
}

/**
 * The role a signed-in account starts as (Calm Mint v2, ledger D-55): there is no role choice screen
 * any more. A role saved on this device always wins. With none saved, the server's word comes next: an
 * account the server already knows as a rider (`role: "rider"` on the verify response or the session)
 * is a rider. The saved role is wiped by every sign-out and by a reinstall, so without this a returning
 * rider landed in the customer app (start-up review 2026-10-06, C-3). Otherwise the account starts as a
 * customer unless it took the rider path on C1. On the customer-only iPhone app (src/rider-mode.ts) it
 * is always customer.
 */
export function startRoleFor(chosen: StartRole | null, intent: SignInIntent, serverRole?: string | null): StartRole {
  if (!riderModeAvailable()) return "customer";
  if (chosen) return chosen;
  return serverRole === "rider" || intent === "rider" ? "rider" : "customer";
}

/**
 * Where a signed-in, profile-complete account goes (verify.tsx for a returning user, profile/setup.tsx
 * after a new account names itself). A customer lands on Home — location and notifications are asked
 * in context there (README §3), so there is no priming detour. A rider still primes location and job
 * alerts first unless this device already chose rider: a rider without them cannot take work (the
 * priming screen forwards straight on when they were already primed).
 */
export function signedInDestination(
  chosen: StartRole | null,
  intent: SignInIntent = null,
  serverRole?: string | null,
): "/rider" | "/home" | "/permissions?next=/rider" {
  const role = startRoleFor(chosen, intent, serverRole);
  if (role === "customer") return "/home";
  return chosen === "rider" ? "/rider" : "/permissions?next=/rider";
}
