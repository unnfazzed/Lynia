import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { Animated } from "react-native";
import { getBootReadiness, reportBootEnded } from "./boot-readiness";

/**
 * "Is the process still in its cold start?" — one boolean, owned at the root.
 *
 * WHY IT EXISTS. The cold start has to read as ONE static green screen (owner instruction
 * 2026-08-18), and the root Stack's default slide/fade is a moving frame between the splash and the
 * destination. The blunt fix is `animation: "none"` on the navigator, but that is app-wide: every
 * later push becomes an instant cut too, and the owner asked to KEEP the in-app animation. So the
 * suppression has to be scoped to the boot handoff, and something has to say when that is over.
 *
 * WHY IT CAN'T BE A PER-ROUTE OPTION. In native-stack the transition belongs to the screen being
 * presented, not the one being left — so pinning `animation: "none"` on the splash route does
 * nothing, and a cold start can land on /home, /rider, /onboarding, /phone, /profile/setup or a
 * push-tap deep link into an order. Covering that set by name would be a list that silently rots the
 * first time a boot destination is added. A phase flag covers every destination, including ones that
 * don't exist yet.
 *
 * WHY NOT A MODULE-SCOPE BOOLEAN. Flipping it has to re-render the navigator so the new screenOptions
 * are picked up for subsequent navigations; a plain module variable would change without telling
 * React. It is deliberately one-way — nothing sets it back to `true`, because a process only cold
 * starts once (the same reasoning as `BootSplashHold` returning null forever once released).
 *
 * PROCESS-LIFETIME, NOT MOUNT-LIFETIME. The provider can remount without the process restarting: the
 * root ErrorBoundary's "Reload" re-renders the whole root layout. A fresh `useState(true)` there would
 * replay the cold-start splash (~1.7–3.6s) over a recovery tap. So the initial value reads the boot's
 * process-lifetime end stamp (`boot-readiness` `endedAt`), and `endBoot` writes it.
 */
export interface BootPhase {
  /** True until the splash has handed off to the first real screen; drives the boot-only animation suppression. */
  booting: boolean;
  /** Called once when the splash hands off (or something that replaces the navigator ends the boot). */
  endBoot: () => void;
  /**
   * The app's entrance from under the splash (`handoff/splash-v1` § Exit, ledger D-64). While booting the
   * navigator sits off-screen BELOW the splash overlay, and the splash's exit slides it up over itself:
   * `y` 0 → 1 is that rise (native-driven), `radius` the top corners (40 → 0, native-driven — drawn by
   * `RevealCorners` as scaled corner cut-outs, since border radius isn't native-animatable), `opacity`
   * the reduced-motion cross-fade. `endBoot` snaps all three to "in place", so a boot that ends any other way never strands the app off-screen.
   */
  reveal: BootReveal;
  /**
   * Whether the app under the splash may mount yet. False only for the very first frames of a cold
   * start: the splash draws ALONE first, so its first frame is not held up by the navigator's mount
   * (which commits one frame later, still off-screen). `markSplashDrawn` flips it; `endBoot` too.
   */
  appMountable: boolean;
  markSplashDrawn: () => void;
}

export interface BootReveal {
  y: Animated.Value;
  radius: Animated.Value;
  opacity: Animated.Value;
}

/** The handoff's rising app starts with 40px top corners. */
export const REVEAL_RADIUS = 40;

const inPlace = (): BootReveal => ({ y: new Animated.Value(1), radius: new Animated.Value(0), opacity: new Animated.Value(1) });

/** Default is "not booting": a subtree mounted without the provider (tests, the parity lane, the
 *  error boundary's own tree) should behave like the ordinary app, not like a permanent cold start. */
const BootPhaseContext = createContext<BootPhase>({ booting: false, endBoot: () => {}, reveal: inPlace(), appMountable: true, markSplashDrawn: () => {} });

export function BootPhaseProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [booting, setBooting] = useState(() => getBootReadiness().endedAt == null);
  const [splashDrawn, setSplashDrawn] = useState(false);
  const markSplashDrawn = useCallback(() => setSplashDrawn(true), []);
  // Lazily built so a remount after the boot (see above) starts with the app in place.
  const revealRef = useRef<BootReveal | null>(null);
  revealRef.current ??= booting
    ? {
        y: new Animated.Value(0),
        radius: new Animated.Value(REVEAL_RADIUS),
        opacity: new Animated.Value(1),
      }
    : inPlace();
  const reveal = revealRef.current;
  const endBoot = useCallback(() => {
    reportBootEnded();
    for (const v of [reveal.y, reveal.radius, reveal.opacity]) v.stopAnimation();
    reveal.y.setValue(1);
    reveal.radius.setValue(0);
    reveal.opacity.setValue(1);
    setBooting(false);
  }, [reveal]);
  const appMountable = splashDrawn || !booting;
  const value = useMemo(() => ({ booting, endBoot, reveal, appMountable, markSplashDrawn }), [booting, endBoot, reveal, appMountable, markSplashDrawn]);
  return <BootPhaseContext.Provider value={value}>{children}</BootPhaseContext.Provider>;
}

export function useBootPhase(): BootPhase {
  return useContext(BootPhaseContext);
}
