import { type AdvanceStatusRequest, UndeliveredReason } from "@lynia/shared";
import { tokens } from "@lynia/shared/tokens";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { ApiError } from "../../src/api/client";
import { getMe } from "../../src/api/auth";
import { collectedItemCount, shouldShowJobError } from "../../src/logic/journey";
import {
  clearPickupChecklistDraft,
  loadPickupChecklistDraft,
  savePickupChecklistDraft,
} from "../../src/logic/pickup-checklist-draft";
import { clearPickupPhotoDraft } from "../../src/logic/pickup-photo-draft";
import { ACTIVE, advanceReconciled, DELIVERY_OTP_MAX_ATTEMPTS, NEXT, RIDER_CANCELLABLE, reconcileConfirmItemsPending, reconcileOtpAttempts, reconcilePendingSenderRating, reconcileRiderJobTerminal } from "../../src/logic/rider-job";
import { advanceStatus, cancelOrder, confirmDelivery, confirmItems, getActiveOrder, getOrder, markUndelivered, rateSender, type OrderSnapshot } from "../../src/api/orders";
import { pendingOrQueued } from "../../src/query/client";
import { invalidateRiderJobQueries } from "../../src/query/use-history-feed";
import {
  acknowledgeHandback,
  clearConfirmItemsPending,
  clearRiderJobTerminal,
  clearSenderRatingPending,
  loadAcknowledgedHandbacks,
  loadConfirmItemsPending,
  loadRiderJobTerminal,
  loadSenderRatingPending,
  saveConfirmItemsPending,
  saveRiderJobTerminal,
  saveSenderRatingPending,
  type PendingSenderRating,
  type RiderJobTerminal,
} from "../../src/auth/session";
import { fmtClock } from "../../src/logic/format-time";
import { formatMoney } from "../../src/logic/money";
import type { LastActive } from "../../src/logic/last-active";
import { clearLastActiveJob, loadLastActiveJob, saveLastActiveJob } from "../../src/net/last-active-store";
import { useForegroundRefetch } from "../../src/realtime/use-foreground-refetch";
import { useRiderJobSocket } from "../../src/realtime/use-rider-job-socket";
import { useRiderLocationStream } from "../../src/realtime/use-rider-location";
import { AppBar, Button, Card, Celebrate, haptic, Heading, Icon, OfflineBanner, orderStatusTone, Screen, SkeletonList, StatusPill, Sub, useActionError, useToast } from "../../src/ui";
import { RiderActiveParcelCashStripView } from "./active-parcel-cash-strip.view";
import { JobRestoredBanner } from "../../src/ui/rider/JobRestoredBanner";
import { RiderErrorState } from "../../src/ui/rider/RiderErrorState";
import { wasJobRestored } from "../../src/ui/rider/job-resume";
import { DeliveryOtp } from "../../src/ui/rider/DeliveryOtp";
import { JobDetailsCard } from "../../src/ui/rider/JobDetailsCard";
import { LeaveJobButton } from "../../src/ui/rider/LeaveJobButton";
import { PickupChecklist } from "../../src/ui/rider/PickupChecklist";
import { CancelledHandback, UndeliveredDone } from "../../src/ui/rider/terminals";
import { UndeliveredSheet } from "../../src/ui/rider/UndeliveredSheet";
import { BailSheet } from "../../src/ui/rider/BailSheet";
import { GetHelpControl, ReportControl, SosControl } from "../../src/ui/safety";

