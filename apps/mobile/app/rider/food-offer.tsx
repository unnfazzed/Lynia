import { tokens } from "@lynia/shared/tokens";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { ScrollView, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { acceptFoodDispatch, declineFoodDispatch, type FoodOfferJob, getFoodDispatchOfferWithJob } from "../../src/api/food-rider";
import { foodCashBreakdown, foodOfferVariant } from "../../src/logic/food-rider-job";
import { useFeatureFlags } from "../../src/net/use-feature-flags";
import { pendingOrQueued } from "../../src/query/client";
import { AppBar, EmptyState, haptic, Icon, Screen, SkeletonList, useActionErrorEffect } from "../../src/ui";
import { useReduceMotion } from "../../src/ui/useReduceMotion";
import { CtaBar, CtaButton } from "../../src/ui/order/kit";
import { OrderMap } from "../../src/ui/order/OrderMap";
import { OrderSheet, PeekMark } from "../../src/ui/order/OrderSheet";
import { JTag, StopLine } from "../../src/ui/rider/board";
import { O, ofFmt } from "../../src/ui/orderflow/copy";
import { OfNote } from "../../src/ui/rider/proof-kit";
import { RiderErrorState } from "../../src/ui/rider/RiderErrorState";
import type { IconName } from "../../src/ui";
import { RIDER_COPY as R, RF, usd, venueCopy } from "../../src/ui/rider/copy";
import { TerminalBody } from "../../src/ui/rider/job-kit";

/** How long a food offer holds (the server's window); the bar shows the share left. */
const OFFER_WINDOW_S = 60;

/**
 * Rider v2 food offer (F1–F4, ledger D-54). Entered from the board's `food:offer` push, a `food_offer`
 * notification tap or a cold reopen — in every case the screen's own source of truth is the poll-fallback
 * GET (`dispatch/offer`), polled every 3 s, so an offer taken by someone else or timed out is caught with
 * no live socket. FoodHeader (no Back) · the pickup-stage map · a sheet with the countdown, the FOOD tag,
 * the kitchen, "Your fare", the stops (or, at a kitchen paid up front, the two money tiles) · "Accept this
 * job" / "Not this one". The countdown runs off the server's `expiresAt`.
 *
 * Order flow v2 (RD1a–d, ledger D-59): the same read carries the job's tags — a shop or pharmacy gets its
 * own header and JobTag (SHOP #DDD5FF, PHARMACY #C5E9DF) and the "Sealed bag · photo at pickup" note, a
 * scheduled order "Scheduled · customer expects 12:30–13:00", a prescription order "Prescription order ·
 * see the original at the door". An older API sends no tags: the food offer as before.
 */
export default function FoodOffer(): React.ReactElement {
  const router = useRouter();
  const qc = useQueryClient();
  const reduceMotion = useReduceMotion();
  const { height: winH } = useWindowDimensions();
  const { restaurantsEnabled } = useFeatureFlags();
  // Its own key: the board's ["foodOffer"] caches the bare offer, this read carries the job's tags too.
  // While a read has failed with nothing cached, RiderErrorState owns the retry cadence (every 10 s): the
  // 3 s poll would otherwise keep re-firing and, since a refetch with no data flips the query back to
  // pending, swap the error state for a skeleton every few seconds.
  const offerQ = useQuery({
    queryKey: ["foodOfferJob"],
    queryFn: getFoodDispatchOfferWithJob,
    refetchInterval: (q) => (q.state.data === undefined && q.state.errorUpdateCount > 0 ? false : 3000),
    enabled: restaurantsEnabled,
  });
  const offer = offerQ.data?.offer ?? null;
  const job = offerQ.data?.job ?? null;
  // The expired state (F4) has no offer left to read the kind from: keep the last one seen (FJ-L1).
  const lastKind = useRef<OfferKind>("food");
  if (job) lastKind.current = jobKind(job);
  const kind = job ? jobKind(job) : lastKind.current;
  const place = O.svc[kind === "shop" ? "shops" : kind].place;
  const [now, setNow] = useState(() => Date.now());
  const [areaH, setAreaH] = useState(0);
  const [ctaH, setCtaH] = useState(0);
  const [visible, setVisible] = useState(0);

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
  // Accept/decline failures speak once as an auto-dismissing toast (owner instruction 2026-08-12).
  useActionErrorEffect(acceptM.error ?? declineM.error);

  const expiresMs = offer ? new Date(offer.expiresAt).getTime() : 0;
  const leftS = offer ? Math.max(0, Math.ceil((expiresMs - now) / 1000)) : 0;
  const live = offer != null && leftS > 0;

  useEffect(() => {
    if (!live) return;
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [live]);
  // The alarm: a strong buzz the moment the offer lands, repeated while it is live (handoff: "a looping
  // alarm plays until the rider accepts, passes or the offer expires").
  const ringing = useRef<string | null>(null);
  useEffect(() => {
    if (!live || !offer) return;
    if (ringing.current !== offer.orderId) {
      ringing.current = offer.orderId;
      haptic("alert");
    }
    const iv = setInterval(() => haptic("alert"), 4000);
    return () => clearInterval(iv);
  }, [live, offer]);

  // Reachable only from a live server `false` (the kill switch actually pulled) — NOT a boot state.
  if (!restaurantsEnabled) {
    return (
      <Screen>
        <AppBar onBack={() => router.replace("/rider")} />
        <EmptyState icon="utensils" tone="info" title="Restaurants isn't available yet" body="Check back soon." />
      </Screen>
    );
  }

  // `generic_error`: a FAILED (or offline, paused) READ is not "the offer went to another rider"
  // (LC-D-SIB-1). The no-offer answer is a 200 with `offer: null`, so a failure here means the read itself
  // failed. Checked before the skeleton: a retry of a failed read is pending again, and must keep showing
  // this state ("Trying again…") rather than flashing the skeleton.
  if (!offerQ.data && (offerQ.isError || offerQ.isPaused || offerQ.errorUpdateCount > 0)) {
    return (
      <Screen>
        <RiderErrorState onRetry={() => void offerQ.refetch()} retrying={offerQ.isFetching} onBack={() => router.replace("/rider")} />
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

  const header = <FoodHeader kind={kind} />;

  // F4 — the offer timed out or another rider took it.
  if (!offer || !live) {
    return (
      <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: tokens.color.bg }}>
        {header}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 24, paddingVertical: 16 }} showsVerticalScrollIndicator={false}>
          <TerminalBody icon="clock" title={R.expT} body={kind === "food" ? R.expB : R.expB.replace("Food offers", "Offers")} />
        </ScrollView>
        <CtaBar>
          <CtaButton label={R.backBoard} onPress={() => router.replace("/rider")} />
        </CtaBar>
      </SafeAreaView>
    );
  }

  const upfront = foodOfferVariant(offer) === "cash_upfront";
  // D-71: on a free-delivery order the venue's cash is goods less the fee and the customer pays only the
  // goods; the rider's fee is the same either way.
  const cash = foodCashBreakdown(offer);
  const pay = cash.owed;
  const fee = cash.kept;
  // FJ-H5: an earlier owed balance this order carries is collected at the door on top.
  const collect = cash.collected + (job?.carriedUsd ?? 0);
  const pending = acceptM.isPending || declineM.isPending;
  // Peek: 40% of the screen (26% upfront, 20% under 700dp), measured from the top of the screen.
  const share = upfront ? (winH < 700 ? 0.2 : 0.26) : 0.4;
  const area = areaH || Math.max(0, winH - 80);
  const mapShare = Math.min(0.8, Math.max(0.15, (winH * share) / Math.max(1, area)));

  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: tokens.color.bg }}>
      {header}
      <View testID="food-offer-area" style={{ flex: 1 }} onLayout={(e) => setAreaH(e.nativeEvent.layout.height)}>
        <OrderMap
          pickup={offer.pickup.point}
          dropoff={offer.dropoff.point}
          rider={null}
          riderLabel={R.you}
          riderPaused={false}
          showRider={false}
          toPickupLine={false}
          rings={false}
          dim={false}
          frame="route"
          padBottom={visible || Math.round(area * (1 - mapShare))}
          reduceMotion={reduceMotion}
        />
        {area > 0 ? (
          <OrderSheet areaHeight={area} fallbackShare={mapShare} floor={0} bottomInset={ctaH} contentKey={upfront ? "upfront" : "offer"} reduceMotion={reduceMotion} onVisibleHeight={setVisible}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              {/* RD1a–d draw the pill 32 high, 14 type, a 16 timer (FJ-L2). */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, height: 32, paddingHorizontal: 10, borderRadius: tokens.radius.pill, backgroundColor: tokens.color.surface }}>
                <Icon name="timer" size={16} color={tokens.color.ink} />
                <Text style={{ fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, fontVariant: ["tabular-nums"] }}>{RF.left(leftS)}</Text>
              </View>
              <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: tokens.color.line, overflow: "hidden" }}>
                <View style={{ width: `${Math.min(100, (leftS / OFFER_WINDOW_S) * 100)}%`, height: "100%", backgroundColor: tokens.color.accent }} />
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                <JTag kind={kind} />
                <Text style={{ fontSize: 20, lineHeight: 26, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>{offer.pickup.landmark}</Text>
                <Text style={{ fontSize: 13, color: tokens.color.muted, fontVariant: ["tabular-nums"] }}>{RF.foodMeta(null, offer.distanceKm)}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ fontSize: 12, color: tokens.color.muted }}>{R.foodFare}</Text>
                <Text style={{ fontSize: 28, lineHeight: 34, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, fontVariant: ["tabular-nums"] }}>{usd(fee)}</Text>
              </View>
            </View>
            {upfront ? (
              <>
                <StopLine drop name={offer.dropoff.landmark} />
                <JobNotes job={job} />
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <MoneyTile label={venueCopy(R.payKitchen, place)} value={pay} />
                  <MoneyTile label={R.collectDoor} value={collect} />
                </View>
                <Text style={{ fontSize: 13, lineHeight: 18, color: tokens.color.muted }}>{venueCopy(RF.payKitchenB(pay, collect), place)}</Text>
                <PeekMark />
              </>
            ) : (
              <>
                <View style={{ gap: 4 }}>
                  <StopLine name={offer.pickup.landmark} />
                  <StopLine drop name={offer.dropoff.landmark} />
                </View>
                <JobNotes job={job} />
                <PeekMark />
              </>
            )}
          </OrderSheet>
        ) : null}
        <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 25 }} onLayout={(e) => setCtaH(e.nativeEvent.layout.height)}>
          <CtaBar hint={O.rd.passing}>
            <CtaButton label={R.accept} onPress={() => acceptM.mutate(offer.orderId)} loading={!!pendingOrQueued(acceptM)} disabled={pending} />
            <CtaButton ghost label={R.pass} onPress={() => declineM.mutate(offer.orderId)} loading={!!pendingOrQueued(declineM)} disabled={pending} />
          </CtaBar>
        </View>
      </View>
    </SafeAreaView>
  );
}

