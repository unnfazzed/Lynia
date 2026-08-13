import { tokens } from "@lynia/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { ScrollView, Text, View } from "react-native";
import { acceptFoodDispatch, declineFoodDispatch, getFoodDispatchOffer } from "../../src/api/food-rider";
import { foodOfferVariant } from "../../src/logic/food-rider-job";
import { useFeatureFlags } from "../../src/net/use-feature-flags";
import { pendingOrQueued } from "../../src/query/client";
import { AppBar, Button, Card, EmptyState, haptic, Icon, Money, Screen, SkeletonList, useActionErrorEffect } from "../../src/ui";
import { TypeTag } from "../../src/ui/rider/TypeTag";
import { RiderFoodOfferCardView } from "./food-offer-card.view";

/**
 * D5/C5: the rider's incoming food-dispatch offer. Entered from the board's `food:offer` socket push,
 * a `food_offer` notification tap, or a cold reopen — in every case this screen's own source of truth
 * is the poll-fallback GET (`dispatch/offer`), never the payload that happened to trigger the
 * navigation, so a stale/lost push can never show a dead offer. Polls every 3s while mounted so an
 * offer taken by someone else (or timed out) is caught even with no live socket on this screen.
 *
 * Aligned to the RJM `offer_food` mock (rider-one-app.jsx J4): AppBar + one offer Card + a pinned
 * `Screen.footer` accept/decline pair. The offer Card is a codegen-adopted, guardrail-locked region
 * (RJM.offer_food#offer → food-offer-card.view.tsx). The mock draws the CASH-COLLECT case — the rider
 * collects the kitchen's money at the door and hands it back after the drop; nothing from the rider's
 * own pocket. Riders NEVER front their own cash (product rule, owner 2026-08-12): cash is collected
 * from the customer AFTER delivery, or the customer pre-pays via mobile money (the `wallet` case). The
 * old `cash_upfront` "front your own cash" danger card drew a flow that does not exist and is removed.
 */
