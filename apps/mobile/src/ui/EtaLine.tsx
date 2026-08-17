import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { Text, View } from "react-native";
import { Icon } from "./Icon";

/**
 * Delivery-ETA promise line — the RN port of the design kit's `EtaLine` (r-parts.jsx :: EtaLine): a
 * tinted rounded strip with a leading clock glyph, a bold "Arrives in <range> · <arrive>" line (the
 * arrive window set in tabular, muted), and an honest caveat note under it. Shown BEFORE payment on
 * the cart / checkout / menu, as a range, never a false precision.
 *
 * This is a codegen TARGET primitive: the mock→RN transpiler emits `<EtaLine range=… arrive=… tone=…
 * note=… />` verbatim, so the prop shape mirrors the kit exactly. Every colour/radius is a token.
 *
 * Honest-empty — the app can only promise an ETA once it knows where the food is going (a drop-off
 * pin). Until then the caller passes no `arrive` window (the "· <arrive>" span is dropped) and, when
 * there is no range either, `range` falls back to the kit's own honest placeholder rather than an
 * invented figure. The element still renders its structure; only the un-backed value is left empty.
 */
export function EtaLine({
  range = "25–40 min",
  arrive,
  tone = tokens.color.accentWash,
  note = "Confirmed the moment the kitchen accepts.",
}: {
  range?: string;
  /** The clock-time arrival window ("10:06–10:21"). Omitted (honest-empty) until a drop-off is known. */
  arrive?: string;
  /** Background wash token (defaults to the accent wash the kit uses). */
  tone?: string;
  note?: string;
}): React.ReactElement {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11, paddingHorizontal: 12, backgroundColor: tone, borderRadius: tokens.radius.input }}>
      <Icon name="clock" size={17} color={tokens.color.accentText} style={{ flexShrink: 0 }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 13.5, fontWeight: "700", color: tokens.color.ink }}>
          Arrives in {range}
          {arrive ? <Text style={{ color: tokens.color.muted, fontWeight: "600", fontVariant: ["tabular-nums"] }}> · {arrive}</Text> : null}
        </Text>
        {/* Kit lineHeight:1.35 multiplier — 1.35 × 12 ≈ 16 on RN (px, not unitless). */}
        <Text style={{ fontSize: 12, color: tokens.color.muted, lineHeight: 16 }}>{note}</Text>
      </View>
    </View>
  );
}
