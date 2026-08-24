import * as SplashScreen from "expo-splash-screen";
import { usePathname } from "expo-router";
import { useCallback, useEffect } from "react";
import { InteractionManager } from "react-native";
import { useBootPhase } from "./boot-phase";
import { scheduleWindowBackgroundReset } from "./window-background";

/**
 * The cold-start splash hold — ONE screen, the NATIVE one (owner instruction 2026-08-24: "for splash
 * screen i only want 1 screen, not 3 different versions").
 *
 * Until MOB-BOOT-05 the boot showed the brand-green frame as three stacked look-alikes: the native
 * launch screen (dropped as soon as fonts registered), the JS `SplashView` on route "/", then a
 * `BootSplashHold` overlay rendering `SplashView` again over the destination. Keeping the three
 * pixel-identical was a standing maintenance contract, and it failed visibly the moment the native
 * frame's rendering quality diverged from the vector JS frames (the PNG resampling this fix removes
 * in splash-lockup.ts) — plus the early native hide raced RN's first presented frame, which is where
 * the intermittent white flash lived.
 *
 * Now the native splash is simply never dropped until the FIRST real screen has presented: this
 * controller (renders nothing, mounted once by the root layout) owns the single release. On Android
 * the mechanism is expo-splash-screen suspending the window's first draw (`onPreDraw → false`,
 * SplashScreenManager.kt @0.29.24), so during the whole boot the ONLY thing on screen is the system
 * splash — the JS `SplashView` on "/" never reaches the glass on a production cold start (it remains
 * as the identical fallback frame for dev reloads, where the native splash is already gone, and it
 * is still the parity target for LJ.splash). One rendering of the logo, one screen, no handoffs to
 * keep honest.
 *
 * The release trigger is unchanged from the overlay design (it was the right trigger — only what it
 * released was wrong):
 *
 * - **Dismiss-on-any-route.** `usePathname()` leaving `"/"` — the boot splash route — marks the
 *   destination's COMMIT; one `runAfterInteractions` + `requestAnimationFrame` after it approximates
 *   its presented frame (Paper exposes no compositor callback), bounded by SETTLE_CAP_MS in case
 *   interactions never drain. A cold start can land on home, onboarding, the phone gate, the rider
 *   dashboard, or a push-tap deep link; the pathname flip covers all of them without a per-screen
 *   signal that would rot.
 * - **The absolute cap.** Whatever else happens, the splash force-releases at ABS_CAP_MS from mount.
 *   A too-early release costs one visible beat (over the green window background — see below); a
 *   stuck splash would cost the whole app. The force-update screen replaces the Stack while the
 *   pathname stays "/", so it drops the splash itself (app/force-update.tsx) rather than waiting on
 *   this cap; the ErrorBoundary already did the same.
 *
 * Releasing does three things, together, exactly once: hides the native splash (revealing the
 * destination with `duration: 0` — the no-animation cut the owner specified), ends the boot phase
 * (re-enabling the in-app screen transitions the phase suppressed), and schedules the window
 * background's green→white reset (src/boot/window-background.ts) — the green window is the backstop
 * under any residual native-mount lag at the reveal, which is why the reset is delayed rather than
 * immediate.
 */

/** Hard ceiling from mount — the never-strand guarantee. */
export const BOOT_HOLD_ABS_CAP_MS = 8_000;
/** Post-commit settle bound — release even if the destination's interactions never drain. */
export const BOOT_HOLD_SETTLE_CAP_MS = 2_000;

// One native release per process, whichever caller fires first — this controller's triggers, the
// force-update gate, or the root ErrorBoundary. A module latch rather than per-component state
// because the cold start is a process-lifetime fact (same reasoning as window-background's latch),
// and because idempotence across CALLERS is the point: the absolute-cap timer must not re-run the
// side effects a screen that replaced the navigator already ran.
let nativeReleased = false;

/** Test seam: forget the one-shot latch so each test exercises a fresh cold start. */
export function resetBootSplashReleaseForTest(): void {
  nativeReleased = false;
}

function releaseNativeSplash(): void {
  if (nativeReleased) return;
  nativeReleased = true;
  // hideAsync is a JS wrapper around a sync native call; `async` folds a sync throw into the
  // rejection this catch already swallows. In dev/Fast Refresh the splash is long gone — no-op.
  SplashScreen.hideAsync().catch(() => {});
  scheduleWindowBackgroundReset();
}

/**
 * The ONE way to end the cold-start splash — native hide + window-background reset + boot-phase end,
 * as a single idempotent step. Everything that can stand in for the navigator during boot releases
 * through this: `BootSplashHold` (the ordinary path), the force-update gate and the root
 * ErrorBoundary (both replace the Stack while the pathname stays "/", so the route trigger can never
 * fire for them). A caller outside `BootPhaseProvider` (the ErrorBoundary's own tree) gets the
 * default context's no-op `endBoot`, which is correct — there is no navigator to un-suppress there.
 */
export function useBootSplashRelease(): () => void {
  const { endBoot } = useBootPhase();
  return useCallback(() => {
    releaseNativeSplash();
    // Idempotent (a plain setState to false) — safe to repeat after another caller released.
    endBoot();
  }, [endBoot]);
}

export function BootSplashHold(): null {
  const pathname = usePathname();
  const release = useBootSplashRelease();

  useEffect(() => {
    const t = setTimeout(release, BOOT_HOLD_ABS_CAP_MS);
    return () => clearTimeout(t);
  }, [release]);

  useEffect(() => {
    if (pathname === "/") return; // still on the boot splash route — keep holding
    const handle = InteractionManager.runAfterInteractions(() => {
      // One frame past the interactions drain — the closest JS can get to "the frame is on glass".
      requestAnimationFrame(release);
    });
    const t = setTimeout(release, BOOT_HOLD_SETTLE_CAP_MS);
    return () => {
      handle.cancel();
      clearTimeout(t);
    };
  }, [pathname, release]);

  return null;
}

export default BootSplashHold;