type OfferKind = "food" | "shop" | "pharmacy";

/** RD1a/RD1b: which tag and header the offer wears. */
function jobKind(job: FoodOfferJob | null): OfferKind {
  if (job?.businessType !== "shop") return "food";
  return job.shopKind === "pharmacy" ? "pharmacy" : "shop";
}

const HEADER: Record<OfferKind, { icon: IconName; title: string }> = {
  food: { icon: "utensils", title: R.tFoodOffer },
  shop: { icon: "shopping-bag", title: R.tShopOffer },
  pharmacy: { icon: "shield-check", title: R.tPharmacyOffer },
};

/** FoodHeader: the After Send bar with no Back — the service's icon + "New food job", centred. */
function FoodHeader({ kind }: { kind: OfferKind }): React.ReactElement {
  const h = HEADER[kind];
  return (
    <View style={{ minHeight: 53, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderBottomWidth: 1, borderBottomColor: tokens.color.line, backgroundColor: tokens.color.bg }}>
      <Icon name={h.icon} size={17} color={tokens.color.accentText} />
      <Text accessibilityRole="header" style={{ fontSize: 16, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>{h.title}</Text>
    </View>
  );
}

/** RD1a–d's one note under the stops: a prescription order outranks the sealed bag (RD1d draws only
 *  the Rx line); a scheduled order says the customer's slot. */
function JobNotes({ job }: { job: FoodOfferJob | null }): React.ReactElement | null {
  if (!job) return null;
  const slot = job.scheduledFor ? slotLabel(job.scheduledFor) : null;
  return (
    <>
      {job.rx ? <OfNote tone="hi" icon="file-text" text={O.rd.rxNote} /> : job.businessType === "shop" ? <OfNote icon={job.shopKind === "pharmacy" ? "shield-check" : "camera"} text={O.rd.sealNote} /> : null}
      {slot ? <OfNote icon="calendar" text={ofFmt(O.rd.schedNote, { s: slot })} /> : null}
    </>
  );
}

/** "12:30–13:00" for a 30-minute slot starting at `iso` (BRIEF §12), in the phone's own time. */
function slotLabel(iso: string): string {
  const start = new Date(iso);
  const end = new Date(start.getTime() + 30 * 60_000);
  const hm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${hm(start)}–${hm(end)}`;
}

function MoneyTile({ label, value }: { label: string; value: number }): React.ReactElement {
  return (
    <View style={{ flex: 1, backgroundColor: tokens.color.surface, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, gap: 2 }}>
      <Text style={{ fontSize: 12, color: tokens.color.muted }}>{label}</Text>
      <Text style={{ fontSize: 20, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, fontVariant: ["tabular-nums"] }}>{usd(value)}</Text>
    </View>
  );
}
