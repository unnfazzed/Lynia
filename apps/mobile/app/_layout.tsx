import { tokens } from "@lynia/shared";
import { QueryClientProvider } from "@tanstack/react-query";
import Constants from "expo-constants";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { View } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "../src/auth/auth-context";
import { isUpdateRequired, isVersionBelow } from "../src/config";
import { useReachability } from "../src/net/use-reachability";
import { useServerMinVersion } from "../src/net/use-server-version-gate";
import { queryClient } from "../src/query/client";
import { usePushRegistration } from "../src/push/use-push-registration";
import { AnalyticsProvider } from "../src/telemetry/analytics";
import { start as startRum } from "../src/telemetry/rum";
import { OfflineBanner, ToastProvider } from "../src/ui";
import { useAppFonts } from "../src/ui/fonts";
import ForceUpdateScreen from "./force-update";

// Keep the native splash up until the fonts register (nothing else holds it — expo-router's
// keep-alive no-ops without expo-splash-screen). Rejects if already prevented (e.g. Fast Refresh).
SplashScreen.preventAutoHideAsync().catch(() => {});

/** Syncs the device's FCM token with the signed-in profile. Renders nothing; lives under AuthProvider. */
function PushSync(): null {
  usePushRegistration(useAuth().session);
  return null;
}

/**
 * App-wide offline strip, driven by REAL reachability (a failed request flips it; a passing one or the
 * /health probe clears it) rather than any single screen's socket state. Rendered at the root above the
 * navigator so every screen shows it, on ordinary layout flow (not an overlay): when online it returns
 * null and takes zero height, so it never covers a header; when offline it pushes the app down by a
 * calm ink bar. The ink safe-area pad keeps the strip flush under the notch/status bar. This is the
 * "your app didn't break, the network did" cue that keeps a blip from reading as a crash.
 */
function ConnectivityBanner(): React.ReactElement | null {
  const reachable = useReachability();
  const insets = useSafeAreaInsets();
  if (reachable) return null;
  return (
    <View style={{ paddingTop: insets.top, backgroundColor: tokens.color.ink }}>
      <OfflineBanner state="offline" />
    </View>
  );
}

/**
 * The navigation tree, gated by the hard version check (customer/rider S·3) — two minimums, one
 * screen: the build-time MIN_SUPPORTED_VERSION (inlined at build) and the SERVER-driven
 * /app/version-gate minimum, which reaches binaries already in the field. When either sits above
 * the installed build, the force-update screen replaces the whole Stack — there's no route past
 * it. Inert by default: the build-time gate is unset in normal builds and the server gate
 * fail-opens to null until the founder sets MIN_SUPPORTED_APP_VERSION on the API.
 */
function AppNavigator(): React.ReactElement {
  const serverMin = useServerMinVersion();
  const current = Constants.expoConfig?.version ?? "0.0.0";
  if (isUpdateRequired(current) || isVersionBelow(current, serverMin)) return <ForceUpdateScreen />;
  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout(): React.ReactElement | null {
  // Self-hosted Inter — the splash stays up until the fonts register so no
  // Text mounts before its family is available. Font assets are bundled (no network), so on the
  // rare load error we fall through to the system-font fallback rather than block the app.
  const [fontsLoaded, fontError] = useAppFonts();
  const fontsReady = fontsLoaded || fontError != null;

  // Arm the client-RUM buffer once at app root. Role is tagged per-enqueue, so a role at root isn't
  // needed; we just pass the app version for the (server-bucketed) `appVersion` label.
  useEffect(() => {
    startRum(Constants.expoConfig?.version);
  }, []);

  // Drop the splash once fonts resolve (loaded or errored) — the tree renders on the same pass.
  useEffect(() => {
    if (fontsReady) SplashScreen.hideAsync().catch(() => {});
  }, [fontsReady]);

  if (!fontsReady) return null; // splash still covers the screen

  return (
    <SafeAreaProvider>
      {/* AnalyticsProvider is a no-op passthrough until the founder provisions PostHog (see
          src/telemetry/analytics.tsx). Inside SafeAreaProvider (the SDK reads insets) and above
          the navigator so screen autocapture sees every route. */}
      <AnalyticsProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <PushSync />
            <StatusBar style="dark" />
            {/* ToastProvider wraps the navigator so any screen can raise an in-app toast. Its strip is
                absolutely positioned at the top inset; in the rare offline-and-toasting overlap it sits
                over the connectivity ink bar for the toast's few seconds, then clears itself. */}
            <ToastProvider>
              <View style={{ flex: 1 }}>
                <ConnectivityBanner />
                <View style={{ flex: 1 }}>
                  <AppNavigator />
                </View>
              </View>
            </ToastProvider>
          </AuthProvider>
        </QueryClientProvider>
      </AnalyticsProvider>
    </SafeAreaProvider>
  );
}
