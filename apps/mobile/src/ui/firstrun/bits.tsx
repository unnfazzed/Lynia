import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { Text, View, type ViewStyle } from "react-native";
import { Icon, type IconName } from "../Icon";

/**
 * First Run v2 small parts (README §1, `fr-kit.js` `.chips` `.tries` `.box` `.pill` `.ntf`, ledger D-81).
 */

/** `.chips` — F4/F7 tips: pills min 32, `surface`, Inter 600 13, a 16 green icon, 6 gap; wrap with 8 gap. */
export function TipChips({ items, style }: { items: readonly { icon: IconName; label: string }[]; style?: ViewStyle }): React.ReactElement {
  return (
    <View style={[{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }, style]}>
      {items.map((c) => (
        <View key={c.label} style={{ minHeight: 32, paddingHorizontal: 12, borderRadius: tokens.radius.pill, backgroundColor: tokens.color.surface, flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Icon name={c.icon} size={16} color={tokens.color.accentText} />
          <Text style={{ fontSize: 13, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink }}>{c.label}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * `.tries` — two 28×6 bars (radius 3, 6 gap): remaining in brand green, used in `line`. With `label`
 * it draws F4's whole row: a neutral info box, the label muted on the left, the bars on the right.
 */
export function TriesMeter({ left, total = 2, label, style }: { left: number; total?: number; label?: string; style?: ViewStyle }): React.ReactElement {
  const bars = (
    <View testID="tries-meter" accessibilityLabel={`${left} of ${total}`} style={{ flexDirection: "row", gap: 6 }}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} testID={i < left ? "try-left" : "try-used"} style={{ width: 28, height: 6, borderRadius: 3, backgroundColor: i < left ? tokens.color.accent : tokens.color.line }} />
      ))}
    </View>
  );
  if (!label) return bars;
  return (
    <InfoBox tone="n" style={{ marginTop: 20, justifyContent: "space-between", ...style }} right={bars}>
      <Text style={{ fontSize: 14, lineHeight: 19.6, color: tokens.color.muted }}>{label}</Text>
    </InfoBox>
  );
}

export type InfoBoxTone = "ok" | "bad" | "n";

const BOX: Record<InfoBoxTone, { bg: string; ink: string; weight: 400 | 600 }> = {
  ok: { bg: tokens.color.accentWash, ink: tokens.color.accentText, weight: tokens.font.weight.semibold },
  bad: { bg: tokens.color.dangerWash, ink: tokens.color.dangerInk, weight: tokens.font.weight.regular },
  n: { bg: tokens.color.surface, ink: tokens.color.ink, weight: tokens.font.weight.regular },
};

/**
 * `.box` — radius 14, padding 12 14, 10 gap, 14/1.4 text, 16 above. `ok` mint + green 600, `bad`
 * danger wash + danger ink, `n` surface + ink. `title` is a bold first line (D4 "This ID is on another
 * account"); with a title the icon top-aligns. `children` replaces `text` for custom content.
 */
export function InfoBox({
  tone = "n",
  icon,
  title,
  text,
  right,
  children,
  style,
  testID,
}: {
  tone?: InfoBoxTone;
  icon?: IconName;
  title?: string;
  text?: string;
  right?: React.ReactNode;
  children?: React.ReactNode;
  style?: ViewStyle;
  testID?: string;
}): React.ReactElement {
  const t = BOX[tone];
  return (
    <View
      testID={testID}
      accessibilityRole={tone === "bad" ? "alert" : undefined}
      style={[{ marginTop: 16, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, flexDirection: "row", alignItems: title ? "flex-start" : "center", gap: 10, backgroundColor: t.bg }, style]}
    >
      {icon ? <Icon name={icon} size={20} color={t.ink} /> : null}
      {children ?? (
        <View style={{ flex: 1 }}>
          {title ? <Text style={{ fontSize: 14, lineHeight: 19.6, fontWeight: tokens.font.weight.bold, color: t.ink }}>{title}</Text> : null}
          {text ? <Text style={{ fontSize: 14, lineHeight: 19.6, fontWeight: title ? tokens.font.weight.regular : t.weight, color: title && tone === "bad" ? tokens.color.ink : t.ink }}>{text}</Text> : null}
        </View>
      )}
      {right}
    </View>
  );
}

export type FrBadgeTone = "mint" | "gold" | "checking" | "surface";

const BADGE: Record<FrBadgeTone, { bg: string; ink: string }> = {
  // PC8 "Order placed".
  mint: { bg: tokens.color.accentWash, ink: tokens.color.accentText },
  // P9 "New job" offer tag.
  gold: { bg: tokens.color.highlight, ink: tokens.color.highlightChipInk },
  // E4c "Checking" (owner: #FFF6D6 is the existing `highlightChipWash`).
  checking: { bg: tokens.color.highlightChipWash, ink: tokens.color.highlightChipInk },
  // U1 what's-new pill.
  surface: { bg: tokens.color.surface, ink: tokens.color.ink },
};

/** `.pill` — a non-interactive tag: min 32 (26 for the offer tag via `height`), padding 0 12, 600 13, 6 gap. */
export function FrBadge({ label, icon, tone = "mint", lead, height = 32, style }: { label: string; icon?: IconName; tone?: FrBadgeTone; lead?: string; height?: number; style?: ViewStyle }): React.ReactElement {
  const t = BADGE[tone];
  return (
    <View style={[{ alignSelf: "flex-start", minHeight: height, paddingHorizontal: 12, borderRadius: tokens.radius.pill, backgroundColor: t.bg, flexDirection: "row", alignItems: "center", gap: 6 }, style]}>
      {icon ? <Icon name={icon} size={16} color={t.ink} /> : null}
      {/* U1: "**New** Faster live tracking" — a bold green lead, then the regular line. */}
      {lead ? <Text style={{ fontSize: 13, fontWeight: tokens.font.weight.bold, color: tokens.color.accentText }}>{lead}</Text> : null}
      <Text style={{ fontSize: 13, fontWeight: lead ? tokens.font.weight.regular : tokens.font.weight.semibold, color: t.ink }}>{label}</Text>
    </View>
  );
}

/**
 * `.ntf` — a drawn sample notification (PC8, P3, I·free): white, radius 16, padding 10 12, a 1
 * `rgba(20,24,27,.06)` ring and no shadow; a 28 brand tile (radius 8) with a white 16 icon; title
 * 13/600, body 12/16 muted. Width 268 (P3 288). `behind` scales a card behind the front one to .94.
 */
export function SampleNotification({
  icon,
  title,
  body,
  width = 268,
  behind,
  alignTop,
}: {
  icon: IconName;
  title: string;
  body: string;
  width?: number;
  behind?: boolean;
  alignTop?: boolean;
}): React.ReactElement {
  return (
    <View
      accessible
      accessibilityLabel={`${title}. ${body}`}
      style={{
        width,
        backgroundColor: tokens.color.bg,
        borderRadius: 16,
        paddingVertical: 10,
        paddingHorizontal: 12,
        flexDirection: "row",
        alignItems: alignTop ? "flex-start" : "center",
        gap: 10,
        borderWidth: 1,
        borderColor: "rgba(20,24,27,0.06)",
        transform: behind ? [{ scale: 0.94 }] : undefined,
      }}
    >
      <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: tokens.color.accent, alignItems: "center", justifyContent: "center" }}>
        <Icon name={icon} size={16} color={tokens.color.onAccent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink }}>{title}</Text>
        <Text style={{ fontSize: 12, lineHeight: 16, color: tokens.color.muted }}>{body}</Text>
      </View>
    </View>
  );
}
