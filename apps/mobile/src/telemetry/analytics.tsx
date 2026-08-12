import { useSegments } from "expo-router";
import React, { useEffect, useState } from "react";
import { InteractionManager } from "react-native";
import { analyticsEnabled, POSTHOG_API_KEY, POSTHOG_HOST } from "../config";

/** The SDK's shape, as a TYPE only — `typeof import(...)` is erased at compile time, so naming these
 *  costs nothing at runtime and the module stays off the startup graph. */
type PostHogModule = typeof import("posthog-react-native");
type PostHogProviderComponent = PostHogModule["PostHogProvider"];

/**
 * Manual screen tracking. expo-router runs react-navigation v7, where PostHog's captureScreens
 * autocapture no longer works (the SDK's own docs say to capture manually from the router state:
 * https://docs.expo.dev/router/reference/screen-tracking/). We capture the route PATTERN
 * (`/order/[id]`, from useSegments) rather than the concrete pathname (`/order/abc123`), so screen
 * analytics stay low-cardinality and order/user identifiers never leave the device. Mounts only
 * inside the provider, so `usePostHog` always resolves.
 *
 * `usePostHog` is required lazily for the same reason the provider below is: a top-level import of
 * `posthog-react-native` from this module would put the whole SDK back on the cold-start path, which
 * is precisely what this file was changed to avoid.
 */
function ScreenTracker(): null {
  const { usePostHog } = require("posthog-react-native") as PostHogModule;
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
 * RUM answers "is the app fast", PostHog answers "what people actually do in it".
 *
 * Gating mirrors every other founder-provisioned integration in this app (Places, FCM, EAS):
 * without `EXPO_PUBLIC_POSTHOG_API_KEY` this renders children directly — no provider, no SDK, no
 * network, byte-for-byte the app behaviour before analytics existed.
 *
 * WHY THE SDK IS LOADED LAZILY. The key gate above is a RENDER-time check, but a top-level
 * `import { PostHogProvider } from "posthog-react-native"` is an EVALUATION-time cost — so the whole
 * SDK (307 KB across 108 modules, measured against the production Android bundle) ran on every cold
 * start whether or not analytics was switched on, and on the critical path to the first frame even
 * when it was. Requiring it from an effect instead means: no key ⇒ the SDK is never evaluated at all,
 * and with a key ⇒ it is evaluated AFTER the first interactions have settled, so it costs nothing
 * before the user sees the app. `require` (not `import()`) because Metro bundles a statically
 * analyzable require into the same bundle — this defers evaluation, it does not add a network fetch.
 *
 * The delay is free: nothing is lost by arming analytics a few frames late. `ScreenTracker` captures
 * on mount, so the launch screen is still recorded, and the SDK replays app-lifecycle events itself.
 *
 * What's captured when enabled:
 *  - screens — route patterns via ScreenTracker above;
 *  - app lifecycle — installs, opens, backgrounds (SDK default; retention/DAU come from these).
 * Autocapture stays OFF: touch capture is high-noise, and on screens holding phone numbers / KYC
 * documents the element text it collects is a privacy liability, not a signal; screen autocapture
 * simply doesn't work under expo-router (see ScreenTracker).
 */
export function AnalyticsProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [Provider, setProvider] = useState<PostHogProviderComponent | null>(null);

  useEffect(() => {
    if (!analyticsEnabled()) return;
    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(() => {
      if (cancelled) return;
      try {
        const { PostHogProvider } = require("posthog-react-native") as PostHogModule;
        // The setState updater form would CALL a component passed bare, so wrap it in a thunk.
        setProvider(() => PostHogProvider);
      } catch {
        // Analytics is an accelerant, never a dependency: a failed load leaves the app running with
        // no provider, exactly as if no key had been configured.
      }
    });
    return () => {
      cancelled = true;
      task.cancel();
    };
  }, []);

  if (!Provider) return <>{children}</>;
  return (
    <Provider apiKey={POSTHOG_API_KEY as string} options={{ host: POSTHOG_HOST }} autocapture={false}>
      <ScreenTracker />
      {children}
    </Provider>
  );
}
