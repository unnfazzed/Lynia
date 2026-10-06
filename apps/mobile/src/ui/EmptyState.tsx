import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { type LayoutChangeEvent, Pressable, type StyleProp, Text, View, type ViewStyle } from "react-native";
import { Icon, type IconName } from "./Icon";

/**
 * The one empty state (handoff `packages/design/handoff/empty-states-v2-2026-10`, ledger D-78).
 *
 * Size L (`EmptyState`): a 64 tinted disc inside a 1px 88 halo, an 8px accent dot, a title, at most
 * one line, at most one soft pill and one text button. No card, no shadow, no illustration — the
 * block sits straight on the screen. Size S (`EmptyRow`): one quiet row under live content.
 *
 * Every number below is the handoff README §1's.
 */

export type EmptyTone = "empty" | "info" | "error";

const TONE: Record<EmptyTone, { wash: string; icon: string; dot: string | null }> = {
  // Graphic green for the glyph only (never text); the gold dot is the warm accent.
  empty: { wash: tokens.color.accentWash, icon: tokens.color.accent, dot: tokens.color.highlight },
  info: { wash: tokens.color.surface, icon: tokens.color.illusIdleDark, dot: tokens.color.illusIdleMid },
  error: { wash: tokens.color.dangerWash, icon: tokens.color.dangerInk, dot: null },
};

export type EmptyAction = { label: string; icon?: IconName; onPress: () => void; disabled?: boolean };

/** The mark: disc 64 + concentric 1px halo 88 + the accent dot with a 3px ring of the page colour. */
export function EmptyMark({ icon, tone = "empty", ring = tokens.color.bg }: { icon: IconName; tone?: EmptyTone; ring?: string }): React.ReactElement {
  const t = TONE[tone];
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: 88, height: 88, borderRadius: 44, borderWidth: 1, borderColor: t.wash, alignItems: "center", justifyContent: "center" }}
    >
      <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: t.wash, alignItems: "center", justifyContent: "center" }}>
        <Icon name={icon} size={24} color={t.icon} strokeWidth={tokens.icon.stroke} />
        {t.dot ? (
          // 8 dot at top 4 / right 2 of the disc, drawn as a 14 circle with a 3px ring.
          <View style={{ position: "absolute", top: 1, right: -1, width: 14, height: 14, borderRadius: 7, borderWidth: 3, borderColor: ring, backgroundColor: t.dot }} />
        ) : null}
      </View>
    </View>
  );
}

/** Primary action inside an empty state: the 44 soft mint pill. Never a filled CTA. */
export function SoftPill({ label, icon, onPress, disabled, testID }: EmptyAction & { testID?: string }): React.ReactElement {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityState={disabled ? { disabled } : undefined}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      style={({ pressed }) => ({
        minHeight: tokens.touchTargetMin,
        paddingHorizontal: 20,
        borderRadius: tokens.radius.button,
        backgroundColor: pressed ? tokens.color.accentWashPressed : tokens.color.accentWash,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
      })}
    >
      {icon ? <Icon name={icon} size={16} color={tokens.color.accentText} /> : null}
      <Text style={{ fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.semibold, color: tokens.color.accentText }}>{label}</Text>
    </Pressable>
  );
}

/** Secondary action: a 44 text button in green text. */
export function TextAction({ label, icon, onPress, disabled, compact, testID }: EmptyAction & { compact?: boolean; testID?: string }): React.ReactElement {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityState={disabled ? { disabled } : undefined}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      hitSlop={compact ? { left: 8, right: 8 } : undefined}
      style={({ pressed }) => ({
        minHeight: tokens.touchTargetMin,
        paddingHorizontal: compact ? 4 : 16,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        opacity: pressed || disabled ? 0.6 : 1,
      })}
    >
      {icon ? <Icon name={icon} size={16} color={tokens.color.accentText} /> : null}
      <Text style={{ fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.semibold, color: tokens.color.accentText }}>{label}</Text>
    </Pressable>
  );
}

/**
 * Size L. By default it fills the free space below the header and puts the top of the mark at ~30% of
 * that height (min 48); pass `offsetTop` when it sits in content-sized space (a list footer, a sheet).
 */
