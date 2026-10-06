import { tokens } from "@lynia/shared/tokens";
import { StatusBar } from "expo-status-bar";
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, type LayoutChangeEvent, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path, Polygon } from "react-native-svg";
import { probeNow } from "../../net/reachability";
import { useReachability } from "../../net/use-reachability";
import { Wordmark } from "../../ui/Brand";
import { DOVE_BODY_POLYGONS, DOVE_CREASE_PATHS, DOVE_CREASE_WIDTH, DOVE_KEEL_POLYGON, DOVE_VIEWBOX } from "../../ui/dove-paths";
import { useBootPhase } from "../boot-phase";
import { reportSplashExit, useBootReadiness } from "../boot-readiness";
import { releaseNativeSplash, useBootSplashRelease } from "../boot-splash-hold";
import { S } from "./copy";
import { held, keyframesEasing, keyframesInput, popEasing } from "./motion";
import { CARD_H_ESTIMATE, PANEL_H_ESTIMATE, splashGeometry } from "./geometry";
import { EXIT, GIVE_UP_MS, INTRO_MS, SLOW_AFTER_MS, type StepState, nextStepChange, shownSteps, splashDoneAt, stepStates, stepTimes } from "./timeline";

/**
 * The cold-start splash — "1a Sun & orbit" (`packages/design/handoff/splash-v1`, ledger D-64; it
 * replaces the static green dove frame, journey node 0·1).
 *
 * It is on screen for exactly as long as the app takes to be ready: the brand intro plays (1300ms),
 * then the steps card ticks off the three REAL boot tasks (src/boot/boot-readiness.ts) — the session
 * decision, Home's profile read, Home's first content — and the moment the last one is done the sun
 * floods the screen and Home slides up over it. Anywhere other than Home (onboarding, sign-in, the
 * rider app, a push-tap deep link) hands off straight after step 1, without the exit (handoff:
 * "skip the exit and route to onboarding/login after step 1"). Timing rules: ./timeline.ts.
 *
 * Mounted by the root layout BELOW the navigator while `booting`; the navigator itself is held
 * off-screen (BootPhase `reveal`) until the exit raises it, so Home mounts, fetches and lays out
 * underneath the splash and arrives fully drawn.
 *
 * MOTION RUNS ON THE UI THREAD ONLY. Home mounts and fetches underneath during the whole splash, so
 * the JS thread is busy exactly when the motion plays. Every animation is therefore ONE native-driven
 * `Animated.timing` — delays, pop overshoots and multi-keyframe loops are folded into the easing
 * (./motion.ts), loops are native `Animated.loop`s of a single timing, and nothing waits on a JS
 * timer or completion callback between frames. (`Animated.delay`/`delay:` are JS `setTimeout`s and an
 * `Animated.sequence` is chained from JS, which is what made the intro bunch up, the loops hitch and
 * the pops stall on real devices.) The brand art is a memoised component with stable animated nodes,
 * so the step clock's re-renders never rebuild a native-driven transform mid-animation (a rebuild
 * re-applies the stale JS-side value for a frame — the sun flashing back to size mid-exit).
 *
 * Reduced motion: no pops, drift, spin, breathing or bob — everything sits in its final place and
 * state changes cross-fade (200ms).
 */

const C = tokens.color;
const SUN = 220;
const ORBIT = 272;
const DOT = 22;
const DOT_RING = 5;
const DOVE = 128;
const WORDMARK = 40;
/** How long "Try again" shows loading before the offline panel can come back. */
const RETRY_GRACE_MS = 3000;
/** One orbit lap, and the breathe / bob cycle (handoff § Loading loops). */
const ORBIT_LAP_MS = 2600;
const BREATHE_MS = 2400;
/** Blob drift: three 2000ms keyframe segments (handoff: 6s). */
const DRIFT_MS = 6000;

const POP = Easing.bezier(0.3, 1.5, 0.5, 1);
const TICK_POP = Easing.bezier(0.3, 1.6, 0.5, 1);
const EASE_OUT = Easing.bezier(0, 0, 0.58, 1);
const EASE_IN_OUT = Easing.bezier(0.42, 0, 0.58, 1);
const RISE = Easing.bezier(0.2, 0.7, 0.3, 1);
const SPRING_OUT = Easing.bezier(0.2, 0.9, 0.3, 1.2);
const SETTLE = Easing.bezier(0.2, 0.9, 0.3, 1);
const SUN_FLOOD = Easing.bezier(0.6, 0, 0.2, 1);
const HOME_UP = Easing.bezier(0.2, 0.8, 0.2, 1);
const POP_CURVE = popEasing(POP);
const TICK_CURVE = popEasing(TICK_POP);
const SWING_CURVE = keyframesEasing(2, EASE_IN_OUT);
const DRIFT_CURVE = keyframesEasing(3, EASE_IN_OUT);
const SWING_IN = keyframesInput(2);
const DRIFT_IN = keyframesInput(3);

