import { tokens } from "@lynia/shared/tokens";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import Constants from "expo-constants";
import { Stack, usePathname, type ErrorBoundaryProps } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useMemo } from "react";
import { Animated, View, useWindowDimensions } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "../src/auth/auth-context";
import type { Session } from "../src/auth/session";
import { SessionGate } from "../src/auth/session-gate";
import { BootPhaseProvider, useBootPhase } from "../src/boot/boot-phase";
import { reportBootRoute } from "../src/boot/boot-readiness";
import { prewarmBootReads } from "../src/boot/prewarm";
import { isUpdateRequired, isVersionBelow } from "../src/config";
import { useOfflineBannerClaimed } from "../src/net/offline-banner-owner";
import { wireReachabilitySignals } from "../src/net/reachability-signals";
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
import { EmptyState, OfflineBanner, Screen, ToastProvider } from "../src/ui";
import { prewarmFonts, useAppFonts } from "../src/ui/fonts";
import { useBootSplashRelease } from "../src/boot/boot-splash-hold";
import { BootSplash } from "../src/boot/splash/BootSplash";
import { RevealCorners } from "../src/boot/RevealCorners";
import { RiderRouteGate } from "../src/rider-route-gate";
import ForceUpdateScreen from "./force-update";
import { isCustomerWebBuild } from "../src/web-build";

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

// Keep the native launch screen up until the JS splash (src/boot/splash/BootSplash.tsx, ledger D-64)
// has drawn its first frame — it drops the native screen from its onLayout, onto the same green.
// Rejects if already prevented (e.g. Fast Refresh).
bootStep(() => SplashScreen.preventAutoHideAsync().catch(() => {}));
// The native→JS drop is a straight cut. `duration: 0` is the half that actually matters on Android:
// SplashScreenManager.kt (verified at expo-splash-screen@0.29.24) IGNORES `fade` and always runs its
// exit as an alpha animation over `duration` — default 400ms, which would cross-fade the native frame
// into the JS splash's intro. All the boot's motion belongs to the JS splash. `fade: false` stays for
// the platforms/versions that do read it.
bootStep(() => SplashScreen.setOptions({ fade: false, duration: 0 }));

// Start the fonts and every device-local boot read NOW, at module evaluation, so the native side works
// on them while the JS thread finishes evaluating the startup graph. Previously all of this began only
// after the first render committed, which itself waited on the fonts — one serial chain where nothing
// actually depended on anything. See src/boot/prewarm.ts for the full shape of that bug.
bootStep(prewarmFonts);
bootStep(prewarmBootReads);

/**
 * Syncs the device's FCM token with the signed-in profile. Renders nothing; lives under AuthProvider and
 * BootPhaseProvider. Held until the cold start ends: registration is not something the splash waits on,
 * and on a 300–600ms-RTT link every request that shares the boot's connection slots slows the ones it
 * does wait on (/app/bootstrap, Home's rails). The token registers the moment the splash hands off.
 */
function PushSync(): null {
  const { session } = useAuth();
  const { booting } = useBootPhase();
  usePushRegistration(booting ? null : session);
  return null;
}

/**
 * Tells the splash where the app actually is while it boots (src/boot/boot-readiness.ts
 * `reportBootRoute`). A boot bound for Home that is redirected before Home is ready — a session the
 * server rejects (the SessionGate replaces Home with /phone), a route gate — would otherwise hold the
 * splash, waiting on Home's tasks, until its 20s give-up (S-2). Renders nothing.
 */
function BootRouteWatch(): null {
  const pathname = usePathname();
  const { booting } = useBootPhase();
  useEffect(() => {
    if (booting) reportBootRoute(pathname);
  }, [booting, pathname]);
  return null;
}

