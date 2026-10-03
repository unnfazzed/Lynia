import { tokens } from "@lynia/shared/tokens";
import React, { createContext, useContext, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Animated, Easing, PanResponder, ScrollView, View } from "react-native";
import { chooseSnap } from "../BottomSheet";
import { Tappable } from "../Tappable";
import { useKeyboardVisible } from "../shell/TabShell";
import { ORDER_COPY as A } from "./copy";

/**
 * The order screen's bottom sheet (After Send handoff "Sheet", ledger D-53, v2 round): white, radius 16 on
 * top, a 28px grabber row (36×4 `line` bar), content in a column with a 12px gap that scrolls at either
 * snap. Two snaps — PEEK and FULL (a 96px map strip stays under the header). The content area ends at the
 * top of the pinned CTA bar (`bottomInset`).
 *
 * PEEK is measured (v2 §1.3): each stage marks the end of the block that must be fully visible with
 * `<PeekMark/>`; the sheet's peek height is that block's bottom + 16 + the CTA bar, never below the
 * stage's floor and never leaving the map under 96. A stage without a mark falls back to `fallbackShare`.
 *
 * The grabber's tap/drag target is 120×44: the 28px row plus 16px ABOVE the sheet's edge. It is rendered
 * as a sibling of the sheet (riding the same animated `top`), because Android doesn't deliver touches to a
 * child drawn outside its parent's bounds. Tap toggles peek ↔ full; TalkBack reads "Show more" / "Show less".
 *
 * The sheet's `top` animates on the JS driver (it changes the scroll viewport, which a transform can't).
 * The content cross-fades in (opacity 0 → 1, translateY 8 → 0, 250ms) when `contentKey` changes. Reduce
 * motion cuts both instantly. Core Animated + PanResponder only (no reanimated in this app).
 */

/** The map strip kept under the header when the sheet is at FULL — and the map's minimum at peek. */
export const FULL_STRIP = 96;
const GRAB = 28;
const DRAG_CLAIM_PX = 6;
const GAP = 12;

const PeekContext = createContext<{ set: (y: number) => void; gap: number; stage: string } | null>(null);

/** Marks where the must-see block of a stage ends (put it right after that block). */
export function PeekMark(): React.ReactElement {
  const ctx = useContext(PeekContext);
  // The mark sits one column gap below the block it follows.
  // Keyed by the stage: a stage change clears the measured mark, and a mark that lands at the same y would
  // never fire onLayout again — leaving the peek stuck on the fallback share. Remounting re-measures.
  return <View key={ctx?.stage} pointerEvents="none" style={{ height: 0, marginTop: -(ctx?.gap ?? GAP) }} onLayout={(e) => ctx?.set(e.nativeEvent.layout.y)} />;
}

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
    /** The map's share of `areaHeight` at peek when the stage has no `PeekMark`. */
    fallbackShare: number;
    /** The stage's floor for the sheet's height at peek (README v2 peek table), 0 for none. */
    floor: number;
    /** The pinned CTA bar's height — the content area ends there. */
    bottomInset: number;
    contentKey: string;
    reduceMotion: boolean;
    /** Reports the sheet's visible height (for the map's fit padding). */
    onVisibleHeight?: (h: number) => void;
    /** Top corner radius (After Send 16; Order flow v2.1 24). */
    radius?: number;
    /** The content column's gap (After Send 12; Order flow v2.1 14). */
    gap?: number;
    children: React.ReactNode;
  }
>(function OrderSheet(props, ref) {
  const { areaHeight, bottomInset, reduceMotion, floor, fallbackShare, contentKey } = props;
  const radius = props.radius ?? 16;
  const gap = props.gap ?? GAP;
  const [mark, setMark] = useState<number | null>(null);
  const peekCtx = useMemo(() => ({ set: setMark, gap, stage: contentKey }), [gap, contentKey]);
  // A new stage re-measures.
  useEffect(() => setMark(null), [contentKey]);

  const maxH = Math.max(0, areaHeight - FULL_STRIP);
  const measured = mark != null ? GRAB + mark + 16 + bottomInset : Math.round(areaHeight * (1 - fallbackShare));
  const peekH = Math.min(maxH, Math.max(floor, measured));
  const peekTop = Math.round(areaHeight - peekH);
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

  // A stage change (new peek) or a resize returns the sheet to the stage's peek — except while the keyboard
  // is up: Android shrinks the window for it, and snapping back to peek in the smaller area left the
  // focused field (a 6-digit code box) below the fold. Typing opens the sheet to FULL instead.
  const keyboard = useKeyboardVisible();
  useEffect(() => {
    if (areaHeight <= 0) return;
    if (keyboard) animateTo(fullTop, fullTop !== peekTop);
    else animateTo(peekTop, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-snap only when the peek geometry changes.
  }, [peekTop, fullTop, areaHeight, keyboard]);

  useImperativeHandle(ref, () => ({
    isFull: () => fullRef.current,
    collapse: () => animateTo(peekTop, false),
  }));

  const toggle = (): void => (fullRef.current ? animateTo(peekTop, false) : animateTo(fullTop, fullTop !== peekTop));

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
  }, [contentKey, reduceMotion, fade]);

  return (
    <>
      <Animated.View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top,
          bottom: 0,
          backgroundColor: tokens.color.bg,
          borderTopLeftRadius: radius,
          borderTopRightRadius: radius,
          zIndex: 10,
          ...tokens.shadow.sheet,
        }}
      >
        <View style={{ height: GRAB, alignItems: "center", justifyContent: "center" }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: tokens.color.line }} />
        </View>
        <ScrollView
          style={{ flex: 1, marginBottom: bottomInset }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <PeekContext.Provider value={peekCtx}>
            <Animated.View style={{ gap, opacity: fade, transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }}>
              {props.children}
            </Animated.View>
          </PeekContext.Provider>
        </ScrollView>
      </Animated.View>
      {/* The grabber's 120×44 target: 16px above the sheet edge + the 28px row. */}
      <Animated.View
        {...pan.panHandlers}
        style={{ position: "absolute", top: Animated.add(top, -16), left: "50%", marginLeft: -60, width: 120, height: 44, zIndex: 12 }}
      >
        <Tappable
          tone="icon"
          onPress={toggle}
          accessibilityRole="button"
          accessibilityLabel={full ? A.grabLess : A.grabMore}
          accessibilityActions={[{ name: "expand" }, { name: "collapse" }]}
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === "expand") animateTo(fullTop, fullTop !== peekTop);
            else animateTo(peekTop, false);
          }}
          style={{ width: 120, height: 44 }}
        />
      </Animated.View>
    </>
  );
});
