import { tokens } from "@lynia/shared/tokens";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { EXIT, GIVE_UP_MS, INTRO_MS, SLOW_AFTER_MS, type StepState, nextStepChange, splashDoneAt, stepStates, stepTimes } from "./timeline";

/**
 * The cold-start splash — "1a Sun & orbit" (`packages/design/handoff/splash-v1`, ledger D-63; it
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
 * Built on RN `Animated` with the native driver for every transform/opacity (the handoff's low-end
 * Android note); only the rising app's corner radius is JS-driven. Reduced motion: no pops, drift,
 * spin, breathing or bob — everything sits in its final place and state changes cross-fade (200ms).
 */

const C = tokens.color;
const SUN = 220;
const ORBIT = 272;
const DOT = 22;
const DOT_RING = 5;
const DOVE = 128;
const WORDMARK = 40;
const OFFLINE_LIFT = 64;
/** How long "Try again" shows loading before the offline panel can come back. */
const RETRY_GRACE_MS = 3000;

const POP = Easing.bezier(0.3, 1.5, 0.5, 1);
const TICK_POP = Easing.bezier(0.3, 1.6, 0.5, 1);
const EASE_OUT = Easing.bezier(0, 0, 0.58, 1);
const EASE_IN_OUT = Easing.bezier(0.42, 0, 0.58, 1);
const RISE = Easing.bezier(0.2, 0.7, 0.3, 1);
const SPRING_OUT = Easing.bezier(0.2, 0.9, 0.3, 1.2);
const SETTLE = Easing.bezier(0.2, 0.9, 0.3, 1);
const SUN_FLOOD = Easing.bezier(0.6, 0, 0.2, 1);
const HOME_UP = Easing.bezier(0.2, 0.8, 0.2, 1);

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

/** Decorative blobs. `top` is a function of the screen height H and the anchor A (44% of H). */
const BLOBS = [
  {
    color: C.coral,
    size: 74,
    pos: (H: number) => ({ left: 28, top: 0.13 * H }),
    pop: 550,
    drift: 1300,
  },
  {
    color: C.illusPink,
    size: 34,
    pos: (H: number) => ({ right: 40, top: 0.21 * H }),
    pop: 700,
    drift: 1600,
  },
  {
    color: C.sky,
    size: 54,
    pos: (H: number) => ({ right: -8, top: 0.44 * H + 64 }),
    pop: 800,
    drift: 1900,
  },
  {
    color: C.riderAccent,
    size: 150,
    pos: () => ({ left: -62, bottom: -56 }),
    pop: 900,
    drift: 1300,
  },
] as const;

const timing = (v: Animated.Value, toValue: number, duration: number, easing: (x: number) => number, delay = 0): Animated.CompositeAnimation =>
  Animated.timing(v, {
    toValue,
    duration,
    easing,
    delay,
    useNativeDriver: true,
  });

/** CSS `pop` keyframes: 0 → 1.08 (70%) → 1, the easing applied per segment. */
const pop = (v: Animated.Value, duration: number, delay: number): Animated.CompositeAnimation =>
  Animated.sequence([Animated.delay(delay), timing(v, 1.08, duration * 0.7, POP), timing(v, 1, duration * 0.3, POP)]);

const loop = (v: Animated.Value, duration: number, easing: (x: number) => number): Animated.CompositeAnimation =>
  Animated.loop(Animated.timing(v, { toValue: 1, duration, easing, useNativeDriver: true }));

/** A 0 → 1 → 0 swing (CSS `alternate`-style breathe/bob), as one looping value. */
const swing = (v: Animated.Value, half: number): Animated.CompositeAnimation =>
  Animated.loop(Animated.sequence([timing(v, 1, half, EASE_IN_OUT), timing(v, 0, half, EASE_IN_OUT)]));

/** Resolves the OS reduce-motion setting; `null` until known (the intro waits on it, briefly). */
function useReduceMotionSetting(): boolean | null {
  const [reduce, setReduce] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((r) => alive && setReduce(r))
      .catch(() => alive && setReduce(false));
    // Never hold the intro on a slow answer.
    const t = setTimeout(() => alive && setReduce((r) => r ?? false), 150);
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", (r) => setReduce(r));
    return () => {
      alive = false;
      clearTimeout(t);
      sub.remove();
    };
  }, []);
  return reduce;
}

type Phase = "boot" | "loading" | "offline" | "done";

