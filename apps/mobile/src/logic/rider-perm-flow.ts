import { allGranted, ensureJobAlertChannel, type PermissionsSnapshot, readPermissions } from "../permissions/state";
import { riderPermFlowDone } from "../permissions/store";

/**
 * The rider permission flow (First Run v2 P1–P16, handoff `first-run-v2` README §2B, ledger D-82) — the pure
 * step logic and the entry point R3 calls.
 *
 * Owner decision D-82 §2 #5: R3's "Go online" STARTS the flow (P1 …) and P13's "Go online" is what goes
 * online. A rider who has already granted everything (or already ran the flow on this phone) goes straight
 * online — no screens. The flow runs once per install; a skipped step resurfaces on the board as J8 / G8.
 */

/** One of the flow's screens (README §2B ids). P2/P10 are the Android dialogs, P8 is a toast, P14/P15 live
 *  on the board / in Settings — none of those is a screen here. */
export type RiderPermScreen = "P1" | "P3" | "P4" | "P5" | "P6" | "P7" | "P9" | "P11" | "P12" | "P13" | "P16";

/** A step of the flow; each resolves to one of its screens or is skipped when nothing is missing. */
export type RiderPermStep = "location" | "notifications" | "battery" | "done";

/** Where a step starts for the phone's current state, or null when it has nothing to ask. Pure. */
export function entryScreen(step: RiderPermStep, p: PermissionsSnapshot): RiderPermScreen | null {
  switch (step) {
    case "location":
      if (p.loc === "blocked") return "P6";
      if (p.loc === "coarse") return p.gps ? "P4" : "P7";
      if (p.loc === "granted") return p.gps ? null : "P7";
      return "P1"; // undetermined, or denied once (the dialog can still show — explain first)
    case "notifications":
      if (p.notif === "blocked") return "P11";
      if (p.notif === "granted") return p.channelMuted ? "P12" : null;
      return "P9";
    case "battery":
      return "P16";
    case "done":
      return "P13";
  }
}

/** The Android location dialog's answer (P2) → the next screen. `null` = granted precisely with GPS on:
 *  P3 with the P8 toast. Pure. */
export function afterLocationAnswer(loc: PermissionsSnapshot["loc"], gps: boolean): RiderPermScreen | "granted" {
  if (loc === "granted") return gps ? "granted" : "P7";
  if (loc === "coarse") return gps ? "P4" : "P7";
  if (loc === "blocked") return "P6";
  if (loc === "denied") return "P5";
  return "P1"; // the dialog was dismissed — stay on the explainer
}

/** The steps a visit walks: the whole flow (from R3), or one step reopened from the board or Settings. */
export function stepsFor(from: "flow" | "single", step: RiderPermStep | null): RiderPermStep[] {
  if (from === "flow") return ["location", "notifications", "done"];
  return [step ?? "location"];
}

// The callback R3 handed over — run by P13's "Go online". Module scope: the flow is a pushed route, and the
// board below it owns what "online" means.
let pendingGoOnline: (() => void) | null = null;

/**
 * R3 "Go online" (owner #5). Everything granted, or the flow already ran on this phone → `goOnline` now.
 * Otherwise the flow opens and `goOnline` runs from P13.
 */
export async function startRiderPermFlow(router: { push: (href: never) => void }, goOnline: () => void): Promise<void> {
  await ensureJobAlertChannel();
  const [done, perms] = await Promise.all([riderPermFlowDone(), readPermissions(true)]);
  if (done || allGranted(perms)) {
    goOnline();
    return;
  }
  pendingGoOnline = goOnline;
  router.push("/permissions?from=flow" as never);
}

/** P13 "Go online": hands the shift back to the board. False when nothing was waiting (a cold restart). */
export function finishRiderPermFlow(): boolean {
  const cb = pendingGoOnline;
  pendingGoOnline = null;
  cb?.();
  return cb != null;
}

/** The routes the board and Settings reopen a single step with (P14 J8/G8, P15, P16). */
export const RIDER_PERM_ROUTES = {
  location: "/permissions?step=location",
  notifications: "/permissions?step=notifications",
  battery: "/permissions?step=battery",
} as const;
