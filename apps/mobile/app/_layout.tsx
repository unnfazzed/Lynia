import { tokens } from "@lynia/shared";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import Constants from "expo-constants";
import { Stack, type ErrorBoundaryProps } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { View } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "../src/auth/auth-context";
import { SessionGate } from "../src/auth/session-gate";
import { isUpdateRequired, isVersionBelow } from "../src/config";
import { useReachability } from "../src/net/use-reachability";
import { useServerMinVersion } from "../src/net/use-server-version-gate";
import { queryClient, wireFocusManager } from "../src/query/client";
import { persistBuster, PERSIST_MAX_AGE_MS, queryPersister, shouldPersistQuery } from "../src/query/persist";
import { useBootstrap } from "../src/query/use-bootstrap";
import { usePushRegistration } from "../src/push/use-push-registration";
import { AnalyticsProvider } from "../src/telemetry/analytics";
import { start as startRum } from "../src/telemetry/rum";
import { Button, EmptyState, OfflineBanner, Screen, ToastProvider } from "../src/ui";
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

/** Wave-2 W1: fires the one-round-trip boot aggregate as soon as the session is known and seeds the
 *  query cache (me + active order/job), so the first screens paint without their own fetches. Renders
 *  nothing; lives under AuthProvider + the query provider. Failure seeds nothing — screens self-serve. */
function BootstrapSync(): null {
  useBootstrap(useAuth().session);
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

/**
 * App-wide render-error safety net. expo-router (v4) auto-mounts an `ErrorBoundary` export from a
 * layout/route file, catching render-time exceptions in its subtree that would otherwise be an
 * unrecoverable white-screen crash in production. Deliberately minimal — calm, on-brand copy and a
 * single "Reload" action that calls expo-router's `retry()` to clear the error state and re-render the
 * route. Wrapped in its own SafeAreaProvider because this can render above RootLayout's provider tree
 * (when the layout subtree itself threw), so Screen's insets still resolve. This is a recovery path,
 * not crash reporting (telemetry is gated separately elsewhere).
 */
export function ErrorBoundary({ retry }: ErrorBoundaryProps): React.ReactElement {
  return (
    <SafeAreaProvider>
      <Screen>
        <View style={{ flex: 1, justifyContent: "center" }}>
          <EmptyState
            icon="triangle-alert"
            title="Something went wrong"
            message="The app hit an unexpected snag. Tap to reload and pick up where you left off."
          >
            <Button label="Reload" onPress={() => void retry()} />
          </EmptyState>
        </View>
      </Screen>
    </SafeAreaProvider>
  );
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

  // Pause React Query's refetchInterval polling while backgrounded (see wireFocusManager).
  useEffect(() => wireFocusManager(), []);

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
        {/* Warm boot: restore the allowlisted slice of the query cache from disk so a cold start on a
            slow/dead link paints last-known data instantly and revalidates behind it, instead of
            skeletons until the network answers. Live order/offer/board state is deliberately NOT
            persisted — see src/query/persist.ts. */}
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{
            persister: queryPersister,
            maxAge: PERSIST_MAX_AGE_MS,
            buster: persistBuster,
            dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
          }}
        >
          <AuthProvider>
            <PushSync />
            <BootstrapSync />
            {/* Redirects to /phone when the session drops to null after boot (sign-out or a
                server-forced 401 logout) — cold-boot routing in app/index.tsx can't reach that
                transition, so without this the user is stranded on an authless protected screen. */}
            <SessionGate />
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
        </PersistQueryClientProvider>
      </AnalyticsProvider>
    </SafeAreaProvider>
  );
}
