/**
 * Easing builders that let every splash animation run as ONE native-driven `Animated.timing`, with no
 * JS thread involvement after it starts.
 *
 * Why this exists: RN `Animated` runs a native-driven timing on the UI thread, but everything AROUND
 * it is JS — a `delay` is a JS `setTimeout`, each step of an `Animated.sequence` is started from the
 * previous step's JS completion callback, and `Animated.loop` only loops natively when it wraps a single
 * timing (a loop around a sequence is restarted from JS every lap). During the splash the JS thread is
 * busy mounting Home underneath, so those hand-offs landed late: the intro played out of order and
 * bunched up, the loops hitched at every half-cycle, and pops stalled at their peak.
 *
 * The native driver precomputes a timing's frames by sampling its easing in JS when it starts. So a
 * delay, a multi-keyframe shape or a per-segment easing can all be folded into a single easing curve,
 * and the whole animation then plays on the UI thread regardless of what JS is doing.
 */

type Ease = (x: number) => number;

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * A `delay` folded into the curve: run the timing for `delay + duration` and hold at 0 for the first
 * `delay` ms. Returns the `duration` and `easing` to pass to `Animated.timing`.
 */
export function held(delay: number, duration: number, easing: Ease): { duration: number; easing: Ease } {
  const total = delay + duration;
  if (delay <= 0) return { duration, easing };
  const start = delay / total;
  return {
    duration: total,
    easing: (x) => (x <= start ? 0 : easing(clamp01((x - start) / (1 - start)))),
  };
}

/**
 * CSS `pop` keyframes (0 → `peak` at `at`, → 1 at the end), the easing applied per segment — as one
 * curve to animate a value 0 → 1. The output overshoots past 1, which `Animated.timing` passes through.
 */
export function popEasing(easing: Ease, peak = 1.08, at = 0.7): Ease {
  return (x) => (x < at ? peak * easing(x / at) : peak + (1 - peak) * easing((x - at) / (1 - at)));
}

/**
 * `n` equal keyframe segments, each eased, as one monotonic 0 → 1 curve: segment k covers
 * [k/n, (k+1)/n] of the output. Pair it with an interpolation whose `inputRange` is
 * `[0, 1/n, …, 1]` and whose `outputRange` lists the keyframes. Because the curve ends exactly at the
 * timing's `toValue`, a native `Animated.loop` around it repeats seamlessly when the first and last
 * keyframes match (a breathe 1 → 1.04 → 1, a drift that returns to rest).
 */
export function keyframesEasing(n: number, easing: Ease): Ease {
  return (x) => {
    if (x >= 1) return 1;
    if (x <= 0) return 0;
    const k = Math.min(n - 1, Math.floor(x * n));
    return (k + easing(x * n - k)) / n;
  };
}

/** The `inputRange` that goes with {@link keyframesEasing}: `[0, 1/n, …, 1]`. */
export function keyframesInput(n: number): number[] {
  return Array.from({ length: n + 1 }, (_, i) => i / n);
}
