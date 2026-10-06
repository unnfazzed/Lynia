import { Platform } from "react-native";

/**
 * True only in the customer web build (`EXPO_PUBLIC_LYNIA_WEB=1 expo export --platform web`,
 * docs/plans/2026-10-06-customer-web-app-plan.md): customer-only, no push, no store listing, no
 * force-update. Keyed on the build flag as well as the platform because the parity lane also renders
 * screens through react-native-web (Platform.OS "web") and must keep seeing the phone app's behaviour.
 * Expo inlines EXPO_PUBLIC_* at build time, so phone builds compile this to `false`.
 */
export function isCustomerWebBuild(): boolean {
  return Platform.OS === "web" && process.env.EXPO_PUBLIC_LYNIA_WEB === "1";
}
