import type { IconName } from "../ui/Icon";
import { apiFetch } from "./client";

type Platform = "android" | "ios" | "web";

/**
 * A row in the in-app notifications centre (customer-journey A·3). The feed is READ-ONLY and derived
 * server-side from the user's own order events — notifications are push-only (FCM), there is no
 * Notification table. `icon` is a house IconName; `at` is ISO-8601.
 */
export interface NotificationRow {
  id: string;
  // Nullable since KB-FEED-SYNTH: account-status rows (KYC / standing changes) have no order — the
  // screen routes those to the rider home instead of /order/:id.
  orderId: string | null;
  // BH-18: which account an orderId-less row is about ("customer" for customer.hold/lift, "rider" for
  // every other account-status row). UX19-03: on order-status rows this is instead the VIEWER's
  // per-order role, used by notificationRowDestination to replicate pushDestination's rider-only
  // screen routing — see the matching field in the API's NotificationRow.
  to?: "customer" | "rider";
  // UX19-03: the raw order-status this row is about (undefined for offer/account rows).
  status?: string;
  icon: IconName;
  title: string;
  message: string;
  at: string;
  unread: boolean;
  // Notifications v1 (ledger D-66): structured data the screen builds the handoff's copy from. All
  // optional — an older API omits them and the screen falls back to `title` / `message`.
  type?: "status" | "offer" | "fare" | "riders_available" | "account" | "sos" | "standing" | "standing_resolved" | "issue" | "swap";
  beat?: string;
  action?: string;
  service?: "send" | "restaurants" | "shops" | "pharmacy";
  pickupArea?: string;
  dropoffArea?: string;
  venue?: string;
  riderName?: string;
  customerName?: string;
  amount?: string;
  count?: number;
  prepMinutes?: number;
  swap?: { item: string; sub: string; diff: string };
  steps?: { beat: string; title: string; at: string }[];
  active?: boolean;
}

/** The caller's notifications feed, newest first (see GET /notifications/feed). */
export function getNotificationsFeed(): Promise<NotificationRow[]> {
  return apiFetch<NotificationRow[]>("/notifications/feed");
}

/**
 * STREAMLINE-01: how many feed rows the caller hasn't seen — the Account row's "N new" hint. Cheap
 * enough to sit on the Account screens because the feed synthesis behind it is bounded to one day.
 */
export function getNotificationsUnreadCount(): Promise<{ count: number }> {
  return apiFetch<{ count: number }>("/notifications/unread-count");
}

/**
 * STREAMLINE-01: stamp the read watermark. Called when the centre gains focus, which is the only
 * honest moment to claim the list was seen — `unread` is derived from this server-side, so a row the
 * user never opened the screen for stays unread however old it gets (the old 24h recency proxy silently
 * marked it read instead).
 */
export function markNotificationsRead(): Promise<{ readAt: string }> {
  return apiFetch<{ readAt: string }>("/notifications/read", { method: "POST" });
}

/**
 * STREAMLINE-01: dismiss one row (the swipe). Sends back the row's own synthetic `id` — the feed is
 * derived server-side, so there is no database id to send.
 */
export function dismissNotification(id: string): Promise<{ ok: true }> {
  return apiFetch("/notifications/dismiss", { method: "POST", body: { id } });
}

/** Bind this device's FCM token to the signed-in profile (called after login + on token refresh). */
export function registerDeviceToken(token: string, platform?: Platform): Promise<{ ok: true }> {
  return apiFetch("/notifications/device-token", { method: "POST", body: { token, platform } });
}

/** Drop this device's token (sign-out / notifications disabled). */
export function unregisterDeviceToken(token: string): Promise<{ ok: true }> {
  return apiFetch("/notifications/device-token", { method: "DELETE", body: { token } });
}