/** The dove's three facets, each folding in about its own centre (CSS `transform-box: fill-box`). */
const FACETS = [
  {
    points: DOVE_BODY_POLYGONS[0],
    fill: C.accent,
    origin: "44.8% 25%",
    delay: 250,
  },
  {
    points: DOVE_BODY_POLYGONS[1],
    fill: C.accent,
    origin: "54.2% 44.8%",
    delay: 450,
  },
  {
    points: DOVE_KEEL_POLYGON,
    fill: C.accentPressed,
    origin: "68.8% 57.3%",
    delay: 650,
  },
] as const;

/** Decorative blobs. `top` is a function of the screen height H and the anchor A (44% of H, or higher
 *  where the screen is short — see {@link splashGeometry}); the sky blob sits at "anchor + 64". */
const BLOBS = [
  {
    color: C.coral,
    size: 74,
    pos: (H: number, _A: number) => ({ left: 28, top: 0.13 * H }),
    pop: 550,
    drift: 1300,
  },
  {
    color: C.illusPink,
    size: 34,
    pos: (H: number, _A: number) => ({ right: 40, top: 0.21 * H }),
    pop: 700,
    drift: 1600,
  },
  {
    color: C.sky,
    size: 54,
    pos: (_H: number, A: number) => ({ right: -8, top: A + 64 }),
    pop: 800,
    drift: 1900,
  },
  {
    color: C.riderAccent,
    size: 150,
    pos: (_H: number, _A: number) => ({ left: -62, bottom: -56 }),
    pop: 900,
    drift: 1300,
  },
] as const;

/** What a screen reader hears as a step completes (accessibility only — the card draws the tick). */
export function stepDoneAnnouncement(label: string): string {
  return `${label}, done`;
}

/** One native-driven timing; `delay` is folded into the easing (no JS timer). */
const timing = (v: Animated.Value, toValue: number, duration: number, easing: (x: number) => number, delay = 0): Animated.CompositeAnimation =>
  Animated.timing(v, {
    toValue,
    ...held(delay, duration, easing),
    useNativeDriver: true,
  });

/** A native loop of one 0 → 1 timing — `Animated.loop` only loops on the UI thread around a single timing. */
const loop = (v: Animated.Value, duration: number, easing: (x: number) => number): Animated.CompositeAnimation =>
  Animated.loop(Animated.timing(v, { toValue: 1, duration, easing, useNativeDriver: true }));

/**
 * The OS reduce-motion setting. Starts `false` so the intro begins on the very first frame instead of
 * waiting on the async read; if the read says reduce, every animation snaps to its final state (the
 * effects below re-run on the change), which is what reduced motion draws anyway.
 */
function useReduceMotionSetting(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((r) => alive && setReduce(r))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", (r) => setReduce(r));
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduce;
}

type Phase = "boot" | "loading" | "offline" | "done";

interface SplashValues {
  sun: Animated.Value;
  facets: Animated.Value[];
  crease: Animated.Value;
  blobs: Animated.Value[];
  drift: Animated.Value[];
  wordmark: Animated.Value;
  orbitIn: Animated.Value;
  spin: Animated.Value;
  spinOffset: Animated.Value;
  breathe: Animated.Value;
  bob: Animated.Value;
  card: Animated.Value;
  slow: Animated.Value;
  offline: Animated.Value;
  idle: Animated.Value;
  exitOrbit: Animated.Value;
  exitDove: Animated.Value;
  exitSun: Animated.Value;
  ringSpin: Animated.Value;
}

