import { tokens } from "@lynia/shared";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, type IconName } from "./Icon";
import { useReduceMotion } from "./useReduceMotion";

/**
 * A lightweight in-app toast — the transient "something just happened" strip modern apps use for
 * foreground events the current screen doesn't already show (e.g. the customer's auction got
 * auto-rebroadcast out from under them because their rider bailed). Core `Animated` only: no library,
 * no portal dep. Mounted ONCE at the root (below the connectivity banner) so any screen can raise one
 * via `useToast()`.
 *
 * It deliberately does NOT duplicate the OS push banner (that already fires for background notices) —
 * it's for in-app moments. Each toast auto-dismisses; a new one replaces the visible one (we show a
 * single strip, newest wins) so a burst can't stack into a wall. Announced to screen readers.
 */

export type ToastTone = "info" | "success" | "warning";

export interface ToastMessage {
  id: number;
  text: string;
  tone: ToastTone;
}

/** How long a toast stays before auto-dismissing. */
export const TOAST_DURATION_MS = 4000;

/**
 * Reduce a raise into the visible queue: newest-first, capped. Pure so the behaviour is unit-testable
 * without rendering. The provider caps to 1 (single strip, newest wins) — a larger cap would let an
 * OLDER, already-stale message re-appear after the newest one dismisses, which is worse than dropping
 * it. The `max` parameter stays general for testing/other callers.
 */
export function pushToast(queue: ToastMessage[], msg: ToastMessage, max = 3): ToastMessage[] {
  return [msg, ...queue.filter((m) => m.id !== msg.id)].slice(0, max);
}

const TONE: Record<ToastTone, { icon: IconName; tint: string; ink: string }> = {
  info: { icon: "circle-alert", tint: tokens.color.accentWash, ink: tokens.color.accentText },
  success: { icon: "check", tint: tokens.color.accentWash, ink: tokens.color.accentText },
  warning: { icon: "triangle-alert", tint: tokens.color.dangerWash, ink: tokens.color.danger },
};

interface ToastApi {
  show: (text: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** Raise a toast from any screen under the provider. A no-op-safe fallback if used outside a provider. */
export function useToast(): ToastApi {
  return useContext(ToastContext) ?? NOOP;
}
const NOOP: ToastApi = { show: () => undefined };

/**
 * How an ACTION error reaches the user (owner instruction 2026-08-12): "error cards must just display
 * once and go — which is when an action is attempted and there is an error."
 *
 * Screens used to hold the failure in `useState` and paint a persistent red `<ErrorText>` under the
 * button. That message then camped on the screen indefinitely — nothing cleared it but a later success
 * — which is the same get-in-the-way problem as the background error cards, just smaller. This hook is
 * the drop-in replacement: it keeps the exact `(message: string | null) => void` shape of the `setError`
 * setters it replaces, so call sites keep reading `setError("Couldn't send the offer.")` and the
 * screen-specific, curated copy each `onError` computes is preserved verbatim — but the message is now
 * spoken once as a 4s auto-dismissing toast instead of being stored.
 *
 * Raising is UNCONDITIONAL per call, which is the point: a second failed attempt with a byte-identical
 * message must still speak. (A `useState`-based version silently swallows that — React bails out when
 * the value is unchanged, so the effect never re-runs and the rider gets no feedback on retry #2.)
 * `null`/`undefined` is the old "clear the error" call and is simply a no-op — a toast clears itself.
 *
 * NOT for inline field validation: `Field`'s own `error` prop still draws a persistent danger border +
 * caption under the offending input, because that message must stay readable while you fix the field.
 */
export function useActionError(): (message?: string | null) => void {
  const { show } = useToast();
  return useCallback(
    (message?: string | null): void => {
      if (message) show(message, "warning");
    },
    [show],
  );
}

/**
 * The same rule for screens that don't hold an error in state but DERIVE one from a mutation's own
 * `error` object (the tracker's `selectM.error ?? rotateM.error ?? …`, the safety sheets, the
 * food-offer accept/decline pair). Raises once per failure and never persists.
 *
 * Keyed on the Error OBJECT, not its message: React Query mints a fresh Error per failed attempt, so
 * a retry that fails with byte-identical copy still changes identity here and still speaks. Keying on
 * the string would swallow exactly the repeat the rider most needs to hear.
 */
export function useActionErrorEffect(error: unknown): void {
  const fail = useActionError();
  useEffect(() => {
    if (error instanceof Error) fail(error.message);
    // `fail` is stable (useCallback over the provider's stable `show`), so this runs on error identity.
  }, [error, fail]);
}

export function ToastProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [queue, setQueue] = useState<ToastMessage[]>([]);
  const nextId = useRef(1);
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const anim = useRef(new Animated.Value(0)).current;

  const show = useCallback((text: string, tone: ToastTone = "info"): void => {
    const msg: ToastMessage = { id: nextId.current++, text, tone };
    // Cap to 1: a new raise replaces the visible strip (newest wins) rather than queuing behind it,
    // so an older message can never re-surface after the newest dismisses.
    setQueue((q) => pushToast(q, msg, 1));
    AccessibilityInfo.announceForAccessibility(text);
  }, []);

  const current = queue[0] ?? null;

  // Slide/fade the current toast in, hold, then dismiss — dropping it from the queue so the next (if
  // any) takes over. Re-runs whenever the head changes.
  useEffect(() => {
    if (!current) return;
    const dismiss = (): void => setQueue((q) => q.filter((m) => m.id !== current.id));
    if (reduceMotion) {
      anim.setValue(1);
      const t = setTimeout(dismiss, TOAST_DURATION_MS);
      return () => clearTimeout(t);
    }
    anim.setValue(0);
    Animated.timing(anim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    const t = setTimeout(() => {
      Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: true }).start(dismiss);
    }, TOAST_DURATION_MS);
    return () => clearTimeout(t);
  }, [current, reduceMotion, anim]);

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {current ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: insets.top + tokens.space.sm,
            left: tokens.space.screen,
            right: tokens.space.screen,
            opacity: anim,
            transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) }],
          }}
        >
          <View
            accessibilityRole="alert"
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: tokens.space.sm,
              backgroundColor: tokens.color.bg,
              borderRadius: tokens.radius.card,
              paddingVertical: tokens.space.md,
              paddingHorizontal: tokens.space.lg,
              ...tokens.shadow.menu,
            }}
          >
            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: TONE[current.tone].tint, alignItems: "center", justifyContent: "center" }}>
              <Icon name={TONE[current.tone].icon} size={16} color={TONE[current.tone].ink} />
            </View>
            <Text style={{ flex: 1, fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink, lineHeight: 18 }}>
              {current.text}
            </Text>
          </View>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}
