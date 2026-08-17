import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { Text, View } from "react-native";
import { Money } from "./Money";

/**
 * Itemised price block — the RN port of the design kit's `PriceMath` (r-parts.jsx :: PriceMath): the
 * goods + per-km delivery breakdown, a hairline, then the 19px Total, with an optional footnote. Used
 * by the cart/checkout/order summary.
 *
 * This is a codegen TARGET primitive: the transpiler emits `<PriceMath goods=… fee=… km=… total=…
 * note=… />` verbatim, so the prop shape mirrors the kit exactly (a container earlier in the app used
 * a divergent {rows,total,footnote} shape — this is the faithful mock mirror, and lives at the ui
 * root so codegen output resolves it off `src/ui`). Every colour/hairline is a token.
 */
function Row({ label, value, sub }: { label: string; value: number | string; sub?: string }): React.ReactElement {
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, paddingVertical: 5 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13.5, color: tokens.color.muted }}>{label}</Text>
        {sub ? <Text style={{ fontSize: 12, color: tokens.color.muted, opacity: 0.85 }}>{sub}</Text> : null}
      </View>
      <Money v={value} size={14} weight="600" color={tokens.color.ink} />
    </View>
  );
}

export function PriceMath({
  goods,
  fee,
  km,
  total,
  note,
}: {
  goods: number | string;
  fee: number | string;
  /** Distance shown in the delivery row's sub-line ("`km` km · $0.80/km, rounded to $0.50"). */
  km: number | string;
  total: number | string;
  note?: string;
}): React.ReactElement {
  return (
    <View>
      <Row label="Food" value={goods} />
      <Row label="Delivery" value={fee} sub={`${km} km · $0.80/km, rounded to $0.50`} />
      {/* Kit PriceMath: a hairline separates the itemised rows from the total. */}
      <View style={{ height: 1, backgroundColor: tokens.color.line, marginVertical: 6 }} />
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Text style={{ flex: 1, fontSize: 14.5, fontWeight: "700", color: tokens.color.ink }}>Total</Text>
        <Money v={total} size={19} />
      </View>
      {note ? <Text style={{ fontSize: 12.5, color: tokens.color.muted, marginTop: 7, lineHeight: 18 }}>{note}</Text> : null}
    </View>
  );
}