/** A short local clock label (e.g. "3:40 PM") for a cooldown-until timestamp; empty on a bad date. */
export default function RiderJob(): React.ReactElement {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const [code, setCode] = useState("");
  // Action errors speak once as an auto-dismissing toast, never as a persistent card
  // (owner instruction 2026-08-12). Same `setError(msg)` shape as the useState setter it replaces.
  const setError = useActionError();
  // Pickup item verification: which line-items the rider has ticked as physically collected. Indexes
  // into order.items; defaults to all ticked when the rider reaches the pickup-verification step.
  const [checkedItems, setCheckedItems] = useState<Set<number>>(() => new Set());
  // Persisted mirror of checkedItems (keyed to the order it was ticked against) — a process death mid-
  // verification used to silently revert every manual untick back to "all collected" on relaunch,
  // since the seeding effect below has no memory of anything before the remount. "loading" (not null)
  // until the async SecureStore read settles, so the seeding effect can wait for it instead of racing
  // ahead with the all-ticked default and then visibly flipping.
  const [checklistDraft, setChecklistDraft] = useState<{ orderId: string; checkedIndexes: number[] } | null | "loading">(
    "loading",
  );
  useEffect(() => {
    let alive = true;
    void loadPickupChecklistDraft().then((d) => {
      if (alive) setChecklistDraft(d);
    });
    return () => {
      alive = false;
    };
  }, []);
  // R1: the post-pickup "can't complete delivery" reason picker + the frozen terminal once it commits.
  const [undelivering, setUndelivering] = useState(false);
  const [undeliveredDone, setUndeliveredDone] = useState<UndeliveredReason | null>(null);
  // A successful delivery-confirm freezes the delivered order's id into a terminal (the only field the
  // terminal below actually renders — see GetHelpControl/ReportControl). A `delivered` order drops out
  // of activeForRider (ACTIVE_RIDE_STATUSES excludes it), so the post-confirm refetch returns null and
  // would otherwise blank straight to "No active job" with zero acknowledgement the parcel arrived.
  // Mirrors the undelivered/cancelled frozen terminals below.
  const [deliveredDone, setDeliveredDone] = useState<string | null>(null);
  // Durable across an app kill (see saveRiderJobTerminal in session.ts): loaded once on mount, then
  // promoted into deliveredDone/undeliveredDone below the first time this session sees no active job.
  // Covers the window between the deliver/undeliver mutation's success and the rider actually viewing
  // (or tapping "Back to board" on) the frozen terminal — previously in-memory-only state that an app
  // kill in that window silently erased, including the rate-the-sender affordance.
  const [persistedTerminal, setPersistedTerminal] = useState<RiderJobTerminal | null | "loading">("loading");
  useEffect(() => {
    let alive = true;
    void loadRiderJobTerminal().then((t) => {
      if (alive) setPersistedTerminal(t);
    });
    return () => {
      alive = false;
    };
  }, []);
  // 4·b3: the pre-pickup bail flow — open the reason + reliability-warning sheet before cancelling,
  // and carry the (optional) reason to the server so the customer's re-broadcast has a "why".
  const [bailing, setBailing] = useState(false);
  const [bailReason, setBailReason] = useState("");
  // R9: count wrong delivery-code tries to show attempts-remaining and lock the field at the cap.
  const [otpTries, setOtpTries] = useState(0);
  // Rate-the-sender (4·7): an OPTIONAL post-delivery star, recorded-only — tap-then-submit, no undo.
  const [senderScore, setSenderScore] = useState(0);
  // BH-07: whether the sender rating is confirmed landed — either this session's own POST succeeded, or
  // a retry of a durably-persisted marker (below) hit the server's "already rated" 409, which for a
  // rating (never reversible, one-per-rider) IS confirmation. Drives the thank-you state instead of
  // `senderRateM.isSuccess` alone, which a fresh mount after an app-kill would never see.
  const [senderRatingConfirmed, setSenderRatingConfirmed] = useState(false);
  // A durable "rate-the-sender still pending for order X" marker (persisted the instant the star is
  // tapped, before the POST resolves) so a full app-kill — not just a lost response — retries on the
  // next launch. Loaded once on mount; the guard ref stops the reconcile effect below from overlapping.
  const [pendingSenderRating, setPendingSenderRating] = useState<PendingSenderRating | null>(null);
  const senderRatingRetryInFlight = useRef(false);
  useEffect(() => {
    let alive = true;
    void loadSenderRatingPending().then((p) => {
      if (alive) setPendingSenderRating(p);
    });
    return () => {
      alive = false;
    };
  }, []);
  // R8 follow-up: order ids the rider has already handed back (tapped "Back to board" on). A cancelled
  // order stays reopenable for 24h, so without this its snapshot keeps re-showing the hand-back prompt
  // on every reopen. Loaded once from the device; a fresh WS cancel is never suppressed (only reopens).
  // `"loading"` sentinel for the same reason `persistedTerminal` above has one: an empty Set is a
  // positive claim ("this rider has acknowledged nothing"), so treating the not-yet-read state as one
  // re-shows the full-screen hand-back terminal for an order the rider already handed back, then
  // replaces it with "No active job" once the read lands — two different screens in a row.
  const [ackedHandbacks, setAckedHandbacks] = useState<Set<string> | "loading">("loading");
  useEffect(() => {
    let alive = true;
    void loadAcknowledgedHandbacks().then((ids) => {
      if (alive) setAckedHandbacks(new Set(ids));
    });
    return () => {
      alive = false;
    };
  }, []);

  // KB-CONFIRMITEMS-RETRY: a durable "confirmItems still pending for order X" marker (persisted in
  // confirmAndCollect below). Loaded once on mount so a cold start / foreground after an app-kill can
  // re-send a lost pickup-item confirmation. The guard ref stops overlapping retries.
  const [pendingConfirm, setPendingConfirm] = useState<{ orderId: string; confirmedIndexes: number[] } | null>(null);
  const confirmRetryInFlight = useRef(false);
  useEffect(() => {
    let alive = true;
    void loadConfirmItemsPending().then((p) => {
      if (alive) setPendingConfirm(p);
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
  // B-O2: memoized off the primitive lat/lng, ahead of every early return below (the rules of hooks
  // forbid a hook call after a conditional return) — a fresh `{lat,lng}` object literal every render
  // (even with identical values) would defeat JobDetailsCard's memo boundary for every OTHER re-render
  // this ~950-line screen goes through (a sheet opening, a checklist tick, a banner) that has nothing
  // to do with the rider's actual position.
  const riderPoint = useMemo(
    () =>
      order?.rider != null && order.rider.currentLat != null && order.rider.currentLng != null
        ? { lat: order.rider.currentLat, lng: order.rider.currentLng }
        : null,
    [order?.rider?.currentLat, order?.rider?.currentLng],
  );

  // D5: this screen owns the PARCEL flow only — a food (merchant) job redirects to its own active-job
  // screen, which reuses the Express tracker/Stepper/safety surfaces but drives the food-specific
  // pickup-code/doorstep-handshake/return-leg machinery this file doesn't have. Fires before any
  // terminal/mutation branch below ever sees a food order, so none of this file's parcel-only actions
  // (advanceStatus's NEXT labels, cancelOrder-based bail, the sender-rating terminal) can run against one.
  useEffect(() => {
    if (order && order.orderType === "merchant") router.replace("/rider/food-job");
  }, [order, router]);

  // Load the last-known job summary (persisted below) so an OFFLINE COLD START shows it instead of a
  // bare "couldn't load your job" — only ever rendered in the fetch-error branch, never over live data.
  const [lastKnownJob, setLastKnownJob] = useState<LastActive | null>(null);
  // `offline_resume` (kit r-rider.jsx RR.offline_resume): the SAME slot, read once on mount, also tells
  // us whether an EARLIER app process saw this job live — i.e. the app was killed mid-delivery. Derived
  // here (not in a second effect) so it's measured against the store before this process's own persist
  // effect below can overwrite it. See src/ui/rider/job-resume.ts.
  const [restoredJobId, setRestoredJobId] = useState<string | null>(null);
  const [restoreDismissed, setRestoreDismissed] = useState(false);
  // Gates the persist effect below: this read has to see the PREVIOUS process's `savedAt` before this
  // process is allowed to overwrite it. Both fire on the same mount (the query cache is persisted, so
  // `jobQ.data` can be there on the first commit), and without the gate the write could win the race
  // and silently erase the only evidence the app was ever killed.
  const [resumeChecked, setResumeChecked] = useState(false);
  useEffect(() => {
    let alive = true;
    void loadLastActiveJob().then((la) => {
      if (!alive) return;
      setLastKnownJob(la);
      if (la) setRestoredJobId(wasJobRestored(la, la.id) ? la.id : null);
      setResumeChecked(true);
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
    if (!resumeChecked) return; // let the offline_resume read above see the stored value first
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
  }, [jobQ.data, resumeChecked]);

  // Stream GPS only while the ride is genuinely active — stops on delivered AND cancelled/completed
  // (don't blocklist a single terminal state, or a cancelled job keeps broadcasting the rider's GPS).
  const { permissionDenied: locationDenied } = useRiderLocationStream(order && ACTIVE.includes(order.status) ? orderId : null);

  // The customer (or ops) can cancel anytime (C3). When `job:cancelled` arrives we FREEZE the
  // last-known snapshot into a terminal, because a cancelled order immediately drops out of
  // /orders/mine/active (so a refetch would blank the sender contact needed for a post-pickup hand-back).
  const [cancelledJob, setCancelledJob] = useState<{ collected: boolean; snapshot: OrderSnapshot; cancelledBy: "customer" | "admin" } | null>(null);
  // C5: the customer's app has gone dark on this active job — surface a soft "may be offline" warning
  // so the rider knows the customer might not be seeing live position/status. Cleared on the next
  // status change (the flow progressing implies things are moving again) OR — BH-08 — the moment the
  // matching `presence:recovered` arrives, so the warning doesn't linger for the rest of a long leg
  // sitting at one status just because the customer happened to reconnect mid-leg.
  const [customerStale, setCustomerStale] = useState(false);
  const orderRef = useRef<OrderSnapshot | null>(order);
  orderRef.current = order;
  const { connected: jobSocketConnected } = useRiderJobSocket(
    order && ACTIVE.includes(order.status) ? orderId : null,
    (e) => {
      // cancelledBy is optional on the wire (a not-yet-deployed API server during a rolling rollout
      // won't send it yet) — fall back to the pre-existing "customer" copy in that gap.
      if (orderRef.current) setCancelledJob({ collected: e.collected, snapshot: orderRef.current, cancelledBy: e.cancelledBy ?? "customer" });
    },
    () => setCustomerStale(true),
    // BH-08: clear the warning the instant the customer's app is confirmed back, rather than only on
    // the next status change (which, mid-delivery, can be a long wait at one status).
    () => setCustomerStale(false),
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

  // WD-022: also invalidate the Trip History / Earnings queries wherever the active job is refreshed —
  // deliverM/cancelM/undeliverM all land a terminal status (delivered/cancelled/undelivered) that
  // `historyForUser`/`earningsSummary` immediately reflect, but `["history"]`/`["earnings","summary"]`
  // sat on the same 30s staleTime as every other query with no invalidation trigger of their own, so a
  // rider who'd peeked at either screen shortly before could see it miss the trip they just finished.
  const refresh = (): void => invalidateRiderJobQueries(qc);

  // Warm-resume: refetch the active job the moment the app returns to foreground. Without this, a job
  // the customer cancelled while we were backgrounded serves its stale (still-live) cache for up to the
  // 6s poll — briefly re-exposing advance/OTP controls on a dead order — before flipping to the R8
  // hand-back. Invalidating on resume makes the terminal appear immediately; reuses `refresh()` so a
  // delivery/cancel/undeliver that landed while backgrounded also self-heals Trip History/Earnings.
  useForegroundRefetch(refresh);
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
    // BH-16: clear a stale error from an earlier reconciled/failed attempt once a later advance actually
    // succeeds — mirrors deliverM/undeliverM/senderRateM, none of which leave a permanent error banner
    // behind once the server confirms the real state moved on.
    onSuccess: () => setError(null),
    onError: (e, to, ctx) => {
      // Restore the snapshot (incl. a legitimate null), but never write `undefined` back over the cache.
      if (ctx?.prev !== undefined) qc.setQueryData(["activeJob"], ctx.prev);
      // BH-16: 409 = "Order changed, retry" — thrown when the CAS edge no longer matches, which a lost-
      // response timeout retry can hit right after the server already committed THIS SAME advance on the
      // first attempt. Mirrors deliverM/undeliverM's reconciliation: check the order directly, and if it
      // already reached (or passed) the requested step, that's a success, not a failure — an unreconciled
      // 409 here left a permanent "Couldn't update this delivery" banner even after onSettled's refresh()
      // silently self-healed the status underneath it.
      if (e instanceof ApiError && e.status === 409 && orderId) {
        const failedOrderId = orderId;
        void getOrder(failedOrderId)
          .then((fresh) => {
            if (advanceReconciled(fresh.status, to)) setError(null);
            else fail(e);
            refresh();
          })
          .catch(() => {
            fail(e);
            refresh();
          });
        return;
      }
      fail(e);
      refresh();
    },
    onSettled: refresh,
  });
  const deliverM = useMutation({
    mutationFn: () => confirmDelivery(orderId!, code.trim()),
    // LC-C07: write the terminal marker BEFORE the request fires, not just on success/409-reconcile —
    // an app kill strictly between sending confirmDelivery and processing any response previously left
    // no marker at all, so reconcileRiderJobTerminal (which only PROMOTES an existing marker once the
    // order leaves the active feed) had nothing to recover the acknowledgement/rate-the-sender screen
    // from on relaunch, even though the delivery had actually landed server-side. Safe to write eagerly:
    // reconcileRiderJobTerminal still gates on `hasActiveOrder`, so a marker written for a request that
    // in fact failed (order still active) just sits inert until a definitive rejection below clears it.
    onMutate: () => {
      if (orderRef.current) void saveRiderJobTerminal({ orderId: orderRef.current.id, kind: "delivered" });
    },
    onSuccess: () => {
      // The hand-off landed — the warm success cue at the moment the delivery completes.
      haptic("success");
      setCode("");
      setOtpTries(0);
      // Freeze the just-delivered order id so the acknowledgement + rate-the-sender terminal survives
      // the refresh() below (which returns null once the order leaves the active feed) — the durable
      // marker was already written in onMutate above, ahead of this response.
      if (orderRef.current) setDeliveredDone(orderRef.current.id);
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
              // The durable marker was already written in onMutate; no need to rewrite it here.
              setDeliveredDone(fresh.id);
              toast.show("Looks like that delivery already went through.", "success");
            } else {
              // Definitive: the reconciliation check confirms this attempt did NOT deliver — roll back
              // the provisional marker onMutate wrote so it can't later mislead reconcileRiderJobTerminal
              // if the order goes inactive for some unrelated reason (e.g. cancelled).
              fail(e);
              void clearRiderJobTerminal();
            }
            refresh();
          })
          .catch(() => {
            // The reconciliation check ITSELF failed (still offline/timed out) — genuinely ambiguous, so
            // leave the provisional marker in place rather than guessing; it stays inert while the order
            // remains active and self-heals on the next successful reconciliation or foreground refetch.
            fail(e);
            refresh();
          });
        return;
      }
      // 403 = the 5-attempt lockout; the customer must re-issue the code. 401 = a wrong code — count it
      // so the rider sees how many tries remain and the field locks at the cap instead of hammering a
      // dead endpoint. Anything else is an unexpected failure. 403/401 are both definitive non-409
      // rejections — this attempt did not deliver — so roll back the provisional onMutate marker.
      if (e instanceof ApiError && e.status === 403) {
        haptic("warning");
        setOtpTries(DELIVERY_OTP_MAX_ATTEMPTS);
        setError("Too many attempts — ask the customer to re-issue the delivery code.");
        void clearRiderJobTerminal();
      } else if (e instanceof ApiError && e.status === 401) {
        // A firmer double so a wrong code is felt, not just read — useful at a noisy hand-off.
        haptic("warning");
        setOtpTries((n) => n + 1);
        setError(null);
        void clearRiderJobTerminal();
      } else {
        // Ambiguous (network error/timeout/5xx) — the request may or may not have reached the server.
        // Leave the provisional marker in place: if it silently succeeded, reconcileRiderJobTerminal
        // recovers the acknowledgement screen once the order leaves the active feed; if it didn't, the
        // order stays active and the marker never promotes.
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
    onError: (e) => {
      // A timed-out/dropped response can land here after the server already committed the cancel — the
      // three sibling mutations below all re-sync the cache on error; this one silently didn't, leaving
      // the rider stuck on a BailSheet whose "Confirm cancellation" retry can now only ever 409.
      fail(e);
      refresh();
    },
  });
  // 4·7: optional, recorded-only rate-the-sender. Doesn't change status or gate anything.
  const senderRateM = useMutation({
    // Rate against the frozen delivered order id when we're on that terminal (orderId is null there —
    // the delivered order has left the active feed); fall back to the live order otherwise.
    mutationFn: (score: number) => rateSender(deliveredDone ?? orderId!, { score }),
    onSuccess: () => {
      setSenderRatingConfirmed(true);
      setPendingSenderRating(null);
      void clearSenderRatingPending();
    },
    onError: (e) => {
      // BH-07: a 409 here means "Order already rated" — for a one-per-rider, never-reversible rating,
      // that's confirmation the tap (or an earlier lost-response retry of it) already landed, not a
      // failure. Mirrors deliverM/undeliverM's 409-reconciliation: show the thank-you state instead of
      // rolling back the star with a scary, unrecoverable-looking error.
      if (e instanceof ApiError && e.status === 409) {
        setSenderRatingConfirmed(true);
        setPendingSenderRating(null);
        void clearSenderRatingPending();
        return;
      }
      // The tap fills the star optimistically (setSenderScore below); roll it back on genuine failure so
      // a failed POST doesn't leave a falsely-filled star with no acknowledgement — the error toast on the
      // delivered terminal then surfaces why, and the (now-empty) stars invite a retry. The durable
      // marker (saved on tap, below) survives to retry this on the next reconciliation/relaunch.
      setSenderScore(0);
      fail(e);
    },
  });
  // BH-07: re-send a pending sender rating against the frozen delivered terminal. Fires once the marker
  // matches the terminal this session resolved and hasn't been confirmed yet, so a rating dropped by a
  // full app-kill self-heals the next time the rider is on that same terminal (cold start included, since
  // reconcileRiderJobTerminal above promotes it right back from its own durable marker).
  useEffect(() => {
    const decision = reconcilePendingSenderRating({
      pending: pendingSenderRating,
      deliveredOrderId: deliveredDone,
      confirmed: senderRatingConfirmed,
    });
    if (decision !== "retry" || !pendingSenderRating || senderRatingRetryInFlight.current) return;
    senderRatingRetryInFlight.current = true;
    const { orderId: pid, score } = pendingSenderRating;
    void rateSender(pid, { score })
      .then(() => {
        setSenderScore(score);
        setSenderRatingConfirmed(true);
        setPendingSenderRating(null);
        void clearSenderRatingPending();
      })
      .catch((e) => {
        // Same 409-is-confirmation reasoning as the mutation's own onError above.
        if (e instanceof ApiError && e.status === 409) {
          setSenderScore(score);
          setSenderRatingConfirmed(true);
          setPendingSenderRating(null);
          void clearSenderRatingPending();
        }
        // Any other failure (offline, 5xx): leave the marker in place for the next reconciliation pass.
      })
      .finally(() => {
        senderRatingRetryInFlight.current = false;
      });
  }, [pendingSenderRating, deliveredDone, senderRatingConfirmed]);
  // R1: record a failed hand-off. On success we freeze a terminal (the order leaves the active feed).
  const undeliverM = useMutation({
    mutationFn: (reason: UndeliveredReason) => markUndelivered(orderId!, reason),
    onSuccess: (_res, reason) => {
      setUndelivering(false);
      setUndeliveredDone(reason);
      if (orderId) void saveRiderJobTerminal({ orderId, kind: "undelivered", reason });
    },
    onError: (e, reason) => {
      setUndelivering(false);
      // Mirrors deliverM's reconciliation: a timeout/retry can land here after the server already
      // committed the undelivered CAS on the first attempt (409 "Order changed, retry"). Without this,
      // the rider saw a scary generic conflict and then a refresh (activeForRider excludes
      // `undelivered`) dropped straight to "No active job" with no acknowledgement the hand-off was
      // actually recorded.
      if (e instanceof ApiError && e.status === 409 && orderId) {
        const failedOrderId = orderId;
        void getOrder(failedOrderId)
          .then((fresh) => {
            if (fresh.status === "undelivered") {
              setError(null);
              setUndeliveredDone(reason);
              void saveRiderJobTerminal({ orderId: failedOrderId, kind: "undelivered", reason });
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
      fail(e);
      refresh();
    },
  });
  // Reset the per-order UI counters whenever the active job changes.
  useEffect(() => {
    setOtpTries(0);
    setUndelivering(false);
  }, [orderId]);

  // Promote a durable terminal marker into the live in-memory state the first time this session sees
  // no active job — the reconciliation path for an app kill between the deliver/undeliver mutation's
  // success and the rider viewing the frozen terminal (see the marker's own comment in session.ts).
  // Gated on `!order` so a genuinely live/new job (which can't itself be `delivered`/`undelivered`, per
  // ACTIVE_RIDE_STATUSES) always wins over a stale marker.
  useEffect(() => {
    const promoted = reconcileRiderJobTerminal({
      persistedTerminal,
      jobLoading: jobQ.isLoading,
      hasActiveOrder: order != null,
      alreadyResolved: deliveredDone != null || undeliveredDone != null,
    });
    if (!promoted) return;
    if (promoted.kind === "delivered") setDeliveredDone(promoted.orderId);
    else setUndeliveredDone(promoted.reason);
  }, [jobQ.isLoading, persistedTerminal, order, deliveredDone, undeliveredDone]);

  // KB-OTP-COUNT-SYNC: reconcile the local retry counter against the server's committed count whenever a
  // FRESH snapshot value arrives — in BOTH directions. A DOWN move catches a customer re-issue
  // (rotateDeliveryCode zeroes deliveryOtpAttempts server-side); an UP move catches a lost confirmDelivery
  // response after the server already committed the attempt (the client never saw the 401), which
  // previously left the rider shown more attempts remaining than they really had until a 403 snapped it to
  // the max. Keyed ONLY on the fetched server value (never on otpTries), so the optimistic post-401
  // increment can't retrigger this and get stomped by a stale-lower cached value before its refetch lands.
  useEffect(() => {
    const next = reconcileOtpAttempts({ local: otpTries, serverAttempts: order?.deliveryOtpAttempts });
    if (next != null) setOtpTries(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reconcile on a FRESH server value only; otpTries must NOT retrigger this (that is what avoids stomping the optimistic post-401 increment before its refetch lands).
  }, [order?.deliveryOtpAttempts]);

  // Default every item ticked when the rider enters the pickup-verification step — they untick only
  // what's missing — UNLESS a persisted draft for this exact order says otherwise (a relaunch after a
  // process death mid-verification). Keyed on primitives so a 6s poll (new object identity, same data)
  // doesn't reset the rider's manual ticks mid-verification. Waits on checklistDraft leaving "loading"
  // so it never seeds all-ticked first and then visibly flips once the async read resolves.
  useEffect(() => {
    if (checklistDraft === "loading") return;
    if (order?.status === "en_route_pickup" && items.length > 0) {
      if (checklistDraft && checklistDraft.orderId === order.id) {
        setCheckedItems(new Set(checklistDraft.checkedIndexes.filter((i) => i < items.length)));
      } else {
        setCheckedItems(new Set(items.map((_, i) => i)));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed once per order/step (or once the
    // draft finishes loading), not per poll.
  }, [order?.id, order?.status, items.length, checklistDraft]);

  const toggleItem = (i: number): void => {
    setCheckedItems((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      if (orderId) void savePickupChecklistDraft({ orderId, checkedIndexes: [...next] });
      return next;
    });
  };
  // Confirm the ticked items, then advance to picked_up. The confirmation POST is best-effort so it never
  // blocks the collect; the advance is gated on ≥1 tick. KB-CONFIRMITEMS-RETRY: persist a durable pending
  // marker BEFORE firing (and mirror it into state so a same-session foreground can retry too), then clear
  // it on confirmed success — so a lost response / app-kill right here is re-sent from the retry effect
  // below rather than silently losing the confirmed-items record.
  const confirmAndCollect = (): void => {
    if (!orderId || checkedItems.size === 0) return;
    const confirmedIndexes = [...checkedItems].sort((a, b) => a - b);
    const pendingOrderId = orderId;
    setPendingConfirm({ orderId: pendingOrderId, confirmedIndexes });
    void saveConfirmItemsPending(pendingOrderId, confirmedIndexes);
    // Claim the in-flight guard synchronously so the retry effect below can't fire a duplicate in the brief
    // window before the optimistic advance repaints the status to picked_up.
    confirmRetryInFlight.current = true;
    void confirmItems(pendingOrderId, { confirmedIndexes })
      .then(() => {
        setPendingConfirm((cur) => (cur?.orderId === pendingOrderId ? null : cur));
        void clearConfirmItemsPending();
      })
      .catch(() => undefined)
      .finally(() => {
        confirmRetryInFlight.current = false;
      });
    void clearPickupChecklistDraft();
    // C-O7 (LC-C09): a pending/failed pickup-photo resume marker no longer applies once the rider has
    // moved past this step — leaving it would offer a stale "finish uploading" resume for a job that's
    // already progressed. Harmless either way (single key, overwritten by the next capture), but this
    // keeps the same-order invariant tight.
    void clearPickupPhotoDraft();
    advanceM.mutate("picked_up");
  };

  // KB-CONFIRMITEMS-RETRY: re-send (or retire) a pending pickup-item confirmation against the live
  // snapshot. Fires only when the marker's order is still at `en_route_pickup` with no server record yet
  // (the only window the server accepts confirmItems); clears the marker once the record lands or the
  // pending order is no longer the active job. Re-runs on every snapshot refresh — incl. the warm
  // foreground refetch above — so a dropped confirmation self-heals without a manual retry.
  useEffect(() => {
    const decision = reconcileConfirmItemsPending({ pendingOrderId: pendingConfirm?.orderId, order });
    if (decision === "clear") {
      setPendingConfirm(null);
      void clearConfirmItemsPending();
      return;
    }
    if (decision !== "retry" || !pendingConfirm || confirmRetryInFlight.current) return;
    confirmRetryInFlight.current = true;
    const { orderId: pid, confirmedIndexes } = pendingConfirm;
    void confirmItems(pid, { confirmedIndexes })
      .then(() => {
        setPendingConfirm((cur) => (cur?.orderId === pid ? null : cur));
        void clearConfirmItemsPending();
      })
      .catch(() => undefined)
      .finally(() => {
        confirmRetryInFlight.current = false;
      });
  }, [order, pendingConfirm]);

  // D5 redirect (see the effect above) — render nothing of this parcel screen for a food order; the
  // brief frame before the effect's router.replace() lands just shows the skeleton.
  if (order && order.orderType === "merchant") {
    return (
      <Screen>
        <SkeletonList />
      </Screen>
    );
  }

  // Terminal: the customer (or ops) cancelled. Rendered from the frozen WS snapshot (keeps the sender
  // contact after the order leaves the active feed), OR — R8 — from a fetched cancelled order when the
  // rider reopens after missing the `job:cancelled` push while backgrounded. activeForRider only
  // surfaces a cancelled order this rider had COLLECTED, so `collected` is true on that reopen path.
  // The reopen path has no WS event to read the actor from — fall back to the order snapshot's own
  // `cancelledBy` (a rider's own bail never reaches this branch: it's blocked post-pickup and takes the
  // rebroadcast path instead, never landing here as "collected").
  const handback =
    cancelledJob ??
    (order && order.status === "cancelled" && ackedHandbacks !== "loading" && !ackedHandbacks.has(order.id)
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
    return (
      <UndeliveredDone
        reason={undeliveredDone}
        onBack={() => {
          void clearRiderJobTerminal();
          router.replace("/rider");
        }}
      />
    );
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
            {senderRatingConfirmed || senderRateM.isSuccess ? (
              <Text style={{ fontSize: 14, color: tokens.color.accentText, fontWeight: "600" }}>Thanks for the feedback.</Text>
            ) : (
              <View style={{ flexDirection: "row", gap: 4 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Pressable
                    key={n}
                    onPress={() => {
                      setSenderScore(n);
                      // BH-07: persist BEFORE the POST resolves so a full app-kill (not just a lost
                      // response) is retried on the next launch by the reconciliation effect above.
                      void saveSenderRatingPending(deliveredDone, n);
                      setPendingSenderRating({ orderId: deliveredDone, score: n });
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
          <GetHelpControl orderId={deliveredDone} />
          <ReportControl orderId={deliveredDone} counterpartyNoun="sender" />
          <Button
            label="Back to board"
            onPress={() => {
              void clearRiderJobTerminal();
              router.replace("/rider");
            }}
          />
          {/* A failed rate-the-sender POST writes `error` (senderRateM.onError → fail); surface it here
              the same way live-job errors do — this frozen terminal is the only place that mutation runs. */}
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
          <AppBar onBack={() => router.replace("/rider")} />
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
          </ScrollView>
        </Screen>
      );
    }
    // `generic_error` (kit rider-screens.jsx `GenericError`). Nothing cached, nothing to show — but the
    // rider may well be carrying a parcel, and a failed READ changed nothing server-side. The kit's copy
    // says so ("your active job is safe") instead of leaving that to be inferred from a bare retry.
    return (
      <Screen>
        <RiderErrorState
          onRetry={() => void jobQ.refetch()}
          retrying={jobQ.isFetching}
          onBack={() => router.replace("/rider")}
          backLabel="Back"
        />
      </Screen>
    );
  }
  // No live job — either genuinely nothing, or an already-acknowledged hand-back whose cancelled
  // snapshot still lingers in the 24h reopen window (handback resolved to null above). Either way
  // there's nothing to act on, so show the calm empty terminal rather than the collect/deliver flow.
  // First wait for the durable terminal marker to load — otherwise a delivered/undelivered order whose
  // in-memory state was lost to an app kill would flash "No active job" for a frame before the
  // promotion effect above catches up. `ackedHandbacks` joins it for the mirror-image reason: until
  // that read lands the `handback` derivation above cannot tell an already-acknowledged cancel from a
  // fresh one, and guessing either way paints a screen the next frame contradicts. A fresh WS cancel
  // (`cancelledJob`) resolves `handback` before reaching here, so it is never delayed by this.
  if ((!order || order.status === "cancelled") && (persistedTerminal === "loading" || ackedHandbacks === "loading")) {
    return (
      <Screen>
        <SkeletonList />
      </Screen>
    );
  }
  if (!order || order.status === "cancelled") {
    return (
      <Screen>
        <AppBar onBack={() => router.replace("/rider")} />
        <Heading>No active job</Heading>
        <Sub>Accept an order to start a delivery.</Sub>
      </Screen>
    );
  }

  const next = NEXT[order.status];
  const isActive = ACTIVE.includes(order.status);
  const canUndeliver = order.status === "picked_up" || order.status === "en_route_dropoff";
  // Total quantity across the ticked items — the collect CTA counts pieces, not rows ("Confirm 3
  // items collected" for a 1× + 2× selection).
  const collectedCount = collectedItemCount(items, checkedItems);

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

        {/* `offline_resume`: the app was killed mid-job and relaunched straight back onto it. Distinct
            from the reconnecting banner above — that's a dropped socket, this is a dead process. */}
        {restoredJobId === order.id && !restoreDismissed && isActive ? (
          <JobRestoredBanner onDismiss={() => setRestoreDismissed(true)} />
        ) : null}

        {/* Plan §5 B4 / RIDER-ONE-APP-PLAN.md decision 6: cash-held split, live for the one job a
            rider can carry at a time — the first real (non-zero) figure this component renders
            (the Money tab still shows 0/0 — no feed exists yet for "cash owed across any open
            job"). Parcel cash is always all "yours"; "owed to a kitchen" stays 0 here too — a food
            job's collect-and-return money isn't wired to the rider screen until Lane D5. */}
        {isActive ? (
          <View style={{ marginBottom: tokens.space.md }}>
            {/* RJM active_parcel CashStrip (rider-one-app.jsx J6) — the codegen-adopted, guardrail-locked
                "yours vs owed to a kitchen" split (RJM.active_parcel#cash_strip → active-parcel-cash-strip.view.tsx).
                Same live seam the app already passed CashHeldStrip; pixels unchanged (CashStrip wraps it).
                Parcel cash is always all "yours" (owed 0 — nothing collected-and-returned). */}
            <RiderActiveParcelCashStripView yours={Number(order.agreedFare ?? order.proposedFare)} owed={0} />
          </View>
        ) : null}

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
            pending={pendingOrQueued(advanceM)}
            onToggle={toggleItem}
            onConfirm={confirmAndCollect}
            // §5c optional proof-of-pickup photo — the checklist owns capture/upload; never blocks collect.
            orderId={orderId}
            onCantCollect={() => setBailing(true)}
          />
        ) : next ? (
          <Button label={next.label} onPress={() => advanceM.mutate(next.to)} loading={pendingOrQueued(advanceM)} />
        ) : null}

        {order.status === "en_route_dropoff" ? (
          <DeliveryOtp code={code} onChangeCode={setCode} otpTries={otpTries} pending={pendingOrQueued(deliverM)} onConfirm={() => deliverM.mutate()} senderPhone={order.counterpartyPhone} />
        ) : null}

        {/* R1: post-pickup, the rider needs a way to record a hand-off that can't happen — otherwise a
            refused / unreachable / wrong-address / breakdown job is a dead end. Opens a reason picker
            that commits the terminal `undelivered` state and frees the rider for the next job. */}
        {canUndeliver ? (
          undelivering ? (
            <UndeliveredSheet orderId={orderId ?? undefined} canAttachProof={order.status === "en_route_dropoff"} pending={pendingOrQueued(undeliverM)} onSelect={(reason) => undeliverM.mutate(reason)} onDismiss={() => setUndelivering(false)} />
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
              pending={pendingOrQueued(cancelM)}
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
        <View style={{ height: tokens.space.xxl }} />
      </ScrollView>
    </Screen>
  );
}
