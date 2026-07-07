import { tokens } from "@lynia/shared";
import React, { useEffect, useRef } from "react";
import { Animated, Easing, View } from "react-native";
import { Icon } from "./Icon";
import { useReduceMotion } from "./useReduceMotion";

/**
 * A small, self-contained "delivered!" celebration — the payoff moment modern delivery apps invest in,
 * built with React Native's CORE `Animated` only: NO Lottie, NO confetti library, NO bundled asset (so
 * it stays data-light and adds no native dep / EAS rebuild). A check badge pops in with a spring-ish
 * scale while a ring of accent dots radiates and fades once. Purely decorative and one-shot.
 *
 * Reduce-motion (read via the shared hook) renders the badge at rest with no burst — the same discipline
 * as LiveMap / BottomSheet. Marked decorative for screen readers; the surrounding card carries the
 * "Delivered" text that actually matters.
 */

const RAYS = 8;

export function Celebrate({ size = 72 }: { size?: number }): React.ReactElement {
  const reduceMotion = useReduceMotion();
  // One shared 0→1 driver for the whole burst. Starts at rest (1) under reduce-motion.
  const t = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;

  useEffect(() => {
    if (reduceMotion) {
      t.setValue(1);
      return;
    }
    t.setValue(0);
    Animated.timing(t, { toValue: 1, duration: 620, easing: Easing.out(Easing.back(2)), useNativeDriver: true }).start();
  }, [reduceMotion, t]);

  const badgeScale = t.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.2, 1.08, 1] });
  const ring = size * 0.92;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={{ width: size, height: size, alignItems: "center", justifyContent: "center", alignSelf: "center" }}
    >
      {/* Radiating dots — each sits on the ring and pushes outward + fades as the burst completes. */}
      {Array.from({ length: RAYS }, (_, i) => {
        const angle = (i / RAYS) * Math.PI * 2;
        const dist = ring / 2;
        const dx = Math.cos(angle) * dist;
        const dy = Math.sin(angle) * dist;
        const translateX = t.interpolate({ inputRange: [0, 1], outputRange: [0, dx] });
        const translateY = t.interpolate({ inputRange: [0, 1], outputRange: [0, dy] });
        const opacity = t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 0] });
        return (
          <Animated.View
            key={i}
            style={{
              position: "absolute",
              width: 7,
              height: 7,
              borderRadius: 4,
              backgroundColor: tokens.color.accent,
              opacity,
              transform: [{ translateX }, { translateY }],
            }}
          />
        );
      })}
      {/* The check badge — accent fill (a graphic fill, white glyph allowed here, same as the CTA). */}
      <Animated.View
        style={{
          width: size * 0.66,
          height: size * 0.66,
          borderRadius: (size * 0.66) / 2,
          backgroundColor: tokens.color.accent,
          alignItems: "center",
          justifyContent: "center",
          transform: [{ scale: badgeScale }],
        }}
      >
        <Icon name="check" size={size * 0.36} color={tokens.color.onAccent} strokeWidth={3} />
      </Animated.View>
    </View>
  );
}
