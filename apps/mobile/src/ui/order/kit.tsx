import { tokens } from "@lynia/shared/tokens";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Text, type TextStyle, View, type ViewStyle } from "react-native";
import { Icon, type IconName } from "../Icon";
import { RemoteImage } from "../RemoteImage";
import { Tappable } from "../Tappable";
import { LABEL_STYLE } from "../send/kit";
import { clock, ORDER_COPY as A } from "./copy";

/**
 * The After Send order screen's shared parts, rebuilt from the handoff's `as-kit.jsx`
 * (`packages/design/handoff/after-send/`, ledger D-53) on the app's tokens. Geometry is the
 * handoff's: 44px small buttons, 52px CTAs in a pinned bar, 12px card radii, 44px tags and star
 * targets. Built at size — never inflated with hitSlop. Strings come from `./copy` only.
 */

export const TABULAR: TextStyle = { fontVariant: ["tabular-nums"] };
export const LABEL = LABEL_STYLE;

/** 18/700 sheet headline, line-height 24. */
export function H2({ children, style }: { children: React.ReactNode; style?: TextStyle }): React.ReactElement {
  return <Text style={{ fontSize: 18, fontWeight: tokens.font.weight.bold, lineHeight: 24, color: tokens.color.ink, ...style }}>{children}</Text>;
}

/** Muted copy: 13/18 by default, 14/20 for body sub-lines, 12/16 for hints. */
export function Muted({ children, size = 13, style, lines }: { children: React.ReactNode; size?: 12 | 13 | 14; style?: TextStyle; lines?: number }): React.ReactElement {
  const lh = size === 14 ? 20 : size === 13 ? 18 : 16;
  return (
    <Text numberOfLines={lines} style={{ fontSize: size, lineHeight: lh, color: tokens.color.muted, ...style }}>
      {children}
    </Text>
  );
}

export function Row({ children, gap = 10, align = "center", style }: { children: React.ReactNode; gap?: number; align?: ViewStyle["alignItems"]; style?: ViewStyle }): React.ReactElement {
  return <View style={{ flexDirection: "row", alignItems: align, gap, ...style }}>{children}</View>;
}

/** Small button: 44px pill, 14/700, 16px icon. ghost (line border) · fill (accent) · white (no border). */
export function SmBtn({
  label,
  icon,
  kind = "ghost",
  danger,
  flex,
  onPress,
  disabled,
  loading,
  accessibilityLabel,
}: {
  label: string;
  icon?: IconName;
  kind?: "ghost" | "fill" | "white";
  danger?: boolean;
  flex?: number;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  accessibilityLabel?: string;
}): React.ReactElement {
  // v2: loading = a spinner in place of the icon, label kept; disabled = line fill (fill) / muted text.
  const off = !!disabled && !loading;
  const bg = kind === "fill" ? (off ? tokens.color.line : tokens.color.accent) : tokens.color.bg;
  const fg = off ? tokens.color.muted : danger ? tokens.color.danger : kind === "fill" ? tokens.color.onAccent : tokens.color.accentText;
  return (
    <Tappable
      tone={kind === "fill" ? "onDark" : "row"}
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      style={{
        flex,
        // minHeight, not height: at a large system font scale the label wraps and the button grows (2.32).
        minHeight: tokens.touchTargetMin,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 4,
        borderRadius: tokens.radius.pill,
        backgroundColor: bg,
        borderWidth: kind === "ghost" ? 1.5 : 0,
        borderColor: tokens.color.line,
        overflow: "hidden",
      }}
    >
      {loading ? <ActivityIndicator size="small" color={fg} /> : icon ? <Icon name={icon} size={16} color={fg} /> : null}
      <Text style={{ fontSize: 14, fontWeight: tokens.font.weight.bold, color: fg, textAlign: "center", flexShrink: 1, ...TABULAR }}>{label}</Text>
    </Tappable>
  );
}

