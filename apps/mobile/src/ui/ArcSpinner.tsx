import React, { useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { useReduceMotion } from "./useReduceMotion";

/**
 * The kit's spinning ring — CSS `border: Wpx solid <track>; border-top-color: <arc>` on a circle, turned
 * at a linear pace. Drawn as two SVG strokes rather than a bordered View: Android paints a View whose
 * sides have different border colours as mitred trapezoids, so the "top arc" came out as a tapered,
 * lopsided sliver that wobbled as it turned instead of a round quarter ring. The arc is the CSS
 * border-top's exact span — a quarter turn centred on 12 o'clock, square ends.
 */
export function ArcSpinner({
  size,
  width,
  track,
  arc,
  duration,
  testID,
}: {
  size: number;
  width: number;
  track: string;
  arc: string;
  duration: number;
  testID?: string;
}): React.ReactElement {
  const reduceMotion = useReduceMotion();
  const turn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(Animated.timing(turn, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, turn, duration]);
  const rotate = turn.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  const r = (size - width) / 2;
  const c = 2 * Math.PI * r;
  return (
    <Animated.View testID={testID} accessibilityRole="progressbar" accessibilityState={{ busy: true }} style={{ width: size, height: size, transform: [{ rotate }] }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={width} fill="none" />
        {/* A stroke starts at 3 o'clock and runs clockwise; offsetting by 3/8 puts the quarter dash on 225°–315°. */}
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={arc} strokeWidth={width} fill="none" strokeDasharray={`${c / 4} ${(c * 3) / 4}`} strokeDashoffset={(c * 3) / 8} />
      </Svg>
    </Animated.View>
  );
}
