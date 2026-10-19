import { FLEET_DISPATCH, type FleetJobOffer, haversineKm } from "@lynia/shared";
import { tokens } from "@lynia/shared/tokens";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Location from "expo-location";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { acceptFleetJob, declineFleetJob, getFleetOffers } from "../../src/api/fleet";
import { pendingOrQueued } from "../../src/query/client";
import { useMyFleet } from "../../src/query/use-my-fleet";
import { useTabTop } from "../../src/query/use-tab-top";
import { haptic, Icon, Screen, SkeletonList, useActionErrorEffect } from "../../src/ui";
import { CtaBar, CtaButton } from "../../src/ui/order/kit";
import { StopLine } from "../../src/ui/rider/board";
import { km, usd } from "../../src/ui/rider/copy";
import { FleetBtn2, FleetTag } from "../../src/ui/rider/fleet";
import { OBB } from "../../src/ui/rider/fleet-copy";
import { TerminalBody } from "../../src/ui/rider/job-kit";
import { MintTop } from "../../src/ui/rider/kit";
import { RiderErrorState } from "../../src/ui/rider/RiderErrorState";
import { useBackToBoard } from "../../src/ui/rider/use-back-to-board";

/** A fleet job holds for one round, then rings the next biker (the server's FLEET_DISPATCH). */
const HOLD_S = Math.round(FLEET_DISPATCH.roundMs / 1000);

/** "0:48". */
const clock = (s: number): string => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/**
 * OB-R7 · a fleet job offer (Own bikers v1, `packages/design/handoff/own-bikers-v1/`, ledger D-117). Rider v2's
 * F1–F4 without the fare and the pay-the-kitchen tiles: a green ringing header ("New Chicken Inn job", the time
 * left and its bar), the "Chicken Inn job" tag, the two stops, "0.4 km to pickup · 3.2 km trip", and, when the
 * customer pays at the door, "Collect at the door $14.00 · All of it goes back to Chicken Inn Avondale". Accept /
 * Not this one, "Passing or missing a job doesn't affect you." Entered from the `fleet:offer` socket, a
 * `fleet_offer` push or the board. Its own source of truth is `GET /fleet/jobs/offers`, read every 3 s, so a job
 * taken or out of time is caught with no live socket (F4: "That one went to another biker").
 */