export function BootSplash(): React.ReactElement {
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [size, setSize] = useState({ W: window.width, H: window.height });
  const { W, H } = size;

  const reduce = useReduceMotionSetting();
  const reachable = useReachability();
  const readiness = useBootReadiness();
  const { reveal, markSplashDrawn } = useBootPhase();
  const release = useBootSplashRelease();

  // ── The clock: ms since the splash first drew. Re-rendered only at the moments something changes. ──
  const t0 = useRef(Date.now()).current;
  const [t, setT] = useState(0);
  const [retryAt, setRetryAt] = useState<number | null>(null);

  const times = useMemo(() => {
    const rel = (at: number | null): number | null => (at == null ? null : Math.max(0, at - t0));
    return stepTimes([rel(readiness.readyAt.session), rel(readiness.readyAt.profile), rel(readiness.readyAt.home)], shownSteps(readiness.destination));
  }, [readiness, t0]);
  const steps = stepStates(times, t);
  const loading = t >= INTRO_MS;
  const readyDoneAt = splashDoneAt(times, readiness.destination);
  // `done` is one-way: once the exit (or the cut) has started it never flips back — a request failing
  // mid-exit (offline) must not stop the exit and snap Home into place. Latched in render (idempotent)
  // because the flip-back render would otherwise reach the exit effect's cleanup before any effect could.
  const doneLatch = useRef(false);
  // Offline only while the boot is still WAITING on something (S-4): once every step's real task is in,
  // the remaining time is the handoff's minimums, not the network — a panel there only flashes.
  const offline = !doneLatch.current && loading && readyDoneAt == null && !reachable && (retryAt == null || t - retryAt >= RETRY_GRACE_MS);
  // The give-up bound counts ONLINE loading time only: time spent on the offline panel is time the
  // network, not the app, was the holdup, so coming back after 20s offline still gets a real load.
  const [offlineSince, setOfflineSince] = useState<number | null>(null);
  const [offlineTotal, setOfflineTotal] = useState(0);
  const giveUpAt = GIVE_UP_MS + offlineTotal + (offlineSince != null ? Math.max(0, t - offlineSince) : 0);
  const doneAt = readyDoneAt ?? (offline ? null : giveUpAt);
  const done = doneLatch.current || (doneAt != null && t >= doneAt);
  if (done) doneLatch.current = true;
  useEffect(() => {
    if (offline) {
      setOfflineSince((s) => s ?? t);
      return;
    }
    if (offlineSince == null) return;
    // Real elapsed time (not the last clock tick) so the bound never under-counts the outage.
    setOfflineTotal((total) => total + Math.max(t - offlineSince, Date.now() - t0 - offlineSince));
    setOfflineSince(null);
  }, [offline, offlineSince, t, t0]);
  // A full exit into Home; anywhere else (or a give-up before the destination is known) is a straight cut.
  const toHome = readiness.destination === "/home";
  const phase: Phase = done ? "done" : offline ? "offline" : loading ? "loading" : "boot";
  const slow = phase === "loading" && t >= INTRO_MS + SLOW_AFTER_MS;
  // The steps card is on screen while loading and through the exit; hidden in the intro and offline.
  const cardShown = phase === "loading" || phase === "done";

  // Wake at the next moment anything changes (intro end, a step boundary, the slow pill, the end of a
  // retry's grace, done). A readiness stamp that is already in the past schedules an immediate wake.
  useEffect(() => {
    if (done) return;
    const upcoming = [INTRO_MS, INTRO_MS + SLOW_AFTER_MS, doneAt, retryAt != null ? retryAt + RETRY_GRACE_MS : null, nextStepChange(times, t)].filter(
      (x): x is number => x != null && x > t,
    );
    if (!upcoming.length) return;
    const wait = Math.max(0, Math.min(...upcoming) - (Date.now() - t0));
    const handle = setTimeout(() => setT(Date.now() - t0), wait);
    return () => clearTimeout(handle);
  }, [t, t0, times, doneAt, retryAt, done]);

  // ── Animated values ──
  const v = useRef<SplashValues>({
    sun: new Animated.Value(0),
    facets: FACETS.map(() => new Animated.Value(0)),
    crease: new Animated.Value(0),
    blobs: BLOBS.map(() => new Animated.Value(0)),
    drift: BLOBS.map(() => new Animated.Value(0)),
    wordmark: new Animated.Value(0),
    orbitIn: new Animated.Value(0),
    spin: new Animated.Value(0),
    spinOffset: new Animated.Value(0),
    breathe: new Animated.Value(0),
    bob: new Animated.Value(0),
    card: new Animated.Value(0),
    slow: new Animated.Value(0),
    offline: new Animated.Value(0),
    idle: new Animated.Value(0),
    exitOrbit: new Animated.Value(0),
    exitDove: new Animated.Value(0),
    exitSun: new Animated.Value(0),
    ringSpin: new Animated.Value(0),
  }).current;

  // Boot: the intro timeline. Every element starts on the first frame; its handoff delay is held
  // inside its own curve, so the stagger keeps time even while JS is busy mounting Home.
  useEffect(() => {
    if (reduce) {
      for (const x of [v.sun, v.crease, v.wordmark, ...v.facets, ...v.blobs]) x.setValue(1);
      return;
    }
    const intro = Animated.parallel([
      timing(v.sun, 1, 700, POP_CURVE, 100),
      ...FACETS.map((f, i) => timing(v.facets[i]!, 1, 500, EASE_OUT, f.delay)),
      timing(v.crease, 1, 300, EASE_OUT, 950),
      ...BLOBS.map((b, i) => timing(v.blobs[i]!, 1, 600, POP_CURVE, b.pop)),
      timing(v.wordmark, 1, 550, RISE, 1000),
    ]);
    intro.start();
    // Drift: CSS `drift` keyframes (0 → 33% → 66% → 100%), ease-in-out per segment, as one native loop.
    // Only its START waits on a JS timer — the blob is at rest then, so a late start is invisible.
    const drifts = BLOBS.map((b, i) => Animated.sequence([Animated.delay(b.drift), loop(v.drift[i]!, DRIFT_MS, DRIFT_CURVE)]));
    drifts.forEach((d) => d.start());
    const ring = loop(v.ringSpin, 800, Easing.linear);
    ring.start();
    return () => {
      intro.stop();
      drifts.forEach((d) => d.stop());
      ring.stop();
    };
  }, [reduce, v]);

  // Loading: orbit, breathing sun, bobbing dove — paused (orbit) or stopped while offline / done.
  const looping = phase === "loading" || phase === "offline";
  useEffect(() => {
    if (!looping) return;
    const fade = reduce ? EXIT.fadeMs : 400;
    const shown = Animated.parallel([timing(v.orbitIn, 1, fade, SETTLE), timing(v.card, phase === "loading" ? 1 : 0, reduce ? EXIT.fadeMs : 500, SPRING_OUT)]);
    shown.start();
    return () => shown.stop();
  }, [reduce, looping, phase, v]);

  // The orbit pauses where it is (offline) and resumes from there. The lap itself is a native loop
  // from 0; the paused angle lives in `spinOffset` (rotation = (offset + spin) mod 1), so resuming
  // never needs a JS-chained "finish this lap" step. A pause reads the native angle asynchronously, so
  // a resume waits for the last pause to land.
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );
  const spinPaused = useRef<Promise<void>>(Promise.resolve());
  const spinPhase = useRef(0);
  useEffect(() => {
    if (reduce || phase !== "loading") return;
    let alive = true;
    void spinPaused.current.then(() => {
      if (!alive) return;
      v.spin.setValue(0);
      loop(v.spin, ORBIT_LAP_MS, Easing.linear).start();
    });
    const breathe = loop(v.breathe, BREATHE_MS, SWING_CURVE);
    const bob = loop(v.bob, BREATHE_MS, SWING_CURVE);
    v.breathe.setValue(0);
    v.bob.setValue(0);
    breathe.start();
    bob.start();
    return () => {
      alive = false;
      spinPaused.current = new Promise((resolve) => {
        v.spin.stopAnimation((x) => {
          spinPhase.current = (spinPhase.current + x) % 1;
          v.spinOffset.setValue(spinPhase.current);
          v.spin.setValue(0);
          resolve();
        });
      });
      breathe.stop();
      bob.stop();
      // Settle the breathe/bob back to rest instead of freezing mid-swing (not on unmount).
      if (mounted.current) {
        timing(v.breathe, 0, 300, EASE_OUT).start();
        timing(v.bob, 0, 300, EASE_OUT).start();
      }
    };
  }, [reduce, phase, v]);

  // Offline panel, idle dot and the lift that keeps the brand clear of the panel.
  useEffect(() => {
    const on = phase === "offline" ? 1 : 0;
    const a = Animated.parallel([timing(v.offline, on, reduce ? EXIT.fadeMs : 450, SETTLE), timing(v.idle, on, reduce ? EXIT.fadeMs : 300, EASE_OUT)]);
    a.start();
    return () => a.stop();
  }, [reduce, phase, v]);

  useEffect(() => {
    const a = timing(v.slow, slow ? 1 : 0, reduce ? EXIT.fadeMs : 400, SPRING_OUT);
    a.start();
    return () => a.stop();
  }, [reduce, slow, v]);

  // ── Exit ──
  const [homeRising, setHomeRising] = useState(false);
  useEffect(() => {
    if (!done) return;
    if (!toHome) {
      // Not Home: no exit — the destination simply replaces the splash.
      release();
      return;
    }
    reportSplashExit();
    if (reduce) {
      reveal.y.setValue(1);
      reveal.radius.setValue(0);
      reveal.opacity.setValue(0);
      setHomeRising(true);
      const fadeIn = Animated.timing(reveal.opacity, {
        toValue: 1,
        duration: EXIT.fadeMs,
        useNativeDriver: true,
      });
      fadeIn.start(() => release());
      return () => fadeIn.stop();
    }
    // Everything in the exit — the brand clearing, the sun flood, Home's rise and its corners rounding
    // off — starts now on the UI thread; Home's 450ms offset is held inside its curves.
    const exit = Animated.parallel([
      timing(v.exitOrbit, 1, EXIT.orbitMs, EASE_OUT),
      timing(v.exitDove, 1, EXIT.doveMs, EASE_OUT),
      timing(v.exitSun, 1, EXIT.sunMs, SUN_FLOOD),
      timing(reveal.y, 1, EXIT.homeMs, HOME_UP, EXIT.homeDelayMs),
      timing(reveal.radius, 0, EXIT.homeMs, HOME_UP, EXIT.homeDelayMs),
    ]);
    // The status bar flips as Home starts rising; only the bar re-renders (the art is memoised).
    const rise = setTimeout(() => setHomeRising(true), EXIT.homeDelayMs);
    // Stopped early only when the boot already ended some other way — releasing again is a no-op.
    exit.start(() => release());
    return () => {
      exit.stop();
      clearTimeout(rise);
    };
  }, [done, toHome, reduce, release, reveal, v]);

  // Announce each completed step as "<label>, done" — the label alone reads like the task is starting
  // (Android reads the live region; iOS needs the explicit announcement).
  const announced = useRef(0);
  const doneCount = steps.filter((s) => s === "done").length;
  useEffect(() => {
    if (doneCount > announced.current) {
      AccessibilityInfo.announceForAccessibility?.(stepDoneAnnouncement(S.steps[doneCount - 1]!));
      announced.current = doneCount;
    }
  }, [doneCount]);
  // The offline panel is an alert (handoff § Accessibility): say so when it appears, on both platforms.
  useEffect(() => {
    if (phase === "offline") AccessibilityInfo.announceForAccessibility?.(`${S.offlineTitle}. ${S.offlineBody}`);
  }, [phase]);

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const { width, height } = e.nativeEvent.layout;
      setSize((s) => (s.W === width && s.H === height ? s : { W: width, H: height }));
      // The JS splash has drawn: drop the native launch screen onto it (same green, no visible seam),
      // then let the app mount underneath on the NEXT frame, so this first frame was the splash alone.
      releaseNativeSplash();
      requestAnimationFrame(markSplashDrawn);
    },
    [markSplashDrawn],
  );
  // Belt and braces: if layout never reports (it always should), don't keep the native screen up.
  useEffect(() => {
    const h = setTimeout(() => {
      releaseNativeSplash();
      markSplashDrawn();
    }, 1000);
    return () => clearTimeout(h);
  }, [markSplashDrawn]);

  const onRetry = useCallback(() => {
    probeNow();
    setRetryAt(Date.now() - t0);
  }, [t0]);

  // ── Layout (S-5) ── The handoff's geometry assumes a frame with no system bars; with the bottom inset
  // added (D-64 #3) the steps card / offline panel can reach the wordmark on a 640dp phone with a
  // 3-button nav bar. Where space is short the brand moves UP, never under a panel (README review notes:
  // "the content moves up … to clear the panel"). Heights are measured, so a wrapped body line counts.
  const [cardH, setCardH] = useState(CARD_H_ESTIMATE);
  const [panelH, setPanelH] = useState(PANEL_H_ESTIMATE);
  const geometry = splashGeometry({ H, bottomInset: insets.bottom, cardH, panelH });
  const onCardLayout = useCallback((e: LayoutChangeEvent) => setCardH(Math.round(e.nativeEvent.layout.height)), []);
  const onPanelLayout = useCallback((e: LayoutChangeEvent) => setPanelH(Math.round(e.nativeEvent.layout.height)), []);

  const still = reduce;
  const motion = useMemo(
    () => ({
      cardY: still ? 0 : v.card.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }),
      slowY: still ? 0 : v.slow.interpolate({ inputRange: [0, 1], outputRange: [-110, 0] }),
      panelY: still ? 0 : v.offline.interpolate({ inputRange: [0, 1], outputRange: [320, 0] }),
    }),
    [still, v],
  );

  return (
    <View style={[StyleSheet.absoluteFill, styles.screen]} onLayout={onLayout}>
      <StatusBar style={homeRising ? "dark" : "light"} />

      <SplashArt v={v} W={W} H={H} A={geometry.anchor} lift={geometry.offlineLift} still={still} />

      {/* Steps card — real progress, a polite live region. Hidden from accessibility while it is not on
          screen (the intro, the offline panel), so a screen reader never reads an invisible card. */}
      <Animated.View
        accessibilityLiveRegion="polite"
        importantForAccessibility={cardShown ? "auto" : "no-hide-descendants"}
        accessibilityElementsHidden={!cardShown}
        onLayout={onCardLayout}
        style={[
          styles.card,
          {
            bottom: 16 + insets.bottom,
            opacity: v.card,
            transform: [{ translateY: motion.cardY }],
          },
        ]}
      >
        {S.steps.map((label, i) => (
          <StepRow key={label} label={label} state={steps[i]!} spin={v.ringSpin} still={still} />
        ))}
      </Animated.View>

      {/* Slow-network pill — in the accessibility tree only while it is showing. */}
      <Animated.View
        pointerEvents="none"
        importantForAccessibility={slow ? "auto" : "no-hide-descendants"}
        accessibilityElementsHidden={!slow}
        style={[
          styles.slowWrap,
          {
            top: Math.max(44, insets.top + 8),
            opacity: still ? v.slow : 1,
            transform: [{ translateY: motion.slowY }],
          },
        ]}
      >
        <View style={styles.slow} accessibilityLiveRegion="polite">
          <Text style={styles.slowText}>{S.slow}</Text>
        </View>
      </Animated.View>

      {/* Offline panel. */}
      <Animated.View
        pointerEvents={phase === "offline" ? "auto" : "none"}
        accessibilityRole="alert"
        accessibilityLiveRegion="assertive"
        importantForAccessibility={phase === "offline" ? "auto" : "no-hide-descendants"}
        accessibilityElementsHidden={phase !== "offline"}
        onLayout={onPanelLayout}
        style={[
          styles.panel,
          {
            bottom: 14 + insets.bottom,
            opacity: still ? v.offline : 1,
            transform: [{ translateY: motion.panelY }],
          },
        ]}
      >
        <Text style={styles.panelTitle}>{S.offlineTitle}</Text>
        <Text style={styles.panelBody}>{S.offlineBody}</Text>
        <Pressable accessibilityRole="button" onPress={onRetry} style={({ pressed }) => [styles.retry, pressed && { opacity: 0.85 }]}>
          <Text style={styles.retryText}>{S.retry}</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

/**
 * The brand art — blobs, orbit, sun, dove, wordmark. Memoised on props that only change with the
 * screen size or the reduce-motion setting, with every animated node built once: the step clock's
 * re-renders never reach it, so no native-driven transform is ever rebuilt mid-animation.
 */
const SplashArt = memo(function SplashArt({
  v,
  W,
  H,
  A,
  lift: liftPx,
  still,
}: {
  v: SplashValues;
  W: number;
  H: number;
  /** The anchor's y (44% of H, clamped up on short screens). */
  A: number;
  /** How far the brand moves up while the offline panel shows (64, more on short screens). */
  lift: number;
  still: boolean;
}): React.ReactElement {
  // The offline lift's nodes are the only ones that depend on the measured layout (`liftPx`), so they
  // are memoised apart: a late measurement rebuilds the lift alone, never the intro's running nodes.
  const lifted = useMemo(() => {
    // Reduced motion keeps the lift — the panel would cover the wordmark without it — but without the
    // motion: the brand jumps clear the moment the panel starts to fade in and comes back only once it
    // has fully faded out.
    const lift = still
      ? v.offline.interpolate({ inputRange: [0, 0.001, 1], outputRange: [0, -liftPx, -liftPx], extrapolate: "clamp" })
      : v.offline.interpolate({ inputRange: [0, 1], outputRange: [0, -liftPx] });
    return {
      lift,
      wordmarkY: Animated.add(
        lift,
        still
          ? 0
          : v.wordmark.interpolate({
              inputRange: [0, 1],
              outputRange: [14, 0],
            }),
      ),
    };
  }, [v, still, liftPx]);
  const n = useMemo(() => {
    return {
      blobs: BLOBS.map((_, i) => ({
        tx: still
          ? 0
          : v.drift[i]!.interpolate({
              inputRange: DRIFT_IN,
              outputRange: [0, 8, -6, 0],
            }),
        ty: still
          ? 0
          : v.drift[i]!.interpolate({
              inputRange: DRIFT_IN,
              outputRange: [0, -10, 6, 0],
            }),
      })),
      sunScale: Animated.multiply(
        Animated.multiply(
          v.sun,
          still
            ? 1
            : v.breathe.interpolate({
                inputRange: SWING_IN,
                outputRange: [1, 1.04, 1],
              }),
        ),
        v.exitSun.interpolate({
          inputRange: [0, 1],
          outputRange: [1, still ? 1 : 6],
        }),
      ),
      orbitOpacity: Animated.multiply(v.orbitIn, v.exitOrbit.interpolate({ inputRange: [0, 1], outputRange: [1, 0] })),
      orbitScale: still
        ? 1
        : Animated.multiply(
            v.orbitIn.interpolate({
              inputRange: [0, 1],
              outputRange: [0.85, 1],
            }),
            v.exitOrbit.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 0.3],
            }),
          ),
      orbitRotate: Animated.modulo(Animated.add(v.spinOffset, v.spin), 1).interpolate({
        inputRange: [0, 1],
        outputRange: ["0deg", "360deg"],
      }),
      doveOpacity: v.exitDove.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 0],
      }),
      bobY: still ? 0 : v.bob.interpolate({ inputRange: SWING_IN, outputRange: [0, -8, 0] }),
      bobR: still
        ? "0deg"
        : v.bob.interpolate({
            inputRange: SWING_IN,
            outputRange: ["0deg", "-3deg", "0deg"],
          }),
      facets: FACETS.map((_, i) => ({
        scale: v.facets[i]!.interpolate({
          inputRange: [0, 1],
          outputRange: [0.3, 1],
        }),
        rotate: v.facets[i]!.interpolate({
          inputRange: [0, 1],
          outputRange: ["-14deg", "0deg"],
        }),
      })),
    };
  }, [v, still]);

  return (
    <>
      {/* Blobs — decorative, hidden from accessibility. */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {BLOBS.map((b, i) => (
          <Animated.View
            key={b.color}
            style={[
              {
                position: "absolute",
                width: b.size,
                height: b.size,
                borderRadius: b.size / 2,
                backgroundColor: b.color,
              },
              b.pos(H, A),
              {
                transform: [{ translateX: n.blobs[i]!.tx }, { translateY: n.blobs[i]!.ty }, { scale: v.blobs[i]! }],
              },
            ]}
          />
        ))}
      </View>

      {/* The anchor group: orbit, sun, dove — centred at 44% of the height. */}
      <Animated.View style={[styles.anchor, { left: W / 2, top: A, transform: [{ translateY: lifted.lift }] }]}>
        <Animated.View
          pointerEvents="none"
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          style={[
            styles.orbit,
            {
              opacity: n.orbitOpacity,
              transform: [{ scale: n.orbitScale }, { rotate: n.orbitRotate }],
            },
          ]}
        >
          <Svg width={ORBIT} height={ORBIT}>
            <Circle cx={ORBIT / 2} cy={ORBIT / 2} r={ORBIT / 2 - 1} stroke="rgba(255,255,255,0.5)" strokeWidth={2} strokeDasharray="6 6" fill="none" />
          </Svg>
          <View style={styles.dotRing}>
            <View style={[styles.dot, { backgroundColor: C.coral }]} />
            <Animated.View style={[styles.dot, styles.dotOver, { backgroundColor: C.illusIdleMid, opacity: v.idle }]} />
          </View>
        </Animated.View>
        <Animated.View style={[styles.sun, { transform: [{ scale: n.sunScale }] }]} />
        <Animated.View
          accessible
          accessibilityRole="image"
          accessibilityLabel={S.brand}
          style={[
            styles.dove,
            {
              opacity: n.doveOpacity,
              transform: [{ translateY: n.bobY }, { rotate: n.bobR }],
            },
          ]}
        >
          {FACETS.map((f, i) => (
            <Animated.View
              key={f.points}
              style={[
                StyleSheet.absoluteFill,
                {
                  transformOrigin: f.origin,
                  opacity: v.facets[i]!,
                  transform: [{ scale: n.facets[i]!.scale }, { rotate: n.facets[i]!.rotate }],
                },
              ]}
            >
              <Svg width={DOVE} height={DOVE} viewBox={DOVE_VIEWBOX}>
                <Polygon points={f.points} fill={f.fill} />
              </Svg>
            </Animated.View>
          ))}
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: v.crease }]}>
            <Svg width={DOVE} height={DOVE} viewBox={DOVE_VIEWBOX}>
              {DOVE_CREASE_PATHS.map((d) => (
                <Path key={d} d={d} stroke={C.highlight} strokeWidth={DOVE_CREASE_WIDTH} fill="none" />
              ))}
            </Svg>
          </Animated.View>
        </Animated.View>
      </Animated.View>

      {/* Wordmark — hidden from screen readers (the dove already says "LyniaGo"). */}
      <Animated.View
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        style={[
          styles.wordmark,
          {
            top: A + 152,
            opacity: v.wordmark,
            transform: [{ translateY: lifted.wordmarkY }],
          },
        ]}
      >
        <Wordmark size={WORDMARK} color={C.onAccent} goColor={C.onAccentSoft} />
      </Animated.View>
    </>
  );
});

