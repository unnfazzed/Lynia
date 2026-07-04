import { tokens } from "@lynia/shared";
import React from "react";
import { AccessibilityInfo, ActivityIndicator, Animated, type DimensionValue, Pressable, Text, TextInput, type TextInputProps, View, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Icon, type IconName } from "./Icon";
import { isTestBuild } from "./test-build";

export { Icon, type IconName } from "./Icon";
export { BrandLockup, DoveMark, Wordmark } from "./Brand";
export { fontFamilies, interFamily } from "./fonts";
export { OfflineBanner, type ConnectivityState } from "./OfflineBanner";

export { isTestBuild } from "./test-build";

/**
 * A gold attention bar shown only on the QA test build (isTestBuild). It tells a tester the app is a
 * bypass build talking to the LIVE API — so test data and provenance in bug-report screenshots are
 * never mistaken for production. Renders nothing in a real release, so it can't leak.
 */
export function TestBuildBanner(): React.ReactElement | null {
  if (!isTestBuild()) return null;
  return (
    <View
      accessibilityRole="alert"
      style={{ backgroundColor: tokens.color.highlight, paddingVertical: 6, paddingHorizontal: tokens.space.screen, alignItems: "center" }}
    >
      <Text style={{ fontSize: 12, fontWeight: "700", color: tokens.color.ink }}>TEST BUILD — live API</Text>
    </View>
  );
}

export function Screen({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.surface }}>
      <TestBuildBanner />
      {/* 16px edge padding — designs must work at 320px wide (space.screen, not xl). */}
      <View style={{ flex: 1, padding: tokens.space.screen }}>{children}</View>
    </SafeAreaView>
  );
}

export function Heading({ children }: { children: React.ReactNode }): React.ReactElement {
  // Bold with slight negative tracking (≈ -0.02em at 24px) — only 400/600/700 ship, no 800.
  return <Text style={{ fontSize: tokens.font.size.h1, fontWeight: tokens.font.weight.bold, letterSpacing: -0.4, color: tokens.color.ink, marginBottom: tokens.space.sm }}>{children}</Text>;
}

export function Sub({ children }: { children: React.ReactNode }): React.ReactElement {
  return <Text style={{ fontSize: tokens.font.size.body, color: tokens.color.muted, marginBottom: tokens.space.lg }}>{children}</Text>;
}

export function Label({ children }: { children: React.ReactNode }): React.ReactElement {
  return <Text style={{ fontSize: tokens.font.size.label, fontWeight: tokens.font.weight.semibold, color: tokens.color.muted, marginBottom: 4 }}>{children}</Text>;
}

export function Field(props: {
  // Optional: repeatable rows (the compose item list) carry a single shared heading instead of a
  // label per row.
  label?: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "number-pad" | "phone-pad" | "decimal-pad";
  maxLength?: number;
  // Autofill hints: `autoComplete` (cross-platform, Android autofill) + `textContentType` (iOS). Set
  // them on the phone (tel) and OTP (one-time-code) fields so the keyboard/SMS autofill offers the
  // right value.
  autoComplete?: TextInputProps["autoComplete"];
  textContentType?: TextInputProps["textContentType"];
}): React.ReactElement {
  return (
    <View style={{ marginBottom: tokens.space.md }}>
      {props.label ? <Label>{props.label}</Label> : null}
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        placeholderTextColor={tokens.color.muted}
        keyboardType={props.keyboardType ?? "default"}
        maxLength={props.maxLength}
        autoComplete={props.autoComplete}
        textContentType={props.textContentType}
        // The visible Label is a sibling Text with no programmatic link, so name the input for
        // screen readers from the label (falls back to the placeholder for label-less rows).
        accessibilityLabel={props.label ?? props.placeholder}
        style={{
          borderWidth: 1,
          borderColor: tokens.color.line,
          borderRadius: tokens.radius.input,
          padding: tokens.space.md,
          fontSize: tokens.font.size.bodyLg,
          color: tokens.color.ink,
          backgroundColor: tokens.color.bg,
        }}
      />
    </View>
  );
}

