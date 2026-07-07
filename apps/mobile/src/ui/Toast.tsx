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
 * Reduce a raise into the visible queue: newest-first, capped so a burst can't stack endlessly. Pure so
 * the queue behaviour is unit-testable without rendering. We show only the head, but keep a small tail
 * so a rapid second raise has something to fall back to when the first dismisses.
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

export function ToastProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [queue, setQueue] = useState<ToastMessage[]>([]);
  const nextId = useRef(1);
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const anim = useRef(new Animated.Value(0)).current;

  const show = useCallback((text: string, tone: ToastTone = "info"): void => {
    const msg: ToastMessage = { id: nextId.current++, text, tone };
    setQueue((q) => pushToast(q, msg));
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
