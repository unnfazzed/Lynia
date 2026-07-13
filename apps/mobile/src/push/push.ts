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
 * Acquire this device's **native FCM** token and register it with the API. Returns the token (so the
 * caller can unregister it on sign-out) or `null` when push isn't available — no permission, a
 * simulator, or Expo Go (the device token needs the dev/standalone build with the Firebase config).
 *
 * Deliberately `getDevicePushTokenAsync` (the raw FCM registration token), NOT `getExpoPushTokenAsync`:
 * the backend sends through `firebase-admin` directly (D7), so it needs the FCM token, not an Expo one.
 * Fully best-effort — any failure resolves to `null` and is swallowed; the app works without push.
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  try {
    // Push tokens are only ever issued to real hardware (incl. dev builds), never simulators.
    if (!Device.isDevice) return null;

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
    if (!granted) return null;

    const devToken = await Notifications.getDevicePushTokenAsync();
    const token = typeof devToken.data === "string" ? devToken.data : null;
    if (!token) return null;

    await registerDeviceToken(token, currentPlatform());
    return token;
  } catch {
    // Expo Go / missing Firebase config / offline — degrade silently. Push is never load-bearing.
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
 */
export function pushDestination(data: unknown, isRider: boolean): string | null {
  if (typeof data !== "object" || data === null) return null;
  const { orderId, status, kind } = data as { orderId?: unknown; status?: unknown; kind?: unknown };
  if (kind === "broadcast") return "/rider";
  if (kind === "riders_available") return "/home";
  if (kind === "account") return "/rider";
  if (typeof orderId !== "string" || orderId === "") return null;
  // SOS to the counterparty: route the rider to their own job screen; the customer keeps the tracker.
  if (kind === "sos") return isRider ? "/rider/job" : `/order/${orderId}`;
  // Rider-bail rebroadcast: the orderId is the fresh clone — follow it to the new auction.
  if (kind === "rebroadcast") return `/order/${orderId}`;
  if (typeof status === "string" && RIDER_ONLY_STATUSES.has(status)) return "/rider/job";
  if (status === "cancelled" && isRider) return "/rider/job";
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
