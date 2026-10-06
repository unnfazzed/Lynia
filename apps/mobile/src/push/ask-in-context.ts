import { readNotif } from "../permissions/notifications";
import { CUST_NOTIF_ASK_CAP, custNotifAsks } from "../permissions/store";

/**
 * Customers are asked for notifications IN CONTEXT (First Run v2 PC8–PC10, handoff `first-run-v2` README
 * §2A + BRIEF 1–2, ledger D-81): right after an order is placed, an explainer ("Know when it's at the gate")
 * comes BEFORE the Android dialog — the OS dialog only ever opens from its primary button. It shows only
 * while the permission is still undetermined and at most `CUST_NOTIF_ASK_CAP` times per install ("Not now"
 * asks again after the next order). The explainer is its own route (`app/order-updates.tsx`) that hands
 * over to the order screen.
 */
export async function shouldExplainOrderUpdates(): Promise<boolean> {
  if ((await readNotif()) !== "undetermined") return false;
  return (await custNotifAsks()) < CUST_NOTIF_ASK_CAP;
}

/** The PC8 route that continues to `next` (the order screen) when it is done. */
export function orderUpdatesRoute(next: string): string {
  return `/order-updates?next=${encodeURIComponent(next)}`;
}

/** Where a just-placed order goes: PC8 first when it should ask, else straight to the order screen. */
export async function routeAfterOrderPlaced(orderId: string): Promise<string> {
  const order = `/order/${orderId}`;
  return (await shouldExplainOrderUpdates()) ? orderUpdatesRoute(order) : order;
}
