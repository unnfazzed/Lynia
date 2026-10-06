import * as SecureStore from "expo-secure-store";

/**
 * First Run v2 per-install permission flags (handoff `first-run-v2` README §4, ledger D-80). Install-level,
 * like the onboarding flag: they survive sign-out (`clearDeviceState` leaves them), because they are about
 * the phone's permission prompts, not about an account. Every call is best-effort.
 */

/** Set at P13 (or after the rider flow's last "Not now"): the rider flow runs once per install. */
export const RIDER_PERM_FLOW_KEY = "lynia.riderPermFlowDone.v1";
/** How many times PC8 has been shown after an order on this install. */
export const CUST_NOTIF_ASKS_SLOT = "lynia.custNotifAsks.v1";

/** PC8 shows at most this many times per install (designer's proposal; owner to confirm — D-80 §2). */
export const CUST_NOTIF_ASK_CAP = 3;

export async function riderPermFlowDone(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(RIDER_PERM_FLOW_KEY)) === "1";
  } catch {
    return false;
  }
}

export async function markRiderPermFlowDone(): Promise<void> {
  try {
    await SecureStore.setItemAsync(RIDER_PERM_FLOW_KEY, "1");
  } catch {
    /* best-effort */
  }
}

export async function custNotifAsks(): Promise<number> {
  try {
    const n = Number.parseInt((await SecureStore.getItemAsync(CUST_NOTIF_ASKS_SLOT)) ?? "0", 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    // Unreadable: answer the cap, so a broken store never turns into an explainer after every order.
    return CUST_NOTIF_ASK_CAP;
  }
}

export async function noteCustNotifAsked(): Promise<void> {
  try {
    await SecureStore.setItemAsync(CUST_NOTIF_ASKS_SLOT, String((await custNotifAsks()) + 1));
  } catch {
    /* best-effort */
  }
}
