import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { Text, View } from "react-native";
import { formatMoney } from "../../logic/money";
import { Button, Card, Icon } from "../index";

/**
 * `pay_merchant` (kit `explorations/restaurants/r-rider.jsx` — `RR.pay_merchant`, "R2·2 — pay the
 * merchant"): the step a `pay_upfront` kitchen puts between arriving at the counter and getting the
 * food. The rider hands over the GOODS total in their own cash; the delivery fee is never part of it.
 *
 * Only ever rendered for `paymentMethod === "cash"` + `merchantCashRule === "pay_upfront"` — the one
 * variant where the rider's own money is at risk (see `foodOfferVariant`'s `cash_upfront`, which is
 * what the rider already agreed to on the offer card). A `collect_and_return` kitchen releases the
 * food unpaid and is settled at the door, so this screen must never appear for one.
 *
 * HONESTY — this card records nothing. There is no rider-side "I paid the merchant" endpoint (the
 * merchant's own confirm is what sets `merchantPaymentConfirmedAt`, and the 4-digit pickup code is the
 * thing the kitchen only releases once they've been paid). So the CTA is an acknowledgement that moves
 * the rider on to the code entry, and the caption says exactly that rather than implying the tap told
 * anyone anything. Nothing here calls an API, so nothing here needs a test-build gate.
 */
export function PayMerchantCard({
  goodsTotal,
  deliveryFee,
  merchantName,
  onConfirm,
}: {
  /** What the rider hands the cashier — the FOOD only. */
  goodsTotal: number;
  /** The rider's own fee. Never handed over; shown so the two figures can't be confused. */
  deliveryFee: number;
  merchantName?: string | null;
  onConfirm: () => void;
}): React.ReactElement {
  const collectAtDoor = goodsTotal + deliveryFee;
  return (
    <Card accent>
      <View style={{ alignItems: "center" }}>
        <Text style={{ fontSize: 12, fontWeight: tokens.font.weight.bold, color: tokens.color.accentText, letterSpacing: 0.5 }}>
          HAND OVER EXACTLY
        </Text>
        <Text style={{ fontSize: 40, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, lineHeight: 46, fontVariant: ["tabular-nums"] }}>
          {formatMoney(goodsTotal)}
        </Text>
        <Text style={{ fontSize: 12.5, color: tokens.color.muted, lineHeight: 18, textAlign: "center", marginTop: 2 }}>
          Food only. Not the {formatMoney(deliveryFee)} delivery — that&apos;s yours.
        </Text>
      </View>

      {/* Kit: the "both taps must match" reassurance rides in the sunken surface tile, not loose type.
          Reworded to what is actually true here — the kitchen's confirmation is the pickup code. */}
      <View
        style={{
          flexDirection: "row",
          gap: tokens.space.sm,
          padding: tokens.space.md,
          marginTop: tokens.space.md,
          backgroundColor: tokens.color.surface,
          borderRadius: tokens.radius.input,
        }}
      >
        <Icon name="circle-alert" size={16} color={tokens.color.muted} style={{ marginTop: 1 }} />
        <Text style={{ flex: 1, fontSize: 12, color: tokens.color.muted, lineHeight: 18 }}>
          Count it out at the counter{merchantName ? ` with ${merchantName}` : ""}. The 4-digit pickup code they read back is the
          confirmation — this tap doesn&apos;t move money or tell the kitchen anything.
        </Text>
      </View>

      <View style={{ marginTop: tokens.space.md, padding: tokens.space.md, borderWidth: 1, borderColor: tokens.color.line, borderRadius: tokens.radius.input }}>
        <Text style={{ fontSize: 12, fontWeight: tokens.font.weight.bold, color: tokens.color.muted, letterSpacing: 0.3, marginBottom: 6 }}>
          YOU&apos;LL GET BACK AT THE DOOR
        </Text>
        <Row label="Food you fronted" value={goodsTotal} />
        <Row label="Your delivery fee" value={deliveryFee} />
        <View style={{ height: 1, backgroundColor: tokens.color.line, marginTop: tokens.space.sm, marginBottom: tokens.space.sm }} />
        <View style={{ flexDirection: "row", alignItems: "baseline" }}>
          <Text style={{ flex: 1, fontSize: 13.5, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>Collect from the customer</Text>
          <Text style={{ fontSize: 18, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, fontVariant: ["tabular-nums"] }}>
            {formatMoney(collectAtDoor)}
          </Text>
        </View>
      </View>

      <Button label={`I paid ${formatMoney(goodsTotal)} in cash`} onPress={onConfirm} />
    </Card>
  );
}

function Row({ label, value }: { label: string; value: number }): React.ReactElement {
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline", marginTop: 4 }}>
      <Text style={{ flex: 1, fontSize: 13, color: tokens.color.muted }}>{label}</Text>
      <Text style={{ fontSize: 13.5, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink, fontVariant: ["tabular-nums"] }}>
        {formatMoney(value)}
      </Text>
    </View>
  );
}
