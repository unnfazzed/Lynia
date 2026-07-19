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
 *  - `{ registered: false, retry: false }` — TERMINAL: a simulator, Expo Go / missing Firebase config,
 *    or a HARD-denied permission (the OS won't ask again). The environment can't produce a token this
 *    process, so retrying would only spin; push stays off until the user changes the OS setting (which
 *    re-mounts the flow) or restarts.
 *  - `{ registered: false, retry: true }` — TRANSIENT: permission is not granted yet but the OS can still
 *    ask (the primed explainer hasn't run / the user tapped "Not now"); OR we hold permission but the FCM
 *    token mint or the register-with-API request failed on a flaky link. Worth retrying when the explainer
 *    grants (via the push-kick), when reachability recovers, or on the next foreground.
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
  let granted: boolean;
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

    // CHECK — do NOT request. The raw OS permission dialog is owned by the primed explainer
    // (app/permissions.tsx), which shows "here's why we ask" FIRST. This function runs from the root
    // PushSync the instant a profile signs in — i.e. right after OTP verify, before the user has even
    // picked a role — so requesting here popped the system dialog with zero context, raising the
    // denial rate and killing push for anyone who reflexively tapped "Don't allow". Only proceed when
    // permission is already granted; otherwise stay retryable so a later grant (the explainer's
    // push-kick, or returning from Settings on a foreground) binds the token.
    const existing = await Notifications.getPermissionsAsync();
    granted = existing.granted;
    if (!granted) return { registered: false, retry: existing.canAskAgain };
  } catch {
    // Permission/channel probe failed — environmental (Expo Go, missing config), not transient.
    return { registered: false, retry: false };
  }

  // Permission is granted. Acquiring the native FCM token is a SEPARATE failure domain: on a fresh
  // install FCM must reach Google to mint the token, so on flaky 3G / a dead zone (the normal Harare
  // cold-start) this THROWS transiently — a retry on reconnect/foreground can succeed, so it must NOT
  // be classed terminal (the old code folded this into the outer catch and left push dead for the whole
  // session). Only a null token (Expo Go / no Firebase config) is genuinely terminal.
  let token: string;
  try {
    const devToken = await Notifications.getDevicePushTokenAsync();
    const acquired = typeof devToken.data === "string" ? devToken.data : null;
    if (!acquired) return { registered: false, retry: false };
    token = acquired;
  } catch {
    return { registered: false, retry: true };
  }

  // We hold a real token; the only remaining step that can fail transiently is the register POST.
  try {
    await registerDeviceToken(token, currentPlatform());
    return { registered: true, token };
  } catch {
    // Offline / server blip on the register request itself — worth retrying on recovery/foreground.
    return { registered: false, retry: true };
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
 *  job"). A tap on "assigned" belongs on the rider's active-job screen — it's the live job. "completed"
 *  is different: `completed` isn't in ACTIVE_RIDE_STATUSES, so by the time this push can even arrive
 *  the job has already left the active feed — /rider/job renders a bare "No active job" dead end for a
 *  push whose whole point is "you're free for the next job". Route it to the board instead, where the
 *  rider can actually act on that promise (UX-2026-07-15). */
const RIDER_JOB_SCREEN_STATUSES = new Set(["assigned"]);
const RIDER_BOARD_STATUSES = new Set(["completed"]);

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
  // KB-NOTIFY-ORDERID: a "rider's online near you" push now carries the still-open orderId when the
  // customer's original auction is still live — route the tap back to that running request (the
  // destination is viewer-role-aware from earlier fixes, so this is safe). Absent orderId keeps the
  // prior behaviour: bring the customer home to re-broadcast.
  if (kind === "riders_available") return typeof orderId === "string" && orderId !== "" ? `/order/${orderId}` : "/home";
  // UX-2026-07-15: an "account" push covers two different situations. A rider's OWN KYC/standing change
  // (notifyKycDecision, suspend/lift/ban/clearHold) carries no orderId — /rider (their own dashboard) is
  // still right. But notifyCustomersOfRiderStandingChange sends this SAME kind to the CUSTOMER on an
  // order whose assigned rider was just suspended/banned mid-delivery, and that push DOES carry an
  // orderId — routing it to /rider unconditionally sent a (usually non-rider) customer to the "Become a
  // rider" onboarding screen at the exact moment they're anxious about their live delivery.
  // BH-18: a THIRD situation has no orderId either — AdminCustomersService.holdCustomer/liftCustomerHold
  // pushes the CUSTOMER themselves (account-level, not order-level). The server stamps `to:"customer"`
  // on that push (unlike the rider-standing pushes, which stay unstamped); honor it before falling back
  // to "/rider" so a customer with no rider profile doesn't land on the rider-onboarding screen.
  if (kind === "account") {
    if (typeof orderId === "string" && orderId !== "") return `/order/${orderId}`;
    return to === "customer" ? "/home" : "/rider";
  }
  if (typeof orderId !== "string" || orderId === "") return null;
  // SOS to the counterparty: route the rider to their own job screen; the customer keeps the tracker.
  if (kind === "sos") return toRider ? "/rider/job" : `/order/${orderId}`;
  // Rider-bail rebroadcast: the orderId is the fresh clone — follow it to the new auction.
  if (kind === "rebroadcast") return `/order/${orderId}`;
  if (typeof status === "string" && RIDER_JOB_SCREEN_STATUSES.has(status)) return "/rider/job";
  if (typeof status === "string" && RIDER_BOARD_STATUSES.has(status)) return "/rider";
  if (status === "cancelled") return toRider ? "/rider/job" : `/order/${orderId}`;
  return `/order/${orderId}`;
}

/**
 * BH-18: where tapping an in-app Notifications feed row should navigate — the feed's own analogue of
 * {@link pushDestination}, extracted so the destination decision is unit-testable in isolation rather
 * than inlined as a ternary in the screen component. An account-status row with no orderId routes by
 * `to` (mirrors the push branch above: `to:"customer"` for AdminCustomersService's hold/lift rows,
 * "/rider" for every other — currently untagged — account row).
 *
 * UX19-03: an order-scoped row does NOT always go to its order — a rider viewing their OWN `assigned` or
 * `cancelled` row must land on the same screen the equivalent push opens (`/rider/job`, via
 * RIDER_JOB_SCREEN_STATUSES / the `cancelled` branch in {@link pushDestination}), or they hit a
 * dead-control detour: `/order/:id` renders no pickup/confirm/bail controls for an active "assigned" job
 * (just an "Open your job" button that then pushes to /rider/job), and for `cancelled` its LiveTrackingCard
 * (the only place that screen renders a call button) never renders for a cancelled order — so a rider who
 * had already collected the parcel gets no hand-back guidance and no way to call the sender, unlike the
 * dedicated CancelledHandback screen `/rider/job` shows for the exact same event.
 */
export function notificationRowDestination(row: { orderId: string | null; to?: "customer" | "rider"; status?: string }): string {
  if (row.orderId) {
    if (row.to === "rider" && typeof row.status === "string" && RIDER_JOB_SCREEN_STATUSES.has(row.status)) return "/rider/job";
    if (row.to === "rider" && row.status === "cancelled") return "/rider/job";
    return `/order/${row.orderId}`;
  }
  return row.to === "customer" ? "/home" : "/rider";
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
