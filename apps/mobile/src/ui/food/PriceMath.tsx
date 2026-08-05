import { tokens } from "@lynia/shared";
import React from "react";
import { Text, View } from "react-native";
import { formatMoney } from "../../logic/money";
import { Card } from "../index";

interface PriceMathRow {
  label: string;
  value: number;
}

/** D2 checkout/order — the shared goods/delivery/total breakdown card (r-parts.jsx's `PriceMath`).
 *  `total` is always goods + delivery (D-08: never merged into a single opaque figure upstream —
 *  this is the one place they combine, for the customer's own "what am I paying" view). */
export function PriceMath({
  rows,
  total,
  footnote,
}: {
  rows: PriceMathRow[];
  total: number;
  footnote?: string;
}): React.ReactElement {
  return (
    <Card>
      {rows.map((r) => (
        <View key={r.label} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 8, paddingVertical: 5 }}>
          <Text style={{ flex: 1, fontSize: 13.5, color: tokens.color.muted }}>{r.label}</Text>
          <Text style={{ fontSize: 14, fontWeight: "600", color: tokens.color.ink, fontVariant: ["tabular-nums"] }}>{formatMoney(r.value)}</Text>
        </View>
      ))}
      {/* Kit r-parts.jsx PriceMath: a hairline separates the itemised rows from the total. */}
      <View style={{ height: 1, backgroundColor: tokens.color.line, marginVertical: 6 }} />
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ fontSize: 14.5, fontWeight: "700", color: tokens.color.ink }}>Total</Text>
        <Text style={{ fontSize: 19, fontWeight: "700", color: tokens.color.ink, fontVariant: ["tabular-nums"] }}>{formatMoney(total)}</Text>
      </View>
      {footnote ? <Text style={{ fontSize: 12.5, color: tokens.color.muted, marginTop: 7, lineHeight: 18 }}>{footnote}</Text> : null}
    </Card>
  );
}
