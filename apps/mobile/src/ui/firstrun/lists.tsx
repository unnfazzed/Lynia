import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { Text, View, type ViewStyle } from "react-native";
import { Icon, type IconName } from "../Icon";
import { Tappable } from "../Tappable";

/**
 * First Run v2 list card + rows (README §1 "List card", `fr-kit.js` `.list` / `.li` / `.dd`, ledger D-81):
 * 1 `line` border, radius 16; rows ≥56, padding 8 14, a hairline between rows; a 36 leading disc;
 * title 600 15 + sub 13 muted; a trailing value (600 14), chevron (20, `illusIdleMid`) or any node.
 */

export type IconDotTone = "n" | "ok" | "vi" | "bad";

const DOT: Record<IconDotTone, { bg: string; fg: string }> = {
  n: { bg: tokens.color.surface, fg: tokens.color.muted },
  ok: { bg: tokens.color.accentWash, fg: tokens.color.accentText },
  vi: { bg: tokens.color.riderWash, fg: tokens.color.riderAccent },
  bad: { bg: tokens.color.dangerWash, fg: tokens.color.dangerInk },
};

/** `.dd` — the 36 leading disc with a 20 icon. `bg` overrides the wash (P15's white disc on a danger row). */
export function IconDot({ icon, tone = "n", bg }: { icon: IconName; tone?: IconDotTone; bg?: string }): React.ReactElement {
  const t = DOT[tone];
  return (
    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: bg ?? t.bg, alignItems: "center", justifyContent: "center" }}>
      <Icon name={icon} size={20} color={t.fg} />
    </View>
  );
}

/** `.list` — the bordered card. Its first row drops the hairline. */
export function ListCard({ children, style, testID }: { children: React.ReactNode; style?: ViewStyle; testID?: string }): React.ReactElement {
  const rows = React.Children.toArray(children).filter(React.isValidElement);
  return (
    <View testID={testID} style={[{ borderWidth: 1, borderColor: tokens.color.line, borderRadius: 16, overflow: "hidden" }, style]}>
      {rows.map((row, i) => (i === 0 ? React.cloneElement(row as React.ReactElement<{ first?: boolean }>, { first: true }) : row))}
    </View>
  );
}

export interface ListRowProps {
  /** Leading 36 disc. Omit for a custom `leading` (a step marker). */
  icon?: IconName;
  iconTone?: IconDotTone;
  leading?: React.ReactNode;
  title: string;
  sub?: string | null;
  /** Trailing value text (600 14 muted; green when `valueOk`). */
  value?: string | null;
  valueOk?: boolean;
  /** Draw the 20 chevron (a row that pushes a screen). */
  chevron?: boolean;
  /** Any trailing node (Toggle, a soft pill). Wins over `value`/`chevron`. */
  right?: React.ReactNode;
  /** P15: the danger wash row (title + sub in danger ink, a white disc). */
  danger?: boolean;
  /** Title colour override (KYC step 2 active draws it green). */
  titleColor?: string;
  onPress?: () => void;
  accessibilityLabel?: string;
  /** Set by ListCard on its first row. */
  first?: boolean;
  /** Row min-height override (the splash card rows are 48). */
  minHeight?: number;
  testID?: string;
}

/** `.li` — one row. Tappable when `onPress` is given. */
export function ListRow({
  icon,
  iconTone = "n",
  leading,
  title,
  sub,
  value,
  valueOk,
  chevron,
  right,
  danger,
  titleColor,
  onPress,
  accessibilityLabel,
  first,
  minHeight = 56,
  testID,
}: ListRowProps): React.ReactElement {
  const ink = danger ? tokens.color.dangerInk : (titleColor ?? tokens.color.ink);
  const body = (
    <>
      {leading ?? (icon ? <IconDot icon={icon} tone={danger ? "bad" : iconTone} bg={danger ? tokens.color.bg : undefined} /> : null)}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: tokens.font.weight.semibold, color: ink }}>{title}</Text>
        {sub ? <Text style={{ marginTop: 1, fontSize: 13, lineHeight: 18, color: danger ? tokens.color.dangerInk : tokens.color.muted }}>{sub}</Text> : null}
      </View>
      {right ??
        (value ? (
          <Text style={{ fontSize: 14, fontWeight: tokens.font.weight.semibold, color: valueOk ? tokens.color.accentText : tokens.color.muted, fontVariant: ["tabular-nums"] }}>{value}</Text>
        ) : chevron ? (
          <Icon name="chevron-right" size={20} color={tokens.color.illusIdleMid} />
        ) : null)}
    </>
  );
  const style: ViewStyle = {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderTopWidth: first ? 0 : 1,
    borderTopColor: tokens.color.line,
    backgroundColor: danger ? tokens.color.dangerWash : undefined,
  };
  if (onPress) {
    return (
      <Tappable testID={testID} onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? (sub ? `${title}, ${sub}` : title)} style={style}>
        {body}
      </Tappable>
    );
  }
  return (
    <View testID={testID} accessible={!right} accessibilityLabel={accessibilityLabel} style={style}>
      {body}
    </View>
  );
}

/** P1's bullets: a 32 `riderWash` disc with a 16 violet icon, 12 gap, text 15/20; 14 between rows. */
export function BulletList({ items, style }: { items: readonly { icon: IconName; text: string }[]; style?: ViewStyle }): React.ReactElement {
  return (
    <View style={[{ marginTop: 20, gap: 14 }, style]}>
      {items.map((it) => (
        <View key={it.text} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: tokens.color.riderWash, alignItems: "center", justifyContent: "center" }}>
            <Icon name={it.icon} size={16} color={tokens.color.riderAccent} />
          </View>
          <Text style={{ flex: 1, fontSize: 15, lineHeight: 20, color: tokens.color.ink }}>{it.text}</Text>
        </View>
      ))}
    </View>
  );
}
