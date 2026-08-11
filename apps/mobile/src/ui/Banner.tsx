import { tokens } from "@lynia/shared";
import React from "react";
import { Text, View } from "react-native";
import { Icon, type IconName } from "./Icon";

/**
 * Menu/status banner — the RN port of the design kit's `Banner` (r-parts.jsx :: Banner). A full-bleed
 * tinted strip that leads a screen or a list: a leading glyph, a bold title, an optional muted message
 * line, and an optional right-aligned underlined action word. Used as the `banner` slot on the Screen
 * scaffold (offline / stale / restaurant-status notices).
 *
 * This is a codegen TARGET primitive: the mock→RN transpiler emits `<Banner tone=… icon=… title=…
 * msg=… action=… />` verbatim, so the prop shape and the tone→[wash,ink] mapping mirror the kit
 * exactly. Every colour is a token (VALUES authority-chain step — never hardcode a value a token
 * defines).
 */
export type BannerTone = "info" | "good" | "warn" | "danger" | "offline";

// Kit map (r-parts.jsx): [background wash, foreground ink]. `good` intentionally shares `info`'s
// accent wash; `offline` is the calm grey surface, never danger.
const TONE: Record<BannerTone, { bg: string; fg: string }> = {
  info: { bg: tokens.color.accentWash, fg: tokens.color.accentText },
  good: { bg: tokens.color.accentWash, fg: tokens.color.accentText },
  warn: { bg: tokens.color.highlightWash, fg: tokens.color.highlightInk },
  danger: { bg: tokens.color.dangerWash, fg: tokens.color.dangerInk },
  offline: { bg: tokens.color.surface, fg: tokens.color.muted },
};

export function Banner({
  tone = "info",
  icon,
  title,
  msg,
  action,
}: {
  tone?: BannerTone;
  icon?: IconName;
  title: string;
  msg?: string;
  action?: string;
}): React.ReactElement {
  const { bg, fg } = TONE[tone] ?? TONE.info;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 9, paddingHorizontal: 14, backgroundColor: bg }}>
      {icon ? <Icon name={icon} size={16} color={fg} style={{ flexShrink: 0 }} /> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 13, fontWeight: "700", color: fg }}>{title}</Text>
        {/* Kit uses a lineHeight:1.35 multiplier — 1.35 × 12 ≈ 16 on RN (px, not unitless). */}
        {msg ? <Text style={{ fontSize: 12, color: fg, opacity: 0.85, lineHeight: 16 }}>{msg}</Text> : null}
      </View>
      {action ? <Text style={{ fontSize: 12.5, fontWeight: "700", color: fg, textDecorationLine: "underline", flexShrink: 0 }}>{action}</Text> : null}
    </View>
  );
}