/** The 52px CTA: primary (accent fill) · ghost (line border, accent-text) · ghost-danger. */
export function CtaButton({
  label,
  icon,
  ghost,
  danger,
  onPress,
  disabled,
  loading,
  flex,
}: {
  label: string;
  icon?: IconName;
  ghost?: boolean;
  danger?: boolean;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  /** Share of a side-by-side row; omit in a stacked bar (the button stretches full width). */
  flex?: number;
}): React.ReactElement {
  const off = disabled && !loading;
  const bg = ghost ? tokens.color.bg : off ? tokens.color.line : tokens.color.accent;
  const fg = off ? tokens.color.muted : danger ? tokens.color.danger : ghost ? tokens.color.accentText : tokens.color.onAccent;
  return (
    <Tappable
      tone={ghost ? "row" : "onDark"}
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      style={{
        flex,
        minHeight: tokens.touchTargetPrimary,
        borderRadius: tokens.radius.pill,
        backgroundColor: bg,
        borderWidth: ghost ? 1.5 : 0,
        borderColor: tokens.color.line,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 6,
        overflow: "hidden",
      }}
    >
      {loading ? <ActivityIndicator size="small" color={fg} /> : icon ? <Icon name={icon} size={18} color={fg} /> : null}
      {/* Never truncated: at a large font scale the label wraps and the button grows (2.32). */}
      <Text style={{ fontSize: 16, fontWeight: tokens.font.weight.bold, color: fg, textAlign: "center", flexShrink: 1, ...TABULAR }}>{label}</Text>
    </Tappable>
  );
}

/** The pinned CTA bar (Send v2's): white, sheet shadow, padding 10 16 12; stacked or one row, optional hint. */
export function CtaBar({ hint, row, dock, children }: { hint?: string; row?: boolean; dock?: number; children: React.ReactNode }): React.ReactElement {
  // `dock` (tab bar v1, D-56): on a tab root the CTA panel becomes the dock — one white panel whose
  // bottom padding holds the floating tab bar: CTA → 12 → bar → 12 + inset. Pass the bar's reserve
  // (`useTabBarSpace()`); content never shows between the CTA and the bar.
  const dockPad = dock ? { paddingTop: 12, paddingBottom: 12 + dock } : null;
  return (
    <View style={{ backgroundColor: tokens.color.bg, paddingTop: 10, paddingHorizontal: 16, paddingBottom: 12, gap: 8, zIndex: 25, ...tokens.shadow.sheet, ...dockPad }}>
      {hint ? (
        <Text accessibilityLiveRegion="polite" style={{ fontSize: 13, lineHeight: 18, color: tokens.color.muted, textAlign: "center" }}>
          {hint}
        </Text>
      ) : null}
      {row ? <View style={{ flexDirection: "row", gap: 8 }}>{children}</View> : children}
    </View>
  );
}

/** A 44px text link with an icon (Notify me, Cancel order, Get help with this order). */
export function TextLink({
  label,
  icon,
  color = tokens.color.accentText,
  center,
  onPress,
  loading,
}: {
  label: string;
  icon?: IconName;
  color?: string;
  center?: boolean;
  onPress: () => void;
  loading?: boolean;
}): React.ReactElement {
  return (
    <Tappable
      tone="icon"
      onPress={onPress}
      disabled={loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ height: tokens.touchTargetMin, flexDirection: "row", alignItems: "center", justifyContent: center ? "center" : "flex-start", gap: 6, alignSelf: center ? "stretch" : "flex-start" }}
    >
      {loading ? <ActivityIndicator size="small" color={color} /> : icon ? <Icon name={icon} size={16} color={color} /> : null}
      <Text style={{ fontSize: 14, fontWeight: tokens.font.weight.semibold, color }}>{label}</Text>
    </Tappable>
  );
}

/**
 * The countdown pill (28px, surface, Timer + "1:24 left", tabular). Ticks on its own 1s interval so a
 * tick re-renders this pill and nothing else (PERF20-02). `frozen` holds the last value (socket down
 * after being live); `onZero` fires once when the window closes.
 */
