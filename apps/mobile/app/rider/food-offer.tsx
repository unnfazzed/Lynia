import { RESTAURANTS_DISPATCH, tokens } from "@lynia/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { ScrollView, Text, View } from "react-native";
import { ApiError } from "../../src/api/client";
import { acceptFoodDispatch, declineFoodDispatch, getFoodDispatchOffer } from "../../src/api/food-rider";
import { foodOfferVariant } from "../../src/logic/food-rider-job";
import { formatMoney } from "../../src/logic/money";
import { useFeatureFlags } from "../../src/net/use-feature-flags";
import { pendingOrQueued } from "../../src/query/client";
import { Button, Card, EmptyState, ErrorText, haptic, Heading, Icon, Screen, SkeletonList, Sub } from "../../src/ui";
import { CountdownRing, formatCountdown } from "../../src/ui/food/CountdownRing";
import { LiveMap } from "../../src/ui/LiveMap";

/**
 * D5/C5: the rider's incoming food-dispatch offer (N-08's 60s window). Entered from the board's
 * `food:offer` socket push, a `food_offer` notification tap, or a cold reopen — in every case this
 * screen's own source of truth is the poll-fallback GET (`dispatch/offer`), never the payload that
 * happened to trigger the navigation, so a stale/lost push can never show a dead offer. Polls every
 * 3s while mounted so an offer taken by someone else (or timed out) is caught even with no live
 * socket on this screen (see the board's own socket teardown note — it doesn't survive the navigate).
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
    return (
      <Screen>
        <EmptyState icon="utensils" title="That offer's gone" message="It expired or went to another rider — no penalty. Check the board for your next job.">
          <Button label="Back to board" onPress={() => router.replace("/rider")} />
        </EmptyState>
      </Screen>
    );
  }

  const variant = foodOfferVariant(offer);
  const now = Date.now();
  const expiresMs = new Date(offer.expiresAt).getTime();
  const remaining = Number.isFinite(expiresMs) ? Math.max(0, expiresMs - now) : 0;
  const elapsed = Math.max(0, RESTAURANTS_DISPATCH.offerWindowMs - remaining);
  const total = offer.merchantGoodsTotal != null && offer.deliveryFee != null ? offer.merchantGoodsTotal + offer.deliveryFee : null;
  const pending = acceptM.isPending || declineM.isPending;

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: tokens.space.md }}>
          <Icon name="utensils" size={20} color={tokens.color.accentText} />
          <Heading> New food pickup</Heading>
        </View>

        <Card>
          <View style={{ alignItems: "center", marginBottom: tokens.space.sm }}>
            <CountdownRing elapsedMs={elapsed} totalMs={RESTAURANTS_DISPATCH.offerWindowMs} label={formatCountdown(remaining)} sub="to decide" />
          </View>

          {variant === "cash_collect" && total != null ? (
            <>
              <Text style={{ fontSize: 11.5, fontWeight: "700", color: tokens.color.muted, letterSpacing: 0.4 }}>YOU EARN</Text>
              <Text style={{ fontSize: 26, fontWeight: "700", color: tokens.color.ink, fontVariant: ["tabular-nums"] }}>
                {formatMoney(offer.deliveryFee ?? 0)}
              </Text>
              <Card style={{ backgroundColor: tokens.color.accentWash, borderColor: "transparent", marginTop: tokens.space.sm }}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: tokens.color.accentText }}>
                  COLLECT AT THE DOOR {formatMoney(total)}
                </Text>
                <Text style={{ fontSize: 12, color: tokens.color.accentText, marginTop: 2 }}>
                  Ride it back to the kitchen — you keep the {formatMoney(offer.deliveryFee ?? 0)} delivery fee.
                </Text>
              </Card>
            </>
          ) : variant === "cash_upfront" && total != null ? (
            <>
              <Text style={{ fontSize: 11.5, fontWeight: "700", color: tokens.color.muted, letterSpacing: 0.4 }}>YOU EARN</Text>
              <Text style={{ fontSize: 26, fontWeight: "700", color: tokens.color.ink, fontVariant: ["tabular-nums"] }}>
                {formatMoney(offer.deliveryFee ?? 0)}
              </Text>
              <Card style={{ backgroundColor: tokens.color.dangerWash, borderColor: "transparent", marginTop: tokens.space.sm }}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: tokens.color.dangerInk }}>
                  THIS KITCHEN ASKS YOU TO PAY FIRST {formatMoney(total)}
                </Text>
                <Text style={{ fontSize: 12, color: tokens.color.dangerInk, marginTop: 2 }}>
                  Nobody checks a balance — only accept if you&apos;re carrying {formatMoney(total)}. You&apos;re paid back at the door.
                </Text>
              </Card>
            </>
          ) : variant === "wallet" ? (
            <>
              <Text style={{ fontSize: 11.5, fontWeight: "700", color: tokens.color.muted, letterSpacing: 0.4 }}>YOU EARN</Text>
              <Text style={{ fontSize: 26, fontWeight: "700", color: tokens.color.ink, fontVariant: ["tabular-nums"] }}>
                {formatMoney(offer.deliveryFee ?? 0)}
              </Text>
              <Sub>Already paid — nothing to collect. Just pick up and deliver.</Sub>
            </>
          ) : (
            <Text style={{ fontSize: 14, color: tokens.color.muted }}>{offer.itemDesc}</Text>
          )}

          <View style={{ height: tokens.space.sm }} />
          <LiveMap pickup={{ lat: offer.pickup.point.lat, lng: offer.pickup.point.lng }} dropoff={{ lat: offer.dropoff.point.lat, lng: offer.dropoff.point.lng }} rider={null} />
          <Text style={{ fontSize: 13, color: tokens.color.muted, marginTop: tokens.space.sm }}>
            {offer.pickup.landmark} → {offer.dropoff.landmark}
            {offer.distanceKm != null ? ` · ${offer.distanceKm.toFixed(1)} km` : ""}
          </Text>
        </Card>

        <Button label="Accept" onPress={() => acceptM.mutate(offer.orderId)} loading={pendingOrQueued(acceptM)} disabled={pending} />
        <Button label="Pass" variant="ghost" onPress={() => declineM.mutate(offer.orderId)} loading={pendingOrQueued(declineM)} disabled={pending} />
        <ErrorText
          message={
            acceptM.error instanceof ApiError
              ? acceptM.error.message
              : declineM.error instanceof ApiError
                ? declineM.error.message
                : null
          }
        />
        <View style={{ height: tokens.space.xxl }} />
      </ScrollView>
    </Screen>
  );
}
