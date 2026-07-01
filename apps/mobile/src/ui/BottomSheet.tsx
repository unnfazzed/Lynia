import { tokens } from "@lynia/shared";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  type LayoutChangeEvent,
  PanResponder,
  View,
  type ViewStyle,
} from "react-native";

/**
 * A bottom-anchored panel — the "name your price" hero container that pins the required inputs + CTA
 * into the thumb zone — that is now genuinely DRAGGABLE, built from React Native core only (`Animated`,
 * `PanResponder`, `AccessibilityInfo`). No gesture-handler, no reanimated, no @gorhom/bottom-sheet:
 * CI here is typecheck-only and can't catch a native-bundle break, so a JS-only implementation is
 * mandatory (same primitive-only constraint as LiveMap).
 *
 * Prop-compatible with the old static sheet — `{ children, footer, style }` are unchanged, so
 * `app/home.tsx` needs no edit. The new drag behaviour is opt-in via optional `snapPoints` /
 * `initialSnap` / `onSnapChange`.
 *
 * DEFAULT is a single expanded snap (`[1]`) — i.e. static-equivalent, no drag travel. This is
 * deliberate: until the deferred single-full-bleed-map re-architecture lands (map BEHIND the sheet),
 * there is nothing to reveal by collapsing, and a uniform `translateY` collapse would only drag the
 * footer CTA off the bottom of the screen — a dead-end regression (harden design review, P0). A
 * consumer that owns a map behind the sheet opts into real drag by passing multi-stop `snapPoints`.
 *
 * Snap points are FRACTIONS of the sheet's own measured height (0 = fully shown / expanded, larger =
 * pushed further down / collapsed). `translateY` animates on the native driver (transform is
 * native-driver-safe). The settle math is the pure, exported `chooseSnap` so it's testable off-device.
 *
 * Accessibility (a design-review must-fix): the drag handle is a real labeled `adjustable` control —
 * NOT `accessibilityElementsHidden` — with increment/decrement actions that move between snaps. That
 * makes expand/collapse reachable for a screen-reader / no-gesture user, and doubles as the fallback
 * when the gesture is unavailable. Reduce-motion (read once, mirroring home.tsx / LiveMap) jumps to the
 * target snap instantly with no spring.
 */

/** Minimum vertical travel before we claim the gesture — below this a touch is a tap, not a drag. */
const DRAG_CLAIM_PX = 6;
/** A fling faster than this (px/ms) settles in the fling direction regardless of position. */
const FLING_VELOCITY = 0.5;

/**
 * Pick the snap offset to settle on from the current drag offset and release velocity. Pure so it can
 * be unit-tested without a device.
 *
 * @param currentOffset  the sheet's current translateY (px from fully-expanded).
 * @param velocityY      release velocity in px/ms; +ve = dragging down (toward collapsed).
 * @param snapOffsets    the candidate offsets (px). Order-independent; the nearest is chosen.
 * @returns one of `snapOffsets`.
 */
export function chooseSnap(currentOffset: number, velocityY: number, snapOffsets: number[]): number {
  if (snapOffsets.length === 0) return currentOffset;
  const sorted = [...snapOffsets].sort((a, b) => a - b);
  const first = sorted[0] as number;
  const last = sorted[sorted.length - 1] as number;

  // A decisive fling wins over position: jump to the neighbour in the fling direction.
  if (Math.abs(velocityY) > FLING_VELOCITY) {
    if (velocityY > 0) {
      // Dragging down → toward a larger offset (more collapsed).
      const next = sorted.find((o) => o > currentOffset);
      return next ?? last;
    }
    // Dragging up → toward a smaller offset (more expanded).
    const next = [...sorted].reverse().find((o) => o < currentOffset);
    return next ?? first;
  }

  // Otherwise settle to the nearest snap.
  return sorted.reduce(
    (best, o) => (Math.abs(o - currentOffset) < Math.abs(best - currentOffset) ? o : best),
    first,
  );
}

