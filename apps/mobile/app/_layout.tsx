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
import { prewarmBootReads } from "../src/boot/prewarm";
import { isUpdateRequired, isVersionBelow } from "../src/config";
import { useReachability } from "../src/net/use-reachability";
import { useServerMinVersion } from "../src/net/use-server-version-gate";
import { queryClient, wireFocusManager } from "../src/query/client";
import { persistBuster, PERSIST_MAX_AGE_MS, queryPersister, shouldPersistQuery } from "../src/query/persist";
import { useBootstrap } from "../src/query/use-bootstrap";
import { usePushRegistration } from "../src/push/use-push-registration";
import { AnalyticsProvider } from "../src/telemetry/analytics";
import { enqueueBoot, start as startRum } from "../src/telemetry/rum";
import { captureException, initSentry, wrap } from "../src/telemetry/sentry";
import { Button, EmptyState, OfflineBanner, Screen, ToastProvider } from "../src/ui";
import { prewarmFonts, useAppFonts } from "../src/ui/fonts";
import ForceUpdateScreen from "./force-update";

// Crash reporting (roadmap 1.1 / LR20) — first thing at module load so native + JS handlers are armed
// before any app code runs. Inert unless EXPO_PUBLIC_SENTRY_DSN is set (dev/jest stay silent).
initSentry();

// Keep the native splash up until the fonts register (nothing else holds it — expo-router's
// keep-alive no-ops without expo-splash-screen). Rejects if already prevented (e.g. Fast Refresh).
SplashScreen.preventAutoHideAsync().catch(() => {});

// Start the fonts and every device-local boot read NOW, at module evaluation, so the native side works
// on them while the JS thread finishes evaluating the startup graph. Previously all of this began only
// after the first render committed, which itself waited on the fonts — one serial chain where nothing
// actually depended on anything. See src/boot/prewarm.ts for the full shape of that bug.
prewarmFonts();
prewarmBootReads();

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
 * (when the layout subtree itself threw), so Screen's insets still resolve. It also REPORTS the crash
 * to Sentry (roadmap 1.1) — a no-op until a DSN is set — so the white-screen path that recovery hides
 * is still observed.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps): React.ReactElement {
  // Report the render-time exception once (before offering recovery); inert unless Sentry is configured.
  useEffect(() => {
    captureException(error);
  }, [error]);
  // Belt-and-braces: RootLayout's hide effect never commits when the throw happens on the mount pass
  // that would have run it, so this screen would otherwise render UNDER a splash still held up by the
  // module-scope preventAutoHideAsync() above — a frozen icon instead of a recoverable error. Today
  // expo-router's own boundary also force-hides (views/Try.tsx), but the invariant "whatever renders
  // first drops the splash" belongs next to the code that holds it, not in a framework internal.
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);
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

function RootLayout(): React.ReactElement | null {
  // Self-hosted Inter — the splash stays up until the fonts register so no
  // Text mounts before its family is available. Font assets are bundled (no network), so on the
  // rare load error we fall through to the system-font fallback rather than block the app.
  // `useAppFonts` is TIME-BOUNDED (src/ui/fonts.ts): it reports an error rather than pending past
  // FONT_LOAD_TIMEOUT_MS, because this gate holds the splash and a font load that never settles
  // would otherwise strand the app on it forever — the 0.17.12 "installs but won't open" bug.
  const [fontsLoaded, fontError] = useAppFonts();
  const fontsReady = fontsLoaded || fontError != null;

  // Arm the client-RUM buffer once at app root. Role is tagged per-enqueue, so a role at root isn't
  // needed; we just pass the app version for the (server-bucketed) `appVersion` label.
  useEffect(() => {
    startRum(Constants.expoConfig?.version);
  }, []);

  // Pause React Query's refetchInterval polling while backgrounded (see wireFocusManager).
  useEffect(() => wireFocusManager(), []);

  // Drop the splash once fonts resolve (loaded or errored), and record the first half of the cold
  // start: bundle evaluation started → the user can actually see the app. Everything before this
  // instant is module evaluation plus the font gate.
  useEffect(() => {
    if (!fontsReady) return;
    SplashScreen.hideAsync().catch(() => {});
    enqueueBoot("boot_paint");
  }, [fontsReady]);

  // NOTE: this deliberately does NOT `return null` while the fonts load, which is what it did until the
  // cold-start work. Returning null unmounted the whole provider tree, so the session read, the
  // query-cache restore and the boot aggregate could not START until the fonts had finished — the
  // serialization prewarm.ts documents. The tree now mounts immediately and does that work DURING the
  // font load; the native splash (held above, dropped in the effect) is what covers the screen
  // meanwhile, so nothing unstyled is ever visible. A `<Text>` that commits before its family
  // registers is self-healing by construction: `fontsReady` flipping re-renders the tree and the
  // patched Text picks up the same family names (see src/ui/fonts.ts).
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

// Wrap the router root so Sentry attaches its error boundary + touch instrumentation. Inert
// (passthrough) until initSentry() runs with a DSN — see src/telemetry/sentry.ts.
export default wrap(RootLayout);
