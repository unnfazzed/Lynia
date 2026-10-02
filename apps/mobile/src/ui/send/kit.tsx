import { serviceTownsLabel } from "@lynia/shared";
import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { ActivityIndicator, Text, TextInput, type TextInputProps, View, type ViewStyle } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { Icon, type IconName } from "../Icon";
import { Tappable } from "../Tappable";

/**
 * The Send flow's shared parts — rebuilt from `packages/design/handoff/send-compose-v2/design/sc2-kit.jsx`
 * (ledger D-52) on the app's tokens. Geometry is the handoff's: 52px header row + step bar, the 52px
 * pill CTA in a pinned bar, 48px fields with a 2px focus/error ring, 44px text buttons, 12px radii.
 * Every user-facing string lives in `SEND_COPY` (the handoff's `S` object, verbatim).
 */

export const SEND_COPY = {
  back: "Back",
  title: "Send a parcel",
  steps: ["Where", "What", "Price", "Review"] as const,
  pickup: "PICKUP",
  drop: "DROP-OFF",
  pickPh: "Set pickup location",
  dropPh: "Where to?",
  fromGps: "Your location",
  change: "Change",
  search: "Search",
  clear: "Clear",
  useLoc: "Use my location",
  useCur: "Use my current location",
  tapMap: "Tap the map to set the pin",
  mapHintDrop: "Or tap the map to set your drop-off",
  needDrop: "Add a drop-off to continue.",
  noRes: "No matches. Check the spelling, or set the pin on the map.",
  slow: "Searching… Slow connection, hang on.",
  limited: "Search is limited right now. Type the street and area, or use the map.",
  next: "Next",
  // Owner 2026-10-02 (ledger D-61): the served towns are named, replacing "Move your pins closer to Harare…".
  outArea: `We don't cover that pickup or drop-off yet. We deliver across ${serviceTownsLabel()}.`,
  outTag: "Outside our area",
  whatSend: "What are you sending?",
  itemPh: "e.g. Documents envelope",
  qty: "Qty",
  remove: "Remove",
  addItem: "Add another item",
  maxItems: "Up to 10 items per order.",
  note: "Note for the rider (optional)",
  notePh: "Ask for Rita at the pharmacy counter; keep it upright.",
  sender: "Your phone (sender)",
  senderHint: "Shared with your rider only during the delivery.",
  rcpt: "Recipient phone",
  rcptHint: "So the rider can reach them at drop-off.",
  phonePh: "+263 77 000 0000",
  phoneErr: "That doesn't look like a phone number",
  yourPrice: "Your price",
  tapType: "Tap the price to type an amount",
  minus: "− $0.50",
  plus: "+ $0.50",
  low: "That's below what riders usually take — they may pass. Nudge it up for a faster match.",
  high: "That's a lot more than usual for this trip — double-check you didn't add a digit by mistake.",
  cash: "Cash to your rider",
  review: "Review",
  sumRoute: "Route",
  sumItems: "Items",
  sumNote: "Note",
  sumPhones: "Phones",
  sumPrice: "Price",
  edit: "Edit",
  you: "You",
  recipient: "Recipient",
  send: "Send to riders",
  sending: "Sending…",
  failed: "Couldn't send. Check your data and try again.",
  retry: "Try again",
  offline: "You're offline. What you've entered is saved.",
  offlineCta: "Connect to the internet to send.",
  holdT: "Your account is on hold",
  holdB: "You can't send parcels right now. Call us and we'll help you sort it out.",
  call: "Call support",
  home: "Back to home",
} as const;

/** 12/600 uppercase row label, letter-spacing .04em (the handoff's `lbl`). */
export const LABEL_STYLE = {
  fontSize: tokens.font.size.label,
  fontWeight: tokens.font.weight.semibold,
  letterSpacing: 0.5,
  color: tokens.color.muted,
  lineHeight: 16,
} as const;

/** Pickup marker: a green circle (outlined when empty). App-wide visual language. */
export function Dot({ size = 12, empty = false }: { size?: number; empty?: boolean }): React.ReactElement {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: empty ? tokens.color.bg : tokens.color.accent,
        borderWidth: empty ? 2 : 0,
        borderColor: tokens.color.accent,
      }}
    />
  );
}

