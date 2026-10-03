import { tokens } from "@lynia/shared/tokens";
import React, { useMemo } from "react";
import { Animated, StyleSheet } from "react-native";
import Svg, { Path } from "react-native-svg";
import { REVEAL_RADIUS } from "./boot-phase";

const R = REVEAL_RADIUS;
/** The area of an R×R corner square outside a radius-R arc — what a rounded corner cuts away. */
const TOP_LEFT = `M0 0 H${R} A${R} ${R} 0 0 0 0 ${R} Z`;
const TOP_RIGHT = `M0 0 H${R} V${R} A${R} ${R} 0 0 0 0 0 Z`;

/**
 * The rising app's top corners during the splash exit (`handoff/splash-v1` § Exit: "top radius
 * 40 → 0"), drawn on the UI thread.
 *
 * Border radius can't be animated by the native driver, and animating it from JS restyles (and
 * re-clips) the whole Home tree every frame while JS is busiest — the hand-off stuttered on devices.
 * Instead each corner is the area a radius cuts away, filled with the sun yellow that floods the
 * screen behind the rising app, and scaled about its own corner: a cut-out of an R corner scaled by
 * s is exactly a radius of R·s. `radius` runs REVEAL_RADIUS → 0 natively.
 */
export function RevealCorners({ radius }: { radius: Animated.Value }): React.ReactElement {
  const scale = useMemo(
    () =>
      radius.interpolate({
        inputRange: [0, R],
        outputRange: [0, 1],
        extrapolate: "clamp",
      }),
    [radius],
  );
  return (
    <>
      <Animated.View pointerEvents="none" style={[styles.corner, styles.left, { transform: [{ scale }] }]}>
        <Svg width={R} height={R}>
          <Path d={TOP_LEFT} fill={tokens.color.highlight} />
        </Svg>
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.corner, styles.right, { transform: [{ scale }] }]}>
        <Svg width={R} height={R}>
          <Path d={TOP_RIGHT} fill={tokens.color.highlight} />
        </Svg>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  corner: { position: "absolute", top: 0, width: R, height: R },
  left: { left: 0, transformOrigin: "0% 0%" },
  right: { right: 0, transformOrigin: "100% 0%" },
});