export function Button(props: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: "primary" | "ghost";
}): React.ReactElement {
  const primary = (props.variant ?? "primary") === "primary";
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled || props.loading}
      style={({ pressed }) => ({
        // Grab shape language: full-pill buttons. Primary fill is `cta` (#00812F) — tuned for
        // white-on-green sunlight legibility — and presses to the darker `ctaPressed`; the brand
        // `accent` green stays reserved for non-text fills. Ghost is the outline pill with green text.
        // Ghost press feedback is the mint wash — `surface` is invisible against a Screen background.
        backgroundColor: primary ? (pressed ? tokens.color.ctaPressed : tokens.color.cta) : pressed ? tokens.color.accentWash : "transparent",
        borderWidth: primary ? 0 : 1,
        borderColor: tokens.color.line,
        opacity: props.disabled ? 0.5 : 1,
        borderRadius: tokens.radius.button,
        paddingVertical: 14,
        marginTop: tokens.space.sm,
        alignItems: "center",
        justifyContent: "center",
        minHeight: primary ? tokens.touchTargetPrimary : tokens.touchTargetMin, // primary CTA 52px, secondary ≥44px
      })}
    >
      {props.loading ? (
        <ActivityIndicator color={primary ? tokens.color.onAccent : tokens.color.accentText} />
      ) : (
        <Text style={{ color: primary ? tokens.color.onAccent : tokens.color.accentText, fontWeight: tokens.font.weight.semibold, fontSize: tokens.font.size.bodyLg }}>{props.label}</Text>
      )}
    </Pressable>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }): React.ReactElement {
  return (
    <View
      style={[
        {
          // Grab card look: white fill floating on a soft ambient shadow, no visible hairline. The
          // border stays in the box model but transparent so an emphasis card can still pass an
          // accent `borderColor` (active job, delivery code) without a layout shift.
          backgroundColor: tokens.color.bg,
          borderWidth: 1,
          borderColor: "transparent",
          borderRadius: tokens.radius.card,
          padding: tokens.space.lg,
          marginBottom: tokens.space.md,
          ...tokens.shadow.card,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/**
 * A pill label. Default (neutral) tone renders an order status in the accent colour. The
 * online/offline/reconnecting tones + optional leading dot back the rider's persistent connection
 * chip (DESIGN.md — reuse StatusPill, don't invent a chip), so an offline/paused state reads at a
 * glance without a new component.
 */
export type PillTone = "neutral" | "online" | "offline" | "reconnecting";
// Mirrors packages/design/components/core/StatusPill.jsx: text is the legible text-green (never the
// bright fill green), the dot is the fill green, and only the online tone sits on the mint wash.
const PILL_TONE: Record<PillTone, { text: string; bg: string; dot: string }> = {
  neutral: { text: tokens.color.accentText, bg: tokens.color.surface, dot: tokens.color.accent },
  online: { text: tokens.color.accentText, bg: tokens.color.accentWash, dot: tokens.color.accent },
  offline: { text: tokens.color.muted, bg: tokens.color.surface, dot: tokens.color.muted },
  // A dropped/paused connection is a transient state, not an error — muted, never danger-red.
  reconnecting: { text: tokens.color.muted, bg: tokens.color.surface, dot: tokens.color.muted },
};

export function StatusPill({
  status,
  tone = "neutral",
  dot = false,
}: {
  status: string;
  tone?: PillTone;
  dot?: boolean;
}): React.ReactElement {
  const t = PILL_TONE[tone];
  return (
    <View
      accessibilityRole="text"
      style={{
        flexDirection: "row",
        alignItems: "center",
        alignSelf: "flex-start",
        backgroundColor: t.bg,
        borderWidth: 1,
        borderColor: tokens.color.line,
        borderRadius: tokens.radius.pill,
        paddingHorizontal: tokens.space.md,
        paddingVertical: 4,
      }}
    >
      {dot ? (
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.dot, marginRight: 6 }} />
      ) : null}
      <Text style={{ fontSize: tokens.font.size.caption, fontWeight: tokens.font.weight.semibold, color: t.text }}>{status.replace(/_/g, " ")}</Text>
    </View>
  );
}

// Fares, ETAs and ratings render with tabular numerals (design tokens: font.tabularNumerals) —
// spread into any money/numeric Text style so digit columns align.
export const tabular = { fontVariant: ["tabular-nums"] as const };

export function ErrorText({ message }: { message?: string | null }): React.ReactElement | null {
  if (!message) return null;
  return <Text style={{ color: tokens.color.danger, fontSize: tokens.font.size.body, marginTop: tokens.space.sm }}>{message}</Text>;
}

// ── §5c journey stepper ───────────────────────────────────────────────────────
// One timeline seen from two sides (CONCEPT §5c): the customer and rider labels are paired so a step
// reads as the same event from either screen. Rendered from the order's append-only `events` + current
// status — no new data needed. Steps before the current one are done (✓ + time), the current one is
// "now" (accent ring + live), later ones are muted.
const STEP_ORDER = [
  "assigned",
  "confirmed",
  "en_route_pickup",
  "picked_up",
  "en_route_dropoff",
  "delivered",
  "completed",
] as const;

const STEP_LABELS: Record<"customer" | "rider", Record<string, string>> = {
  customer: {
    assigned: "Ride accepted",
    confirmed: "Items & note confirmed",
    en_route_pickup: "Rider on the way to pickup",
    picked_up: "Items collected",
    en_route_dropoff: "On the way to drop-off",
    delivered: "Delivered (OTP)",
    completed: "Rate your rider",
  },
  rider: {
    assigned: "You're assigned",
    confirmed: "Details confirmed",
    en_route_pickup: "Heading to pickup",
    picked_up: "Parcel collected",
    en_route_dropoff: "Heading to drop-off",
    delivered: "Delivered",
    completed: "Completed — you're free",
  },
};

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function Stepper(props: {
  events: { status: string; createdAt: string }[];
  currentStatus: string;
  view: "customer" | "rider";
}): React.ReactElement {
  const labels = STEP_LABELS[props.view];
  const currentIdx = STEP_ORDER.indexOf(props.currentStatus as (typeof STEP_ORDER)[number]);
  // First timestamp seen per status (events are append-only, ascending).
  const times: Record<string, string> = {};
  for (const e of props.events) if (!(e.status in times)) times[e.status] = e.createdAt;

  return (
    <View>
      {STEP_ORDER.map((s, i) => {
        const state = currentIdx < 0 ? "todo" : i < currentIdx ? "done" : i === currentIdx ? "now" : "todo";
        const last = i === STEP_ORDER.length - 1;
        const onTrack = state !== "todo";
        const ts = times[s];
        return (
          <View key={s} style={{ flexDirection: "row" }}>
            <View style={{ alignItems: "center", width: 26 }}>
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  borderWidth: 2,
                  borderColor: onTrack ? tokens.color.accent : tokens.color.line,
                  backgroundColor: state === "done" ? tokens.color.accent : tokens.color.bg,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "700",
                    color: state === "done" ? tokens.color.onAccent : state === "now" ? tokens.color.accentText : tokens.color.muted,
                  }}
                >
                  {state === "done" ? "✓" : String(i + 1)}
                </Text>
              </View>
              {!last ? (
                <View style={{ flex: 1, width: 2, minHeight: 16, backgroundColor: i < currentIdx ? tokens.color.accent : tokens.color.line }} />
              ) : null}
            </View>
            <View style={{ flex: 1, paddingBottom: last ? 0 : tokens.space.md, paddingLeft: tokens.space.sm }}>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: state === "todo" ? "600" : "700",
                  color: state === "now" ? tokens.color.accentText : state === "todo" ? tokens.color.muted : tokens.color.ink,
                }}
              >
                {labels[s]}
              </Text>
              {ts && onTrack ? (
                <Text style={{ fontSize: 11, color: tokens.color.muted, marginTop: 1 }}>
                  {fmtTime(ts)}
                  {state === "now" ? " · live" : ""}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
// A dead-end becomes an action (DESIGN.md): warm illustration + heading + one primary action passed as
// children. Used for no-offers / no-orders and similar calm, recoverable states.
export function EmptyState(props: {
  icon: IconName;
  title: string;
  message: string;
  children?: React.ReactNode;
}): React.ReactElement {
  return (
    <View style={{ alignItems: "center", paddingVertical: tokens.space.xl }}>
      <View
        style={{
          width: 88,
          height: 88,
          borderRadius: 44,
          // Mint-wash tile + text-green icon (DS EmptyState tone) — warm, not greyed-out.
          backgroundColor: tokens.color.accentWash,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: tokens.space.md,
        }}
      >
        <Icon name={props.icon} size={34} color={tokens.color.accentText} strokeWidth={1.75} />
      </View>
      <Text style={{ fontSize: tokens.font.size.title, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, textAlign: "center" }}>{props.title}</Text>
      <Text style={{ fontSize: tokens.font.size.body, color: tokens.color.muted, textAlign: "center", lineHeight: 20, marginTop: 6, maxWidth: 260 }}>
        {props.message}
      </Text>
      {props.children ? <View style={{ alignSelf: "stretch", marginTop: tokens.space.md }}>{props.children}</View> : null}
    </View>
  );
}

// ── Skeleton loaders ──────────────────────────────────────────────────────────
// DESIGN.md (data-light): list/board/stepper screens show content-shaped skeletons while loading,
// not a bare spinner, so the layout doesn't jump when data lands. A calm opacity pulse, native-driven
// so it stays cheap on constrained devices.

// Reduce-motion, live-updating — a pulsing loop must stop the moment the OS setting flips on.
function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = React.useState(false);
  React.useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      if (!cancelled) setReduceMotion(on);
    });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);
  return reduceMotion;
}

export function Skeleton({
  width = "100%",
  height = 14,
  radius = 6,
  style,
}: {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: ViewStyle;
}): React.ReactElement {
  const reduceMotion = useReduceMotion();
  const pulse = React.useRef(new Animated.Value(0.5)).current;
  React.useEffect(() => {
    // Reduce-motion: no pulse — hold a static mid opacity so the placeholder still reads as loading.
    if (reduceMotion) {
      pulse.setValue(0.65);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduceMotion]);
  return <Animated.View style={[{ width, height, borderRadius: radius, backgroundColor: tokens.color.line, opacity: pulse }, style]} />;
}

/** A Card-shaped placeholder mirroring a list/board row. */
export function SkeletonCard(): React.ReactElement {
  return (
    <Card>
      <Skeleton width="55%" height={16} />
      <Skeleton width="80%" height={12} style={{ marginTop: tokens.space.sm }} />
      <Skeleton width="35%" height={12} style={{ marginTop: tokens.space.sm }} />
    </Card>
  );
}

/** N skeleton cards — the default loading state for list/board/stepper screens. */
export function SkeletonList({ count = 3 }: { count?: number }): React.ReactElement {
  return (
    <View accessibilityLabel="Loading" accessibilityState={{ busy: true }}>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </View>
  );
}

/** A row-shaped placeholder mirroring a list row that has a right-aligned value (e.g. trip history). */
export function SkeletonRow(): React.ReactElement {
  return (
    <Card>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View style={{ flex: 1, paddingRight: tokens.space.sm }}>
          <Skeleton width="70%" height={14} />
          <Skeleton width="90%" height={12} style={{ marginTop: tokens.space.sm }} />
        </View>
        <Skeleton width={48} height={16} />
      </View>
    </Card>
  );
}

/** N skeleton rows — loading state for row-with-value lists (mirrors the row layout, no reflow). */
export function SkeletonRows({ count = 4 }: { count?: number }): React.ReactElement {
  return (
    <View accessibilityLabel="Loading" accessibilityState={{ busy: true }}>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonRow key={i} />
      ))}
    </View>
  );
}