/** Drop-off marker: a red square (outlined when empty). */
export function Sq({ size = 12, empty = false }: { size?: number; empty?: boolean }): React.ReactElement {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 2,
        backgroundColor: empty ? tokens.color.bg : tokens.color.danger,
        borderWidth: empty ? 2 : 0,
        borderColor: tokens.color.danger,
      }}
    />
  );
}

/** A 44px icon + label text button (every icon carries a visible word). */
export function TextAction({
  icon,
  label,
  onPress,
  color = tokens.color.accentText,
  size = 13,
  accessibilityLabel,
  style,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  color?: string;
  size?: number;
  accessibilityLabel?: string;
  style?: ViewStyle;
}): React.ReactElement {
  return (
    <Tappable
      tone="icon"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={{ minHeight: tokens.touchTargetMin, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 6, ...style }}
    >
      <Icon name={icon} size={size + 2} color={color} />
      <Text style={{ fontSize: size, fontWeight: tokens.font.weight.semibold, color }}>{label}</Text>
    </Tappable>
  );
}

function StepBar({ step }: { step: number }): React.ReactElement {
  return (
    <View style={{ flexDirection: "row", gap: 6, paddingHorizontal: 12, paddingBottom: 8 }}>
      {SEND_COPY.steps.map((label, i) => {
        const n = i + 1;
        const done = n < step;
        const cur = n === step;
        const on = done || cur;
        return (
          <View
            key={label}
            style={{ flex: 1, minWidth: 0 }}
            accessible
            accessibilityLabel={`Step ${n}, ${label}${done ? ", done" : cur ? ", current" : ""}`}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5, height: 22 }}>
              <View
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: on ? tokens.color.accentText : tokens.color.surface,
                  borderWidth: on ? 0 : 1,
                  borderColor: tokens.color.line,
                }}
              >
                {done ? (
                  <Icon name="check" size={12} color={tokens.color.onAccent} />
                ) : (
                  <Text style={{ fontSize: 11, fontWeight: tokens.font.weight.bold, color: on ? tokens.color.onAccent : tokens.color.muted }}>{n}</Text>
                )}
              </View>
              <Text
                numberOfLines={1}
                style={{
                  fontSize: 12,
                  fontWeight: cur ? tokens.font.weight.bold : tokens.font.weight.semibold,
                  color: cur ? tokens.color.ink : done ? tokens.color.accentText : tokens.color.muted,
                }}
              >
                {label}
              </Text>
            </View>
            <View style={{ height: 3, borderRadius: 2, marginTop: 4, backgroundColor: on ? tokens.color.accent : tokens.color.line }} />
          </View>
        );
      })}
    </View>
  );
}

/** White header: "‹ Back" + centred "Send a parcel", then the step bar (hidden while editing an address). */
export function SendHeader({ step, bar = true, onBack }: { step: number; bar?: boolean; onBack: () => void }): React.ReactElement {
  return (
    <View style={{ backgroundColor: tokens.color.bg, borderBottomWidth: 1, borderBottomColor: tokens.color.line, zIndex: 20 }}>
      <View style={{ height: 52, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8 }}>
        <Tappable
          tone="icon"
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={SEND_COPY.back}
          style={{ height: tokens.touchTargetMin, flexDirection: "row", alignItems: "center", gap: 2, paddingLeft: 2, paddingRight: 8 }}
        >
          <View style={{ transform: [{ rotate: "90deg" }] }}>
            <Icon name="chevron-down" size={22} color={tokens.color.accentText} />
          </View>
          <Text style={{ fontSize: 15, fontWeight: tokens.font.weight.semibold, color: tokens.color.accentText }}>{SEND_COPY.back}</Text>
        </Tappable>
        <Text
          accessibilityRole="header"
          style={{ flex: 1, textAlign: "center", fontSize: 16, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, marginRight: 64 }}
        >
          {SEND_COPY.title}
        </Text>
      </View>
      {bar ? <StepBar step={step} /> : null}
    </View>
  );
}