/**
 * The self-hosted Inter load, in a leaf of its own. It used to live in RootLayout, where its one state
 * change (pending → loaded) re-rendered the WHOLE root tree — the splash included — in the middle of
 * the intro. Here it re-renders nothing but this null leaf. Text needs no root re-render to pick the
 * family up: every Text that mounts after the load gets it, and the fonts are prewarmed at module scope
 * (`prewarmFonts` below) so they are registered before almost anything draws.
 *
 * `useAppFonts` is TIME-BOUNDED (src/ui/fonts.ts): it reports an error rather than pending past
 * FONT_LOAD_TIMEOUT_MS — since MOB-BOOT-05 the splash release no longer waits on fonts at all (only the
 * boot_paint mark does), but the bound stays so a stalled font load can never wedge that mark — the
 * 0.17.12 "installs but won't open" bug class. Font assets are bundled (no network), so on the rare
 * load error the app simply stays on the system-font fallback.
 */
function FontLoad(): null {
  const [fontsLoaded, fontError] = useAppFonts();
  const fontsReady = fontsLoaded || fontError != null;
  // Arm the client-RUM buffer once at app root. Here, ahead of the boot_paint mark below, because a
  // child's effects run before its parent's: armed from RootLayout it would start AFTER this leaf had
  // already tried (and, unarmed, dropped) the mark. Role is tagged per-enqueue, so a role at root isn't
  // needed; we just pass the app version for the (server-bucketed) `appVersion` label.
  useEffect(() => {
    startRum(Constants.expoConfig?.version);
  }, []);
  // Record the first half of the cold start once fonts resolve (loaded or errored): bundle
  // evaluation started → the tree is fully paintable. The splash is deliberately NOT dropped here
  // (MOB-BOOT-05): hiding on this commit raced RN's first PRESENTED frame, and losing that race exposed
  // the window background for a few frames — the intermittent white flash. The JS splash drops it from
  // its own first layout (ledger D-64).
  useEffect(() => {
    if (!fontsReady) return;
    enqueueBoot("boot_paint");
  }, [fontsReady]);
  return null;
}

const launchSession = (): Promise<Session | null> => prewarmBootReads().session;

/** Wave-2 W1: fires the one-round-trip boot aggregate as soon as the session is known and seeds the
 *  query cache (me + active order/job), so the first screens paint without their own fetches. Renders
 *  nothing; lives under AuthProvider + the query provider. Failure seeds nothing — screens self-serve. */
function BootstrapSync(): null {
  // Started from the prewarmed keychain read, not the AuthProvider re-render after it (use-bootstrap.ts).
  useBootstrap(useAuth().session, launchSession);
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
  // A screen that draws its own offline banner (the order screen, D-53) holds a claim; don't double up.
  const claimed = useOfflineBannerClaimed();
  if (reachable || claimed) return null;
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
 * The JS splash covers this handoff (the navigator sits off-screen under it until its exit — see
 * `AppStage`); the suppression is what keeps the redirect beneath it from animating.
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
  // The customer web build is always the latest version, so there is nothing to update to.
  const gated = !isCustomerWebBuild() && (isUpdateRequired(current) || isVersionBelow(current, serverMin));
  if (gated) return <ForceUpdateScreen />;
  return <Stack screenOptions={booting ? bootStackScreenOptions : stackScreenOptions} />;
}

/** The cold-start splash, mounted only while the process is booting. */
function SplashWhileBooting(): React.ReactElement | null {
  return useBootPhase().booting ? <BootSplash /> : null;
}

/**
 * The app's frame during the cold start (ledger D-64, `handoff/splash-v1` § Exit). While booting it
 * holds the navigator 105% of a screen below the splash — mounted, fetching and laying out, but off
 * screen and hidden from accessibility — and the splash's exit slides it up with its top corners
 * rounding off (40 → 0, {@link RevealCorners}). Everything in that rise is native-driven: no JS-driven
 * border radius or clip over the Home tree. After the boot it is a plain full-size view: `endBoot`
 * snaps the reveal into place, and the corners/background only apply while booting.
 */
