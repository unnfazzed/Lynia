import { QueryClientProvider } from "@tanstack/react-query";
import Constants from "expo-constants";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "../src/auth/auth-context";
import { queryClient } from "../src/query/client";
import { usePushRegistration } from "../src/push/use-push-registration";
import { start as startRum } from "../src/telemetry/rum";
import { useAppFonts } from "../src/ui/fonts";

// Keep the native splash up until the fonts register (nothing else holds it — expo-router's
// keep-alive no-ops without expo-splash-screen). Rejects if already prevented (e.g. Fast Refresh).
SplashScreen.preventAutoHideAsync().catch(() => {});

/** Syncs the device's FCM token with the signed-in profile. Renders nothing; lives under AuthProvider. */
function PushSync(): null {
  usePushRegistration(useAuth().session);
  return null;
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
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <PushSync />
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false }} />
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