export function Countdown({ expiresAt, frozen, onZero }: { expiresAt: string | null; frozen?: boolean; onZero?: () => void }): React.ReactElement | null {
  const end = expiresAt ? Date.parse(expiresAt) : NaN;
  const [now, setNow] = useState(() => Date.now());
  const firedRef = React.useRef(false);
  useEffect(() => {
    firedRef.current = false;
  }, [expiresAt]);
  useEffect(() => {
    if (frozen || !Number.isFinite(end)) return;
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [frozen, end]);
  const remaining = Number.isFinite(end) ? end - now : NaN;
  useEffect(() => {
    if (Number.isFinite(remaining) && remaining <= 0 && !firedRef.current) {
      firedRef.current = true;
      onZero?.();
    }
  }, [remaining, onZero]);
  if (!Number.isFinite(remaining)) return null;
  const t = clock(remaining);
  return (
    <View
      accessible
      accessibilityLabel={`${t} ${A.left}`}
      style={{ height: 28, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, borderRadius: tokens.radius.pill, backgroundColor: tokens.color.surface, flexShrink: 0 }}
    >
      <Icon name="timer" size={14} color={tokens.color.muted} />
      <Text style={{ fontSize: 13, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, ...TABULAR }}>
        {t} {A.left}
      </Text>
    </View>
  );
}

/** The 4px offer-window bar under the finding headline: share of the window still left. */
export function WindowProgress({ expiresAt, windowMs }: { expiresAt: string | null; windowMs: number }): React.ReactElement | null {
  const end = expiresAt ? Date.parse(expiresAt) : NaN;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!Number.isFinite(end)) return;
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [end]);
  if (!Number.isFinite(end)) return null;
  const pct = Math.max(0, Math.min(100, ((end - now) / windowMs) * 100));
  return (
    <View style={{ height: 4, borderRadius: 2, backgroundColor: tokens.color.line, overflow: "hidden" }}>
      <View style={{ width: `${pct}%`, height: "100%", backgroundColor: tokens.color.accent }} />
    </View>
  );
}

/** Rider avatar: the photo, else initials 15/700 accent-text on accent-wash (or a User glyph on surface). */
export function RiderAvatar({ photoUrl, initials, size = 44 }: { photoUrl?: string | null; initials?: string | null; size?: number }): React.ReactElement {
  const [failed, setFailed] = useState(false);
  const r = size / 2;
  if (photoUrl && !failed) {
    return (
      <RemoteImage
        source={{ uri: photoUrl }}
        onError={() => setFailed(true)}
        accessibilityElementsHidden
        importantForAccessibility="no"
        style={{ width: size, height: size, borderRadius: r, backgroundColor: tokens.color.surface }}
      />
    );
  }
  if (initials) {
    return (
      <View style={{ width: size, height: size, borderRadius: r, backgroundColor: tokens.color.accentWash, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontSize: Math.round(size * 0.34), fontWeight: tokens.font.weight.bold, color: tokens.color.accentText }}>{initials}</Text>
      </View>
    );
  }
  return (
    <View style={{ width: size, height: size, borderRadius: r, backgroundColor: tokens.color.surface, borderWidth: 1, borderColor: tokens.color.line, alignItems: "center", justifyContent: "center" }}>
      <Icon name="user" size={Math.round(size * 0.45)} color={tokens.color.muted} />
    </View>
  );
}

/** The Verified tag: 20px pill, accent-wash, ShieldCheck 13 + "Verified" 11/700. */
export function VerifiedTag(): React.ReactElement {
  return (
    <View style={{ height: 20, flexDirection: "row", alignItems: "center", gap: 3, paddingLeft: 5, paddingRight: 7, borderRadius: tokens.radius.pill, backgroundColor: tokens.color.accentWash }}>
      <Icon name="shield-check" size={13} color={tokens.color.accentText} />
      <Text style={{ fontSize: 11, fontWeight: tokens.font.weight.bold, color: tokens.color.accentText }}>{A.verified}</Text>
    </View>
  );
}

