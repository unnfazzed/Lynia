import * as SplashScreen from "expo-splash-screen";
import { useCallback } from "react";
import { useBootPhase } from "./boot-phase";
import { reportBootEnded } from "./boot-readiness";
import { scheduleWindowBackgroundReset } from "./window-background";

/**
 * The two ends of the cold-start splash (ledger D-64, `packages/design/handoff/splash-v1`).
 *
 * The cold start is the JS splash (src/boot/splash/BootSplash.tsx): an animated brand intro, then a
 * loading state that stays up for exactly as long as the boot takes, then a handoff into Home. The
 * NATIVE launch screen only covers the time before JS can draw: it is held (`preventAutoHideAsync` in
 * app/_layout.tsx) until the JS splash has laid out its first frame, then dropped onto that frame —
 * {@link releaseNativeSplash}. Both are the same brand green, so the drop is invisible.
 *
 * Ending the boot is the other end — {@link useBootSplashRelease}: native splash gone (if it somehow
 * still isn't), the window background's green→white reset scheduled, and the boot phase ended (which
 * unmounts the JS splash, snaps the navigator into place and gives the in-app transitions back). The
 * JS splash calls it when its exit finishes; so do the force-update gate and the root ErrorBoundary,
 * which replace the navigator and must never render under a splash that is still up.
 */

// One native release per process, whichever caller fires first — a module latch rather than
// per-component state because the cold start is a process-lifetime fact (same reasoning as
// window-background's latch).
let nativeReleased = false;
let bootEnded = false;

/** Test seam: forget the one-shot latches so each test exercises a fresh cold start. */
export function resetBootSplashReleaseForTest(): void {
  nativeReleased = false;
  bootEnded = false;
}

/** Drop the native launch screen. Idempotent; a no-op in dev / Fast Refresh, where it is long gone. */
export function releaseNativeSplash(): void {
  if (nativeReleased) return;
  nativeReleased = true;
  // hideAsync is a JS wrapper around a sync native call; `async` folds a sync throw into the
  // rejection this catch already swallows.
  SplashScreen.hideAsync().catch(() => {});
}

/**
 * The ONE way to end the cold start — native hide + window-background reset + boot-phase end, as a
 * single idempotent step. A caller outside `BootPhaseProvider` (the ErrorBoundary's own tree) gets the
 * default context's no-op `endBoot`, which is correct — there is no navigator to un-suppress there.
 */
export function useBootSplashRelease(): () => void {
  const { endBoot } = useBootPhase();
  return useCallback(() => {
    releaseNativeSplash();
    if (!bootEnded) {
      bootEnded = true;
      scheduleWindowBackgroundReset();
    }
    // The process-lifetime stamp — also from callers outside BootPhaseProvider (the ErrorBoundary),
    // whose `endBoot` is the default no-op: a remounted root layout must not replay the splash.
    reportBootEnded();
    // Idempotent (a plain setState to false) — safe to repeat after another caller released.
    endBoot();
  }, [endBoot]);
}
