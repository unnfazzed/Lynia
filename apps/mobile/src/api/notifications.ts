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
  // every other account-status row) — see the matching field in the API's NotificationRow.
  to?: "customer" | "rider";
  icon: IconName;
  title: string;
  message: string;
  at: string;
  unread: boolean;
}

/** The caller's notifications feed, newest first (see GET /notifications/feed). */
export function getNotificationsFeed(): Promise<NotificationRow[]> {
  return apiFetch<NotificationRow[]>("/notifications/feed");
}

/** Bind this device's FCM token to the signed-in profile (called after login + on token refresh). */
export function registerDeviceToken(token: string, platform?: Platform): Promise<{ ok: true }> {
  return apiFetch("/notifications/device-token", { method: "POST", body: { token, platform } });
}

/** Drop this device's token (sign-out / notifications disabled). */
export function unregisterDeviceToken(token: string): Promise<{ ok: true }> {
  return apiFetch("/notifications/device-token", { method: "DELETE", body: { token } });
}
