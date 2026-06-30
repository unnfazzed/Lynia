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
        lightColor: "#1E7A46",
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

/** Best-effort: drop this device's token server-side on sign-out. */
export async function unregisterForPushNotificationsAsync(token: string): Promise<void> {
  try {
    await unregisterDeviceToken(token);
  } catch {
    /* best-effort — a failed unregister just leaves a token the server prunes when it goes dead */
  }
}