/** "Bike" + the plate chip (12/700, 1.5px ink border, radius 4); "Bike" only when no plate is on file (2.13). */
export function Plate({ plate }: { plate: string | null }): React.ReactElement {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <Text style={{ fontSize: 12, color: tokens.color.muted }}>{A.bike}</Text>
      {plate ? (
        <View style={{ borderWidth: 1.5, borderColor: tokens.color.ink, borderRadius: 4, paddingHorizontal: 6 }}>
          <Text style={{ fontSize: 12, fontWeight: tokens.font.weight.bold, letterSpacing: 1, color: tokens.color.ink, lineHeight: 18 }}>{plate}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** A filled ink star + "4.8 · 132 trips". */
export function RatingLine({ text }: { text: string }): React.ReactElement {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <Icon name="star" size={13} color={tokens.color.ink} fill={tokens.color.ink} />
      <Text style={{ fontSize: 13, lineHeight: 18, color: tokens.color.muted }}>{text}</Text>
    </View>
  );
}

/** Matched · Picked up · On the way · Delivered — done / current (halo) / upcoming. */
export function StepTrack({ current }: { current: number }): React.ReactElement {
  const steps = [A.stMatched, A.stPicked, A.stOnWay, A.stDelivered];
  return (
    <View style={{ flexDirection: "row" }} accessible accessibilityLabel={`Step ${current + 1} of 4, ${steps[current]}`}>
      {steps.map((label, i) => {
        const done = i < current;
        const now = i === current;
        return (
          <View key={label} style={{ flex: 1, alignItems: "center", gap: 4, minWidth: 0 }}>
            {i > 0 ? <View style={{ position: "absolute", top: 8, left: 0, right: "50%", height: 3, backgroundColor: i <= current ? tokens.color.accent : tokens.color.line }} /> : null}
            {i < 3 ? <View style={{ position: "absolute", top: 8, left: "50%", right: 0, height: 3, backgroundColor: i < current ? tokens.color.accent : tokens.color.line }} /> : null}
            <View
              style={{
                width: now ? 28 : 20,
                height: now ? 28 : 20,
                marginTop: now ? -4 : 0,
                marginBottom: now ? -4 : 0,
                borderRadius: 14,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: now ? tokens.color.accentWash : "transparent",
              }}
            >
              <View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: done || now ? tokens.color.accentText : tokens.color.surface,
                  borderWidth: done || now ? 0 : 1,
                  borderColor: tokens.color.line,
                }}
              >
                {done ? (
                  <Icon name="check" size={12} color={tokens.color.onAccent} strokeWidth={3} />
                ) : (
                  <Text style={{ fontSize: 11, fontWeight: tokens.font.weight.bold, color: now ? tokens.color.onAccent : tokens.color.muted }}>{i + 1}</Text>
                )}
              </View>
            </View>
            <Text
              // v2: labels may wrap to two lines at a large font scale.
              numberOfLines={2}
              style={{
                textAlign: "center",
                paddingHorizontal: 3,
                fontSize: 12,
                lineHeight: 16,
                fontWeight: now ? tokens.font.weight.bold : tokens.font.weight.semibold,
                color: now ? tokens.color.ink : done ? tokens.color.accentText : tokens.color.muted,
              }}
            >
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/** A 56 (or 40) px disc with an icon at 46%: calm (surface/muted) · ok (wash/accent-text) · danger (ring). */
export function IconDisc({ name, tone = "calm", size = 56 }: { name: IconName; tone?: "calm" | "ok" | "danger"; size?: number }): React.ReactElement {
  const fg = tone === "danger" ? tokens.color.danger : tone === "ok" ? tokens.color.accentText : tokens.color.muted;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: tone === "ok" ? tokens.color.accentWash : tone === "danger" ? tokens.color.bg : tokens.color.surface,
        borderWidth: tone === "danger" ? 1.5 : 0,
        borderColor: tokens.color.danger,
      }}
    >
      <Icon name={name} size={Math.round(size * 0.46)} color={fg} />
    </View>
  );
}

/** A 44px tag (13/600). On: 1.5px accent-text border, accent-wash, a 14px check. */
export function Tag({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }): React.ReactElement {
  return (
    <Tappable
      tone="row"
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
      style={{
        height: tokens.touchTargetMin,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: on ? 13.5 : 14,
        borderRadius: tokens.radius.pill,
        borderWidth: on ? 1.5 : 1,
        borderColor: on ? tokens.color.accentText : tokens.color.line,
        backgroundColor: on ? tokens.color.accentWash : tokens.color.bg,
      }}
    >
      {on ? <Icon name="check" size={14} color={tokens.color.accentText} strokeWidth={3} /> : null}
      <Text style={{ fontSize: 13, fontWeight: tokens.font.weight.semibold, color: on ? tokens.color.accentText : tokens.color.ink }}>{label}</Text>
    </Tappable>
  );
}

export function Tags({ list, on, onToggle }: { list: readonly string[]; on: readonly number[]; onToggle: (i: number) => void }): React.ReactElement {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {list.map((t, i) => (
        <Tag key={t} label={t} on={on.includes(i)} onPress={() => onToggle(i)} />
      ))}
    </View>
  );
}

/** Five 44px star targets (36px stars, stroke 1.6) and the rating word. */
export function Stars({ value, onChange }: { value: number; onChange: (n: number) => void }): React.ReactElement {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => {
        const on = i <= value;
        return (
          <Tappable
            key={i}
            tone="icon"
            onPress={() => onChange(i)}
            accessibilityRole="button"
            accessibilityLabel={`${i} ${i === 1 ? "star" : "stars"}, ${A.rl[i]}`}
            accessibilityState={{ selected: i === value }}
            style={{ width: tokens.touchTargetMin, height: tokens.touchTargetMin, alignItems: "center", justifyContent: "center" }}
          >
            <Icon name="star" size={36} color={on ? tokens.color.accent : tokens.color.line} fill={on ? tokens.color.accent : undefined} strokeWidth={1.6} />
          </Tappable>
        );
      })}
      {value ? <Text style={{ marginLeft: 6, fontSize: 15, fontWeight: tokens.font.weight.bold, color: tokens.color.accentText }}>{A.rl[value]}</Text> : null}
    </View>
  );
}

