import { haversineKm, OFFER_WINDOW_MS, tokens } from "@lynia/shared";
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
import { isKycLocked, kycDeclineLabel, onlineGateReason, ONLINE_GATE_COPY, type OnlineGateReason } from "../../src/logic/gates";
import { Button, Card, EmptyState, ErrorText, Field, Heading, Icon, OfflineBanner, Screen, SkeletonList, StatusPill, Sub } from "../../src/ui";
import { parseNum } from "../../src/util";

/** mm:ss for the offer-sent auction countdown. */
function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** A live offer the rider has sent — kept on-screen with a countdown to the auction close (C2). */
interface SentOffer {
  order: OpenOrder;
  fare: string;
  etaMinutes: number;
  /** ISO auction close — createdAt + OFFER_WINDOW_MS, the same window the customer sees. */
  expiresAt: string;
}

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
  // Offers the rider has sent this session — rendered with a live "customer's window closes in"
  // countdown, and flipped to a distinct "that window closed" state on a `bid:expired` push.
  const [sentOffers, setSentOffers] = useState<SentOffer[]>([]);
  // 1s clock for the countdowns (only advanced while there are live sent offers).
  const [nowMs, setNowMs] = useState(() => Date.now());

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
  const rider = meQ.data?.rider;
  const kyc = rider?.kycStatus;
  // KYC decline detail (item 4): the specific reason + whether self-resubmit is locked (2+ attempts).
  const kycReasonLabel = kycDeclineLabel(rider?.kycDeclineReason);
  const kycLocked = isKycLocked(rider?.kycAttempts);

  // Online-gate refusal (item 2): the reason the rules API blocked going online (kyc / suspended /
  // on_hold / cooldown). Set from the mutation's onError, cleared once the rider is online.
  const [gate, setGate] = useState<OnlineGateReason | null>(null);

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
      setGate(null);
      setError(null);
    },
    onError: (e) => {
      // The rules API refuses going online with a reason — surface the matching state (on hold /
      // suspended / cooldown / KYC) instead of a generic error. Falls through to the error text when
      // the refusal isn't a recognised gate reason (e.g. a plain network failure).
      const reason = e instanceof ApiError ? onlineGateReason(e) : null;
      if (reason) {
        setGate(reason);
        setError(null);
        // A KYC refusal means our ["me"] view is stale (they lost verified) — refetch to drop into the gate.
        if (reason === "kyc") void qc.invalidateQueries({ queryKey: ["me"] });
        return;
      }
      setGate(null);
      setError(e instanceof ApiError ? e.message : "Couldn't change your status.");
    },
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
  // Only a 403 (server cooldown forced us offline) flips the switch — a network blip/timeout is a
  // transient reconnect, which is a state (the reconnecting chip/banner), not an error, so we keep
  // the rider online and let the next beat self-heal.
  // Two consecutive failed beats mean the server may have already cooled us down while the board
  // socket still looks healthy — surface the reconnecting state instead of a confident "Online".
  const [beatStale, setBeatStale] = useState(false);
  useEffect(() => {
    if (!online) {
      setBeatStale(false);
      return;
    }
    let failures = 0;
    const t = setInterval(() => {
      setOnline(true)
        .then(() => {
          failures = 0;
          setBeatStale(false);
        })
        .catch((e: unknown) => {
          if (e instanceof ApiError && e.status === 403) {
            setOnlineState(false);
            setError("You were taken offline (cooldown or a connection issue). Tap Go online to retry.");
          } else {
            failures += 1;
            if (failures >= 2) setBeatStale(true);
          }
        });
    }, 20_000);
    return () => clearInterval(t);
  }, [online]);

  // Board push: new orders arrive live over WS while online; the poll is the 15s self-heal fallback.
  const board = useRiderBoard(online, loc);

  // Sent offers are a live-board artifact: clear them when the rider goes offline (the board room is
  // gone and the countdowns are meaningless).
  useEffect(() => {
    if (!online) setSentOffers([]);
  }, [online]);
  // Tick a 1s clock only while there are sent offers on screen, for the auction countdowns.
  useEffect(() => {
    if (sentOffers.length === 0) return;
    const iv = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [sentOffers.length]);
  const openQ = useQuery({
    queryKey: ["openOrders"],
    // Pass the rider's position so the server geo-scopes to nearby, distance-sorted orders; with no
    // loc yet it fetches city-wide (backward compat). The key stays exactly ["openOrders"] — do NOT
    // add loc — because useRiderBoard merges live pushes into that exact key. When loc arrives/changes
    // the useEffect below invalidates this query to re-run the geo-scoped fetch.
    queryFn: () => getOpenOrders(loc ?? undefined, 5000),
    enabled: online,
    refetchInterval: online ? 15_000 : false,
  });

  // Once the rider's position is known (or moves), re-run the geo-scoped fetch. We invalidate rather
  // than key the query on loc so the live-board merge into ["openOrders"] keeps working.
  useEffect(() => {
    if (!online || !loc) return;
    void qc.invalidateQueries({ queryKey: ["openOrders"] });
  }, [loc?.lat, loc?.lng, online, qc]);

  // Client-side haversine sort. Now largely a no-op when the server already distance-sorted, but it's
  // kept as the sort for the loc-absent (city-wide) fallback and to visually reconcile live WS pushes
  // (which are still global) against the geo-scoped REST results.
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
      if (selected) {
        const s = selected;
        setBidIds((prev) => new Set(prev).add(s.id));
        // Same auction window the customer sees: createdAt + OFFER_WINDOW_MS (the shared clock).
        const expiresAt = new Date(new Date(s.createdAt).getTime() + OFFER_WINDOW_MS).toISOString();
        setSentOffers((prev) => [{ order: s, fare, etaMinutes: Math.round(etaNum ?? 0), expiresAt }, ...prev.filter((p) => p.order.id !== s.id)]);
      }
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
      {/* A dropped board socket while online surfaces as the standard top banner. */}
      {online && (!board.connected || beatStale) ? <OfflineBanner state="reconnecting" /> : null}
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: tokens.space.md }}>
          <Heading>Rider</Heading>
          <View style={{ flex: 1 }} />
          <Button label="Trips" variant="ghost" onPress={() => router.push("/history")} />
          <Button label="Rider setup" variant="ghost" onPress={() => router.push("/rider/become")} />
        </View>

        {activeQ.data ? (
          <Card style={{ borderColor: tokens.color.accent }}>
            <Text style={{ fontWeight: "700", color: tokens.color.ink }}>You have an active job ({activeQ.data.status.replace(/_/g, " ")})</Text>
            {/* Ghost: the accent-bordered card already carries the emphasis — one primary per state. */}
            <Button label="Open job" variant="ghost" onPress={() => router.push("/rider/job")} />
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
              icon="id-card"
              title="Set up as a rider"
              message="Verify your ID and register your bike to start accepting deliveries."
            >
              <Button label="Become a rider" onPress={() => router.push("/rider/become")} />
              <Button label="Refresh status" variant="ghost" onPress={() => void meQ.refetch()} />
            </EmptyState>
          ) : kyc === "failed" ? (
            kycLocked ? (
              // Two+ failed attempts (A-02): self-resubmit is locked — hand off to support, no "Try again"
              // so the rider isn't stuck re-running a check the system won't accept again.
              <EmptyState
                icon="triangle-alert"
                title="We couldn't verify your ID"
                message={
                  kycReasonLabel
                    ? `Your ID check didn't pass: ${kycReasonLabel.toLowerCase()}. You've reached the retry limit — contact support to finish verifying.`
                    : "Your ID check didn't pass and you've reached the retry limit. Contact support to finish verifying."
                }
              >
                <Button label="Refresh status" variant="ghost" onPress={() => void meQ.refetch()} />
              </EmptyState>
            ) : (
              // Honest declined state with the specific reason + a real retry (a fresh session).
              <EmptyState
                icon="triangle-alert"
                title="We couldn't verify your ID"
                message={
                  kycReasonLabel
                    ? `${kycReasonLabel}. Fix that and try again — or contact support if it keeps failing.`
                    : "The check didn't pass — often a blurry photo or glare on the ID. Try again, or contact support if it keeps failing."
                }
              >
                <Button label="Try again" onPress={() => retryM.mutate()} loading={retryM.isPending} />
                <Button label="Refresh status" variant="ghost" onPress={() => void meQ.refetch()} />
              </EmptyState>
            )
          ) : (
            // Pending — let them re-open a working verification session instead of re-keying the form.
            <EmptyState
              icon="id-card"
              title="Finish verifying your ID"
              message="Your ID check is still pending. Continue in the browser, then come back — riders go online once verified."
            >
              <Button label="Continue verification" onPress={() => retryM.mutate()} loading={retryM.isPending} />
              <Button label="Refresh status" variant="ghost" onPress={() => void meQ.refetch()} />
            </EmptyState>
          )
        ) : (
          <>
        {gate ? (
          // The rules API refused going online — a distinct, calm state per reason (on hold / suspended /
          // banned / cooldown / KYC), not a red error. Cooldown is temporary so it keeps a retry; the
          // others are resolved elsewhere (support / recovery) so they just explain and offer a status
          // refresh. Banned is the hardest state (permanent) and reads as circle-alert, distinct from
          // suspended's triangle-alert.
          <EmptyState
            icon={gate === "suspended" ? "triangle-alert" : gate === "cooldown" ? "clock" : gate === "kyc" ? "id-card" : "circle-alert"}
            title={ONLINE_GATE_COPY[gate].title}
            message={ONLINE_GATE_COPY[gate].message}
          >
            {gate === "cooldown" ? (
              <Button label="Try again" onPress={() => onlineM.mutate(true)} loading={onlineM.isPending} />
            ) : null}
            <Button label="Refresh status" variant="ghost" onPress={() => void meQ.refetch()} />
          </EmptyState>
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
              status={online ? (board.connected && !beatStale ? "Online" : "Reconnecting") : "Offline"}
              tone={online ? (board.connected && !beatStale ? "online" : "reconnecting") : "offline"}
              dot
            />
          </Pressable>
          <Button
            label={online ? "Go offline" : "Go online"}
            // Ghost while the compose card is open so "Send offer" is the screen's one primary.
            variant={online || selected != null ? "ghost" : "primary"}
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

        {online && sentOffers.some((s) => s.order.id !== activeQ.data?.id) ? (
          <View>
            <Sub>Your offers</Sub>
            {sentOffers
              .filter((s) => s.order.id !== activeQ.data?.id)
              .map((s) => {
                const expired = board.expiredOrderIds.has(s.order.id);
                const remaining = new Date(s.expiresAt).getTime() - nowMs;
                return (
                  <Card key={s.order.id}>
                    <Text style={{ fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>
                      {s.order.pickup.landmark} → {s.order.dropoff.landmark}
                    </Text>
                    <Text style={{ fontSize: tokens.font.size.body, color: tokens.color.muted, fontVariant: ["tabular-nums"] }}>
                      Your offer ${s.fare} · ETA {s.etaMinutes} min
                    </Text>
                    {expired ? (
                      // Distinct from "not chosen": the whole auction closed with nobody picked (C2).
                      <View style={{ flexDirection: "row", gap: tokens.space.sm, marginTop: tokens.space.sm, padding: tokens.space.sm, borderRadius: tokens.radius.input, backgroundColor: tokens.color.surface }}>
                        <Icon name="inbox" size={16} color={tokens.color.muted} />
                        <Text style={{ flex: 1, fontSize: tokens.font.size.caption, color: tokens.color.muted, lineHeight: 18 }}>
                          That window closed — the customer&apos;s auction ended with nobody picked. If they re-broadcast at a new price, it&apos;ll show up here as a fresh order.
                        </Text>
                      </View>
                    ) : (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: tokens.space.sm, marginTop: tokens.space.sm, padding: tokens.space.sm, borderRadius: tokens.radius.input, backgroundColor: tokens.color.surface }}>
                        <Text style={{ flex: 1, fontSize: tokens.font.size.caption, fontWeight: tokens.font.weight.semibold, color: tokens.color.muted }}>Customer&apos;s window closes in</Text>
                        <Text style={{ fontSize: tokens.font.size.bodyLg, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, fontVariant: ["tabular-nums"] }}>{formatClock(remaining)}</Text>
                      </View>
                    )}
                  </Card>
                );
              })}
          </View>
        ) : null}

        {online ? (
          <View>
            <Sub>Open orders{openQ.isFetching ? " …" : ""}</Sub>
            {ranked.map(({ o, km }) => (
              <Card key={o.id}>
                <Text style={{ fontWeight: "700", color: tokens.color.ink }}>{o.pickup.landmark} → {o.dropoff.landmark}</Text>
                <Text style={{ fontSize: 14, color: tokens.color.muted, fontVariant: ["tabular-nums"] }}>
                  {o.itemDesc} · {km != null ? `${km.toFixed(1)} km away` : `${o.distanceKm ?? "?"} km trip`} · asking ${o.proposedFare}
                </Text>
                <Button label="Make an offer" variant="ghost" onPress={() => chooseOrder(o)} />
              </Card>
            ))}
            {openQ.isError ? (
              <EmptyState icon="wifi-off" title="Couldn't load nearby orders" message="Check your connection and try again.">
                <Button label="Retry" onPress={() => void openQ.refetch()} />
              </EmptyState>
            ) : ranked.length === 0 ? (
              <EmptyState
                icon="inbox"
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
          </>
        )}

        <Button label="Back to customer" variant="ghost" onPress={() => router.replace("/home")} />
        <ErrorText message={error} />
        <View style={{ height: tokens.space.xxl }} />
      </ScrollView>
    </Screen>
  );
}
