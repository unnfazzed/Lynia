import { tokens } from "@lynia/shared/tokens";
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
import { BootPhaseProvider, useBootPhase } from "../src/boot/boot-phase";
import { prewarmBootReads } from "../src/boot/prewarm";
import { isUpdateRequired, isVersionBelow } from "../src/config";
import { useReachability } from "../src/net/use-reachability";
import { useServerMinVersion } from "../src/net/use-server-version-gate";
import { queryClient, wireFocusManager } from "../src/query/client";
import { persistBuster, PERSIST_MAX_AGE_MS, queryPersister, shouldPersistQuery } from "../src/query/persist";
import { useBootstrap } from "../src/query/use-bootstrap";
import { usePushRegistration } from "../src/push/use-push-registration";
import { AnalyticsProvider } from "../src/telemetry/analytics";
import { NavOpenProbe } from "../src/telemetry/nav-timing";
import { enqueueBoot, start as startRum } from "../src/telemetry/rum";
import { captureException, initSentry, wrap } from "../src/telemetry/sentry";
import { Button, EmptyState, OfflineBanner, Screen, ToastProvider } from "../src/ui";
import { prewarmFonts, useAppFonts } from "../src/ui/fonts";
import { BootSplashHold, useBootSplashRelease } from "../src/boot/boot-splash-hold";
import ForceUpdateScreen from "./force-update";

/**
 * EVERY STATEMENT IN THIS BLOCK RUNS WHERE NOTHING CAN CATCH IT (MOB-BOOT-04,
 * docs/COLD-START-CRASH-RCA-2026-08-21.md).
 *
 * expo-router evaluates this file EAGERLY while it builds the route tree — `getRoutes()` calls
 * `loadRoute()` for every `_layout` — and the `Try` boundary that catches render errors for the whole
 * app is built FROM the result of that load. It therefore cannot catch the load itself. Neither
 * `Sentry.wrap` (touch instrumentation + a profiler, not a boundary) nor Expo's `registerRootComponent`
 * (dev-only) adds one either. So a synchronous throw anywhere in this module's graph is not an error
 * screen: uncaught JS → `DefaultJSExceptionHandler` rethrows on the native thread → the process dies and
 * Android shows "LyniaGo keeps stopping".
 *
 * That is not hypothetical — it is how build #31 reached testers dead. So every module-scope call here
 * goes through {@link bootStep}: it reports (if telemetry survived) and continues. A boot that is
 * missing its splash pin, its font prewarm or its crash reporter is strictly better than no boot, and
 * each of these is an optimisation or a nicety, never a correctness precondition — the app re-does or
 * tolerates all of it downstream (fonts fall back to system, prewarm's consumers call it again from
 * their own effects, and a splash that was never pinned simply auto-hides on first paint).
 */
function bootStep(step: () => unknown): void {
  try {
    step();
  } catch (error) {
    try {
      captureException(error);
    } catch {
      // Belt and braces, and the braces are load-bearing. `captureException` already guards its own
      // SDK call (src/telemetry/sentry.ts) and is inert without a DSN — but this catch block exists
      // precisely so that a throw cannot kill the launch, and it would be absurd for the reporting
      // inside it to be the thing that does. bootStep's contract is "nothing here ends the process",
      // and a contract that depends on a collaborator's internals is not a contract.
    }
  }
}

// Crash reporting (roadmap 1.1 / LR20) — first thing at module load so native + JS handlers are armed
// before any app code runs. Inert unless EXPO_PUBLIC_SENTRY_DSN is set (dev/jest stay silent).
// Guarded twice over: initSentry() no longer throws on its own (src/telemetry/sentry.ts) AND it runs
// through bootStep, because this is the statement that must not be the one that kills the launch.
bootStep(initSentry);

// Keep the native splash up until the DESTINATION screen has presented (MOB-BOOT-05: the cold start
// is ONE screen — the native splash — released by src/boot/boot-splash-hold.tsx, not by the font
// gate). Rejects if already prevented (e.g. Fast Refresh).
bootStep(() => SplashScreen.preventAutoHideAsync().catch(() => {}));
// The cold start is ONE screen and it does not animate (owner instructions 2026-08-18/2026-08-24).
// `duration: 0` is the half that actually matters on Android: SplashScreenManager.kt (verified at
// expo-splash-screen@0.29.24) IGNORES `fade` and always runs its exit as an alpha animation over
// `duration` — default 400ms. With the splash now released onto the destination screen (not onto an
// identical green frame), a 400ms fade would render as the destination fading in, i.e. an animation
// in a boot sequence that is supposed to have none. `fade: false` stays for the platforms/versions
// that do read it.
bootStep(() => SplashScreen.setOptions({ fade: false, duration: 0 }));

