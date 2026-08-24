import { tokens } from "@lynia/shared/tokens";

/**
 * Boot-scoped window background (MOB-BOOT-05, the white-flash half).
 *
 * The native window background is brand green (app.config.ts `backgroundColor`), because it is the
 * surface that shows whenever the window is visible with no React frame on it — the only place the
 * cold start's intermittent white flash could come from. But it must not STAY green: on Android the
 * window background also peeks out during IME-driven window resizes (the root view relayouts through
 * Yoga a few frames behind the window), and a green strip flashing under the keyboard on the white
 * /phone screen would trade one reported defect for another.
 *
 * So the boot release schedules this reset: once the destination screen has settled, flip the window
 * background to the app's own ground (`tokens.color.bg`) via expo-system-ui. Delayed rather than
 * immediate because the release fires on a JS-side approximation of "the frame is on glass"
 * (src/boot/boot-splash-hold.tsx) — resetting in the same instant would remove the green backstop at
 * exactly the moment a lagging native mount still needs it. Nothing can open a keyboard that fast; a
 * lagging first frame is precisely the window the delay covers.
 *
 * BEST-EFFORT, like every boot step: expo-system-ui is a native module, and a boot must never die —
 * or strand — on a cosmetic optimisation (the MOB-BOOT-04 rule). A failure leaves the window green,
 * which is the pre-reset state, not a broken one.
 */

/** How long after the boot release the green backstop stays armed before resetting to the app bg. */
export const WINDOW_BACKGROUND_RESET_DELAY_MS = 2_000;

let scheduled = false;

/** Schedule the one-shot post-boot reset. Idempotent — the release path can call it more than once. */
export function scheduleWindowBackgroundReset(): void {
  if (scheduled) return;
  scheduled = true;
  setTimeout(() => {
    try {
      // Lazy require so a missing/hostile native module costs the reset, not the module graph —
      // this file is imported by the root layout, which evaluates where nothing can catch a throw.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const SystemUI = require("expo-system-ui") as {
        setBackgroundColorAsync: (color: string) => Promise<void>;
      };
      SystemUI.setBackgroundColorAsync(tokens.color.bg).catch(() => {});
    } catch {
      // Leave the window on the splash green — cosmetically stale, never fatal.
    }
  }, WINDOW_BACKGROUND_RESET_DELAY_MS);
}

/** Test seam: forget the one-shot latch so each test exercises a fresh boot. */
export function resetWindowBackgroundLatchForTest(): void {
  scheduled = false;
}
