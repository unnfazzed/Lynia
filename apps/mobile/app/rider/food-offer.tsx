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
import { Button, Card, EmptyState, ErrorText, haptic, Icon, Screen, SkeletonList } from "../../src/ui";
import { LiveMap } from "../../src/ui/LiveMap";

/** Kit `r-rider.jsx` PayTag — the CASH / WALLET pill on the offer header. */
function PayTag({ method }: { method: "cash" | "wallet" }): React.ReactElement {
  const cash = method === "cash";
  return (
    <View style={{ alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 6, borderRadius: tokens.radius.pill, backgroundColor: cash ? tokens.color.highlightWash : tokens.color.accentWash }}>
      <Text style={{ fontSize: 12.5, fontWeight: "800", letterSpacing: 0.5, color: cash ? tokens.color.highlightInk : tokens.color.accentText }}>{cash ? "CASH" : "WALLET"}</Text>
    </View>
  );
}

/** Kit `r-rider.jsx` Leg — one end of the trip as a marked row: pickup is a filled dot, the drop a
 *  square, each under its COLLECT FROM / DELIVER TO eyebrow. */
function Leg({ role, name, meta }: { role: "pickup" | "drop"; name: string; meta?: string | null }): React.ReactElement {
  const pickup = role === "pickup";
  return (
    <View style={{ flexDirection: "row", gap: 10, paddingVertical: 9 }}>
      <View style={{ width: 24, alignItems: "center", paddingTop: 2 }}>
        <View style={{ width: 11, height: 11, borderRadius: pickup ? 6 : 3, backgroundColor: pickup ? tokens.color.ink : tokens.color.accent }} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 12, fontWeight: "700", letterSpacing: 0.6, color: tokens.color.muted }}>{pickup ? "COLLECT FROM" : "DELIVER TO"}</Text>
        <Text style={{ fontSize: 14, fontWeight: "700", color: tokens.color.ink }}>{name}</Text>
        {meta ? <Text style={{ fontSize: 12, color: tokens.color.muted, fontVariant: ["tabular-nums"] }}>{meta}</Text> : null}
      </View>
    </View>
  );
}

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
  const total = offer.merchantGoodsTotal != null && offer.deliveryFee != null ? offer.merchantGoodsTotal + offer.deliveryFee : null;
  const pending = acceptM.isPending || declineM.isPending;
  // Kit `r-rider.jsx` OfferHead: the live 60s window as a linear bar + a raw seconds read-out.
  const secs = Math.max(0, Math.ceil(remaining / 1000));
  const pct = RESTAURANTS_DISPATCH.offerWindowMs > 0 ? Math.min(100, Math.max(0, (remaining / RESTAURANTS_DISPATCH.offerWindowMs) * 100)) : 0;
  const payMethod: "cash" | "wallet" = variant === "wallet" ? "wallet" : "cash";

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Kit `r-rider.jsx` OfferHead ("NEW ORDER"): a cta-fill banner carrying the live 60s window
            as a linear bar — the offer's defining chrome. Screen owns the 16px gutter, so this reads
            as a banner block rather than the kit's full-bleed band. */}
        <View style={{ backgroundColor: tokens.color.cta, borderRadius: tokens.radius.card, paddingHorizontal: tokens.space.md, paddingTop: 10, paddingBottom: 12, marginBottom: tokens.space.md }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <Icon name="timer" size={17} color={tokens.color.onAccent} />
            <Text style={{ fontSize: 13.5, fontWeight: "800", letterSpacing: 0.4, color: tokens.color.onAccent }}>NEW ORDER</Text>
            <View style={{ flex: 1 }} />
            <Text style={{ fontSize: 16, fontWeight: "800", color: tokens.color.onAccent, fontVariant: ["tabular-nums"] }}>{secs}s</Text>
          </View>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.3)", overflow: "hidden" }}>
            <View style={{ height: "100%", width: `${pct}%`, backgroundColor: tokens.color.onAccent, borderRadius: 3 }} />
          </View>
        </View>

        {/* Kit `r-rider.jsx` offer_cash: the pay-method chip and the rider's own take, side by side. */}
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: tokens.space.sm }}>
          <PayTag method={payMethod} />
          <View style={{ flex: 1, alignItems: "flex-end" }}>
            <Text style={{ fontSize: 12, fontWeight: "700", color: tokens.color.muted, letterSpacing: 0.4 }}>YOU EARN</Text>
            <Text style={{ fontSize: 22, fontWeight: "700", color: tokens.color.ink, fontVariant: ["tabular-nums"] }}>{formatMoney(offer.deliveryFee ?? 0)}</Text>
          </View>
        </View>

        {variant === "cash_collect" && total != null ? (
          // `r-rider.jsx` offer_cash: a label, then the amount at full size, then what happens to it.
          // The kitchen's money reads in the highlight wash — green would say "this is yours".
          <Card style={{ backgroundColor: tokens.color.highlightWash, borderColor: "transparent" }}>
            <Text style={{ fontSize: 12, fontWeight: "700", letterSpacing: 0.4, color: tokens.color.highlightInk }}>COLLECT AT THE DOOR</Text>
            <Text style={{ fontSize: 32, fontWeight: "700", color: tokens.color.ink, fontVariant: ["tabular-nums"] }}>{formatMoney(total)}</Text>
            <Text style={{ fontSize: 12, color: tokens.color.highlightInk, lineHeight: 18, marginTop: 2 }}>
              Nothing from your pocket. Hand over the food, take the cash, then ride {formatMoney(offer.merchantGoodsTotal ?? 0)} back to the
              kitchen — the {formatMoney(offer.deliveryFee ?? 0)} is yours.
            </Text>
          </Card>
        ) : variant === "cash_upfront" && total != null ? (
          // Same label → amount → consequence anatomy as the collect card (kit offer_upfront). Kept in
          // the danger wash rather than the kit's highlight: this is the one offer where the rider's
          // OWN cash is at risk.
          <Card style={{ backgroundColor: tokens.color.dangerWash, borderColor: "transparent" }}>
            <Text style={{ fontSize: 12, fontWeight: "700", letterSpacing: 0.4, color: tokens.color.dangerInk }}>THIS KITCHEN ASKS YOU TO PAY FIRST</Text>
            <Text style={{ fontSize: 32, fontWeight: "700", color: tokens.color.ink, fontVariant: ["tabular-nums"] }}>{formatMoney(total)}</Text>
            <Text style={{ fontSize: 12, color: tokens.color.dangerInk, lineHeight: 18, marginTop: 2 }}>
              Only accept if you&apos;re carrying {formatMoney(total)} — nobody checks a balance, but arriving short strands you at the
              counter. You&apos;re paid back at the door.
            </Text>
          </Card>
        ) : variant === "wallet" ? (
          // `r-rider.jsx` offer_wallet: no float at risk changes the decision, so it gets a card and a
          // tick, not a footnote.
          <Card style={{ backgroundColor: tokens.color.accentWash, borderColor: "transparent" }}>
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
        ) : (
          <Text style={{ fontSize: 14, color: tokens.color.muted }}>{offer.itemDesc}</Text>
        )}

        {/* Kit `r-rider.jsx` offer_cash Leg card: the two ends of the trip as marked rows. */}
        <Card>
          <Leg role="pickup" name={offer.pickup.landmark} meta={null} />
          <View style={{ height: 1, backgroundColor: tokens.color.line, marginLeft: 24 }} />
          <Leg role="drop" name={offer.dropoff.landmark} meta={offer.distanceKm != null ? `${offer.distanceKm.toFixed(1)} km from the restaurant` : null} />
        </Card>

        <LiveMap pickup={{ lat: offer.pickup.point.lat, lng: offer.pickup.point.lng }} dropoff={{ lat: offer.dropoff.point.lat, lng: offer.dropoff.point.lng }} rider={null} />

        {/* Kit `r-rider.jsx` offer_cash: the return-to-kitchen duty stated on the offer, not discovered
            at the door. (The kit's "~9 min" ETA isn't computed here — omitted rather than faked.) */}
        {variant === "cash_collect" ? (
          <View style={{ flexDirection: "row", gap: tokens.space.sm, marginTop: tokens.space.sm }}>
            <Icon name="refresh-cw" size={14} color={tokens.color.muted} />
            <Text style={{ flex: 1, fontSize: 12, color: tokens.color.muted, lineHeight: 18 }}>
              After the drop: return leg to the kitchen · no new offers until they confirm the cash
            </Text>
          </View>
        ) : null}

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