export function BootSplash(): React.ReactElement {
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [size, setSize] = useState({ W: window.width, H: window.height });
  const { W, H } = size;
  const A = 0.44 * H;

  const reduce = useReduceMotionSetting();
  const reachable = useReachability();
  const readiness = useBootReadiness();
  const { reveal } = useBootPhase();
  const release = useBootSplashRelease();

  // ── The clock: ms since the splash first drew. Re-rendered only at the moments something changes. ──
  const t0 = useRef(Date.now()).current;
  const [t, setT] = useState(0);
  const [retryAt, setRetryAt] = useState<number | null>(null);

  const times = useMemo(() => {
    const rel = (at: number | null): number | null => (at == null ? null : Math.max(0, at - t0));
    return stepTimes([rel(readiness.readyAt.session), rel(readiness.readyAt.profile), rel(readiness.readyAt.home)]);
  }, [readiness, t0]);
  const steps = stepStates(times, t);
  const loading = t >= INTRO_MS;
  const offline = loading && !reachable && (retryAt == null || t - retryAt >= RETRY_GRACE_MS);
  const readyDoneAt = splashDoneAt(times, readiness.destination);
  const doneAt = readyDoneAt ?? (offline ? null : GIVE_UP_MS);
  const done = doneAt != null && t >= doneAt;
  // A full exit into Home; anywhere else (or a give-up before the destination is known) is a straight cut.
  const toHome = readiness.destination === "/home";
  const phase: Phase = done ? "done" : offline ? "offline" : loading ? "loading" : "boot";
  const slow = phase === "loading" && t >= INTRO_MS + SLOW_AFTER_MS;

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
  const v = useRef({
    sun: new Animated.Value(0),
    facets: FACETS.map(() => new Animated.Value(0)),
    crease: new Animated.Value(0),
    blobs: BLOBS.map(() => new Animated.Value(0)),
    drift: BLOBS.map(() => new Animated.Value(0)),
    wordmark: new Animated.Value(0),
    orbitIn: new Animated.Value(0),
    spin: new Animated.Value(0),
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

  // Boot: the intro timeline.
  useEffect(() => {
    if (reduce == null) return;
    if (reduce) {
      for (const x of [v.sun, v.crease, v.wordmark, ...v.facets, ...v.blobs]) x.setValue(1);
      return;
    }
    const intro = Animated.parallel([
      pop(v.sun, 700, 100),
      ...FACETS.map((f, i) => timing(v.facets[i]!, 1, 500, EASE_OUT, f.delay)),
      timing(v.crease, 1, 300, EASE_OUT, 950),
      ...BLOBS.map((b, i) => pop(v.blobs[i]!, 600, b.pop)),
      timing(v.wordmark, 1, 550, RISE, 1000),
    ]);
    intro.start();
    const drifts = BLOBS.map((b, i) =>
      // CSS `drift` keyframes (0 → 33% → 66% → 100%), ease-in-out per segment; the loop's reset to 0
      // lands where segment 3 ends, at rest.
      Animated.sequence([Animated.delay(b.drift), Animated.loop(Animated.sequence([1, 2, 3].map((k) => timing(v.drift[i]!, k, 2000, EASE_IN_OUT))))]),
    );
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
    if (reduce == null || !looping) return;
    const fade = reduce ? EXIT.fadeMs : 500;
    const shown = Animated.parallel([
      timing(v.orbitIn, 1, fade, SETTLE),
      timing(v.card, phase === "loading" ? 1 : 0, reduce ? EXIT.fadeMs : 500, SPRING_OUT),
    ]);
    shown.start();
    return () => shown.stop();
  }, [reduce, looping, phase, v]);

  useEffect(() => {
    if (reduce !== false || phase !== "loading") return;
    // Resume the orbit from wherever it paused: finish this lap, then loop full laps.
    let current = 0;
    v.spin.stopAnimation((x) => (current = x % 1));
    v.spin.setValue(current);
    const lap = 2600;
    const spin = Animated.sequence([
      Animated.timing(v.spin, {
        toValue: 1,
        duration: lap * (1 - current),
        easing: Easing.linear,
        useNativeDriver: true,
      }),
      Animated.loop(
        Animated.sequence([
          Animated.timing(v.spin, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
          Animated.timing(v.spin, {
            toValue: 1,
            duration: lap,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
        ]),
      ),
    ]);
    const breathe = swing(v.breathe, 1200);
    const bob = swing(v.bob, 1200);
    spin.start();
    breathe.start();
    bob.start();
    return () => {
      v.spin.stopAnimation();
      breathe.stop();
      bob.stop();
    };
  }, [reduce, phase, v]);

  // Offline panel, idle dot and the lift that keeps the brand clear of the panel.
  useEffect(() => {
    if (reduce == null) return;
    const on = phase === "offline" ? 1 : 0;
    const a = Animated.parallel([
      timing(v.offline, on, reduce ? EXIT.fadeMs : 450, SETTLE),
      timing(v.idle, on, reduce ? EXIT.fadeMs : 300, EASE_OUT),
    ]);
    a.start();
    return () => a.stop();
  }, [reduce, phase, v]);

  useEffect(() => {
    if (reduce == null) return;
    const a = timing(v.slow, slow ? 1 : 0, reduce ? EXIT.fadeMs : 400, SPRING_OUT);
    a.start();
    return () => a.stop();
  }, [reduce, slow, v]);

  // ── Exit ──
  const [homeRising, setHomeRising] = useState(false);
  useEffect(() => {
    if (!done || reduce == null) return;
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
    const brand = Animated.parallel([
      timing(v.exitOrbit, 1, EXIT.orbitMs, EASE_OUT),
      timing(v.exitDove, 1, EXIT.doveMs, EASE_OUT),
      timing(v.exitSun, 1, EXIT.sunMs, SUN_FLOOD),
    ]);
    brand.start();
    const rise = setTimeout(() => setHomeRising(true), EXIT.homeDelayMs);
    const home = Animated.parallel([
      Animated.timing(reveal.y, {
        toValue: 1,
        duration: EXIT.homeMs,
        delay: EXIT.homeDelayMs,
        easing: HOME_UP,
        useNativeDriver: true,
      }),
      Animated.timing(reveal.radius, {
        toValue: 0,
        duration: EXIT.homeMs,
        delay: EXIT.homeDelayMs,
        easing: HOME_UP,
        useNativeDriver: false,
      }),
    ]);
    // Stopped early only when the boot already ended some other way — releasing again is a no-op.
    home.start(() => release());
    return () => {
      brand.stop();
      home.stop();
      clearTimeout(rise);
    };
  }, [done, toHome, reduce, release, reveal, v]);

  // Announce each completed step (Android reads the live region; iOS needs the explicit announcement).
  const announced = useRef(0);
  const doneCount = steps.filter((s) => s === "done").length;
  useEffect(() => {
    if (doneCount > announced.current) {
      AccessibilityInfo.announceForAccessibility?.(S.steps[doneCount - 1]!);
      announced.current = doneCount;
    }
  }, [doneCount]);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((s) => (s.W === width && s.H === height ? s : { W: width, H: height }));
    // The JS splash has drawn: drop the native launch screen onto it (same green, no visible seam).
    releaseNativeSplash();
  }, []);
  // Belt and braces: if layout never reports (it always should), don't keep the native screen up.
  useEffect(() => {
    const h = setTimeout(releaseNativeSplash, 1000);
    return () => clearTimeout(h);
  }, []);

  const onRetry = useCallback(() => {
    probeNow();
    setRetryAt(Date.now() - t0);
  }, [t0]);

  // ── Interpolations ──
  const still = reduce !== false;
  const lift = v.offline.interpolate({
    inputRange: [0, 1],
    outputRange: [0, still ? 0 : -OFFLINE_LIFT],
  });
  const sunScale = Animated.multiply(
    Animated.multiply(v.sun, still ? 1 : v.breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] })),
    v.exitSun.interpolate({
      inputRange: [0, 1],
      outputRange: [1, still ? 1 : 6],
    }),
  );
  const orbitOpacity = Animated.multiply(v.orbitIn, v.exitOrbit.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }));
  const orbitScale = still
    ? 1
    : Animated.multiply(
        v.orbitIn.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }),
        v.exitOrbit.interpolate({ inputRange: [0, 1], outputRange: [1, 0.3] }),
      );
  const orbitRotate = v.spin.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });
  const doveOpacity = v.exitDove.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });
  const bobY = still ? 0 : v.bob.interpolate({ inputRange: [0, 1], outputRange: [0, -8] });
  const bobR = still ? "0deg" : v.bob.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "-3deg"] });
  const cardY = still ? 0 : v.card.interpolate({ inputRange: [0, 1], outputRange: [24, 0] });
  const slowY = still ? 0 : v.slow.interpolate({ inputRange: [0, 1], outputRange: [-110, 0] });
  const panelY = still ? 0 : v.offline.interpolate({ inputRange: [0, 1], outputRange: [320, 0] });

  return (
    <View style={[StyleSheet.absoluteFill, styles.screen]} onLayout={onLayout}>
      <StatusBar style={homeRising ? "dark" : "light"} />

      {/* Blobs — decorative, hidden from accessibility. */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {BLOBS.map((b, i) => {
          const d = v.drift[i]!;
          const tx = still
            ? 0
            : d.interpolate({
                inputRange: [0, 1, 2, 3],
                outputRange: [0, 8, -6, 0],
              });
          const ty = still
            ? 0
            : d.interpolate({
                inputRange: [0, 1, 2, 3],
                outputRange: [0, -10, 6, 0],
              });
          return (
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
                b.pos(H),
                {
                  transform: [{ translateX: tx }, { translateY: ty }, { scale: v.blobs[i]! }],
                },
              ]}
            />
          );
        })}
      </View>

      {/* The anchor group: orbit, sun, dove — centred at 44% of the height. */}
      <Animated.View style={[styles.anchor, { left: W / 2, top: A, transform: [{ translateY: lift }] }]}>
        <Animated.View
          pointerEvents="none"
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          style={[
            styles.orbit,
            {
              opacity: orbitOpacity,
              transform: [{ scale: orbitScale }, { rotate: orbitRotate }],
            },
          ]}
        >
          <Svg width={ORBIT} height={ORBIT}>
            <Circle
              cx={ORBIT / 2}
              cy={ORBIT / 2}
              r={ORBIT / 2 - 1}
              stroke="rgba(255,255,255,0.5)"
              strokeWidth={2}
              strokeDasharray="6 6"
              fill="none"
            />
          </Svg>
          <View style={styles.dotRing}>
            <View style={[styles.dot, { backgroundColor: C.coral }]} />
            <Animated.View style={[styles.dot, styles.dotOver, { backgroundColor: C.illusIdleMid, opacity: v.idle }]} />
          </View>
        </Animated.View>
        <Animated.View style={[styles.sun, { transform: [{ scale: sunScale }] }]} />
        <Animated.View
          accessible
          accessibilityRole="image"
          accessibilityLabel={S.brand}
          style={[
            styles.dove,
            {
              opacity: doveOpacity,
              transform: [{ translateY: bobY }, { rotate: bobR }],
            },
          ]}
        >
          {FACETS.map((f, i) => {
            const p = v.facets[i]!;
            return (
              <Animated.View
                key={f.points}
                style={[
                  StyleSheet.absoluteFill,
                  {
                    transformOrigin: f.origin,
                    opacity: p,
                    transform: [
                      {
                        scale: p.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.3, 1],
                        }),
                      },
                      {
                        rotate: p.interpolate({
                          inputRange: [0, 1],
                          outputRange: ["-14deg", "0deg"],
                        }),
                      },
                    ],
                  },
                ]}
              >
                <Svg width={DOVE} height={DOVE} viewBox={DOVE_VIEWBOX}>
                  <Polygon points={f.points} fill={f.fill} />
                </Svg>
              </Animated.View>
            );
          })}
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
            transform: [
              {
                translateY: Animated.add(
                  lift,
                  still
                    ? 0
                    : v.wordmark.interpolate({
                        inputRange: [0, 1],
                        outputRange: [14, 0],
                      }),
                ),
              },
            ],
          },
        ]}
      >
        <Wordmark size={WORDMARK} color={C.onAccent} goColor={C.onAccentSoft} />
      </Animated.View>

      {/* Steps card — real progress, a polite live region. */}
      <Animated.View
        accessibilityLiveRegion="polite"
        style={[
          styles.card,
          {
            bottom: 16 + insets.bottom,
            opacity: v.card,
            transform: [{ translateY: cardY }],
          },
        ]}
      >
        {S.steps.map((label, i) => (
          <StepRow key={label} label={label} state={steps[i]!} spin={v.ringSpin} still={still} />
        ))}
      </Animated.View>

      {/* Slow-network pill. */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.slowWrap,
          {
            top: Math.max(44, insets.top + 8),
            opacity: still ? v.slow : 1,
            transform: [{ translateY: slowY }],
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
        style={[
          styles.panel,
          {
            bottom: 14 + insets.bottom,
            opacity: still ? v.offline : 1,
            transform: [{ translateY: panelY }],
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

function StepRow({ label, state, spin, still }: { label: string; state: StepState; spin: Animated.Value; still: boolean }): React.ReactElement {
  const tick = useRef(new Animated.Value(state === "done" ? 1 : 0)).current;
  useEffect(() => {
    if (state !== "done") return;
    if (still) {
      tick.setValue(1);
      return;
    }
    const a = Animated.sequence([timing(tick, 1.08, 210, TICK_POP), timing(tick, 1, 90, TICK_POP)]);
    a.start();
    return () => a.stop();
  }, [state, still, tick]);
  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });
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
}

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