export function BottomSheet({
  children,
  footer,
  style,
  snapPoints = [1],
  initialSnap = snapPoints.length - 1,
  onSnapChange,
}: {
  children: React.ReactNode;
  /** Optional footer pinned below the body — e.g. the primary CTA + error text. */
  footer?: React.ReactNode;
  style?: ViewStyle;
  /**
   * Snap positions as FRACTIONS of the sheet's own height, ascending. Each fraction is how much of the
   * sheet is VISIBLE at that snap: 1 = fully shown (expanded), 0.45 = collapsed to 45%. Defaults to a
   * single expanded stop (`[1]`) — static-equivalent; pass multiple stops only when a map sits behind
   * the sheet (otherwise collapsing drags the footer CTA off-screen).
   */
  snapPoints?: number[];
  /** Index into `snapPoints` to rest at initially (default: last = expanded). */
  initialSnap?: number;
  /** Called with the snap index whenever the resting snap changes. */
  onSnapChange?: (index: number) => void;
}): React.ReactElement {
  // Ascending fractions → we work in translateY OFFSETS (px hidden below the bottom), which is
  // (1 - fraction) * height. Larger offset = more collapsed.
  const fractions = useMemo(() => [...snapPoints].sort((a, b) => a - b), [snapPoints]);
  const clampedInitial = Math.min(Math.max(initialSnap, 0), fractions.length - 1);

  const [height, setHeight] = useState(0);
  const [snapIndex, setSnapIndex] = useState(clampedInitial);
  const translateY = useRef(new Animated.Value(0)).current;
  // The offset the sheet currently rests at (px). Kept in a ref so the PanResponder (created once) reads
  // a live value without re-subscribing.
  const restOffset = useRef(0);

  // Reduce-motion: read once (same discipline as home.tsx / LiveMap). When on, snap instantly.
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      if (!cancelled) setReduceMotion(on);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Convert a snap index → translateY offset (px). Offset 0 is the fully-shown fraction (== 1 or the
  // largest fraction). A fraction f leaves (1 - f) * height hidden below.
  const offsetForIndex = useCallback(
    (index: number): number => (1 - (fractions[index] ?? 1)) * height,
    [fractions, height],
  );

  const snapOffsets = useMemo(() => fractions.map((f) => (1 - f) * height), [fractions, height]);
  // Drag bounds are the extremes of the VALID snap offsets (not the raw sheet height), so a drag can
  // never carry the sheet past its most-collapsed snap. With a single snap these collapse to one point.
  const minOffset = useMemo(() => (snapOffsets.length ? Math.min(...snapOffsets) : 0), [snapOffsets]);
  const maxOffset = useMemo(() => (snapOffsets.length ? Math.max(...snapOffsets) : 0), [snapOffsets]);

  const animateTo = useCallback(
    (index: number): void => {
      const clamped = Math.min(Math.max(index, 0), fractions.length - 1);
      const toValue = offsetForIndex(clamped);
      restOffset.current = toValue;
      if (reduceMotion) {
        translateY.setValue(toValue);
      } else {
        Animated.spring(translateY, { toValue, useNativeDriver: true, bounciness: 4 }).start();
      }
      if (clamped !== snapIndex) {
        setSnapIndex(clamped);
        onSnapChange?.(clamped);
      }
    },
    [fractions.length, offsetForIndex, reduceMotion, translateY, snapIndex, onSnapChange],
  );

  // Once we know the height, position the sheet at its resting snap. Re-runs if height/snap change.
  useEffect(() => {
    if (height === 0) return;
    const toValue = offsetForIndex(snapIndex);
    restOffset.current = toValue;
    translateY.setValue(toValue);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-seat on height change; snapIndex is applied via animateTo elsewhere.
  }, [height]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // Claim only on clear VERTICAL intent, so taps and horizontal gestures pass through.
        onMoveShouldSetPanResponder: (_e, g) =>
          Math.abs(g.dy) > DRAG_CLAIM_PX && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderGrant: () => {
          translateY.stopAnimation();
        },
        onPanResponderMove: (_e, g) => {
          // Follow the finger, clamped to the SNAP range — never past the most-collapsed snap. Clamping
          // to `height` (the old bug) let the user drag the whole sheet, handle and all, off-screen.
          const next = Math.min(Math.max(restOffset.current + g.dy, minOffset), maxOffset);
          translateY.setValue(next);
        },
        onPanResponderRelease: (_e, g) => {
          const current = Math.min(Math.max(restOffset.current + g.dy, minOffset), maxOffset);
          const target = chooseSnap(current, g.vy, snapOffsets);
          const index = snapOffsets.indexOf(target);
          animateTo(index >= 0 ? index : snapIndex);
        },
      }),
    // Recreate when the geometry the closures capture changes.
    [translateY, minOffset, maxOffset, snapOffsets, animateTo, snapIndex],
  );

  // Accessibility action: step between snaps. increment = more expanded (smaller offset → smaller
  // index-from-top); decrement = more collapsed. We map "increment" to expand (natural: more content).
  const onAccessibilityAction = useCallback(
    (event: { nativeEvent: { actionName: string } }): void => {
      const name = event.nativeEvent.actionName;
      if (name === "increment") animateTo(snapIndex + 1);
      else if (name === "decrement") animateTo(snapIndex - 1);
    },
    [animateTo, snapIndex],
  );

  const onLayout = useCallback((e: LayoutChangeEvent): void => {
    setHeight(e.nativeEvent.layout.height);
  }, []);

  return (
    <Animated.View
      onLayout={onLayout}
      style={[
        {
          backgroundColor: tokens.color.bg,
          borderTopLeftRadius: tokens.radius.card,
          borderTopRightRadius: tokens.radius.card,
          borderTopWidth: 1,
          borderColor: tokens.color.line,
          padding: tokens.space.lg,
          transform: [{ translateY }],
        },
        style,
      ]}
    >
      {/* Drag handle — a REAL adjustable control (screen-reader can expand/collapse without dragging),
          and the PanResponder is attached here so the drag originates from the handle. Visual look
          (36×4 pill in the line colour, centred) is unchanged from the static version. */}
      <View
        {...panResponder.panHandlers}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Sheet handle"
        accessibilityHint="Swipe up or down, or use the adjust actions, to expand or collapse the panel"
        // Numeric value so it stays meaningful beyond two stops (higher index = more expanded).
        accessibilityValue={{ min: 0, max: fractions.length - 1, now: snapIndex }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={onAccessibilityAction}
        // A ≥44px hit area (design must-fix): the 4px pill alone is far below the touch-target min, so
        // centre it inside a full-width, 44px-tall grab zone.
        style={{
          alignSelf: "stretch",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 44,
          marginTop: -tokens.space.sm,
          marginBottom: tokens.space.xs,
        }}
      >
        <View
          style={{
            width: 36,
            height: 4,
            borderRadius: tokens.radius.pill,
            backgroundColor: tokens.color.line,
          }}
        />
      </View>
      {children}
      {footer ? <View style={{ marginTop: tokens.space.sm }}>{footer}</View> : null}
    </Animated.View>
  );
}
