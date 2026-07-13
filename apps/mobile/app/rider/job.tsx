import { type AdvanceStatusRequest, UndeliveredReason, tokens } from "@lynia/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { ApiError } from "../../src/api/client";
import { getMe } from "../../src/api/auth";
import { collectedItemCount, shouldShowJobError } from "../../src/logic/journey";
import { ACTIVE, DELIVERY_OTP_MAX_ATTEMPTS, NEXT, RIDER_CANCELLABLE } from "../../src/logic/rider-job";
import { advanceStatus, cancelOrder, confirmDelivery, confirmItems, getActiveOrder, getOrder, markUndelivered, rateSender, type OrderSnapshot } from "../../src/api/orders";
import { acknowledgeHandback, loadAcknowledgedHandbacks } from "../../src/auth/session";
import { formatMoney } from "../../src/logic/money";
import type { LastActive } from "../../src/logic/last-active";
import { clearLastActiveJob, loadLastActiveJob, saveLastActiveJob } from "../../src/net/last-active-store";
import { useForegroundRefetch } from "../../src/realtime/use-foreground-refetch";
import { useRiderJobSocket } from "../../src/realtime/use-rider-job-socket";
import { useRiderLocationStream } from "../../src/realtime/use-rider-location";
import { Button, Card, Celebrate, EmptyState, ErrorText, haptic, Heading, Icon, OfflineBanner, orderStatusTone, Screen, SkeletonList, StatusPill, Sub, useToast } from "../../src/ui";
import { DeliveryOtp } from "../../src/ui/rider/DeliveryOtp";
import { JobDetailsCard } from "../../src/ui/rider/JobDetailsCard";
import { LeaveJobButton } from "../../src/ui/rider/LeaveJobButton";
import { PickupChecklist } from "../../src/ui/rider/PickupChecklist";
import { CancelledHandback, UndeliveredDone } from "../../src/ui/rider/terminals";
import { UndeliveredSheet } from "../../src/ui/rider/UndeliveredSheet";
import { BailSheet } from "../../src/ui/rider/BailSheet";
import { GetHelpControl, ReportControl, SosControl } from "../../src/ui/safety";