/** The 52px pill: accent fill when enabled, `line` fill + muted text when disabled, spinner when loading. */
export function SendButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  ghost = false,
  icon,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  ghost?: boolean;
  icon?: IconName;
}): React.ReactElement {
  const bg = ghost ? tokens.color.bg : disabled ? tokens.color.line : tokens.color.accent;
  const fg = ghost ? tokens.color.accentText : disabled ? tokens.color.muted : tokens.color.onAccent;
  return (
    <Tappable
      tone={ghost ? "row" : "onDark"}
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      style={{
        height: tokens.touchTargetPrimary,
        borderRadius: tokens.radius.pill,
        backgroundColor: bg,
        borderWidth: ghost ? 1.5 : 0,
        borderColor: tokens.color.line,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        overflow: "hidden",
      }}
    >
      {loading ? <ActivityIndicator size="small" color={fg} /> : icon ? <Icon name={icon} size={18} color={fg} /> : null}
      <Text style={{ fontSize: 16, fontWeight: tokens.font.weight.bold, color: fg }}>{label}</Text>
    </Tappable>
  );
}

/** The pinned CTA bar: an optional one-line "what's missing" hint over the button. */
export function SendCtaBar({
  label,
  onPress,
  disabled,
  loading,
  hint,
  children,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  hint?: string | null;
  /** Rendered above the hint (Review pins the price here). */
  children?: React.ReactNode;
}): React.ReactElement {
  return (
    <View style={{ backgroundColor: tokens.color.bg, paddingTop: children ? 4 : 10, paddingHorizontal: 16, paddingBottom: 12, zIndex: 25, ...tokens.shadow.sheet }}>
      {children}
      {hint ? (
        <Text accessibilityLiveRegion="polite" style={{ fontSize: 13, lineHeight: 18, color: tokens.color.muted, textAlign: "center", marginBottom: 8 }}>
          {hint}
        </Text>
      ) : null}
      <SendButton label={label} onPress={onPress} disabled={disabled} loading={loading} />
    </View>
  );
}

/** A field: 13/600 label, 48px input (68 multiline), 2px accent-text focus / danger error ring. */
export function SendField({
  label,
  error,
  hint,
  multiline,
  children,
  ...input
}: TextInputProps & { label?: string; error?: string | null; hint?: string; children?: React.ReactNode }): React.ReactElement {
  const [focused, setFocused] = React.useState(false);
  const ring = error ? tokens.color.danger : focused ? tokens.color.accentText : tokens.color.line;
  return (
    <View style={{ marginBottom: 14 }}>
      {label ? <Text style={{ fontSize: 13, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink, lineHeight: 18, marginBottom: 6 }}>{label}</Text> : null}
      <TextInput
        {...input}
        multiline={multiline}
        accessibilityLabel={input.accessibilityLabel ?? label}
        placeholderTextColor={tokens.color.muted}
        onFocus={(e) => {
          setFocused(true);
          input.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          input.onBlur?.(e);
        }}
        style={{
          minHeight: multiline ? 68 : 48,
          borderWidth: error || focused ? 2 : 1,
          borderColor: ring,
          borderRadius: tokens.radius.input,
          backgroundColor: tokens.color.bg,
          paddingHorizontal: error || focused ? 11 : 12,
          paddingVertical: multiline ? 10 : 0,
          fontSize: 15,
          color: tokens.color.ink,
          textAlignVertical: multiline ? "top" : "center",
        }}
      />
      {children}
      {error ? (
        <View accessibilityRole="alert" style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6 }}>
          <Icon name="circle-alert" size={14} color={tokens.color.danger} />
          <Text style={{ fontSize: 13, fontWeight: tokens.font.weight.semibold, color: tokens.color.danger }}>{error}</Text>
        </View>
      ) : null}
      {hint ? <Text style={{ fontSize: 12, lineHeight: 16, color: tokens.color.muted, marginTop: 6 }}>{hint}</Text> : null}
    </View>
  );
}

