import React, { useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { useReduceMotion } from "./useReduceMotion";

/**
 * A kit ring with one coloured border side — CSS `border: Wpx solid <track>; border-<side>-color: <arc>` on
 * a circle — drawn as SVG strokes. Never build these as a bordered View: Android paints a rounded View whose
 * sides have different border colours as mitred trapezoids, so the arc comes out as a tapered, lopsided
 * sliver that wobbles as it turns. `sweep` is the arc's share of the turn (a CSS side is 0.25), centred on
 * `centreDeg` (screen degrees clockwise from 3 o'clock; 270 = 12 o'clock); square ends, like a CSS border.
 * `track` omitted = nothing behind the arc (a transparent side).
 */
export function ArcRing({
  size,
  width,
  track,
  arc,
  sweep = 0.25,
  centreDeg = 270,
}: {
  size: number;
  width: number;
  track?: string;
  arc: string;
  sweep?: number;
  centreDeg?: number;
}): React.ReactElement {
  const r = (size - width) / 2;
  const c = 2 * Math.PI * r;
  // A stroke starts at 3 o'clock and runs clockwise; the dash pattern repeats once per turn, so the offset
  // that puts the dash's start at `centreDeg - sweep/2` is the remaining share of the turn.
  const start = (((centreDeg / 360 - sweep / 2) % 1) + 1) % 1;
  return (
    <Svg width={size} height={size}>
      {track ? <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={width} fill="none" /> : null}
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={arc} strokeWidth={width} fill="none" strokeDasharray={`${c * sweep} ${c * (1 - sweep)}`} strokeDashoffset={c * ((1 - start) % 1)} />
    </Svg>
  );
}

/** The kit's spinning ring: a track with a top arc, one linear turn per `duration` ms (still under reduce motion). */
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
  return (
    <Animated.View testID={testID} accessibilityRole="progressbar" accessibilityState={{ busy: true }} style={{ width: size, height: size, transform: [{ rotate }] }}>
      <ArcRing size={size} width={width} track={track} arc={arc} />
    </Animated.View>
  );
}
