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
import { Button, Card, EmptyState, ErrorText, haptic, Heading, Icon, Screen, SkeletonList } from "../../src/ui";
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
        <View style={{ flexDirection: "row", alignItems: "center", gap: tokens.space.sm, marginBottom: tokens.space.md }}>
          <Icon name="utensils" size={20} color={tokens.color.accentText} />
          <Heading>New food pickup</Heading>
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
              {/* `r-rider.jsx` offer_cash: a label, then the amount at full size, then what happens to
                  it. The kitchen's money reads in the highlight wash — green would say "this is yours". */}
              <Card style={{ backgroundColor: tokens.color.highlightWash, borderColor: "transparent", marginTop: tokens.space.sm }}>
                <Text style={{ fontSize: 12, fontWeight: "700", letterSpacing: 0.4, color: tokens.color.highlightInk }}>COLLECT AT THE DOOR</Text>
                <Text style={{ fontSize: 32, fontWeight: "700", color: tokens.color.ink, fontVariant: ["tabular-nums"] }}>{formatMoney(total)}</Text>
                <Text style={{ fontSize: 12, color: tokens.color.highlightInk, lineHeight: 18, marginTop: 2 }}>
                  Nothing from your pocket. Hand over the food, take the cash, then ride {formatMoney(offer.merchantGoodsTotal ?? 0)} back to the
                  kitchen — the {formatMoney(offer.deliveryFee ?? 0)} is yours.
                </Text>
              </Card>
            </>
          ) : variant === "cash_upfront" && total != null ? (
            <>
              <Text style={{ fontSize: 11.5, fontWeight: "700", color: tokens.color.muted, letterSpacing: 0.4 }}>YOU EARN</Text>
              <Text style={{ fontSize: 26, fontWeight: "700", color: tokens.color.ink, fontVariant: ["tabular-nums"] }}>
                {formatMoney(offer.deliveryFee ?? 0)}
              </Text>
              {/* Same label → amount → consequence anatomy as the collect card above (kit offer_upfront).
                  Kept in the danger wash rather than the kit's highlight: this is the one offer where
                  the rider's OWN cash is at risk. */}
              <Card style={{ backgroundColor: tokens.color.dangerWash, borderColor: "transparent", marginTop: tokens.space.sm }}>
                <Text style={{ fontSize: 12, fontWeight: "700", letterSpacing: 0.4, color: tokens.color.dangerInk }}>THIS KITCHEN ASKS YOU TO PAY FIRST</Text>
                <Text style={{ fontSize: 32, fontWeight: "700", color: tokens.color.ink, fontVariant: ["tabular-nums"] }}>{formatMoney(total)}</Text>
                <Text style={{ fontSize: 12, color: tokens.color.dangerInk, lineHeight: 18, marginTop: 2 }}>
                  Only accept if you&apos;re carrying {formatMoney(total)} — nobody checks a balance, but arriving short strands you at the
                  counter. You&apos;re paid back at the door.
                </Text>
              </Card>
            </>
          ) : variant === "wallet" ? (
            <>
              <Text style={{ fontSize: 11.5, fontWeight: "700", color: tokens.color.muted, letterSpacing: 0.4 }}>YOU EARN</Text>
              <Text style={{ fontSize: 26, fontWeight: "700", color: tokens.color.ink, fontVariant: ["tabular-nums"] }}>
                {formatMoney(offer.deliveryFee ?? 0)}
              </Text>
              {/* `r-rider.jsx` offer_wallet: no float at risk changes the decision, so it gets a card
                  and a tick, not a footnote. */}
              <Card style={{ backgroundColor: tokens.color.accentWash, borderColor: "transparent", marginTop: tokens.space.sm }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
                  <Icon name="circle-check" size={20} color={tokens.color.accentText} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: "700", color: tokens.color.ink }}>No money from your pocket</Text>
                    <Text style={{ fontSize: 12, color: tokens.color.accentText, lineHeight: 18 }}>
                      The customer already paid the restaurant. Just collect and deliver.
                    </Text>
                  </View>
                </View>
              </Card>
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

        {/* Kit accept labels (`r-rider.jsx` offer_cash / offer_upfront / offer_wallet): the button
            repeats the money commitment being accepted, so the tap is never a blind "Accept". */}
        <Button
          label={
            variant === "cash_collect" && total != null
              ? "Accept · collect at the door"
              : variant === "cash_upfront" && total != null
                ? `Accept · front ${formatMoney(total)}`
                : "Accept"
          }
          onPress={() => acceptM.mutate(offer.orderId)}
          loading={pendingOrQueued(acceptM)}
          disabled={pending}
        />
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