export default function FoodOffer(): React.ReactElement {
  const router = useRouter();
  const qc = useQueryClient();
  const { restaurantsEnabled } = useFeatureFlags();
  const offerQ = useQuery({ queryKey: ["foodOffer"], queryFn: getFoodDispatchOffer, refetchInterval: 3000, enabled: restaurantsEnabled });
  const offer = offerQ.data ?? null;

  const acceptM = useMutation({
    mutationFn: (orderId: string) => acceptFoodDispatch(orderId),
    onSuccess: () => {
      haptic("success");
      void qc.invalidateQueries({ queryKey: ["activeJob"] });
      router.replace("/rider/food-job");
    },
  });
  const declineM = useMutation({
    mutationFn: (orderId: string) => declineFoodDispatch(orderId),
    onSuccess: () => router.replace("/rider"),
  });
  // Accept/decline failures speak once as an auto-dismissing toast (owner instruction 2026-08-12) —
  // this screen is a live countdown, the worst possible place to camp a stuck red line. Declared here
  // (above the flag early-return) so the hook runs unconditionally on every render path.
  useActionErrorEffect(acceptM.error ?? declineM.error);

  // Reachable only from a live server `false` (the kill switch actually pulled) — NOT a boot state.
  // `useFeatureFlags` defaults `restaurantsEnabled` true because the vertical is launched, so this
  // screen never renders as a cold-start frame ahead of the flags fetch (MOB-BOOT-02).
  if (!restaurantsEnabled) {
    return (
      <Screen>
        <EmptyState icon="utensils" title="Restaurants isn't available yet" message="Check back soon.">
          <Button label="Back to board" variant="ghost" onPress={() => router.replace("/rider")} />
        </EmptyState>
      </Screen>
    );
  }

  if (offerQ.isLoading) {
    return (
      <Screen>
        <SkeletonList />
      </Screen>
    );
  }

  if (!offer) {
    // RR.offer_expired (r-rider.jsx): the food offer timed out or another rider took it. The mock
    // wraps the EmptyState (icon "timer") in a Card and pins a reassurance line below — "no penalty"
    // is stated as the standing rule, and the rider is told they're still first in line. Copy verbatim;
    // the "Back to the board" ghost keeps the unchanged `router.replace("/rider")` navigation.
    return (
      <Screen>
        <View style={{ paddingTop: 30 }}>
          <Card style={{ padding: 16 }}>
            <EmptyState
              icon="timer"
              title="That one went to another rider"
              message="Offers hold for 60 seconds, then move to the next rider nearby. Passing or missing one doesn't affect your standing."
            >
              <Button label="Back to the board" onPress={() => router.replace("/rider")} />
            </EmptyState>
          </Card>
          <View style={{ flexDirection: "row", alignItems: "center", gap: tokens.space.sm, justifyContent: "center", marginTop: 14 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tokens.color.accent }} />
            <Text style={{ fontSize: 12.5, color: tokens.color.muted }}>You're online and first in line for the next one</Text>
          </View>
        </View>
      </Screen>
    );
  }

  // `cash_upfront` cannot occur (riders never front their own cash); it collapses into the standard
  // collect case. `wallet` is the customer-prepaid case (already paid via mobile money — collect
  // nothing). Everything else renders the cash-collect card. The accept/decline mutations below are
  // called identically for every variant.
  const isWallet = foodOfferVariant(offer) === "wallet";
  const pending = acceptM.isPending || declineM.isPending;

  return (
    <Screen
      footer={
        // RJM offer_food footer (rider-one-app.jsx J4): the pinned accept + ghost decline pair, copy
        // verbatim. Wired to the UNCHANGED food-dispatch accept/decline mutations.
        <View style={{ gap: tokens.space.sm }}>
          <Button label="Accept this job" onPress={() => acceptM.mutate(offer.orderId)} loading={pendingOrQueued(acceptM)} disabled={pending} />
          <Button label="Not this one" variant="ghost" onPress={() => declineM.mutate(offer.orderId)} loading={pendingOrQueued(declineM)} disabled={pending} />
        </View>
      }
    >
      {/* RJM offer_food AppBar (rider-one-app.jsx J4): "Food job" + a "pickup → drop-off" sub. */}
      <AppBar title="Food job" sub={`${offer.pickup.landmark} → ${offer.dropoff.landmark}`} onBack={() => router.replace("/rider")} />
      <ScrollView showsVerticalScrollIndicator={false}>
        {isWallet ? (
          // Customer pre-paid via mobile money — collect nothing. The RJM offer_food mock draws only
          // the cash-collect case, so this prepaid card is honest container glue (pruned from the
          // composition check): same Card anatomy, wallet copy.
          <Card style={{ padding: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <TypeTag food />
              <View style={{ flex: 1 }} />
              <Money v={offer.deliveryFee ?? 0} size={20} />
            </View>
            <Text style={{ fontSize: 13, color: tokens.color.muted, lineHeight: 20 }}>
              Your fare is fixed for food jobs. No bidding.
            </Text>
            <View style={{ marginTop: 10, padding: 10, borderRadius: 10, backgroundColor: tokens.color.accentWash }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
                <Icon name="circle-check" size={20} color={tokens.color.accentText} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: tokens.color.ink }}>No money from your pocket</Text>
                  <Text style={{ fontSize: 12, color: tokens.color.accentText, lineHeight: 18 }}>
                    The customer already paid the restaurant. Just collect and deliver.
                  </Text>
                </View>
              </View>
            </View>
          </Card>
        ) : (
          // RJM offer_food#offer — the codegen-adopted, guardrail-locked cash-collect card. `fare` is
          // the rider's fixed delivery fee; `collectAmount` is the kitchen's money collected at the
          // door and handed back after the drop.
          <RiderFoodOfferCardView fare={offer.deliveryFee} collectAmount={offer.merchantGoodsTotal} />
        )}
        <View style={{ height: tokens.space.xxl }} />
      </ScrollView>
    </Screen>
  );
}
