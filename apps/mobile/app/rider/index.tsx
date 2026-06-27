import { haversineKm, tokens } from "@lynia/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { ApiError } from "../../src/api/client";
import { makeOffer } from "../../src/api/offers";
import { getActiveOrder, getOpenOrders, type OpenOrder } from "../../src/api/orders";
import { setOnline } from "../../src/api/riders";
import { Button, Card, EmptyState, ErrorText, Field, Heading, Screen, Sub } from "../../src/ui";
import { parseNum } from "../../src/util";

export default function RiderHome(): React.ReactElement {
  const router = useRouter();
  const qc = useQueryClient();
  const [online, setOnlineState] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [selected, setSelected] = useState<OpenOrder | null>(null);
  const [fare, setFare] = useState("");
  const [eta, setEta] = useState("");
  const [bidIds, setBidIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    void (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      try {
        const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setLoc({ lat: p.coords.latitude, lng: p.coords.longitude });
      } catch {
        /* leave unsorted */
      }
    })();
  }, []);

  const activeQ = useQuery({ queryKey: ["activeJob"], queryFn: getActiveOrder, refetchInterval: 8000 });

  const onlineM = useMutation({
    mutationFn: (next: boolean) => setOnline(next),
    onSuccess: (res) => {
      setOnlineState(res.online);
      setError(null);
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Couldn't change your status."),
  });

  // Heartbeat: keep the rider selectable (ET3 liveness) while online by refreshing lastHeartbeatAt.
  // If a beat fails (e.g. a cooldown forced us offline server-side), reflect it instead of lying.
  useEffect(() => {
    if (!online) return;
    const t = setInterval(() => {
      void setOnline(true).catch(() => {
        setOnlineState(false);
        setError("You were taken offline (cooldown or a connection issue). Tap Go online to retry.");
      });
    }, 20_000);
    return () => clearInterval(t);
  }, [online]);

  const openQ = useQuery({
    queryKey: ["openOrders"],
    queryFn: getOpenOrders,
    enabled: online,
    refetchInterval: online ? 5000 : false,
  });

  const ranked = (openQ.data ?? [])
    .filter((o) => !bidIds.has(o.id)) // hide orders we've already bid on (one round per rider)
    .map((o) => ({ o, km: loc ? haversineKm(loc, o.pickup.point) : null }))
    .sort((a, b) => (a.km ?? Number.MAX_SAFE_INTEGER) - (b.km ?? Number.MAX_SAFE_INTEGER));

  const fareNum = parseNum(fare);
  const etaNum = parseNum(eta);
  const canOffer = selected != null && fareNum != null && fareNum > 0 && etaNum != null && etaNum > 0;

  const offerM = useMutation({
    mutationFn: () => {
      // Accept = take the customer's price; any other fare is a counter.
      const type = fareNum === Number(selected!.proposedFare) ? "accept" : "counter";
      return makeOffer(selected!.id, { type, offeredFare: fareNum!, etaMinutes: Math.round(etaNum!) });
    },
    onSuccess: () => {
      if (selected) setBidIds((prev) => new Set(prev).add(selected.id));
      setSelected(null);
      setFare("");
      setEta("");
      setError(null);
      void qc.invalidateQueries({ queryKey: ["openOrders"] });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Couldn't send the offer."),
  });

  const chooseOrder = (o: OpenOrder): void => {
    setSelected(o);
    setFare(o.proposedFare);
    setEta("10");
  };

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: tokens.space.md }}>
          <Heading>Rider</Heading>
          <View style={{ flex: 1 }} />
          <Button label="Trips" variant="ghost" onPress={() => router.push("/history")} />
          <Button label="Setup / KYC" variant="ghost" onPress={() => router.push("/rider/become")} />
        </View>

        {activeQ.data ? (
          <Card style={{ borderColor: tokens.color.accent }}>
            <Text style={{ fontWeight: "700", color: tokens.color.ink }}>You have an active job ({activeQ.data.status.replace(/_/g, " ")})</Text>
            <Button label="Open job" onPress={() => router.push("/rider/job")} />
          </Card>
        ) : null}

        <Card>
          <Button
            label={online ? "Go offline" : "Go online"}
            variant={online ? "ghost" : "primary"}
            onPress={() => onlineM.mutate(!online)}
            loading={onlineM.isPending}
          />
          <Text style={{ fontSize: 12, color: tokens.color.muted, marginTop: 4 }}>
            {online ? "You're online — offers you make stay live." : "Go online to see and bid on nearby orders."}
          </Text>
        </Card>

        {online ? (
          <View>
            <Sub>Open orders{openQ.isFetching ? " …" : ""}</Sub>
            {ranked.map(({ o, km }) => (
              <Card key={o.id}>
                <Text style={{ fontWeight: "700", color: tokens.color.ink }}>{o.pickup.landmark} → {o.dropoff.landmark}</Text>
                <Text style={{ fontSize: 13, color: tokens.color.muted }}>
                  {o.itemDesc} · {km != null ? `${km.toFixed(1)} km away` : `${o.distanceKm ?? "?"} km trip`} · asking ${o.proposedFare}
                </Text>
                <Button label="Make an offer" variant="ghost" onPress={() => chooseOrder(o)} />
              </Card>
            ))}
            {ranked.length === 0 ? (
              <EmptyState
                icon="📭"
                title="No open orders near you right now"
                message="You're online and first in line — stay put, requests come through fast. Busiest 7–9am & 5–7pm."
              />
            ) : null}
          </View>
        ) : null}

        {selected ? (
          <Card style={{ borderColor: tokens.color.accent }}>
            <Text style={{ fontWeight: "700", marginBottom: tokens.space.sm }}>Offer on {selected.pickup.landmark}</Text>
            <Field label="Your fare (USD)" value={fare} onChangeText={setFare} keyboardType="decimal-pad" />
            <Field label="ETA to pickup (min)" value={eta} onChangeText={setEta} keyboardType="number-pad" maxLength={3} />
            <Button label="Send offer" onPress={() => offerM.mutate()} loading={offerM.isPending} disabled={!canOffer} />
            <Button label="Cancel" variant="ghost" onPress={() => setSelected(null)} />
          </Card>
        ) : null}

        <Button label="Back to customer" variant="ghost" onPress={() => router.replace("/home")} />
        <ErrorText message={error} />
        <View style={{ height: tokens.space.xxl }} />
      </ScrollView>
    </Screen>
  );
}