// Start the fonts and every device-local boot read NOW, at module evaluation, so the native side works
// on them while the JS thread finishes evaluating the startup graph. Previously all of this began only
// after the first render committed, which itself waited on the fonts — one serial chain where nothing
// actually depended on anything. See src/boot/prewarm.ts for the full shape of that bug.
bootStep(prewarmFonts);
bootStep(prewarmBootReads);

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
 * Root Stack screenOptions, exported so the pin test can assert the exact object the navigator
 * consumes. `contentStyle`: the native-stack's default scene background is WHITE, and it is what
 * paints during every transition gap — most visibly the cold-start splash→home redirect, where it
 * produced the reported green→white flash. accentWash (deliberately NOT `tokens.color.bg`, which is
 * literally #FFFFFF — using it here would be a no-op) keeps every between-screens frame on the brand
 * wash the home header already uses, so the boot sequence reads green → pale green → home instead of
 * a hard white cut.
 */
export const stackScreenOptions = {
  headerShown: false,
  contentStyle: { backgroundColor: tokens.color.accentWash },
} as const;

/**
 * The same options with the screen transition suppressed — used ONLY while the process is still cold
 * starting (`useBootPhase().booting`), then dropped for {@link stackScreenOptions}.
 *
 * The boot sequence has to read as ONE green screen replaced by the destination, with nothing moving
 * (owner instruction 2026-08-18), and the native-stack default slide/fade is that moving frame. But
 * the owner also asked to KEEP the in-app animation, so this cannot live on the navigator
 * permanently: the transition belongs to the screen being presented, and a cold start can land on any
 * route (including a push-tap deep link), so scoping by route name would be a list that rots. Scoping
 * by PHASE covers every destination and expires on its own — see src/boot/boot-phase.tsx.
 *
 * The native splash (held by `BootSplashHold` until the destination presents) covers this handoff;
 * the suppression is what makes it deterministic rather than a race between the splash release and a
 * transition still in flight.
 */
export const bootStackScreenOptions = {
  ...stackScreenOptions,
  animation: "none",
} as const;

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
  // Cold-start handoff runs without a transition; every navigation after it animates normally.
  const { booting } = useBootPhase();
  if (isUpdateRequired(current) || isVersionBelow(current, serverMin)) return <ForceUpdateScreen />;
  return <Stack screenOptions={booting ? bootStackScreenOptions : stackScreenOptions} />;
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
  // Belt-and-braces: BootSplashHold's release never fires when the throw happens on the mount pass
  // that would have mounted it, so this screen would otherwise render UNDER a splash still held up by
  // the module-scope preventAutoHideAsync() above — a frozen icon instead of a recoverable error. Today
  // expo-router's own boundary also force-hides (views/Try.tsx), but the invariant "whatever renders
  // first drops the splash" belongs next to the code that holds it, not in a framework internal.
  // Goes through the ONE shared release (native hide + window-background reset + boot-phase end);
  // this tree mounts outside BootPhaseProvider, where the default context's endBoot is a no-op —
  // correct, since there is no navigator here to un-suppress.
  const release = useBootSplashRelease();
  useEffect(() => {
    release();
  }, [release]);
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
  // Self-hosted Inter — the native splash covers the whole boot (held by BootSplashHold), so no
  // Text is ever VISIBLE before its family is available. Font assets are bundled (no network), so on
  // the rare load error we fall through to the system-font fallback rather than block the app.
  // `useAppFonts` is TIME-BOUNDED (src/ui/fonts.ts): it reports an error rather than pending past
  // FONT_LOAD_TIMEOUT_MS — since MOB-BOOT-05 the splash release no longer waits on fonts at all
  // (only the boot_paint mark does), but the bound stays so a stalled font load can never wedge the
  // gate's consumers — the 0.17.12 "installs but won't open" bug class.
  const [fontsLoaded, fontError] = useAppFonts();
  const fontsReady = fontsLoaded || fontError != null;

  // Arm the client-RUM buffer once at app root. Role is tagged per-enqueue, so a role at root isn't
  // needed; we just pass the app version for the (server-bucketed) `appVersion` label.
  useEffect(() => {
    startRum(Constants.expoConfig?.version);
  }, []);

  // Pause React Query's refetchInterval polling while backgrounded (see wireFocusManager).
  useEffect(() => wireFocusManager(), []);

  // Record the first half of the cold start once fonts resolve (loaded or errored): bundle
  // evaluation started → the tree is fully paintable. The splash is deliberately NOT dropped here
  // any more (MOB-BOOT-05): hiding on this commit raced RN's first PRESENTED frame, and losing that
  // race exposed the window background for a few frames — the intermittent white flash. The one
  // release now lives in src/boot/boot-splash-hold.tsx, after the destination has settled. The font
  // gate's own timeout (src/ui/fonts.ts) still bounds this mark; the splash no longer depends on it.
  useEffect(() => {
    if (!fontsReady) return;
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
            {/* Tap → destination-screen latency (`nav_open`). Renders nothing; needs the router
                context, and pairs each route change with the press that caused it. */}
            <NavOpenProbe />
            <StatusBar style="dark" />
            {/* ToastProvider wraps the navigator so any screen can raise an in-app toast. Its strip is
                absolutely positioned at the top inset; in the rare offline-and-toasting overlap it sits
                over the connectivity ink bar for the toast's few seconds, then clears itself. */}
            <ToastProvider>
              {/* Scopes the no-transition rule to the cold start: AppNavigator reads `booting` for
                  its screenOptions and BootSplashHold ends the phase when it releases, so in-app
                  navigation keeps its animation. */}
              <BootPhaseProvider>
                <View style={{ flex: 1 }}>
                  <ConnectivityBanner />
                  <View style={{ flex: 1 }}>
                    <AppNavigator />
                  </View>
                  {/* Cold-start splash hold (MOB-BOOT-05): holds the NATIVE splash — the boot's one
                      and only screen — until the first REAL screen's frame is presented, then hides
                      it, ends the boot phase and schedules the window-background reset. Renders
                      nothing. Dismisses on ANY route + a hard cap — see the component's header. */}
                  <BootSplashHold />
                </View>
              </BootPhaseProvider>
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