export default function FleetOffer(): React.ReactElement {
  const router = useRouter();
  const toBoard = useBackToBoard();
  const qc = useQueryClient();
  const top = useTabTop("rider");
  const myFleet = useMyFleet();
  const { orderId: orderParam } = useLocalSearchParams<{ orderId?: string }>();
  const pinned = typeof orderParam === "string" && orderParam !== "" ? orderParam : undefined;
  const offersQ = useQuery({
    queryKey: ["fleetOffer", pinned ?? null],
    queryFn: getFleetOffers,
    refetchInterval: (q) => (q.state.data === undefined && q.state.errorUpdateCount > 0 ? false : 3000),
  });
  // The one opened, else the one running out first (an older push named none).
  const offer: FleetJobOffer | null = offersQ.data ? (pinned ? (offersQ.data.find((o) => o.orderId === pinned) ?? null) : soonest(offersQ.data)) : null;
  const [now, setNow] = useState(() => Date.now());
  // "0.4 km to pickup": from the phone's last fix (the board just had one); none → the trip alone.
  const [you, setYou] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    let off = false;
    Location.getLastKnownPositionAsync()
      .then((p) => {
        if (!off && p) setYou({ lat: p.coords.latitude, lng: p.coords.longitude });
      })
      .catch(() => undefined);
    return () => {
      off = true;
    };
  }, []);

  const acceptM = useMutation({
    mutationFn: (o: FleetJobOffer) => acceptFleetJob(o.orderId),
    onSuccess: (_r, o) => {
      haptic("success");
      void qc.invalidateQueries({ queryKey: ["activeJob"] });
      void qc.invalidateQueries({ queryKey: ["fleetOffers"] });
      // An app order is a merchant order (the food job screens); a phone booking is a Send delivery.
      router.replace(o.kind === "app" ? "/rider/food-job" : "/rider/job");
    },
  });
  const declineM = useMutation({
    mutationFn: (o: FleetJobOffer) => declineFleetJob(o.orderId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["fleetOffers"] });
      toBoard();
    },
  });
  useActionErrorEffect(acceptM.error ?? declineM.error);

  const leftS = offer ? Math.max(0, Math.ceil((new Date(offer.expiresAt).getTime() - now) / 1000)) : 0;
  const live = offer != null && leftS > 0;
  useEffect(() => {
    if (!live) return;
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [live]);
  // It rings like a food offer: a strong buzz when it lands, repeated while it's live.
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

  if (!offersQ.data && (offersQ.isError || offersQ.isPaused || offersQ.errorUpdateCount > 0)) {
    return (
      <Screen>
        <RiderErrorState onRetry={() => void offersQ.refetch()} retrying={offersQ.isFetching} onBack={() => toBoard()} />
      </Screen>
    );
  }
  if (offersQ.isLoading) {
    return (
      <Screen>
        <SkeletonList />
      </Screen>
    );
  }

  // F4: out of time, or another biker took it.
  if (!offer || !live) {
    const shop = offer?.shop || lastShop.current || myFleet.fleet?.shop || offersQ.data?.[0]?.shop || "";
    return (
      <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: tokens.color.bg }}>
        <MintTop {...top} online loc={null} />
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            flexGrow: 1,
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            paddingHorizontal: 24,
            paddingVertical: 16,
          }}
          showsVerticalScrollIndicator={false}
        >
          <TerminalBody icon="clock" title={OBB.expT} body={OBB.expB(shop, HOLD_S)} />
        </ScrollView>
        <CtaBar>
          <CtaButton label={OBB.backJobs} onPress={() => toBoard()} />
        </CtaBar>
      </SafeAreaView>
    );
  }
  lastShop.current = offer.shop;

  const collect = offer.collect != null && Number(offer.collect) > 0 ? Number(offer.collect) : null;
  const tripKm = offer.distanceKm;
  const pending = acceptM.isPending || declineM.isPending;
  return (
    <SafeAreaView edges={["bottom"]} style={{ flex: 1, backgroundColor: tokens.color.bg }}>
      <SafeAreaView edges={["top"]} style={{ backgroundColor: tokens.color.cta }}>
        <View
          style={{
            paddingTop: 12,
            paddingHorizontal: 16,
            paddingBottom: 20,
            gap: 12,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: "rgba(255,255,255,0.16)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="volume-2" size={20} color={tokens.color.onAccent} />
            </View>
            <Text
              accessibilityRole="header"
              style={{
                flex: 1,
                fontSize: 20,
                lineHeight: 26,
                fontWeight: tokens.font.weight.bold,
                color: tokens.color.onAccent,
              }}
            >
              {OBB.offerT(offer.shop)}
            </Text>
            <Text
              accessibilityLiveRegion="polite"
              style={{
                fontSize: 32,
                lineHeight: 38,
                fontWeight: tokens.font.weight.bold,
                color: tokens.color.onAccent,
                fontVariant: ["tabular-nums"],
              }}
            >
              {clock(leftS)}
            </Text>
          </View>
          <View
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: HOLD_S, now: leftS }}
            style={{
              height: 4,
              borderRadius: 2,
              backgroundColor: "rgba(255,255,255,0.24)",
              overflow: "hidden",
            }}
          >
            <View
              style={{
                width: `${Math.min(100, (leftS / HOLD_S) * 100)}%`,
                height: "100%",
                backgroundColor: tokens.color.bg,
              }}
            />
          </View>
        </View>
      </SafeAreaView>
      <ScrollView
        style={{
          flex: 1,
          marginTop: -12,
          backgroundColor: tokens.color.bg,
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
        }}
        contentContainerStyle={{
          paddingVertical: 18,
          paddingHorizontal: 16,
          gap: 14,
        }}
      >
        <FleetTag shop={offer.shop} wide />
        <View style={{ gap: 10 }}>
          <StopLine name={offer.pickup.landmark} size={16} />
          <StopLine drop name={offer.dropoff.landmark} size={16} />
        </View>
        <Text
          style={{
            fontSize: 14,
            lineHeight: 20,
            color: tokens.color.muted,
            fontVariant: ["tabular-nums"],
          }}
        >
          {OBB.meta(you ? km(haversineKm(you, offer.pickup.point)) : null, tripKm != null ? km(tripKm) : null)}
        </Text>
        {collect != null ? (
          <View
            style={{
              backgroundColor: tokens.color.surface,
              borderRadius: 12,
              paddingVertical: 12,
              paddingHorizontal: 14,
              gap: 4,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Icon name="banknote" size={18} color={tokens.color.accentText} />
              <Text
                style={{
                  flex: 1,
                  fontSize: 12,
                  fontWeight: tokens.font.weight.bold,
                  letterSpacing: 0.72,
                  color: tokens.color.muted,
                }}
              >
                {OBB.collectDoor.toUpperCase()}
              </Text>
              <Text
                style={{
                  fontSize: 24,
                  lineHeight: 30,
                  fontWeight: tokens.font.weight.bold,
                  color: tokens.color.ink,
                  fontVariant: ["tabular-nums"],
                }}
              >
                {usd(collect)}
              </Text>
            </View>
            <Text
              style={{
                fontSize: 13,
                lineHeight: 18,
                color: tokens.color.muted,
              }}
            >
              {OBB.collectDoorB(offer.shop)}
            </Text>
          </View>
        ) : null}
      </ScrollView>
      <CtaBar>
        <CtaButton label={OBB.accept} onPress={() => acceptM.mutate(offer)} loading={!!pendingOrQueued(acceptM)} disabled={pending} />
        <FleetBtn2 label={OBB.pass} onPress={() => declineM.mutate(offer)} disabled={pending} />
        <Text
          style={{
            fontSize: 13,
            lineHeight: 18,
            color: tokens.color.muted,
            textAlign: "center",
          }}
        >
          {OBB.passHint}
        </Text>
      </CtaBar>
    </SafeAreaView>
  );
}

/** The shop the last live offer named, for F4's sentence once it's gone from the read. */
const lastShop = { current: "" };

function soonest(offers: readonly FleetJobOffer[]): FleetJobOffer | null {
  return offers.reduce<FleetJobOffer | null>((a, b) => (a == null || b.expiresAt < a.expiresAt ? b : a), null);
}
