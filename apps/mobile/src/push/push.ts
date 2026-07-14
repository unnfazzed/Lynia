import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { registerDeviceToken, unregisterDeviceToken } from "../api/notifications";

// Show a heads-up banner for a notification that arrives while the app is foregrounded (the OS only
// shows it automatically in the background). Set once at module load.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const ANDROID_CHANNEL = "default";

function currentPlatform(): "android" | "ios" | "web" | undefined {
  if (Platform.OS === "android") return "android";
  if (Platform.OS === "ios") return "ios";
  return undefined;
}

/**
 * Outcome of a registration attempt.
 *  - `{ registered: true, token }` — the device is now bound; `token` lets the caller unregister on
 *    sign-out / account switch.
 *  - `{ registered: false, retry: false }` — TERMINAL: no permission, a simulator, or Expo Go / missing
 *    Firebase config. The environment can't produce a token this process, so retrying would only spin;
 *    push stays off until the user changes the OS setting (which re-mounts the flow) or restarts.
 *  - `{ registered: false, retry: true }` — TRANSIENT: we DID acquire a token, but the register-with-API
 *    request failed (a dead zone / server blip). Worth retrying when reachability or the foreground returns.
 */
export type PushRegistrationResult =
  | { registered: true; token: string }
  | { registered: false; retry: boolean };

/**
 * Acquire this device's **native FCM** token and register it with the API.
 *
 * Deliberately `getDevicePushTokenAsync` (the raw FCM registration token), NOT `getExpoPushTokenAsync`:
 * the backend sends through `firebase-admin` directly (D7), so it needs the FCM token, not an Expo one.
 * Fully best-effort — never throws; the app works without push. See {@link PushRegistrationResult} for
 * how a failure signals whether a retry could ever succeed.
 */
