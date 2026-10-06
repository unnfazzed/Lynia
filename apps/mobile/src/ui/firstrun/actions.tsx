import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { ActivityIndicator, Pressable, Text, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, type IconName } from "../Icon";
import { Tappable } from "../Tappable";
import { em, useFirstRunMetrics } from "./metrics";

/**
 * First Run v2 actions and chrome (README §1, `fr-kit.js` `.ft` `.cta` `.lk` `.ex` `.pill.b` `.tg` `.top`
 * `.big`, ledger D-82). Targets come from the tokens (`touchTargetPrimary` 52, `touchTargetMin` 44).
 */

export interface FrAction {
  label: string;
  onPress: () => void;
  icon?: IconName;
  disabled?: boolean;
  testID?: string;
}

export interface PrimaryButtonProps extends FrAction {
  /** The icon after the label instead of before it (F3 "Finish ID check →"). */
  iconAfter?: boolean;
  loading?: boolean;
  /** D3: the button turns mint with a check and the "Saved" label (inline confirmation, no toast). */
  done?: boolean;
}

/** `.cta` — the 52 pill, `cta` fill (pressed `ctaPressed`), white Inter 600 16, an optional 20 icon, 8 gap. */
export function PrimaryButton({ label, onPress, icon, iconAfter, disabled, loading, done, testID }: PrimaryButtonProps): React.ReactElement {
  // U3 draws the disabled CTA as `line` / `muted` (not a faded green).
  const ink = done ? tokens.color.accentText : disabled ? tokens.color.muted : tokens.color.onAccent;
  const glyph = done ? "check" : icon;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled || loading || done}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!(disabled || done), busy: !!loading }}
      style={({ pressed }) => ({
        minHeight: tokens.touchTargetPrimary,
        borderRadius: tokens.radius.button,
        backgroundColor: done ? tokens.color.accentWash : disabled ? tokens.color.line : pressed ? tokens.color.ctaPressed : tokens.color.cta,
        flexDirection: iconAfter ? "row-reverse" : "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        paddingHorizontal: 16,
      })}
    >
      {loading ? (
        <ActivityIndicator color={ink} />
      ) : (
        <>
          {glyph ? <Icon name={glyph} size={20} color={ink} /> : null}
          <Text style={{ fontSize: 16, fontWeight: tokens.font.weight.semibold, color: ink }}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

/** `.lk` — the 44 text button: Inter 600 15 green text, an optional 16 icon, 6 gap. */
export function TextLinkButton({ label, onPress, icon, disabled, testID, color = tokens.color.accentText }: FrAction & { color?: string }): React.ReactElement {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={disabled ? { disabled } : undefined}
      style={({ pressed }) => ({ minHeight: tokens.touchTargetMin, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, opacity: pressed || disabled ? 0.6 : 1 })}
    >
      {icon ? <Icon name={icon} size={16} color={color} /> : null}
      <Text style={{ fontSize: 15, fontWeight: tokens.font.weight.semibold, color }}>{label}</Text>
    </Pressable>
  );
}

export interface PinnedFooterProps {
  primary?: PrimaryButtonProps;
  link?: FrAction & { color?: string };
  /** Anything else (a custom button); rendered after primary, before link. */
  children?: React.ReactNode;
  /** In a sheet the footer is inline (`sbtn`: 20 above, no own padding) rather than pinned. */
  inline?: boolean;
}

/**
 * `.ft` — the pinned footer: white, padding 12 16 16 (+ the bottom safe-area inset), a column with 4
 * gap: the 52 primary then the optional 44 link. The body above scrolls; nothing hides under it.
 */
export function PinnedFooter({ primary, link, children, inline }: PinnedFooterProps): React.ReactElement {
  const insets = useSafeAreaInsets();
  return (
    <View
      testID="pinned-footer"
      style={
        inline
          ? { marginTop: 20, gap: 4 }
          : { backgroundColor: tokens.color.bg, paddingTop: 12, paddingHorizontal: tokens.space.screen, paddingBottom: 16 + insets.bottom, gap: 4 }
      }
    >
      {primary ? <PrimaryButton {...primary} /> : null}
      {children}
      {link ? <TextLinkButton {...link} /> : null}
    </View>
  );
}

/** `.ex` — the ID-check exit: a 44 white circle with a 20 ✕ in ink. Place it in `HeroPanel topLeft`. */
export function ExitButton({ onPress, accessibilityLabel = "Close", testID = "exit-button" }: { onPress: () => void; accessibilityLabel?: string; testID?: string }): React.ReactElement {
  return (
    <Tappable
      testID={testID}
      tone="icon"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={{ width: tokens.touchTargetMin, height: tokens.touchTargetMin, borderRadius: tokens.touchTargetMin / 2, backgroundColor: tokens.color.bg, alignItems: "center", justifyContent: "center" }}
    >
      <Icon name="x" size={20} color={tokens.color.ink} />
    </Tappable>
  );
}

export type FrSoftPillTone = "mint" | "white" | "dangerWhite";

const PILL: Record<FrSoftPillTone, { bg: string; bgPressed: string; ink: string; border?: string }> = {
  mint: { bg: tokens.color.accentWash, bgPressed: tokens.color.accentWashPressed, ink: tokens.color.accentText },
  // P9 Test ping: white with a 1 `line` border, green text.
  white: { bg: tokens.color.bg, bgPressed: tokens.color.surface, ink: tokens.color.accentText, border: tokens.color.line },
  // PC11 "Turn on" on the danger card: white with danger-ink text.
  dangerWhite: { bg: tokens.color.bg, bgPressed: tokens.color.dangerWash, ink: tokens.color.dangerInk },
};

/**
 * `.pill.b` — the soft pill: 44 tall, padding 0 18, Inter 600 14, 6 gap, an optional 16 icon. In-row
 * actions ("Add", "Turn on") and the Test ping. (The barrel's `SoftPill` is the empty-state one, D-78.)
 */
export function FrSoftPill({ label, onPress, icon, disabled, testID, tone = "mint", style }: FrAction & { tone?: FrSoftPillTone; style?: ViewStyle }): React.ReactElement {
  const t = PILL[tone];
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={disabled ? { disabled } : undefined}
      style={({ pressed }) => [
        {
          minHeight: tokens.touchTargetMin,
          paddingHorizontal: 18,
          borderRadius: tokens.radius.pill,
          backgroundColor: pressed ? t.bgPressed : t.bg,
          borderWidth: t.border ? 1 : 0,
          borderColor: t.border,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          alignSelf: "flex-start",
          gap: 6,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={16} color={t.ink} /> : null}
      <Text style={{ fontSize: 14, fontWeight: tokens.font.weight.semibold, color: t.ink }}>{label}</Text>
    </Pressable>
  );
}

/**
 * `.tg` — the 44×26 toggle (brand on / `line` off, 20 white knob). It only DRAWS a state: a permission
 * toggle mirrors the OS permission, and its `onPress` requests it or opens phone settings (D-82 §2 #1 —
 * the app cannot switch a permission off). The 26 track gets a 9 vertical hit slop to reach 44.
 */
export function Toggle({ value, onPress, disabled, accessibilityLabel, testID }: { value: boolean; onPress?: () => void; disabled?: boolean; accessibilityLabel: string; testID?: string }): React.ReactElement {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled || !onPress}
      hitSlop={{ top: 9, bottom: 9, left: 4, right: 4 }}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      style={({ pressed }) => ({ width: 44, height: 26, borderRadius: 13, backgroundColor: value ? tokens.color.accent : tokens.color.line, opacity: pressed ? 0.85 : 1, justifyContent: "center" })}
    >
      <View style={{ position: "absolute", top: 3, left: value ? 21 : 3, width: 20, height: 20, borderRadius: 10, backgroundColor: tokens.color.bg }} />
    </Pressable>
  );
}

