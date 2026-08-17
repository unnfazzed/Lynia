import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { mapsPlaceUrl } from "../../logic/maps";
import { formatMoney } from "../../logic/money";
import { Card, Icon } from "../index";

/**
 * `return_rest` (kit `explorations/restaurants/r-rider.jsx` — `RR.return_rest`, "R4·2 — the return
 * leg. It's a real job with its own navigation, not an afterthought").
 *
 * A food delivery that fails at the door (N-10 no-show, R-08 refusal) leaves the rider holding the
 * food. Before this the app said "Marked as no-show. You're free for the next job." and offered "Back
 * to board" — which is true of the DISPATCH and false of the physical world: there's a bag of food on
 * the bike and a kitchen expecting it. This is the leg that says so, with the same navigation
 * affordance the outbound leg gets.
 *
 * WHAT THIS CARD WILL NOT CLAIM
 *  - The kit's "You'll still be paid your $2.50 fee." An undelivered food order pays no fee anywhere in
 *    `markUndelivered`, so the promise is unbacked and is left out rather than made on the API's behalf.
 *  - An ETA / distance ("Back to Sadza Republic · 9 min"). No routing service is wired; the address and
 *    a navigate link are what we actually have.
 *  - A `pay_upfront` refund as a recorded event. Those kitchens have no debt ledger at all
 *    (food-debt.service.ts's own scope-cut note), so the refund is a counter handshake with no app
 *    record — the copy says exactly that instead of implying LyniaGo is tracking it.
 *
 * `debtStatus` is the one genuinely server-confirmed beat: `collect_and_return` opens a debt at pickup
 * and the merchant's own `confirmGoodsReturned` settles it as `settled_goods`, so the card can honestly
 * flip to "the kitchen confirmed" once that lands.
 */
export function ReturnToRestaurantCard({
  merchantName,
  pickupPoint,
  cashRule,
  frontedAmount,
  debtStatus,
}: {
  merchantName?: string | null;
  pickupPoint: { lat: number; lng: number } | null;
  cashRule: "collect_and_return" | "pay_upfront" | null;
  /** `pay_upfront` only: what the rider paid the kitchen out of their own pocket at the counter. */
  frontedAmount: number | null;
  debtStatus: "open" | "settled_cash" | "settled_goods" | "written_off" | null;
}): React.ReactElement {
  const kitchen = merchantName ?? "the restaurant";
  const handedBack = debtStatus === "settled_goods";
  return (
    <Card style={handedBack ? undefined : { borderColor: tokens.color.danger }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 9 }}>
        <Icon
          name={handedBack ? "check" : "triangle-alert"}
          size={18}
          color={handedBack ? tokens.color.accentText : tokens.color.danger}
          style={{ marginTop: 1 }}
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 14.5, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>
            {handedBack ? "Food handed back" : "Delivery failed — return the food"}
          </Text>
          <Text style={{ fontSize: 13, color: tokens.color.muted, lineHeight: 18, marginTop: 4 }}>
            {handedBack
              ? `${kitchen} has confirmed the order came back. Nothing else is riding with you.`
              : `The order is still on your bike. Ride it back to ${kitchen} — they've been told it's coming.`}
          </Text>
        </View>
      </View>

      {!handedBack ? (
        <>
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              gap: tokens.space.sm,
              padding: tokens.space.md,
              marginTop: tokens.space.md,
              backgroundColor: tokens.color.surface,
              borderRadius: tokens.radius.input,
            }}
          >
            <Icon name="banknote" size={16} color={tokens.color.muted} style={{ marginTop: 1 }} />
            <Text style={{ flex: 1, fontSize: 12.5, color: tokens.color.muted, lineHeight: 18 }}>
              {cashRule === "pay_upfront" && frontedAmount != null && frontedAmount > 0
                ? `Ask ${kitchen} for the ${formatMoney(frontedAmount)} you fronted when you hand the food over. LyniaGo doesn't record that refund — count it at the counter, and call support if they won't return it.`
                : cashRule === "collect_and_return"
                  ? `You never paid for this food, so there's no cash to settle — handing the order back is what closes it. ${kitchen} confirms the return on their own screen.`
                  : `Hand the order back at the counter. ${kitchen} confirms the return on their own screen.`}
            </Text>
          </View>

          {pickupPoint ? (
            <Pressable
              onPress={() => void Linking.openURL(mapsPlaceUrl(pickupPoint))}
              accessibilityRole="button"
              accessibilityLabel={`Navigate back to ${kitchen}`}
              style={{
                minHeight: tokens.touchTargetMin,
                flexDirection: "row",
                alignItems: "center",
                gap: tokens.space.sm,
                marginTop: tokens.space.sm,
              }}
            >
              <Icon name="navigation" size={16} color={tokens.color.accentText} />
              <Text style={{ fontSize: 14, fontWeight: tokens.font.weight.semibold, color: tokens.color.accentText }}>
                Navigate back to {kitchen}
              </Text>
            </Pressable>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}