/** Five 14px read-only stars (the "You rated Tendai" line). */
export function MiniStars({ value }: { value: number }): React.ReactElement {
  return (
    <View style={{ flexDirection: "row", gap: 2 }} accessible accessibilityLabel={`${value} of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Icon key={i} name="star" size={14} color={i <= value ? tokens.color.accent : tokens.color.line} fill={i <= value ? tokens.color.accent : undefined} />
      ))}
    </View>
  );
}

/** The ink toast (v2): 12px from the edges, above the CTA bar; an optional 44px wash action. */
export function OrderToast({
  text,
  icon = "circle-alert",
  action,
  actionIcon,
  onAction,
}: {
  text: string;
  icon?: IconName;
  action?: string;
  actionIcon?: IconName;
  onAction?: () => void;
}): React.ReactElement {
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        backgroundColor: tokens.color.ink,
        borderRadius: tokens.radius.input,
        paddingVertical: action ? 6 : 12,
        paddingRight: action ? 6 : 14,
        paddingLeft: 14,
        ...tokens.shadow.menu,
      }}
    >
      <Icon name={icon} size={18} color={tokens.color.onAccent} />
      <Text style={{ flex: 1, fontSize: 13, lineHeight: 18, color: tokens.color.onAccent }}>{text}</Text>
      {action && onAction ? (
        <Tappable
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={action}
          style={{ height: tokens.touchTargetMin, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, borderRadius: 10, backgroundColor: tokens.color.accentWash }}
        >
          {actionIcon ? <Icon name={actionIcon} size={15} color={tokens.color.accentText} /> : null}
          <Text style={{ fontSize: 13, fontWeight: tokens.font.weight.bold, color: tokens.color.accentText, ...TABULAR }}>{action}</Text>
        </Tappable>
      ) : null}
    </View>
  );
}

/** The skeleton offer card under "Offers show here as riders reply." */
export function SkeletonOffer(): React.ReactElement {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ borderWidth: 1, borderColor: tokens.color.line, borderRadius: tokens.radius.input, padding: 12, flexDirection: "row", alignItems: "center", gap: 10 }}
    >
      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: tokens.color.surface }} />
      <View style={{ flex: 1 }}>
        <View style={{ height: 10, width: "55%", backgroundColor: tokens.color.line, borderRadius: 5, marginBottom: 8 }} />
        <View style={{ height: 8, width: "35%", backgroundColor: tokens.color.surface, borderRadius: 4 }} />
      </View>
      <View style={{ width: 70, height: 36, borderRadius: 18, backgroundColor: tokens.color.surface }} />
    </View>
  );
}

/** The 1px divider between the delivered headline and the rating block. */
export function Divider(): React.ReactElement {
  return <View style={{ height: 1, backgroundColor: tokens.color.line }} />;
}

/** A green dot / red square + the stop name, muted. v2: the address wraps instead of an ellipsis. */
export function StopLine({ drop, name }: { drop?: boolean; name: string }): React.ReactElement {
  return (
    <Row gap={8} align="flex-start">
      <View style={{ height: 18, justifyContent: "center" }}>
        {drop ? (
          <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: tokens.color.danger }} />
        ) : (
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: tokens.color.accent }} />
        )}
      </View>
      <Muted style={{ flex: 1 }}>{name}</Muted>
    </Row>
  );
}

/** The green note (price raised, notify confirmed, safety team told): wash, CircleCheck 18, 13/600 accent-text. */
export function OkNote({ text, style }: { text: string; style?: ViewStyle }): React.ReactElement {
  return (
    <View accessibilityLiveRegion="polite" style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: tokens.color.accentWash, borderRadius: tokens.radius.input, paddingVertical: 10, paddingHorizontal: 12, ...style }}>
      <Icon name="circle-check" size={18} color={tokens.color.accentText} />
      <Text style={{ flex: 1, fontSize: 13, lineHeight: 18, fontWeight: tokens.font.weight.semibold, color: tokens.color.accentText }}>{text}</Text>
    </View>
  );
}