/**
 * `.top` — the back header (Settings and its sub-pages, D-82 §2 #1): 56 tall right under the status bar,
 * padding 0 12, a 44 round `surface` back button with a 24 chevron. The large title sits below it
 * (`LargeTitle`). `title` is the optional small 17 title beside the button (`.top b`).
 */
export function BackHeader({ onBack, title, accessibilityLabel = "Back" }: { onBack: () => void; title?: string; accessibilityLabel?: string }): React.ReactElement {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top, backgroundColor: tokens.color.bg }}>
      <View style={{ height: 56, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12 }}>
        <Tappable
          testID="back-button"
          tone="icon"
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          style={{ width: tokens.touchTargetMin, height: tokens.touchTargetMin, borderRadius: tokens.touchTargetMin / 2, backgroundColor: tokens.color.surface, alignItems: "center", justifyContent: "center" }}
        >
          <Icon name="chevron-left" size={24} color={tokens.color.ink} />
        </Tappable>
        {title ? <Text style={{ fontSize: 17, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>{title}</Text> : null}
      </View>
    </View>
  );
}

/** `.big` — the large page title under the back header: Inter 700 30 (24 at 320), −0.025em, padding 4 16 0. */
export function LargeTitle({ children }: { children: string }): React.ReactElement {
  const m = useFirstRunMetrics();
  const size = m.compact ? 24 : 30;
  return (
    <Text accessibilityRole="header" style={{ fontSize: size, lineHeight: Math.round(size * 1.2), fontWeight: tokens.font.weight.bold, letterSpacing: em(-0.025, size), color: tokens.color.ink, paddingTop: 4, paddingHorizontal: tokens.space.screen }}>
      {children}
    </Text>
  );
}
