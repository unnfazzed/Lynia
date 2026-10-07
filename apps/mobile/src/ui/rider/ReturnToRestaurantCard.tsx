import { tokens } from "@lynia/shared/tokens";
import { Tappable } from "../Tappable";
import React from "react";
import { Linking, Text, View } from "react-native";
import { mapsPlaceUrl } from "../../logic/maps";
import { Card, Icon } from "../index";
import { RIDER_COPY as R, RF } from "./copy";

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
 * FJ-M5: the copy lives in `RF` (short, no "mobile money", the venue's own name passed in — never the
 * pickup landmark — and no "the restaurant" on a shop's or a pharmacy's order); sizes come from tokens.
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
  /** The venue's own name (or its noun, "The shop", when the name isn't known). */
  merchantName: string;
  pickupPoint: { lat: number; lng: number } | null;
  cashRule: "collect_and_return" | "pay_upfront" | null;
  /** `pay_upfront` only: what the rider paid the venue out of their own pocket at the counter. */
  frontedAmount: number | null;
  debtStatus: "open" | "settled_cash" | "settled_goods" | "written_off" | null;
}): React.ReactElement {
  const name = merchantName;
  const handedBack = debtStatus === "settled_goods";
  return (
    <Card style={handedBack ? undefined : { borderColor: tokens.color.danger }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: tokens.space.sm }}>
        <Icon name={handedBack ? "check" : "triangle-alert"} size={18} color={handedBack ? tokens.color.accentText : tokens.color.danger} style={{ marginTop: 1 }} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, textAlign: "left" }}>{handedBack ? R.backDoneT : RF.backT(name)}</Text>
          <Text style={{ fontSize: tokens.font.size.body, color: tokens.color.muted, lineHeight: 20, marginTop: 4, textAlign: "left" }}>
            {handedBack ? RF.backDoneB(name) : cashRule === "pay_upfront" && frontedAmount != null && frontedAmount > 0 ? RF.backRefund(frontedAmount, name) : RF.backB(name)}
          </Text>
        </View>
      </View>
      {!handedBack && pickupPoint ? (
        <Tappable
          onPress={() => void Linking.openURL(mapsPlaceUrl(pickupPoint)).catch(() => undefined)}
          accessibilityRole="button"
          accessibilityLabel={RF.navTo(name)}
          style={{ minHeight: tokens.touchTargetMin, flexDirection: "row", alignItems: "center", gap: tokens.space.sm, marginTop: tokens.space.sm }}
        >
          <Icon name="navigation" size={16} color={tokens.color.accentText} />
          <Text style={{ fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.semibold, color: tokens.color.accentText }}>{RF.navTo(name)}</Text>
        </Tappable>
      ) : null}
    </Card>
  );
}