export function EmptyState({
  icon,
  title,
  body,
  tone = "empty",
  primary,
  secondary,
  inSheet,
  offsetTop,
  ring,
  style,
  testID,
}: {
  icon: IconName;
  title: string;
  body?: string;
  tone?: EmptyTone;
  primary?: EmptyAction;
  secondary?: EmptyAction;
  /** Inside a bottom sheet: 24 side padding instead of 40. */
  inSheet?: boolean;
  /** A fixed gap from the top of the block to the disc, instead of the 30%-of-free-height placement. */
  offsetTop?: number;
  /** The page colour behind the block, for the dot's ring (default white). */
  ring?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}): React.ReactElement {
  const [free, setFree] = React.useState(0);
  const fill = offsetTop == null;
  const onLayout = fill ? (e: LayoutChangeEvent) => setFree(e.nativeEvent.layout.height) : undefined;
  // The mark's box is the 88 halo, so the disc's top sits 12 below it: subtract that from the gap.
  const gap = (fill ? Math.max(48, Math.round(free * 0.3)) : offsetTop) - 12;
  return (
    <View onLayout={onLayout} testID={testID} style={[fill ? { flexGrow: 1 } : null, { paddingTop: gap, paddingHorizontal: inSheet ? 24 : 40, alignItems: "center" }, style]}>
      <EmptyMark icon={icon} tone={tone} ring={ring} />
      <Text
        accessibilityRole="header"
        style={{ marginTop: 12, maxWidth: 264, textAlign: "center", fontSize: tokens.font.size.title, lineHeight: 24, fontWeight: tokens.font.weight.semibold, letterSpacing: -0.18, color: tokens.color.ink }}
      >
        {title}
      </Text>
      {body ? (
        <Text style={{ marginTop: 4, maxWidth: 264, textAlign: "center", fontSize: tokens.font.size.body, lineHeight: 20.3, color: tokens.color.muted }}>{body}</Text>
      ) : null}
      {primary || secondary ? (
        <View style={{ marginTop: 20, alignItems: "center", gap: 4 }}>
          {primary ? <SoftPill {...primary} /> : null}
          {secondary ? <TextAction {...secondary} /> : null}
        </View>
      ) : null}
    </View>
  );
}

/**
 * Size S — one row under live content: a 20 idle-grey glyph (optionally on a 36 surface disc), 14
 * muted text, an optional trailing text button. `centred` drops the icon slot to the middle.
 */
export function EmptyRow({
  icon,
  text,
  disc,
  centred,
  strong,
  iconSize = 20,
  iconColor = tokens.color.illusIdleMid,
  gap = 12,
  action,
  style,
  testID,
}: {
  icon?: IconName;
  text: string;
  disc?: boolean;
  centred?: boolean;
  /** 14/600 ink text (a status line, e.g. "Closed · opens 10:08"). */
  strong?: boolean;
  iconSize?: number;
  iconColor?: string;
  gap?: number;
  action?: EmptyAction;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}): React.ReactElement {
  const glyph = icon ? <Icon name={icon} size={iconSize} color={iconColor} /> : null;
  return (
    <View
      testID={testID}
      style={[
        { flexDirection: "row", alignItems: "center", justifyContent: centred ? "center" : action ? "space-between" : "flex-start", gap: 12, minHeight: action ? tokens.touchTargetMin : undefined },
        style,
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap, flexShrink: 1 }}>
        {disc && glyph ? (
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: tokens.color.surface, alignItems: "center", justifyContent: "center" }}>{glyph}</View>
        ) : (
          glyph
        )}
        <Text
          style={{
            flexShrink: 1,
            textAlign: centred ? "center" : "left",
            fontSize: tokens.font.size.body,
            lineHeight: 20.3,
            fontWeight: strong ? tokens.font.weight.semibold : tokens.font.weight.regular,
            color: strong ? tokens.color.ink : tokens.color.muted,
          }}
        >
          {text}
        </Text>
      </View>
      {action ? <TextAction {...action} compact /> : null}
    </View>
  );
}
