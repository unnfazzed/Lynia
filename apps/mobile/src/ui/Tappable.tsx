import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { Platform, Pressable, type GestureResponderEvent, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import { enqueueTapAck } from "../telemetry/rum";
import { noteTouch } from "../telemetry/tap-signal";

/**
 * The one tappable primitive — a `Pressable` that always acknowledges the touch.
 *
 * WHY THIS EXISTS (docs/ANDROID-TAP-RESPONSIVENESS-RCA-2026-08-19.md §1). 90 of the app's 127
 * `<Pressable>` call sites rendered a byte-identical frame on touch-down: nothing changed until the
 * action itself completed, so the whole of the action's latency read as "the button didn't work".
 * That is the reported symptom — "if I click a button it takes time to respond" — and it is a
 * feedback bug, not a speed bug.
 *
 * WHY THE ANDROID PATH IS RIPPLE-ONLY, DELIBERATELY. `Pressable`'s `pressed` flag is React state, so
 * a `style={({ pressed }) => …}` press state costs: touch → bridge → `setState` → re-render → bridge
 * → paint. Under the old architecture (this app runs Paper — `newArchEnabled` is unset) that work is
 * queued behind whatever the JS thread is already doing, which is exactly when a tap feels late.
 * Android's `RippleDrawable` is painted by the PLATFORM on the UI thread from the touch event
 * itself, so it lands immediately and is unaffected by JS-thread load. Adding a `pressed` style on
 * top of the ripple would reintroduce the very re-render the ripple exists to avoid, and would be
 * strictly worse than the ripple alone — so on Android the feedback IS the ripple, full stop, and
 * pressing a control costs ZERO JavaScript.
 *
 * Other platforms have no ripple, so they fall back to a pressed opacity (which does cost a render —
 * there is no alternative there). Zimbabwe is ~90% Android and iOS is a later platform, so the cheap
 * path is the one that matters; the fallback simply keeps the primitive honest cross-platform.
 *
 * PIXEL PARITY (CLAUDE.md). This changes nothing about the RESTING frame — a ripple is transient
 * platform chrome drawn over the view during the touch, not drawn geometry — so the gallery
 * comparison and the parity render lane are unaffected. Controls whose mocks DO draw a press state
 * (`Button`'s `cta → ctaPressed`, `ServiceTiles`' scale 0.97) keep their own drawn treatment and are
 * deliberately NOT ported onto this primitive.
 */

/**
 * Ripple colours, derived from existing tokens rather than introduced as new design values — the
 * same "token + alpha suffix" construction the design system itself uses for `--highlight-border`
 * (`#F2B70566` = `highlight` at 40%). Nothing here is a value `packages/design/tokens/*.css`
 * defines, so the token-conformance guardrail is untouched.
 */
export const RIPPLE_INK = `${tokens.color.ink}14`; // ink @ 8% — rows/cards/tiles on a light surface
export const RIPPLE_ON_DARK = `${tokens.color.onAccent}29`; // white @ 16% — controls on ink/accent fills

/**
 * How the control should acknowledge a touch.
 *
 * - `row` — a row, card, tile or bar on a light surface. Bounded ripple, clipped to the view.
 * - `icon` — a small icon/chevron/close control. Borderless ripple, so it reads on a control whose
 *   visual footprint is smaller than its touch target (the `hitSlop` pattern this app uses widely).
 * - `onDark` — a control sitting on an ink or accent fill, where an ink ripple would be invisible.
 */
export type PressTone = "row" | "icon" | "onDark";

/** The android_ripple config per tone. Exported so the unit test asserts the real objects. */
export const RIPPLE: Record<PressTone, NonNullable<PressableProps["android_ripple"]>> = {
  // `foreground: true` draws the ripple ABOVE the children. Required, not cosmetic: most of these
  // controls set their own `backgroundColor`, and a background-layer ripple would be painted
  // underneath it and never seen. (API 23+; the app's minSdk is well above that.)
  row: { color: RIPPLE_INK, foreground: true },
  icon: { color: RIPPLE_INK, borderless: true, radius: 20 },
  onDark: { color: RIPPLE_ON_DARK, foreground: true },
};

/** Non-Android fallback opacity, mirroring the `opacity: 0.85` press LiveMap's controls already use. */
export const PRESSED_OPACITY: Record<PressTone, number> = { row: 0.85, icon: 0.6, onDark: 0.8 };

export interface TappableProps extends Omit<PressableProps, "android_ripple"> {
  /** Which acknowledgement fits this control. Defaults to `row`. */
  tone?: PressTone;
}

export function Tappable({ tone = "row", style, onPressIn, ...rest }: TappableProps): React.ReactElement {
  // `children` deliberately stays inside `rest` (Pressable's children may be a render prop, which is
  // not a valid third argument to createElement / an explicit JSX child).

  /**
   * Every press goes through here, which makes it the one place the two tap metrics can be armed
   * without touching a single call site (docs/ANDROID-TAP-RESPONSIVENESS-RCA-2026-08-19.md §3):
   * `noteTouch` is a clock read and an assignment, and `enqueueTapAck` is a no-op on 3 presses in 4
   * (and always, until the RUM buffer is armed). The caller's own `onPressIn` still runs, last.
   */
  const handlePressIn = (event: GestureResponderEvent): void => {
    noteTouch();
    enqueueTapAck();
    onPressIn?.(event);
  };

  if (Platform.OS === "android") {
    // No `pressed` style — see the header. The ripple is the acknowledgement and it costs no render.
    return <Pressable {...rest} onPressIn={handlePressIn} android_ripple={RIPPLE[tone]} style={style} />;
  }
  const pressedStyle: PressableProps["style"] = (state) => {
    const base: StyleProp<ViewStyle> = typeof style === "function" ? style(state) : style;
    return state.pressed ? [base, { opacity: PRESSED_OPACITY[tone] }] : base;
  };
  return <Pressable {...rest} onPressIn={handlePressIn} style={pressedStyle} />;
}
