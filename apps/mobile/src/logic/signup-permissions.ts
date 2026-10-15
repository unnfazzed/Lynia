import { type LocState, readLocation } from "../permissions/location";
import { type NotifState, readNotif } from "../permissions/notifications";
import { ensureJobAlertChannel, readPermissions } from "../permissions/state";
import { CUST_NOTIF_ASK_CAP, custNotifAsks, riderPermFlowDone, signupPermsShown } from "../permissions/store";
import { isCustomerWebBuild } from "../web-build";
import { entryScreen } from "./rider-perm-flow";

/**
 * Permissions right after sign-up (ledger D-109, owner 2026-10-15). Every way out of sign-in (verify.tsx for
 * a returning account, profile/setup.tsx for a new one) passes its destination through `afterSignIn`, which
 * puts the permission screens in front of it once per install:
 *
 *   customer  /setup-permissions — location ("Deliver to your door"), then order updates ("Know when it's at
 *             the gate"), each with "Not now". The in-context asks (PC1 on Home, PC8 after an order) stay as
 *             the second chance.
 *   rider     /permissions?from=signup — the First Run v2 rider flow's location and notification steps
 *             (P1–P12), then on to the board or R1. It counts as the rider flow, so R3's "Go online" doesn't
 *             ask again; a skipped step resurfaces on the board as J8 / G8.
 *
 * A step the phone already allows is skipped, and with nothing left to ask the destination is returned as is.
 */

export type SignedInDestination = "/home" | "/rider" | "/rider/become";

export type CustomerSignupStep = "location" | "notifications";

/** The customer's steps for the phone's current answers. Pure. */
export function customerSignupSteps(
  loc: LocState,
  notif: NotifState,
  { web, notifAsksLeft }: { web: boolean; notifAsksLeft: boolean },
): CustomerSignupStep[] {
  const steps: CustomerSignupStep[] = [];
  // "denied" once can still show the dialog; "blocked" can't, and Home's PC5 handles it in context.
  if (loc === "undetermined" || loc === "denied") steps.push("location");
  // The web build has no push yet (src/push/push.ts, ledger D-81): nothing to ask for there.
  if (!web && notif === "undetermined" && notifAsksLeft) steps.push("notifications");
  return steps;
}

export async function readCustomerSignupSteps(): Promise<CustomerSignupStep[]> {
  const web = isCustomerWebBuild();
  const [{ loc }, notif, asks] = await Promise.all([readLocation(), web ? Promise.resolve<NotifState>("granted") : readNotif(), custNotifAsks()]);
  return customerSignupSteps(loc, notif, { web, notifAsksLeft: asks < CUST_NOTIF_ASK_CAP });
}

/** Where a just-signed-in account goes: the permission screens first when they have something to ask. Never throws. */
export async function afterSignIn(dest: SignedInDestination): Promise<string> {
  try {
    if (await signupPermsShown()) return dest;
    if (dest === "/home") {
      return (await readCustomerSignupSteps()).length > 0 ? `/setup-permissions?next=${encodeURIComponent(dest)}` : dest;
    }
    if (await riderPermFlowDone()) return dest;
    await ensureJobAlertChannel();
    const perms = await readPermissions(true);
    const missing = entryScreen("location", perms) != null || entryScreen("notifications", perms) != null;
    return missing ? `/permissions?from=signup&next=${encodeURIComponent(dest)}` : dest;
  } catch {
    return dest;
  }
}

/** The only places the sign-up permission screens hand over to (never a scheme or another host). */
export function signupNext(raw: unknown, fallback: SignedInDestination): SignedInDestination {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === "/home" || v === "/rider" || v === "/rider/become" ? v : fallback;
}
