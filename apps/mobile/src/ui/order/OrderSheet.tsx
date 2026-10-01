import { tokens } from "@lynia/shared/tokens";
import React, { useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Animated, Easing, PanResponder, ScrollView, View } from "react-native";
import { chooseSnap } from "../BottomSheet";

/**
 * The order screen's bottom sheet (After Send handoff "Sheet", ledger D-53): white, radius 16 on top, a
 * 16px grabber row (36×4 `line` bar), content in a column with a 12px gap that scrolls at either snap.
 * Two snaps — PEEK (the stage's share of the space under the header goes to the map) and FULL (a 96px
 * map strip stays under the header). Drag or tap the grabber; the content area ends at the top of the
 * pinned CTA bar (`bottomInset`).
 *
 * The sheet's `top` animates (JS driver: it changes the scroll viewport, which a transform can't), on a
 * stage change too (250ms ease-out). The content cross-fades in (opacity 0 → 1, translateY 8 → 0, 250ms)
 * whenever `contentKey` changes. Reduce motion cuts both instantly. Core Animated + PanResponder only
 * (no reanimated / gesture-handler in this app — see BottomSheet.tsx).
 */

/** The map strip kept under the header when the sheet is at FULL. */
export const FULL_STRIP = 96;
const DRAG_CLAIM_PX = 6;

export interface OrderSheetHandle {
  /** True when the sheet is at FULL (Back collapses it before leaving). */
  isFull: () => boolean;
  collapse: () => void;
}

export const OrderSheet = React.forwardRef<
  OrderSheetHandle,
  {
    /** Height of the area under the header (map + sheet). */
    areaHeight: number;
    /** The map's share of `areaHeight` at peek. */
    mapShare: number;
    /** The pinned CTA bar's height — the content area ends there. */
    bottomInset: number;
    contentKey: string;
    reduceMotion: boolean;
    /** Reports the sheet's visible height (for the map's fit padding). */
    onVisibleHeight?: (h: number) => void;
    children: React.ReactNode;
  }
>(function OrderSheet(props, ref) {
  const { areaHeight, mapShare, bottomInset, reduceMotion } = props;
  const peekTop = Math.round(areaHeight * mapShare);
  const fullTop = Math.min(FULL_STRIP, peekTop);
  const top = useRef(new Animated.Value(peekTop)).current;
  const [full, setFull] = useState(false);
  const fullRef = useRef(false);
  fullRef.current = full;
  const current = useRef(peekTop);

  const animateTo = (to: number, isFull: boolean): void => {
    current.current = to;
    setFull(isFull);
    props.onVisibleHeight?.(areaHeight - to);
    if (reduceMotion) top.setValue(to);
    else Animated.timing(top, { toValue: to, duration: 250, easing: Easing.out(Easing.quad), useNativeDriver: false }).start();
  };

  // A stage change (new peek) or a resize returns the sheet to the stage's peek.
  useEffect(() => {
    if (areaHeight <= 0) return;
    animateTo(peekTop, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-snap only when the peek geometry changes.
  }, [peekTop, areaHeight]);

  useImperativeHandle(ref, () => ({
    isFull: () => fullRef.current,
    collapse: () => animateTo(peekTop, false),
  }));

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > DRAG_CLAIM_PX && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderGrant: () => top.stopAnimation(),
        onPanResponderMove: (_e, g) => {
          const next = Math.max(fullTop, Math.min(peekTop, current.current + g.dy));
          top.setValue(next);
        },
        onPanResponderRelease: (_e, g) => {
          const at = Math.max(fullTop, Math.min(peekTop, current.current + g.dy));
          const to = chooseSnap(at, g.vy, [fullTop, peekTop]);
          animateTo(to, to === fullTop && fullTop !== peekTop);
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuilt when the snap geometry changes.
    [fullTop, peekTop, reduceMotion],
  );

  // Content cross-fade on a stage change.
  const fade = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduceMotion) {
      fade.setValue(1);
      return;
    }
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 250, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [props.contentKey, reduceMotion, fade]);

  return (
    <Animated.View
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top,
        bottom: 0,
        backgroundColor: tokens.color.bg,
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        zIndex: 10,
        ...tokens.shadow.sheet,
      }}
    >
      <View {...pan.panHandlers}>
        {/* Drag-only: the handoff also says "tap the grabber", but its drawn row is 16px — below
            --target-min — so it is not a tap target here (ledger D-53 §4). Screen readers expand and
            collapse it through the adjustable actions. */}
        <View
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={full ? "Collapse the order details" : "Expand the order details"}
          accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === "increment") animateTo(fullTop, true);
            else animateTo(peekTop, false);
          }}
          style={{ height: 16, alignItems: "center", justifyContent: "center" }}
        >
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: tokens.color.line }} />
        </View>
      </View>
      <ScrollView
        style={{ flex: 1, marginBottom: bottomInset }}
        contentContainerStyle={{ paddingTop: 4, paddingHorizontal: 16, paddingBottom: 16 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View style={{ gap: 12, opacity: fade, transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }}>
          {props.children}
        </Animated.View>
      </ScrollView>
    </Animated.View>
  );
});
