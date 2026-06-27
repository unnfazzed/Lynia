import { tokens } from "@lynia/shared";
import React from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export function Screen({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.surface }}>
      <View style={{ flex: 1, padding: tokens.space.xl }}>{children}</View>
    </SafeAreaView>
  );
}

export function Heading({ children }: { children: React.ReactNode }): React.ReactElement {
  return <Text style={{ fontSize: 24, fontWeight: "800", color: tokens.color.ink, marginBottom: tokens.space.sm }}>{children}</Text>;
}

export function Sub({ children }: { children: React.ReactNode }): React.ReactElement {
  return <Text style={{ fontSize: 14, color: tokens.color.muted, marginBottom: tokens.space.lg }}>{children}</Text>;
}

export function Label({ children }: { children: React.ReactNode }): React.ReactElement {
  return <Text style={{ fontSize: 12, fontWeight: "600", color: tokens.color.muted, marginBottom: 4 }}>{children}</Text>;
}

export function Field(props: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "number-pad" | "phone-pad" | "decimal-pad";
  maxLength?: number;
}): React.ReactElement {
  return (
    <View style={{ marginBottom: tokens.space.md }}>
      <Label>{props.label}</Label>
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        placeholderTextColor={tokens.color.muted}
        keyboardType={props.keyboardType ?? "default"}
        maxLength={props.maxLength}
        style={{
          borderWidth: 1,
          borderColor: tokens.color.line,
          borderRadius: tokens.radius.input,
          padding: tokens.space.md,
          fontSize: 16,
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
        backgroundColor: primary ? tokens.color.accent : "transparent",
        borderWidth: primary ? 0 : 1,
        borderColor: tokens.color.line,
        opacity: props.disabled ? 0.5 : pressed ? 0.85 : 1,
        borderRadius: tokens.radius.input,
        paddingVertical: 14,
        marginTop: tokens.space.sm,
        alignItems: "center",
        justifyContent: "center",
        minHeight: primary ? 52 : tokens.touchTargetMin, // spec: primary CTA 52px, secondary ≥44px
      })}
    >
      {props.loading ? (
        <ActivityIndicator color={primary ? "#fff" : tokens.color.accent} />
      ) : (
        <Text style={{ color: primary ? "#fff" : tokens.color.ink, fontWeight: "700", fontSize: 16 }}>{props.label}</Text>
      )}
    </Pressable>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }): React.ReactElement {
  return (
    <View
      style={[
        {
          backgroundColor: tokens.color.bg,
          borderWidth: 1,
          borderColor: tokens.color.line,
          borderRadius: tokens.radius.card,
          padding: tokens.space.lg,
          marginBottom: tokens.space.md,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function StatusPill({ status }: { status: string }): React.ReactElement {
  return (
    <View
      style={{
        alignSelf: "flex-start",
        backgroundColor: tokens.color.surface,
        borderWidth: 1,
        borderColor: tokens.color.line,
        borderRadius: tokens.radius.pill,
        paddingHorizontal: 10,
        paddingVertical: 4,
      }}
    >
      <Text style={{ fontSize: 12, fontWeight: "700", color: tokens.color.accent }}>{status.replace(/_/g, " ")}</Text>
    </View>
  );
}

export function ErrorText({ message }: { message?: string | null }): React.ReactElement | null {
  if (!message) return null;
  return <Text style={{ color: tokens.color.danger, fontSize: 13, marginTop: tokens.space.sm }}>{message}</Text>;
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
                    fontWeight: "800",
                    color: state === "done" ? "#fff" : state === "now" ? tokens.color.accent : tokens.color.muted,
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
                  color: state === "now" ? tokens.color.accent : state === "todo" ? tokens.color.muted : tokens.color.ink,
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
  icon: string;
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
          backgroundColor: tokens.color.surface,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: tokens.space.md,
        }}
      >
        <Text style={{ fontSize: 36 }}>{props.icon}</Text>
      </View>
      <Text style={{ fontSize: 18, fontWeight: "800", color: tokens.color.ink, textAlign: "center" }}>{props.title}</Text>
      <Text style={{ fontSize: 13, color: tokens.color.muted, textAlign: "center", lineHeight: 19, marginTop: 6, maxWidth: 260 }}>
        {props.message}
      </Text>
      {props.children ? <View style={{ alignSelf: "stretch", marginTop: tokens.space.md }}>{props.children}</View> : null}
    </View>
  );
}