export async function registerForPushNotificationsAsync(): Promise<PushRegistrationResult> {
  let token: string;
  try {
    // Push tokens are only ever issued to real hardware (incl. dev builds), never simulators.
    if (!Device.isDevice) return { registered: false, retry: false };

    // Android 8+ requires a channel before any notification can post.
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL, {
        name: "Deliveries",
        importance: Notifications.AndroidImportance.HIGH,
        lightColor: "#00B14F",
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let granted = existing.granted;
    if (!granted && existing.canAskAgain) {
      granted = (await Notifications.requestPermissionsAsync()).granted;
    }
    if (!granted) return { token: null, retry: false }; // user/OS denied — a retry-loop can't fix this

    const devToken = await Notifications.getDevicePushTokenAsync();
    const acquired = typeof devToken.data === "string" ? devToken.data : null;
    if (!acquired) return { token: null, retry: false }; // Expo Go / no Firebase config — not transient
    token = acquired;
  } catch {
    // Permission/channel/device-token acquisition failed — environmental (Expo Go, missing config),
    // not a transient network blip. Degrade silently and don't retry-loop.
    return { token: null, retry: false };
  }

  // We hold a real token; the only remaining step that can fail transiently is the register POST.
  try {
    await registerDeviceToken(token, currentPlatform());
    return { token };
  } catch {
    // Offline / server blip on the register request itself — worth retrying on recovery/foreground.
    return { token: null, retry: true };
  }
}

/**
 * Best-effort: bind a freshly OS/FCM-rotated token to the signed-in profile. A mid-process token
 * rotation otherwise silently kills push until the next cold start. Returns the token on success (so the
 * caller can track it for cleanup / drop the superseded one), or `null` if the register request failed.
 * Never throws.
 */
export async function registerRotatedToken(token: string): Promise<string | null> {
  try {
    await registerDeviceToken(token, currentPlatform());
    return token;
  } catch {
    return null;
  }
}

/** Order-status values whose push (STATUS_NOTICES in notifications.service.ts) is sent to the RIDER
 *  only: "assigned" ("You got the job") and "completed" ("Nice work — you're free for the next
 *  job"). A tap on either always belongs on the rider's active-job screen. */
const RIDER_ONLY_STATUSES = new Set(["assigned", "completed"]);

/**
 * Where tapping a notification should navigate. Every status-driven push (`notifyOrderStatus`)
 * carries `orderId`; most of them (confirmed/en_route_pickup/picked_up/en_route_dropoff/delivered/
 * expired/undelivered) are customer-facing and previously did nothing on tap despite copy like
 * "tap to rate your rider" / "tap for details". `cancelled` is pushed to BOTH parties, so it falls
 * back to `isRider` to pick the right screen.
 *
 * Several non-status `kind`s need special routing, or they dead-end: a `broadcast` alert goes to a rider
 * who hasn't bid yet, so `/order/:id` would 403 (a Retry that can never succeed) — send them to the
 * board; `riders_available` carries no order at all — bring the customer home to re-broadcast; an
 * `account` push (KYC/standing change) has no order — send the rider to their rider home. `sos` is
 * pushed to the counterparty, so a rider belongs on their own job screen, not the customer-voiced
 * tracker. `rebroadcast` carries the FRESH clone's id — follow it to the new auction.
 * Returns null when there's genuinely nowhere to go.
 *
 * `data.to` ("customer" | "rider", optional) is the RECIPIENT's actual per-order relationship, stamped
 * server-side on the two dual-audience pushes (`sos`, `cancelled`). It is authoritative over the global
 * `isRider` account role for those branches: a rider-role user is routinely the CUSTOMER on an order
 * they sent themselves, so keying off `isRider` would land them on `/rider/job` ("No active job", or an
 * unrelated live job of their own) at the most safety-critical tap in the app. When `data.to` is absent
 * — older in-flight pushes sent before the backend stamped it, or any other push kind — we fall back to
 * the existing `isRider` logic unchanged.
 */
export function pushDestination(data: unknown, isRider: boolean): string | null {
  if (typeof data !== "object" || data === null) return null;
  const { orderId, status, kind, to } = data as {
    orderId?: unknown;
    status?: unknown;
    kind?: unknown;
    to?: unknown;
  };
  // Per-order recipient relationship when the backend stamped it; otherwise the global account role.
  const toRider = to === "rider" ? true : to === "customer" ? false : isRider;
  if (kind === "broadcast") return "/rider";
  if (kind === "riders_available") return "/home";
  if (kind === "account") return "/rider";
  if (typeof orderId !== "string" || orderId === "") return null;
  // SOS to the counterparty: route the rider to their own job screen; the customer keeps the tracker.
  if (kind === "sos") return toRider ? "/rider/job" : `/order/${orderId}`;
  // Rider-bail rebroadcast: the orderId is the fresh clone — follow it to the new auction.
  if (kind === "rebroadcast") return `/order/${orderId}`;
  if (typeof status === "string" && RIDER_ONLY_STATUSES.has(status)) return "/rider/job";
  if (status === "cancelled") return toRider ? "/rider/job" : `/order/${orderId}`;
  return `/order/${orderId}`;
}

/**
 * `router.push(target)`, but a no-op when `target` is already the active route. The "Open job"
 * button, a duplicate/replayed push notification tap, and the cold-start deep link can each
 * independently fire the same navigation while already sitting on that screen (e.g. a double-tap,
 * or a notification that arrives while its own destination is already open) — without this guard
 * each stacks a redundant entry onto the back stack, so leaving the screen takes an extra "back".
 */
export function pushOnce(router: { push: (href: string) => void }, currentPathname: string, target: string): void {
  if (currentPathname !== target) router.push(target);
}

/** Best-effort: drop this device's token server-side on sign-out. */
export async function unregisterForPushNotificationsAsync(token: string): Promise<void> {
  try {
    await unregisterDeviceToken(token);
  } catch {
    /* best-effort — a failed unregister just leaves a token the server prunes when it goes dead */
  }
}
