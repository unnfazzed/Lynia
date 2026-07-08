import { useSegments } from "expo-router";
import { PostHogProvider, usePostHog } from "posthog-react-native";
import React, { useEffect } from "react";
import { analyticsEnabled, POSTHOG_API_KEY, POSTHOG_HOST } from "../config";

/**
 * Manual screen tracking. expo-router runs react-navigation v7, where PostHog's captureScreens
 * autocapture no longer works (the SDK's own docs say to capture manually from the router state:
 * https://docs.expo.dev/router/reference/screen-tracking/). We capture the route PATTERN
 * (`/order/[id]`, from useSegments) rather than the concrete pathname (`/order/abc123`), so screen
 * analytics stay low-cardinality and order/user identifiers never leave the device. Mounts only
 * inside the provider, so usePostHog always resolves.
 */
function ScreenTracker(): null {
  const posthog = usePostHog();
  const segments = useSegments();
  const screen = `/${segments.join("/")}`;
  useEffect(() => {
    posthog.screen(screen);
  }, [posthog, screen]);
  return null;
}

/**
 * PostHog product analytics — the OPTIONAL, key-gated companion to the RUM latency buffer (rum.ts):
 * RUM answers "is the app fast", PostHog answers "what do people actually do in it".
 *
 * Gating mirrors every other founder-provisioned integration in this app (Places, FCM, EAS):
 * without `EXPO_PUBLIC_POSTHOG_API_KEY` this renders children directly — no provider, no SDK init,
 * no network, byte-for-byte the app behaviour before analytics existed. Provisioning is one founder
 * command, `npx eas-cli integrations:posthog:connect`, which syncs the key/host into the EAS build
 * environments; the next build lights this up with no code change.
 *
 * What's captured when enabled:
 *  - screens — route patterns via ScreenTracker above;
 *  - app lifecycle — installs, opens, backgrounds (SDK default; retention/DAU come from these).
 * Autocapture stays OFF: touch capture is high-noise, and on screens holding phone numbers / KYC
 * documents the element text it collects is a privacy liability, not a signal; screen autocapture
 * simply doesn't work under expo-router (see ScreenTracker).
 */
export function AnalyticsProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  if (!analyticsEnabled()) return <>{children}</>;
  return (
    <PostHogProvider apiKey={POSTHOG_API_KEY as string} options={{ host: POSTHOG_HOST }} autocapture={false}>
      <ScreenTracker />
      {children}
    </PostHogProvider>
  );
}