function AppStage({ children }: { children: React.ReactNode }): React.ReactElement {
  const { booting, reveal, appMountable } = useBootPhase();
  const { height } = useWindowDimensions();
  // Memoised: a fresh interpolation node on every render (this re-renders with the boot phase) would be
  // re-attached to the native-driven rise mid-flight, a one-frame jump during Home's entrance.
  const translateY = useMemo(() => reveal.y.interpolate({ inputRange: [0, 1], outputRange: [height * 1.05, 0] }), [reveal, height]);
  return (
    <Animated.View
      style={{ flex: 1, opacity: reveal.opacity, transform: [{ translateY }] }}
      importantForAccessibility={booting ? "no-hide-descendants" : "auto"}
      accessibilityElementsHidden={booting}
    >
      <View style={booting ? { flex: 1, backgroundColor: tokens.color.bg } : { flex: 1 }}>{appMountable ? children : null}</View>
      {booting ? <RevealCorners radius={reveal.radius} /> : null}
    </Animated.View>
  );
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
  // Belt-and-braces: when the throw happens on the mount pass that would have mounted the JS splash,
  // nothing else drops the native launch screen held by the module-scope preventAutoHideAsync() above,
  // so this screen would render UNDER it — a frozen icon instead of a recoverable error. Today
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
        <EmptyState
          icon="circle-alert"
          tone="error"
          title="Something went wrong"
          body="The app hit an unexpected snag. Tap to reload and pick up where you left off."
          primary={{ label: "Reload", icon: "refresh-cw", onPress: () => void retry() }}
        />
      </Screen>
    </SafeAreaProvider>
  );
}

function RootLayout(): React.ReactElement | null {
  // Pause React Query's refetchInterval polling while backgrounded (see wireFocusManager).
  useEffect(() => wireFocusManager(), []);
  // Re-probe the API the moment the app returns to the foreground or the browser reports the network
  // back, instead of waiting out reachability's backoff (see reachability-signals.ts).
  useEffect(() => wireReachabilitySignals(), []);

  // NOTE: this deliberately does NOT `return null` while the fonts load, which is what it did until the
  // cold-start work. Returning null unmounted the whole provider tree, so the session read, the
  // query-cache restore and the boot aggregate could not START until the fonts had finished — the
  // serialization prewarm.ts documents. The tree now mounts immediately and does that work DURING the
  // font load (FontLoad, a leaf, owns it — so its state change re-renders nothing else); the native
  // splash, then the JS splash, cover the screen meanwhile.
  return (
    <SafeAreaProvider>
      <FontLoad />
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
            <BootstrapSync />
            {/* Redirects to /phone when the session drops to null after boot (sign-out or a
                server-forced 401 logout) — cold-boot routing in app/index.tsx can't reach that
                transition, so without this the user is stranded on an authless protected screen. */}
            <SessionGate />
            {/* The customer-only iPhone app's backstop: a rider route reached any other way (stale deep
                link, old saved route) goes home. Inert wherever rider mode exists. */}
            <RiderRouteGate />
            {/* Tap → destination-screen latency (`nav_open`). Renders nothing; needs the router
                context, and pairs each route change with the press that caused it. */}
            <NavOpenProbe />
            {/* The app-wide default. Mounted before the splash, so the splash's light icons sit above it
                in RN's StatusBar stack (the last MOUNTED entry wins) and it takes over again when the
                splash unmounts. Screen StatusBars mount only after the boot (src/boot/ScreenStatusBar.tsx)
                — one mounting under the splash would win the stack and turn its icons dark (S-1). */}
            <StatusBar style="dark" />
            {/* ToastProvider wraps the navigator so any screen can raise an in-app toast. Its strip is
                absolutely positioned at the top inset; in the rare offline-and-toasting overlap it sits
                over the connectivity ink bar for the toast's few seconds, then clears itself. */}
            <ToastProvider>
              {/* Scopes the no-transition rule to the cold start: AppNavigator reads `booting` for
                  its screenOptions and the splash ends the phase when it hands off, so in-app
                  navigation keeps its animation. */}
              <BootPhaseProvider>
                <PushSync />
                <BootRouteWatch />
                <View style={{ flex: 1 }}>
                  {/* The cold-start splash (ledger D-64): on screen for exactly as long as the boot
                      takes, then Home rises over it. Drawn UNDER the app, which waits off-screen
                      (AppStage) until the splash's exit raises it. Unmounts when the boot ends. */}
                  <SplashWhileBooting />
                  <AppStage>
                    <ConnectivityBanner />
                    <View style={{ flex: 1 }}>
                      <AppNavigator />
                    </View>
                  </AppStage>
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
