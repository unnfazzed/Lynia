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
 * after a new account names itself): Home for a customer, the rider side for a rider (C1 rider path: OTP →
 * R1, First Run v2 G1). Both pass it through `afterSignIn` (logic/signup-permissions.ts), which puts the
 * permission screens in front of it once per install (owner, ledger D-109; it reverses D-82's "no first-run
 * priming"). What's skipped there is still asked in context: Home's PC1, PC8 after an order, the board's J8/G8.
 */
export function signedInDestination(chosen: StartRole | null, intent: SignInIntent = null, serverRole?: string | null): "/rider" | "/home" {
  return startRoleFor(chosen, intent, serverRole) === "customer" ? "/home" : "/rider";
}

/**
 * Where the rider side starts for an account that has just signed in or named itself. An account with no
 * rider record goes straight to R1 (`/rider/become`) instead of mounting the board only for it to replace
 * itself with R1 (a flash of the board and a wasted round of board reads). The board's own redirect stays
 * the fallback for every other way in. `hasRider` is the server's word: `role: "rider"` (written in the same
 * transaction that creates the rider record) or a `rider` on `/auth/me`.
 */
export function riderEntry(destination: "/rider" | "/home", hasRider: boolean): "/rider" | "/rider/become" | "/home" {
  return destination === "/rider" && !hasRider ? "/rider/become" : destination;
}