/** Calm (surface) or warn (white + danger border/icon) notice. Warn notices are hints, never blocks. */
export function Notice({
  icon = "circle-alert",
  text,
  lead,
  tone = "calm",
  style,
}: {
  icon?: IconName;
  text: string;
  /** A bold first sentence before `text` (the order screen's no-riders notice, D-53). */
  lead?: string;
  tone?: "calm" | "warn" | "wash";
  style?: ViewStyle;
}): React.ReactElement {
  const warn = tone === "warn";
  const wash = tone === "wash";
  return (
    <View
      accessibilityRole={warn ? "alert" : "text"}
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 10,
        backgroundColor: warn ? tokens.color.bg : wash ? tokens.color.accentWash : tokens.color.surface,
        borderWidth: wash ? 0 : 1,
        borderColor: warn ? tokens.color.danger : tokens.color.line,
        borderRadius: tokens.radius.input,
        paddingVertical: 10,
        paddingHorizontal: 12,
        ...style,
      }}
    >
      <Icon name={icon} size={18} color={warn ? tokens.color.danger : tokens.color.muted} />
      <Text style={{ flex: 1, fontSize: 13, lineHeight: 19, color: tokens.color.ink }}>
        {lead ? <Text style={{ fontWeight: tokens.font.weight.bold }}>{lead} </Text> : null}
        {text}
      </Text>
    </View>
  );
}

/** Ink toast floating above the CTA, with a 44px "↻ Try again" on the right. */
export function SendToast({ text, action, onAction }: { text: string; action?: string; onAction?: () => void }): React.ReactElement {
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        backgroundColor: tokens.color.ink,
        borderRadius: tokens.radius.input,
        paddingVertical: 6,
        paddingRight: 6,
        paddingLeft: 14,
        ...tokens.shadow.menu,
      }}
    >
      <Icon name="circle-alert" size={18} color={tokens.color.onAccent} />
      <Text style={{ flex: 1, fontSize: 13, lineHeight: 18, color: tokens.color.onAccent }}>{text}</Text>
      {action && onAction ? (
        <Tappable
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={action}
          style={{
            height: tokens.touchTargetMin,
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            paddingHorizontal: 10,
            borderRadius: 10,
            backgroundColor: tokens.color.accentWash,
          }}
        >
          <Icon name="refresh-cw" size={14} color={tokens.color.accentText} />
          <Text style={{ fontSize: 13, fontWeight: tokens.font.weight.bold, color: tokens.color.accentText }}>{action}</Text>
        </Tappable>
      ) : null}
    </View>
  );
}

/** A 64×56 drawn route thumbnail (no native map): ground, roads, the route, pickup dot + drop square. */
function MiniRoute(): React.ReactElement {
  return (
    <View style={{ width: 64, height: 56, borderRadius: 8, overflow: "hidden", backgroundColor: tokens.color.surface }}>
      <Svg width={64} height={56}>
        <Rect x={0} y={0} width={64} height={56} fill={tokens.color.surface} />
        <Path d="M0 14 L64 18 M0 34 L64 30 M16 0 L18 56 M40 0 L36 56" stroke={tokens.color.bg} strokeWidth={4} />
        <Path d="M14 17 C 18 40, 30 44, 50 40" fill="none" stroke={tokens.color.accent} strokeWidth={3} strokeLinecap="round" />
      </Svg>
      <View style={{ position: "absolute", left: 9, top: 12 }}>
        <Dot size={10} />
      </View>
      <View style={{ position: "absolute", left: 45, top: 35 }}>
        <Sq size={10} />
      </View>
    </View>
  );
}

/** Steps 2–3: the collapsed map — mini route + both names + "✎ Edit" back to step 1. */
export function RouteStrip({ pickup, drop, onEdit }: { pickup: string; drop: string; onEdit: () => void }): React.ReactElement {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        borderWidth: 1,
        borderColor: tokens.color.line,
        borderRadius: tokens.radius.input,
        padding: 6,
        marginBottom: 16,
        backgroundColor: tokens.color.bg,
      }}
    >
      <MiniRoute />
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Dot size={10} />
          <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink }}>
            {pickup}
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Sq size={10} />
          <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink }}>
            {drop}
          </Text>
        </View>
      </View>
      <TextAction icon="pencil" label={SEND_COPY.edit} onPress={onEdit} accessibilityLabel="Edit the route" />
    </View>
  );
}
