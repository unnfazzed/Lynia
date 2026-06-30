import { apiFetch } from "./client";

type Platform = "android" | "ios" | "web";

/** Bind this device's FCM token to the signed-in profile (called after login + on token refresh). */
export function registerDeviceToken(token: string, platform?: Platform): Promise<{ ok: true }> {
  return apiFetch("/notifications/device-token", { method: "POST", body: { token, platform } });
}

/** Drop this device's token (sign-out / notifications disabled). */
export function unregisterDeviceToken(token: string): Promise<{ ok: true }> {
  return apiFetch("/notifications/device-token", { method: "DELETE", body: { token } });
}
