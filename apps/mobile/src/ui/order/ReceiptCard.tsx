import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { Share, Text, View } from "react-native";
import { formatMoney } from "../../logic/money";
import { buildReceiptText, formatReceiptDate } from "../../logic/receipt";
import { Button, Card } from "../index";

/**
 * The shareable delivery receipt shown on a completed order — the "proof it happened" summary. Cash-market
 * honest: a delivery record, not a payment receipt (money settles offline). Extracted from the order
 * screen so the (busy) tracker JSX stays readable and the receipt is reusable/inspectable. Sharing uses
 * React Native's built-in `Share` (no dependency) with the same text `buildReceiptText` produces.
 */
export function ReceiptCard({
  orderId,
  pickupLandmark,
  dropoffLandmark,
  fare,
  riderName,
  completedAt,
}: {
  orderId: string;
  pickupLandmark?: string | null;
  dropoffLandmark?: string | null;
  fare: string | number | null | undefined;
  riderName?: string | null;
  completedAt?: string | null;
}): React.ReactElement {
  const when = formatReceiptDate(completedAt);
  const share = (): void => {
    void Share.share({
      message: buildReceiptText({ orderId, pickupLandmark, dropoffLandmark, fare, riderName, completedAt, delivered: true }),
    }).catch(() => undefined);
  };

  const RowLine = ({ label, value }: { label: string; value: string }): React.ReactElement => (
    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
      <Text style={{ fontSize: tokens.font.size.body, color: tokens.color.muted }}>{label}</Text>
      <Text style={{ fontSize: tokens.font.size.body, color: tokens.color.ink, fontVariant: ["tabular-nums"] }}>{value}</Text>
    </View>
  );

  return (
    <Card>
      <Text style={{ fontSize: tokens.font.size.title, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, marginBottom: tokens.space.sm }}>Receipt</Text>
      <RowLine label="Order" value={orderId.slice(0, 8)} />
      <View style={{ marginBottom: 4 }}>
        <Text style={{ fontSize: tokens.font.size.body, color: tokens.color.ink }}>
          {pickupLandmark || "Pickup"} → {dropoffLandmark || "Drop-off"}
        </Text>
      </View>
      {riderName ? <RowLine label="Rider" value={riderName} /> : null}
      {when ? <RowLine label="Delivered" value={when} /> : null}
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 2, paddingTop: tokens.space.sm, borderTopWidth: 1, borderTopColor: tokens.color.line }}>
        <Text style={{ fontSize: tokens.font.size.bodyLg, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>Fare</Text>
        <Text style={{ fontSize: tokens.font.size.bodyLg, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, fontVariant: ["tabular-nums"] }}>{formatMoney(fare)}</Text>
      </View>
      <Text style={{ fontSize: tokens.font.size.caption, color: tokens.color.muted, lineHeight: 16, marginTop: tokens.space.sm }}>
        Fare agreed in-app; paid in cash, outside the app — a delivery record, not a payment receipt.
      </Text>
      <Button label="Share receipt" variant="ghost" onPress={share} />
    </Card>
  );
}
