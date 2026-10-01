import * as Notifications from "expo-notifications";
import { requestPushRegistration } from "./push-kick";

/**
 * Notifications are asked for IN CONTEXT (Calm Mint v2 README §3, ledger D-55): right after a
 * customer's order goes out — the moment "we'll tell you when it's picked up" is worth something —
 * instead of on a priming screen before Home. The OS dialog only appears while the system can still
 * ask; once granted or permanently refused this is a no-op. Best-effort and never awaited by the caller:
 * the order flow must not wait on a permission dialog.
 */
export async function askNotificationsInContext(): Promise<void> {
  try {
    const existing = await Notifications.getPermissionsAsync();
    if (existing.granted || !existing.canAskAgain) return;
    const asked = await Notifications.requestPermissionsAsync();
    // Root push registration is check-don't-request: nudge it to bind a token now that the user has
    // (possibly) just granted, rather than at the next foreground.
    if (asked.granted) requestPushRegistration();
  } catch {
    /* best-effort */
  }
}