/** One step row. Memoised: it re-renders only when its own state changes, not on every clock tick. */
const StepRow = memo(function StepRow({
  label,
  state,
  spin,
  still,
}: {
  label: string;
  state: StepState;
  spin: Animated.Value;
  still: boolean;
}): React.ReactElement {
  const tick = useRef(new Animated.Value(state === "done" ? 1 : 0)).current;
  useEffect(() => {
    if (state !== "done") return;
    if (still) {
      tick.setValue(1);
      return;
    }
    // 0 → 1.08 → 1 over 300ms, as one native timing.
    const a = timing(tick, 1, 300, TICK_CURVE);
    a.start();
    return () => a.stop();
  }, [state, still, tick]);
  const rotate = useMemo(() => spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }), [spin]);
  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={label}
      accessibilityState={{
        busy: state === "active",
        checked: state === "done",
      }}
    >
      {state === "done" ? (
        <View style={[styles.ring, styles.ringDone]}>
          <Animated.View style={[styles.tick, { transform: [{ scale: tick }, { rotate: "45deg" }] }]} />
        </View>
      ) : state === "active" ? (
        <Animated.View style={[styles.ring, styles.ringActive, { transform: [{ rotate: still ? "0deg" : rotate }] }]} />
      ) : (
        <View style={styles.ring} />
      )}
      <Text style={[styles.rowText, { color: state === "pending" ? C.muted : C.ink }]}>{label}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  screen: { backgroundColor: C.accent, overflow: "hidden" },
  anchor: { position: "absolute", width: 0, height: 0 },
  orbit: {
    position: "absolute",
    left: -ORBIT / 2,
    top: -ORBIT / 2,
    width: ORBIT,
    height: ORBIT,
  },
  dotRing: {
    position: "absolute",
    left: ORBIT / 2 - DOT / 2 - DOT_RING,
    top: -DOT / 2 - DOT_RING + 1,
    width: DOT + DOT_RING * 2,
    height: DOT + DOT_RING * 2,
    borderRadius: (DOT + DOT_RING * 2) / 2,
    backgroundColor: C.onAccent,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2 },
  dotOver: { position: "absolute", left: DOT_RING, top: DOT_RING },
  sun: {
    position: "absolute",
    left: -SUN / 2,
    top: -SUN / 2,
    width: SUN,
    height: SUN,
    borderRadius: SUN / 2,
    backgroundColor: C.highlight,
  },
  dove: {
    position: "absolute",
    left: -60,
    top: -70,
    width: DOVE,
    height: DOVE,
  },
  wordmark: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  card: {
    position: "absolute",
    left: 16,
    right: 16,
    backgroundColor: C.bg,
    borderRadius: 24,
    paddingVertical: 16,
    paddingHorizontal: 18,
    gap: 12,
    // `0 18px 40px -12px rgba(0,0,0,.3)` — RN (old arch) takes one offset/blur shadow; no spread.
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 12,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  rowText: { fontSize: 15, fontWeight: "600" },
  ring: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: C.line,
  },
  ringActive: { borderColor: C.accent, borderTopColor: "transparent" },
  ringDone: { backgroundColor: C.accent, borderColor: C.accent },
  tick: {
    position: "absolute",
    left: 6,
    top: 2,
    width: 5,
    height: 10,
    borderColor: C.onAccent,
    borderRightWidth: 2,
    borderBottomWidth: 2,
  },
  slowWrap: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  slow: {
    backgroundColor: C.highlight,
    borderRadius: tokens.radius.pill,
    paddingVertical: 9,
    paddingHorizontal: 14,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  slowText: { fontSize: 13, fontWeight: "600", color: C.highlightChipInk },
  panel: {
    position: "absolute",
    left: 14,
    right: 14,
    backgroundColor: C.ink,
    borderRadius: 24,
    padding: 20,
    gap: 6,
  },
  panelTitle: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.18,
    color: C.onAccent,
  },
  panelBody: { fontSize: 14, lineHeight: 20, color: C.onInkMuted },
  retry: {
    marginTop: 10,
    height: 52,
    borderRadius: tokens.radius.pill,
    backgroundColor: C.highlight,
    alignItems: "center",
    justifyContent: "center",
  },
  retryText: { fontSize: 16, fontWeight: "700", color: C.ink },
});

export default BootSplash;