/** A short local clock label (e.g. "3:40 PM") for a cooldown-until timestamp; empty on a bad date. */
function fmtClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function RiderJob(): React.ReactElement {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Pickup item verification: which line-items the rider has ticked as physically collected. Indexes
  // into order.items; defaults to all ticked when the rider reaches the pickup-verification step.
  const [checkedItems, setCheckedItems] = useState<Set<number>>(() => new Set());
  // R1: the post-pickup "can't complete delivery" reason picker + the frozen terminal once it commits.
  const [undelivering, setUndelivering] = useState(false);
  const [undeliveredDone, setUndeliveredDone] = useState<UndeliveredReason | null>(null);
  // A successful delivery-confirm freezes the just-delivered snapshot into a terminal. A `delivered`
  // order drops out of activeForRider (ACTIVE_RIDE_STATUSES excludes it), so the post-confirm refetch
  // returns null and would otherwise blank straight to "No active job" with zero acknowledgement the
  // parcel arrived. Mirrors the undelivered/cancelled frozen terminals below.
  const [deliveredDone, setDeliveredDone] = useState<OrderSnapshot | null>(null);
  // 4·b3: the pre-pickup bail flow — open the reason + reliability-warning sheet before cancelling,
  // and carry the (optional) reason to the server so the customer's re-broadcast has a "why".
  const [bailing, setBailing] = useState(false);
  const [bailReason, setBailReason] = useState("");
  // R9: count wrong delivery-code tries to show attempts-remaining and lock the field at the cap.
  const [otpTries, setOtpTries] = useState(0);
  // Rate-the-sender (4·7): an OPTIONAL post-delivery star, recorded-only — tap-then-submit, no undo.
  const [senderScore, setSenderScore] = useState(0);
  // R8 follow-up: order ids the rider has already handed back (tapped "Back to board" on). A cancelled
  // order stays reopenable for 24h, so without this its snapshot keeps re-showing the hand-back prompt
  // on every reopen. Loaded once from the device; a fresh WS cancel is never suppressed (only reopens).
  const [ackedHandbacks, setAckedHandbacks] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    let alive = true;
    void loadAcknowledgedHandbacks().then((ids) => {
      if (alive) setAckedHandbacks(new Set(ids));
    });
    return () => {
      alive = false;
    };
  }, []);

  // The job socket (below) resyncs `activeJob` on connect/connect_error already, so only fall back to
  // REST polling while it isn't connected — avoids a redundant round-trip every 6s on metered data for
  // the whole duration of an active delivery.
  const [jobPollFallback, setJobPollFallback] = useState(true);
  const jobQ = useQuery({ queryKey: ["activeJob"], queryFn: getActiveOrder, refetchInterval: jobPollFallback ? 6000 : false });
  // Only needed to show "this would be strike N" on the bail-confirm sheet — a light, cached read, not
  // polled (the count only matters at the moment the rider opens the cancel sheet).
  const meQ = useQuery({ queryKey: ["me"], queryFn: getMe });
  const order = jobQ.data ?? null;
  const orderId = order?.id ?? null;
  const items = order?.items ?? [];

  // Load the last-known job summary (persisted below) so an OFFLINE COLD START shows it instead of a
  // bare "couldn't load your job" — only ever rendered in the fetch-error branch, never over live data.
  const [lastKnownJob, setLastKnownJob] = useState<LastActive | null>(null);
  useEffect(() => {
    let alive = true;
    void loadLastActiveJob().then((la) => {
      if (alive) setLastKnownJob(la);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Persist the single last-known-job slot for offline cold-start recovery — ONCE per status transition
  // (not per 6s poll / GPS tick). A successful empty fetch (no job) or a terminal status clears it, so a
  // finished job never resurfaces offline; a fetch error leaves undefined data and the slot untouched.
  const persistedJobStatus = useRef<string | null>(null);
  useEffect(() => {
    const d = jobQ.data;
    if (d === undefined) return; // loading or errored — keep whatever's stored
    if (d === null) {
      persistedJobStatus.current = null;
      void clearLastActiveJob();
      return;
    }
    if (d.status === persistedJobStatus.current) return;
    persistedJobStatus.current = d.status;
    if (ACTIVE.includes(d.status)) void saveLastActiveJob(d);
    else void clearLastActiveJob(); // terminal (delivered / cancelled / undelivered / completed)
  }, [jobQ.data]);

  // Stream GPS only while the ride is genuinely active — stops on delivered AND cancelled/completed
  // (don't blocklist a single terminal state, or a cancelled job keeps broadcasting the rider's GPS).
  const { permissionDenied: locationDenied } = useRiderLocationStream(order && ACTIVE.includes(order.status) ? orderId : null);

  // The customer (or ops) can cancel anytime (C3). When `job:cancelled` arrives we FREEZE the
  // last-known snapshot into a terminal, because a cancelled order immediately drops out of
  // /orders/mine/active (so a refetch would blank the sender contact needed for a post-pickup hand-back).
  const [cancelledJob, setCancelledJob] = useState<{ collected: boolean; snapshot: OrderSnapshot; cancelledBy: "customer" | "admin" } | null>(null);
  // C5: the customer's app has gone dark on this active job — surface a soft "may be offline" warning
  // so the rider knows the customer might not be seeing live position/status. Cleared on the next
  // status change (the flow progressing implies things are moving again).
  const [customerStale, setCustomerStale] = useState(false);
  const orderRef = useRef<OrderSnapshot | null>(order);
  orderRef.current = order;
  const { connected: jobSocketConnected } = useRiderJobSocket(
    order && ACTIVE.includes(order.status) ? orderId : null,
    (e) => {
      if (orderRef.current) setCancelledJob({ collected: e.collected, snapshot: orderRef.current, cancelledBy: e.cancelledBy });
    },
    () => setCustomerStale(true),
  );
  // 4·b4: only read "reconnecting" after we've been live once (avoid a connect-window flash on mount).
  const wasJobConnected = useRef(false);
  if (jobSocketConnected) wasJobConnected.current = true;
  useEffect(() => {
    setJobPollFallback(!jobSocketConnected);
  }, [jobSocketConnected]);
  // A status advance means the ride is moving again — drop a stale customer-presence warning.
  useEffect(() => {
    setCustomerStale(false);
  }, [order?.status]);

  // Warm-resume: refetch the active job the moment the app returns to foreground. Without this, a job
  // the customer cancelled while we were backgrounded serves its stale (still-live) cache for up to the
  // 6s poll — briefly re-exposing advance/OTP controls on a dead order — before flipping to the R8
  // hand-back. Invalidating on resume makes the terminal appear immediately.
  useForegroundRefetch(() => void qc.invalidateQueries({ queryKey: ["activeJob"] }));

  const refresh = (): void => void qc.invalidateQueries({ queryKey: ["activeJob"] });
  const fail = (e: unknown): void => setError(e instanceof ApiError ? e.message : "Couldn't update this delivery. Check your connection and try again.");

  // Optimistic advance: the trip step is a frequent, near-always-succeeds tap, so paint the next
  // step instantly and reconcile in the background. cancelQueries first so the 6s poller can't
  // clobber the optimistic write mid-flight; rollback to the snapshot on error (onSettled always
  // re-syncs from the server).
  const advanceM = useMutation({
    mutationFn: (to: AdvanceStatusRequest["to"]) => advanceStatus(orderId!, to),
    onMutate: async (to) => {
      await qc.cancelQueries({ queryKey: ["activeJob"] });
      const prev = qc.getQueryData<OrderSnapshot | null>(["activeJob"]);
      qc.setQueryData<OrderSnapshot | null>(["activeJob"], (o) => (o ? { ...o, status: to } : o));
      return { prev };
    },
    onError: (e, _to, ctx) => {
      // Restore the snapshot (incl. a legitimate null), but never write `undefined` back over the cache.
      if (ctx?.prev !== undefined) qc.setQueryData(["activeJob"], ctx.prev);
      fail(e);
    },
    onSettled: refresh,
  });
  const deliverM = useMutation({
    mutationFn: () => confirmDelivery(orderId!, code.trim()),
    onSuccess: () => {
      // The hand-off landed — the warm success cue at the moment the delivery completes.
      haptic("success");
      setCode("");
      setOtpTries(0);
      // Freeze the just-delivered snapshot so the acknowledgement + rate-the-sender terminal survives
      // the refresh() below (which returns null once the order leaves the active feed).
      if (orderRef.current) setDeliveredDone(orderRef.current);
      refresh();
    },
    onError: (e) => {
      // 409 = "Order is not ready for delivery" — thrown when the order isn't en_route_dropoff. A
      // client-side timeout retry can land here after the server already committed the delivery on the
      // FIRST attempt: the rider sees a scary generic conflict, then `refresh()` (activeForRider
      // excludes `delivered`) drops straight to "No active job" with zero acknowledgement the parcel
      // arrived. Reconcile by checking the order directly — if it's actually delivered/completed,
      // that's a success, not a failure.
      if (e instanceof ApiError && e.status === 409 && orderId) {
        const failedOrderId = orderId;
        void getOrder(failedOrderId)
          .then((fresh) => {
            if (fresh.status === "delivered" || fresh.status === "completed") {
              haptic("success");
              setCode("");
              setOtpTries(0);
              setError(null);
              // Same frozen terminal as the happy path — the reconciled snapshot IS a delivered order,
              // so land the rider on the acknowledgement screen, not just a toast that a refresh wipes.
              setDeliveredDone(fresh);
              toast.show("Looks like that delivery already went through.", "success");
            } else {
              fail(e);
            }
            refresh();
          })
          .catch(() => {
            fail(e);
            refresh();
          });
        return;
      }
      // 403 = the 5-attempt lockout; the customer must re-issue the code. 401 = a wrong code — count it
      // so the rider sees how many tries remain and the field locks at the cap instead of hammering a
      // dead endpoint. Anything else is an unexpected failure.
      if (e instanceof ApiError && e.status === 403) {
        haptic("warning");
        setOtpTries(DELIVERY_OTP_MAX_ATTEMPTS);
        setError("Too many attempts — ask the customer to re-issue the delivery code.");
      } else if (e instanceof ApiError && e.status === 401) {
        // A firmer double so a wrong code is felt, not just read — useful at a noisy hand-off.
        haptic("warning");
        setOtpTries((n) => n + 1);
        setError(null);
      } else {
        fail(e);
      }
      refresh();
    },
  });
  const cancelM = useMutation({
    mutationFn: () => {
      const reason = bailReason.trim();
      return cancelOrder(orderId!, reason ? { reason } : {});
    },
    onSuccess: (res) => {
      // If this cancel tripped the no-show cooldown, tell the rider now — with the concrete time they
      // can go back online — instead of letting them discover a silent multi-hour lockout later. The
      // server owns the duration (COOLDOWN_MS); we just surface the `cooldownUntil` it already returns.
      if (res.cooldownUntil) {
        haptic("warning");
        toast.show(`You've been taken offline until ${fmtClock(res.cooldownUntil)} after cancelling too many jobs.`, "warning");
      }
      refresh();
    },
    onError: fail,
  });
  // 4·7: optional, recorded-only rate-the-sender. Doesn't change status or gate anything.
  const senderRateM = useMutation({
    // Rate against the frozen delivered snapshot's id when we're on that terminal (orderId is null
    // there — the delivered order has left the active feed); fall back to the live order otherwise.
    mutationFn: (score: number) => rateSender(deliveredDone?.id ?? orderId!, { score }),
    onError: fail,
  });
  // R1: record a failed hand-off. On success we freeze a terminal (the order leaves the active feed).
  const undeliverM = useMutation({
    mutationFn: (reason: UndeliveredReason) => markUndelivered(orderId!, reason),
    onSuccess: (_res, reason) => {
      setUndelivering(false);
      setUndeliveredDone(reason);
    },
    onError: (e) => {
      setUndelivering(false);
      fail(e);
      refresh();
    },
  });
  // Reset the per-order UI counters whenever the active job changes.
  useEffect(() => {
    setOtpTries(0);
    setUndelivering(false);
  }, [orderId]);

  // Sync the local retry counter DOWN whenever the server's committed count is lower than what we
  // have locally — e.g. the customer just re-issued the delivery code (rotateDeliveryCode resets
  // deliveryOtpAttempts to 0 server-side), which this screen previously had no way to learn: the
  // lockout stayed permanently stuck on the same screen instance, contradicting its own "enter the
  // new one" copy. The local optimistic increment on a 401 (above) stays for instant feedback; this
  // only ever pulls the count DOWN toward the server's truth, never up.
  useEffect(() => {
    const serverAttempts = order?.deliveryOtpAttempts;
    if (serverAttempts != null && serverAttempts < otpTries) setOtpTries(serverAttempts);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reconcile against the server value only; otpTries itself must not retrigger this.
  }, [order?.deliveryOtpAttempts]);

  // Default every item ticked when the rider enters the pickup-verification step — they untick only
  // what's missing. Keyed on primitives so a 6s poll (new object identity, same data) doesn't reset
  // the rider's manual ticks mid-verification.
  useEffect(() => {
    if (order?.status === "en_route_pickup" && items.length > 0) {
      setCheckedItems(new Set(items.map((_, i) => i)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed once per order/step, not per poll.
  }, [order?.id, order?.status, items.length]);

  const toggleItem = (i: number): void => {
    setCheckedItems((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };
  // Confirm the ticked items, then advance to picked_up. The confirmation POST is best-effort
  // (TODO(api): route pending) so it never blocks the collect; the advance is gated on ≥1 tick.
  const confirmAndCollect = (): void => {
    if (!orderId || checkedItems.size === 0) return;
    const confirmedIndexes = [...checkedItems].sort((a, b) => a - b);
    void confirmItems(orderId, { confirmedIndexes }).catch(() => undefined);
    advanceM.mutate("picked_up");
  };

  // Terminal: the customer (or ops) cancelled. Rendered from the frozen WS snapshot (keeps the sender
  // contact after the order leaves the active feed), OR — R8 — from a fetched cancelled order when the
  // rider reopens after missing the `job:cancelled` push while backgrounded. activeForRider only
  // surfaces a cancelled order this rider had COLLECTED, so `collected` is true on that reopen path.
  // The reopen path has no WS event to read the actor from — fall back to the order snapshot's own
  // `cancelledBy` (a rider's own bail never reaches this branch: it's blocked post-pickup and takes the
  // rebroadcast path instead, never landing here as "collected").
  const handback =
    cancelledJob ??
    (order && order.status === "cancelled" && !ackedHandbacks.has(order.id)
      ? { collected: true, snapshot: order, cancelledBy: order.cancelledBy === "customer" ? ("customer" as const) : ("admin" as const) }
      : null);
  if (handback) {
    const snap = handback.snapshot;
    return (
      <CancelledHandback
        collected={handback.collected}
        cancelledBy={handback.cancelledBy}
        snapshot={snap}
        onBack={() => {
          // Record that this parcel was handed back so the 24h reopen window doesn't re-prompt the
          // rider on their next visit — then drop back to the board.
          void acknowledgeHandback(snap.id);
          router.replace("/rider");
        }}
      />
    );
  }

  // Terminal: the rider recorded a failed hand-off (R1). Frozen locally — an `undelivered` order leaves
  // the active-job feed, so a refetch would drop to "No active job" with no acknowledgement.
  if (undeliveredDone) {
    return <UndeliveredDone reason={undeliveredDone} onBack={() => router.replace("/rider")} />;
  }

  // Terminal: delivery confirmed. Frozen locally — a `delivered` order leaves the active-job feed, so
  // the post-confirm refetch drops to "No active job" with no acknowledgement the parcel arrived. This
  // is the previously-unreachable delivered UI (Celebrate + rate-the-sender + report/help), now driven
  // from the frozen snapshot ahead of the `!order` check, mirroring the undelivered/cancelled terminals.
  if (deliveredDone) {
    return (
      <Screen>
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: tokens.space.md }}>
            <Heading>Your job</Heading>
            <View style={{ flex: 1 }} />
            <StatusPill status="delivered" tone={orderStatusTone("delivered")} dot />
          </View>
          <Card>
            <Celebrate />
            <Text style={{ fontWeight: "700", color: tokens.color.accentText, textAlign: "center", marginTop: tokens.space.sm }}>Delivered. Waiting for the customer to rate — you're free for the next job.</Text>
          </Card>
          {/* Rate the sender (4·7) — OPTIONAL, recorded-only ("a no-show or cash problem here
              protects other riders"). Tap a star to submit; swaps to a thank-you on success. */}
          <Card>
            <Text style={{ fontWeight: "700", marginBottom: 2 }}>Rate the sender</Text>
            <Sub>Optional — a no-show or cash problem here protects other riders.</Sub>
            {senderRateM.isSuccess ? (
              <Text style={{ fontSize: 14, color: tokens.color.accentText, fontWeight: "600" }}>Thanks for the feedback.</Text>
            ) : (
              <View style={{ flexDirection: "row", gap: 4 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Pressable
                    key={n}
                    onPress={() => {
                      setSenderScore(n);
                      senderRateM.mutate(n);
                    }}
                    disabled={senderRateM.isPending}
                    accessibilityRole="button"
                    accessibilityLabel={`Rate the sender ${n} star${n === 1 ? "" : "s"}`}
                    accessibilityState={{ selected: n <= senderScore }}
                    hitSlop={8}
                    style={{ minWidth: tokens.touchTargetMin, minHeight: tokens.touchTargetMin, alignItems: "center", justifyContent: "center" }}
                  >
                    <Text style={{ fontSize: 30, color: n <= senderScore ? tokens.color.highlight : tokens.color.line }}>★</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </Card>
          {/* Order-level support + report/block after the trip (rider → sender), same as a live delivered order. */}
          <GetHelpControl orderId={deliveredDone.id} />
          <ReportControl orderId={deliveredDone.id} counterpartyNoun="sender" />
          <Button label="Back to board" onPress={() => router.replace("/rider")} />
          <View style={{ height: tokens.space.xxl }} />
        </ScrollView>
      </Screen>
    );
  }

  if (jobQ.isLoading) {
    return (
      <Screen>
        <SkeletonList />
      </Screen>
    );
  }
  // Cold-start fetch failure with NOTHING cached: the job fetch failed, which is not the same as
  // "you have no work". Ordered AFTER the loading and cancelled-terminal (handback / undelivered)
  // checks so those still win — and gated on `!order` so a warm refetch that retains the job (or a
  // successful empty fetch) never lands here. Mirrors the rider board's honest error+retry pattern.
  if (shouldShowJobError(jobQ.isError, order != null)) {
    // Offline cold-start: the fetch failed but we have the last-known job summary. Show it (the root
    // offline banner already explains why it's stale) instead of a bare error — the live query takes
    // over the moment we reconnect.
    if (lastKnownJob) {
      return (
        <Screen>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: tokens.space.md }}>
              <Heading>Your job</Heading>
              <View style={{ flex: 1 }} />
              <StatusPill status={lastKnownJob.status} tone={orderStatusTone(lastKnownJob.status)} />
            </View>
            <Card>
              <Text style={{ fontSize: 14, color: tokens.color.muted, marginBottom: tokens.space.xs, fontVariant: ["tabular-nums"] }}>
                Fare {formatMoney(lastKnownJob.fare)}
              </Text>
              <Text style={{ fontSize: tokens.font.size.body, color: tokens.color.ink }}>
                {lastKnownJob.pickupLandmark || "Pickup"} → {lastKnownJob.dropoffLandmark || "Drop-off"}
              </Text>
              <View style={{ height: tokens.space.sm }} />
              <Sub>Showing your last saved job — we&apos;ll refresh the moment you&apos;re back online.</Sub>
            </Card>
            <Button label="Retry now" onPress={() => void jobQ.refetch()} loading={jobQ.isFetching} />
            <Button label="Back" variant="ghost" onPress={() => router.replace("/rider")} />
          </ScrollView>
        </Screen>
      );
    }
    return (
      <Screen>
        <EmptyState icon="wifi-off" title="Couldn't load your job" message="Check your connection and try again.">
          <Button label="Retry" onPress={() => void jobQ.refetch()} loading={jobQ.isFetching} />
        </EmptyState>
        <Button label="Back" variant="ghost" onPress={() => router.replace("/rider")} />
      </Screen>
    );
  }
  // No live job — either genuinely nothing, or an already-acknowledged hand-back whose cancelled
  // snapshot still lingers in the 24h reopen window (handback resolved to null above). Either way
  // there's nothing to act on, so show the calm empty terminal rather than the collect/deliver flow.
  if (!order || order.status === "cancelled") {
    return (
      <Screen>
        <Heading>No active job</Heading>
        <Sub>Accept an order to start a delivery.</Sub>
        <Button label="Back" onPress={() => router.replace("/rider")} />
      </Screen>
    );
  }

  const next = NEXT[order.status];
  const isActive = ACTIVE.includes(order.status);
  const canUndeliver = order.status === "picked_up" || order.status === "en_route_dropoff";
  // Total quantity across the ticked items — the collect CTA counts pieces, not rows ("Confirm 3
  // items collected" for a 1× + 2× selection).
  const collectedCount = collectedItemCount(items, checkedItems);
  const riderPoint =
    order.rider != null && order.rider.currentLat != null && order.rider.currentLng != null
      ? { lat: order.rider.currentLat, lng: order.rider.currentLng }
      : null;

  const jobReconnecting = isActive && wasJobConnected.current && !jobSocketConnected;

  return (
    <Screen>
      {/* 4·b4: socket dropped mid-job — a muted "live paused" banner, never a red alarm. The job is
          saved locally and syncs on reconnect; the rider keeps riding. */}
      {jobReconnecting ? <OfflineBanner state="reconnecting" /> : null}
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: tokens.space.md }}>
          <Heading>Your job</Heading>
          <View style={{ flex: 1 }} />
          <StatusPill status={order.status} tone={jobReconnecting ? "reconnecting" : orderStatusTone(order.status)} />
        </View>

        {jobReconnecting ? (
          <Card style={{ backgroundColor: tokens.color.surface, borderColor: "transparent" }}>
            <Text style={{ fontSize: tokens.font.size.body, color: tokens.color.muted, lineHeight: 20 }}>
              Live paused — reconnecting. Your job is saved; keep riding and it&apos;ll sync when you&apos;re back on.
            </Text>
          </Card>
        ) : null}

        {/* C5: the customer's app went dark — they may not be seeing your live updates. Soft, muted
            warning (a state, not an alarm); it clears itself on the next status change. */}
        {isActive && customerStale ? (
          <View
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={{ flexDirection: "row", alignItems: "center", gap: tokens.space.sm, padding: tokens.space.sm, borderRadius: tokens.radius.input, backgroundColor: tokens.color.surface, borderWidth: 1, borderColor: tokens.color.line, marginBottom: tokens.space.sm }}
          >
            <Icon name="triangle-alert" size={15} color={tokens.color.muted} />
            <Text style={{ flex: 1, fontSize: tokens.font.size.caption, color: tokens.color.muted, lineHeight: 18 }}>
              The customer&apos;s app looks offline — they may not be seeing live updates. Call them if you need to reach the sender.
            </Text>
          </View>
        ) : null}

        {/* JOURNEY-BUGS: location permission can be revoked (Android "only this time", or toggled off
            in Settings) AFTER a job starts — the GPS stream then silently stops with no signal anywhere
            in the app. Actionable, unlike the customer-stale notice above, since the rider can fix it. */}
        {isActive && locationDenied ? (
          <View
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={{ flexDirection: "row", alignItems: "center", gap: tokens.space.sm, padding: tokens.space.sm, borderRadius: tokens.radius.input, backgroundColor: tokens.color.surface, borderWidth: 1, borderColor: tokens.color.line, marginBottom: tokens.space.sm }}
          >
            <Icon name="triangle-alert" size={15} color={tokens.color.muted} />
            <Text style={{ flex: 1, fontSize: tokens.font.size.caption, color: tokens.color.muted, lineHeight: 18 }}>
              Location is off — the customer can&apos;t see where you are.
            </Text>
            <Pressable onPress={() => void Linking.openSettings()} hitSlop={8}>
              <Text style={{ fontSize: tokens.font.size.caption, fontWeight: tokens.font.weight.bold, color: tokens.color.accent }}>Turn on</Text>
            </Pressable>
          </View>
        ) : null}

        <JobDetailsCard order={order} riderPoint={riderPoint} isActive={isActive} />

        {/* Pickup item verification — between "arrived at pickup" and "collected", the rider ticks the
            sender's items against what's physically in hand. The collect CTA counts them and confirms.
            Legacy orders with no line-items fall back to the plain advance button. */}
        {order.status === "en_route_pickup" && items.length > 0 ? (
          <PickupChecklist
            items={items}
            checkedItems={checkedItems}
            collectedCount={collectedCount}
            pending={advanceM.isPending}
            onToggle={toggleItem}
            onConfirm={confirmAndCollect}
            // §5c optional proof-of-pickup photo — the checklist owns capture/upload; never blocks collect.
            orderId={orderId}
            onCantCollect={() => setBailing(true)}
          />
        ) : next ? (
          <Button label={next.label} onPress={() => advanceM.mutate(next.to)} loading={advanceM.isPending} />
        ) : null}

        {order.status === "en_route_dropoff" ? (
          <DeliveryOtp code={code} onChangeCode={setCode} otpTries={otpTries} pending={deliverM.isPending} onConfirm={() => deliverM.mutate()} senderPhone={order.counterpartyPhone} />
        ) : null}

        {/* R1: post-pickup, the rider needs a way to record a hand-off that can't happen — otherwise a
            refused / unreachable / wrong-address / breakdown job is a dead end. Opens a reason picker
            that commits the terminal `undelivered` state and frees the rider for the next job. */}
        {canUndeliver ? (
          undelivering ? (
            <UndeliveredSheet pending={undeliverM.isPending} onSelect={(reason) => undeliverM.mutate(reason)} onDismiss={() => setUndelivering(false)} />
          ) : (
            <Button label="Can't complete delivery" variant="ghost" onPress={() => setUndelivering(true)} />
          )
        ) : null}

        {/* NOTE: the delivered acknowledgement + rate-the-sender UI is no longer rendered here — a
            `delivered` order leaves the active feed, so this branch was never reached. It now lives in
            the frozen `deliveredDone` terminal above (set from deliverM's success/reconciliation). */}

        {/* SOS on a live run (R-16/F-13) — a deliberate danger control, highest value at the cash
            hand-off. Passes the rider's own live GPS when available. */}
        {isActive ? <SosControl orderId={order.id} lat={riderPoint?.lat} lng={riderPoint?.lng} /> : null}

        {/* 4·b3: pre-pickup bail. The confirm sheet warns about the reliability hit and captures an
            optional reason before the (real, server-side) strike + cooldown land — no more silent
            one-tap penalty. Hidden once the parcel is collected (RIDER_CANCELLABLE), where the escape
            hatch becomes "Can't complete delivery" above. */}
        {RIDER_CANCELLABLE.includes(order.status) ? (
          bailing ? (
            <BailSheet
              reason={bailReason}
              onChangeReason={setBailReason}
              pending={cancelM.isPending}
              onConfirm={() => cancelM.mutate()}
              onDismiss={() => setBailing(false)}
              currentStrikes={meQ.data?.rider?.cancelStrikes}
            />
          ) : (
            <Button label="Cancel job" variant="ghost" onPress={() => setBailing(true)} />
          )
        ) : null}

        {/* Order-level support while the run is live (the post-trip report/help now lives on the
            frozen delivered terminal above, since a delivered order no longer reaches this flow). */}
        {isActive ? <GetHelpControl orderId={order.id} /> : null}
        <LeaveJobButton isActive={isActive} onLeave={() => router.replace("/rider")} />
        <ErrorText message={error} />
        <View style={{ height: tokens.space.xxl }} />
      </ScrollView>
    </Screen>
  );
}
