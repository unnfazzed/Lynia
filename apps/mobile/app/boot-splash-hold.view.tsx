import { usePathname } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { InteractionManager, StyleSheet, View } from "react-native";
import { SplashView } from "./splash.view";

/**
 * The cold-start splash HOLD (RCA 2026-08-17 §1.2, the "full fix" the first pass deferred until
 * `boot_home_paint` existed to measure it — owner instruction 2026-08-18 pulled it forward): keep the
 * brand-green splash frame on screen until the FIRST real screen has actually presented a frame, so
 * the boot reads green → destination with no between-screens gap at all (the accentWash contentStyle
 * remains underneath as the ground for every LATER transition; this overlay exists only for the boot).
 *
 * Mechanics, and the two failure modes they close:
 *
 * - **Dismiss-on-any-route.** The release trigger is `usePathname()` leaving `"/"` — the boot splash
 *   route — NOT any one screen's cooperation. A cold start can land on home, onboarding, the phone
 *   gate, the rider dashboard, or a push-tap deep link into an order; wiring a per-screen signal would
 *   strand the overlay on every route that forgot to send it. The pathname flip marks the destination's
 *   COMMIT; one `runAfterInteractions` + `requestAnimationFrame` after it approximates its presented
 *   frame (the same JS-side lower-bound reasoning as `boot_home_paint` — Paper exposes no compositor
 *   callback), bounded by SETTLE_CAP_MS in case interactions never drain.
 * - **The absolute cap.** Whatever else happens — a route that never settles, an interaction handle
 *   leak, a code path nobody predicted — the overlay force-dismisses at ABS_CAP_MS from mount. A
 *   too-early dismissal costs one visible beat of the old transition; a stuck overlay would cost the
 *   whole app. The cap is generous because `app/index.tsx` shows the identical green SplashView while
 *   boot reads settle, so overlay time is only ever ADDITIVE past the redirect.
 *
 * Renders `SplashView` itself (identical pixels to the native splash and index.tsx's frame), so every
 * handoff in the chain native → JS splash → this hold is a visual no-op. Once released it returns null
 * forever — this is a cold-start object, warm navigation never sees it. Named *.view.tsx like the other
 * presentational files in app/ (splash.view, onboarding.view); it is mounted by _layout.tsx, not routed to.
 */

/** Hard ceiling from mount — the never-strand guarantee. */
export const BOOT_HOLD_ABS_CAP_MS = 8_000;
/** Post-commit settle bound — release even if the destination's interactions never drain. */
export const BOOT_HOLD_SETTLE_CAP_MS = 2_000;

export function BootSplashHold(): React.ReactElement | null {
  const pathname = usePathname();
  const [held, setHeld] = useState(true);
  const release = useCallback(() => setHeld(false), []);

  useEffect(() => {
    const t = setTimeout(release, BOOT_HOLD_ABS_CAP_MS);
    return () => clearTimeout(t);
  }, [release]);

  useEffect(() => {
    if (pathname === "/") return; // still on the boot splash route — keep holding
    let done = false;
    const releaseOnce = (): void => {
      if (done) return;
      done = true;
      release();
    };
    const handle = InteractionManager.runAfterInteractions(() => {
      // One frame past the interactions drain — the closest JS can get to "the frame is on glass".
      requestAnimationFrame(releaseOnce);
    });
    const t = setTimeout(releaseOnce, BOOT_HOLD_SETTLE_CAP_MS);
    return () => {
      handle.cancel();
      clearTimeout(t);
    };
  }, [pathname, release]);

  if (!held) return null;
  return (
    // pointerEvents "auto" swallows touches while up — the screen underneath isn't ready to receive
    // them anyway, and a tap leaking through to a half-presented button would be worse than a beat of
    // unresponsiveness on a frame that looks like the splash.
    <View style={StyleSheet.absoluteFill} pointerEvents="auto">
      <SplashView />
    </View>
  );
}

export default BootSplashHold;
