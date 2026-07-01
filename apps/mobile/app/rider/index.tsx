import { haversineKm, tokens } from "@lynia/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Location from "expo-location";
import * as WebBrowser from "expo-web-browser";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { ApiError } from "../../src/api/client";
import { getMe } from "../../src/api/auth";
import { makeOffer } from "../../src/api/offers";
import { getActiveOrder, getOpenOrders, type OpenOrder } from "../../src/api/orders";
import { retryKyc, setOnline } from "../../src/api/riders";
import { useRiderBoard } from "../../src/realtime/use-rider-board";
import { Button, Card, EmptyState, ErrorText, Field, Heading, Screen, SkeletonList, StatusPill, Sub } from "../../src/ui";
import { parseNum } from "../../src/util";

/** Urban motorbike cruising speed for a rough pickup-ETA seed (min = distance / speed). */
const AVG_PICKUP_KMH = 22;

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

  // Gate the dashboard behind KYC: a rider goes online only once verified (the backend enforces it on
  // makeOffer too — the UI shouldn't pretend otherwise). `rider: null` = hasn't started rider setup.
  // While the check is `pending`, poll so a vendor webhook flipping the rider to verified clears the
  // gate on its own — no manual Refresh needed. Stop polling once it resolves (verified/failed).
  const meQ = useQuery({
    queryKey: ["me"],
    queryFn: getMe,
    refetchInterval: (query) => (query.state.data?.rider?.kycStatus === "pending" ? 5000 : false),
  });
  const knownUnverified = meQ.data != null && meQ.data.rider?.kycStatus !== "verified";
  const kyc = meQ.data?.rider?.kycStatus;

  // Re-check verification whenever this screen regains focus (e.g. back from the Didit browser flow), so a
  // freshly-verified rider isn't trapped behind the gate by a stale ["me"] cache.
  useFocusEffect(
    useCallback(() => {
      void qc.invalidateQueries({ queryKey: ["me"] });
    }, [qc]),
  );

  const onlineM = useMutation({
    mutationFn: (next: boolean) => setOnline(next),
    onSuccess: (res) => {
      setOnlineState(res.online);
      setError(null);
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Couldn't change your status."),
  });

  // Pending/failed riders re-run KYC: mint a FRESH Didit session and open it (no re-keying the form).
  const retryM = useMutation({
    mutationFn: retryKyc,
    onSuccess: async (res) => {
      setError(null);
      // In-app browser tab (not the system browser): it returns to the app when the rider closes it,
      // so we can immediately re-check status rather than leaving them stranded outside the app.
      if (res.verificationUrl && res.verificationUrl.startsWith("https://")) {
        await WebBrowser.openAuthSessionAsync(res.verificationUrl).catch(() => undefined);
      }
      void qc.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Couldn't restart verification."),
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

  // Board push: new orders arrive live over WS while online; the poll is the 15s self-heal fallback.
  const board = useRiderBoard(online);
  const openQ = useQuery({
    queryKey: ["openOrders"],
    queryFn: getOpenOrders,
    enabled: online,
    refetchInterval: online ? 15_000 : false,
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
    // Seed the ETA from the real distance to pickup instead of a constant "10", so the customer's
    // "Fastest" sort ranks on something real. Rider can still edit before sending.
    const km = loc ? haversineKm(loc, o.pickup.point) : null;
    setEta(km != null ? String(Math.max(3, Math.round((km / AVG_PICKUP_KMH) * 60))) : "10");
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

        {meQ.isLoading ? (
          <View style={{ marginTop: tokens.space.lg }}>
            <SkeletonList count={2} />
          </View>
        ) : knownUnverified ? (
          !meQ.data?.rider ? (
            // Not a rider yet → the full onboarding form (name, ID, bike, photo).
            <EmptyState
              icon="🪪"
              title="Set up as a rider"
              message="Verify your ID and register your bike to start accepting deliveries."
            >
              <Button label="Become a rider" onPress={() => router.push("/rider/become")} />
              <Button label="Refresh status" variant="ghost" onPress={() => void meQ.refetch()} />
            </EmptyState>
          ) : kyc === "failed" ? (
            // Honest declined state with a real retry (a fresh session) — no silent "pending" loop.
            <EmptyState
              icon="⚠️"
              title="We couldn't verify your ID"
              message="The check didn't pass — often a blurry photo or glare on the ID. Try again, or contact support if it keeps failing."
            >
              <Button label="Try again" onPress={() => retryM.mutate()} loading={retryM.isPending} />
              <Button label="Refresh status" variant="ghost" onPress={() => void meQ.refetch()} />
            </EmptyState>
          ) : (
            // Pending — let them re-open a working verification session instead of re-keying the form.
            <EmptyState
              icon="🪪"
              title="Finish verifying your ID"
              message="Your ID check is still pending. Continue in the browser, then come back — riders go online once verified."
            >
              <Button label="Continue verification" onPress={() => retryM.mutate()} loading={retryM.isPending} />
              <Button label="Refresh status" variant="ghost" onPress={() => void meQ.refetch()} />
            </EmptyState>
          )
        ) : (
          <>
        <Card>
          {/* Persistent connection chip so a silent heartbeat-drop is glanceable, not a surprise
              at offer time. Tap it while offline to go back online. */}
          <Pressable
            onPress={() => {
              if (!online) onlineM.mutate(true);
            }}
            disabled={online || onlineM.isPending}
            accessibilityRole="button"
            accessibilityLabel={online ? "You are online" : "You are offline — tap to go online"}
            style={{ minHeight: tokens.touchTargetMin, justifyContent: "center", marginBottom: 4 }}
          >
            <StatusPill
              status={online ? "Online" : "Offline"}
              tone={online ? "online" : "offline"}
              dot
            />
          </Pressable>
          <Button
            label={online ? "Go offline" : "Go online"}
            variant={online ? "ghost" : "primary"}
            onPress={() => onlineM.mutate(!online)}
            loading={onlineM.isPending}
          />
          <Text style={{ fontSize: 12, color: tokens.color.muted, marginTop: 4 }}>
            {online
              ? board.connected
                ? "You're online — new orders arrive live."
                : "You're online — reconnecting to the live board…"
              : "Go online to see and bid on nearby orders."}
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
            {openQ.isError ? (
              <EmptyState icon="📡" title="Couldn't load nearby orders" message="Check your connection and try again.">
                <Button label="Retry" onPress={() => void openQ.refetch()} />
              </EmptyState>
            ) : ranked.length === 0 ? (
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

        <Button label="View earnings" variant="ghost" onPress={() => router.push("/earnings")} />
          </>
        )}

        <Button label="Back to customer" variant="ghost" onPress={() => router.replace("/home")} />
        <ErrorText message={error} />
        <View style={{ height: tokens.space.xxl }} />
      </ScrollView>
    </Screen>
  );
}
