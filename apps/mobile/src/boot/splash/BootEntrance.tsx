import React, { useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";
import { useReduceMotion } from "../../ui/useReduceMotion";
import { useBootPhase } from "../boot-phase";
import { useBootReadiness } from "../boot-readiness";
import { held } from "./motion";

/**
 * Home's content entrance at the end of the splash (`handoff/splash-v1` § Exit, ledger D-64): once
 * Home has risen into place its sections rise in turn — translateY 14 → 0 and opacity 0 → 1, 450ms
 * ease-out, starting 800ms into the exit and 70–90ms apart.
 *
 * Only a section that MOUNTS during the cold start animates. Anywhere else (every later visit to
 * Home, tests, the parity lane) this renders its children as-is with no wrapper, so the screen's tree
 * is untouched outside the one moment the handoff draws. Reduced motion: no rise — Home cross-fades
 * in as a whole (the splash does that).
 */
export const ENTRANCE_DELAYS_MS = [800, 870, 940, 1030, 1110] as const;
const RISE_MS = 450;
const EASE_OUT = Easing.bezier(0, 0, 0.58, 1);

export function BootEntrance({ index, children }: { index: number; children: React.ReactNode }): React.ReactElement {
  const { booting } = useBootPhase();
  const animate = useRef(booting).current;
  const reduce = useReduceMotion();
  const { exitAt } = useBootReadiness();
  const p = useRef(new Animated.Value(animate ? 0 : 1)).current;

  useEffect(() => {
    if (!animate) return;
    if (reduce) {
      p.setValue(1);
      return;
    }
    if (exitAt == null) return;
    const delay = Math.max(0, ENTRANCE_DELAYS_MS[Math.min(index, ENTRANCE_DELAYS_MS.length - 1)]! - (Date.now() - exitAt));
    // The stagger is held inside the curve, not a JS `delay` timer: Home is still rendering on the JS
    // thread here, and a late timer is what bunched the sections up on devices.
    const a = Animated.timing(p, {
      toValue: 1,
      ...held(delay, RISE_MS, EASE_OUT),
      useNativeDriver: true,
    });
    a.start();
    return () => a.stop();
  }, [animate, reduce, exitAt, index, p]);

  // The boot ended some other way (force-update, a give-up cut) — never leave a section invisible.
  useEffect(() => {
    if (animate && !booting && exitAt == null) p.setValue(1);
  }, [animate, booting, exitAt, p]);

  if (!animate) return <>{children}</>;
  return (
    <Animated.View
      style={{
        opacity: p,
        transform: [
          {
            translateY: p.interpolate({
              inputRange: [0, 1],
              outputRange: [14, 0],
            }),
          },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}
