import { type AdvanceStatusRequest, haversineKm, SOS_POLICY, UndeliveredReason } from "@lynia/shared";
import { tokens } from "@lynia/shared/tokens";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Image, Linking, ScrollView, Text, View } from "react-native";
import { ApiError } from "../../src/api/client";
import { getMe } from "../../src/api/auth";
import { raiseIssue, raiseSos } from "../../src/api/safety";
import { shouldShowJobError } from "../../src/logic/journey";
import {
  clearPickupChecklistDraft,
  loadPickupChecklistDraft,
  savePickupChecklistDraft,
} from "../../src/logic/pickup-checklist-draft";
import { clearPickupPhotoDraft } from "../../src/logic/pickup-photo-draft";
import { ACTIVE, advanceReconciled, DELIVERY_OTP_MAX_ATTEMPTS, parcelCashOnDelivery, RIDER_CANCELLABLE, reconcileConfirmItemsPending, reconcileOtpAttempts, reconcilePendingSenderRating, reconcileRiderJobTerminal } from "../../src/logic/rider-job";
import { type Arrival, type ArrivalMark, AUTO_ADVANCE, clearArrival, loadArrival, parcelStage, REACH_WAIT_MS, saveArrival, stepFor } from "../../src/logic/rider-job-stage";
import { navUrl, useRiderPrefs } from "../../src/logic/rider-prefs";
import { uuidV4FromSeed } from "../../src/util";
import { advanceStatus, cancelOrder, confirmDelivery, confirmItems, getActiveOrder, getOrder, markUndelivered, rateSender, type OrderSnapshot } from "../../src/api/orders";
import { pendingOrQueued } from "../../src/query/client";
import { invalidateRiderJobQueries } from "../../src/query/use-history-feed";
import { usePickupPhoto } from "../../src/query/use-pickup-photo";
import { useWalletConfig } from "../../src/query/use-wallet";
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
import { AppBar, Button, Card, haptic, Heading, Icon, orderStatusTone, Screen, SkeletonList, StatusPill, Sub, useActionError, useToast } from "../../src/ui";
import { useReduceMotion } from "../../src/ui/useReduceMotion";
import { IconDisc, SmBtn, Stars, Tags } from "../../src/ui/order/kit";
import { OrderMap } from "../../src/ui/order/OrderMap";
import { ORDER_COPY as A } from "../../src/ui/order/copy";
import { Notice } from "../../src/ui/send/kit";
import { RIDER_COPY as R, RF, usd } from "../../src/ui/rider/copy";
import { CashLine, MSheet, Progress } from "../../src/ui/rider/kit";
import {
  CodeBoxes,
  CodeError,
  CtaBar,
  CtaButton,
  DangerNote,
  ItemTick,
  JobPage,
  JobShell,
  JobTitle,
  type JobToast,
  KV,
  PhotoPreview,
  PhotoRow,
  ProblemLink,
  ProblemSheet,
  RSteps,
  SosSheet,
  StopCard,
  TerminalBody,
} from "../../src/ui/rider/job-kit";
import { RiderErrorState } from "../../src/ui/rider/RiderErrorState";
import { wasJobRestored } from "../../src/ui/rider/job-resume";
import { ReportSheet } from "../../src/ui/safety";

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
  const [, setUndelivering] = useState(false);
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
  // The cancel reason the old bail sheet captured; the v2 cancel sheet (X6) draws none, so it stays empty.
  const [bailReason] = useState("");
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

  // Seed the pickup check when the rider reaches it — unticked (Rider v2 A2) — UNLESS a persisted
  // draft for this exact order says otherwise (a relaunch after a
  // process death mid-verification). Keyed on primitives so a 6s poll (new object identity, same data)
  // doesn't reset the rider's manual ticks mid-verification. Waits on checklistDraft leaving "loading"
  // so it never seeds all-ticked first and then visibly flips once the async read resolves.
  useEffect(() => {
    if (checklistDraft === "loading") return;
    if (order?.status === "en_route_pickup" && items.length > 0) {
      if (checklistDraft && checklistDraft.orderId === order.id) {
        setCheckedItems(new Set(checklistDraft.checkedIndexes.filter((i) => i < items.length)));
      } else {
        // Rider v2 A2: the check starts unticked — the rider ticks what is in hand (A6 shows it ticked).
        setCheckedItems(new Set());
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

  // ── Rider v2 (ledger D-54): arrivals, the sheets, the can't-reach timer and the pickup photo ──────
  const { prefs } = useRiderPrefs();
  const reduceMotion = useReduceMotion();
  const { config: walletConfig } = useWalletConfig();
  const photo = usePickupPhoto(orderId, order?.pickupPhotoUrl);
  const [arrival, setArrival] = useState<ArrivalMark | null | "loading">("loading");
  useEffect(() => {
    let alive = true;
    void loadArrival().then((m) => {
      if (alive) setArrival(m);
    });
    return () => {
      alive = false;
    };
  }, []);
  const arrived: Arrival | null = arrival !== "loading" && arrival && arrival.orderId === orderId ? arrival.at : null;
  const markArrived = (at: Arrival): void => {
    if (!orderId) return;
    const m = { orderId, at };
    setArrival(m);
    void saveArrival(m);
    setRestoreDismissed(true);
    haptic("tap");
  };
  const [sheet, setSheet] = useState<null | "problem" | "cancel" | "undeliver" | "report" | "sos">(null);
  const [reach, setReach] = useState<{ startedAt: number; calls: number; wa: number } | null>(null);
  const [undelPick, setUndelPick] = useState<number | null>(null);
  const [jobToast, setJobToast] = useState<JobToast | null>(null);
  useEffect(() => {
    if (!jobToast) return;
    const t = setTimeout(() => setJobToast(null), 4000);
    return () => clearTimeout(t);
  }, [jobToast]);
  // The last live snapshot, for the done / undelivered terminals once the order leaves the active feed.
  const lastOrder = useRef<OrderSnapshot | null>(null);
  if (order) lastOrder.current = order;
  const liveReconnecting = !!order && ACTIVE.includes(order.status) && wasJobConnected.current && !jobSocketConnected;
  const [offlineSince, setOfflineSince] = useState<number | null>(null);
  useEffect(() => {
    setOfflineSince((cur) => (liveReconnecting ? (cur ?? Date.now()) : null));
  }, [liveReconnecting]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!reach && offlineSince == null) return;
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [reach, offlineSince]);
  // The server's own steps the handoff draws no tap for: accept → heading to pickup on open, and
  // collected → heading to the drop-off right after the collect. Once per (order, status).
  const autoKey = useRef<string | null>(null);
  useEffect(() => {
    if (!order) return;
    const to = AUTO_ADVANCE[order.status];
    const key = `${order.id}:${order.status}`;
    if (!to || autoKey.current === key || advanceM.isPending) return;
    autoKey.current = key;
    advanceM.mutate(to);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the order's id + status only.
  }, [order?.id, order?.status, advanceM.isPending]);
  const backToJobs = (): void => {
    void clearRiderJobTerminal();
    void clearArrival();
    router.replace("/rider");
  };

  // D5 redirect (see the effect above) — render nothing of this parcel screen for a food order; the
  // brief frame before the effect's router.replace() lands just shows the skeleton.
  if (order && order.orderType === "merchant") {
    return (
      <Screen>
        <SkeletonList />
      </Screen>
    );
  }

  const senderName = (order ?? lastOrder.current)?.customerFirstName || null;
  const senderPhone = (order ?? lastOrder.current)?.counterpartyPhone ?? null;
  const dial = (phone: string | null | undefined): void => {
    if (phone) void Linking.openURL(`tel:${phone}`).catch(() => undefined);
  };
  const wa = (phone: string | null | undefined): void => {
    const digits = (phone ?? "").replace(/\D/g, "");
    if (digits) void Linking.openURL(`https://wa.me/${digits}`).catch(() => undefined);
  };

  // X9 — the customer (or ops) cancelled. Rendered from the frozen WS snapshot (keeps the sender
  // contact after the order leaves the active feed), OR — R8 — from a fetched cancelled order when the
  // rider reopens after missing the `job:cancelled` push while backgrounded.
  const handback =
    cancelledJob ??
    (order && order.status === "cancelled" && ackedHandbacks !== "loading" && !ackedHandbacks.has(order.id)
      ? { collected: true, snapshot: order, cancelledBy: order.cancelledBy === "customer" ? ("customer" as const) : ("admin" as const) }
      : null);
  if (handback) {
    const snap = handback.snapshot;
    const name = snap.customerFirstName || R.theSender;
    const title = handback.cancelledBy === "customer" ? RF.custCxT(name) : R.cancelled;
    const leave = (): void => {
      // Record that this parcel was handed back so the 24h reopen window doesn't re-prompt the rider.
      void acknowledgeHandback(snap.id);
      void clearArrival();
      router.replace("/rider");
    };
    return (
      <JobPage
        title={title.length > 22 ? R.tDone : title}
        onBack={leave}
        centred
        bar={
          <CtaBar>
            <CtaButton label={R.nextJobs} onPress={leave} />
            {handback.collected && snap.counterpartyPhone ? <CtaButton ghost icon="phone" label={RF.callName(name)} onPress={() => dial(snap.counterpartyPhone)} /> : null}
          </CtaBar>
        }
      >
        <TerminalBody icon="x" title={title} body={RF.custCxB(name)} note={R.custCxNoStrike} />
      </JobPage>
    );
  }

  // X5 — the rider recorded a failed hand-off (R1). Frozen locally — an `undelivered` order leaves the
  // active-job feed, so a refetch would drop to "No active job" with no acknowledgement.
  if (undeliveredDone) {
    const name = senderName || R.theSender;
    return (
      <JobPage
        title={R.undelDoneT}
        onBack={backToJobs}
        centred
        bar={
          <CtaBar>
            {senderPhone ? <CtaButton icon="phone" label={RF.callName(name)} onPress={() => dial(senderPhone)} /> : null}
            <CtaButton ghost={!!senderPhone} label={R.nextJobs} onPress={backToJobs} />
          </CtaBar>
        }
      >
        <TerminalBody icon="package" title={R.undelDoneT} body={RF.undelDoneB(name)} note={R.undelNoStrike} />
      </JobPage>
    );
  }

  // A13 — delivery confirmed. Frozen locally — a `delivered` order leaves the active-job feed.
  if (deliveredDone) {
    const snap = lastOrder.current && lastOrder.current.id === deliveredDone ? lastOrder.current : null;
    const fare = snap ? Number(snap.agreedFare ?? snap.proposedFare) : null;
    const rate = walletConfig?.ratePct ?? 0;
    const name = senderName || R.theSender;
    const rated = senderRatingConfirmed || senderRateM.isSuccess;
    return (
      <JobPage title={R.tDone} onBack={backToJobs} bar={<CtaBar><CtaButton label={R.nextJobs} onPress={backToJobs} /></CtaBar>}>
        <ScrollView contentContainerStyle={{ gap: 14, paddingTop: 6 }} showsVerticalScrollIndicator={false}>
          <View style={{ alignItems: "center", gap: 10 }}>
            <IconDisc name="circle-check" tone="ok" size={64} />
            <Text accessibilityRole="header" style={{ fontSize: 22, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, textAlign: "center" }}>{R.doneT}</Text>
          </View>
          {fare != null ? (
            <>
              <View style={{ backgroundColor: tokens.color.accentWash, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 16, flexDirection: "row", alignItems: "baseline" }}>
                <Text style={{ flex: 1, fontSize: 15, fontWeight: tokens.font.weight.semibold, color: tokens.color.accentText }}>{R.doneEarn}</Text>
                <Text style={{ fontSize: 28, fontWeight: tokens.font.weight.bold, color: tokens.color.accentText, fontVariant: ["tabular-nums"] }}>+{usd(fare)}</Text>
              </View>
              <View style={{ paddingHorizontal: 4 }}>
                <KV k={R.doneCash} v={usd(fare)} />
                {rate > 0 ? <KV k={R.doneComm} v={`−${usd((fare * rate) / 100)}`} /> : null}
              </View>
            </>
          ) : null}
          <View style={{ borderTopWidth: 1, borderTopColor: tokens.color.line, paddingTop: 14, gap: 6, alignItems: "center" }}>
            <Text style={{ fontSize: 16, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>{RF.rateSender(name)}</Text>
            <Stars
              value={senderScore}
              onChange={(n) => {
                if (rated || senderRateM.isPending) return;
                setSenderScore(n);
                // BH-07: persist BEFORE the POST resolves so a full app-kill (not just a lost response)
                // is retried on the next launch by the reconciliation effect above.
                void saveSenderRatingPending(deliveredDone, n);
                setPendingSenderRating({ orderId: deliveredDone, score: n });
                senderRateM.mutate(n);
              }}
            />
            <Text style={{ fontSize: 12, color: tokens.color.muted }}>{A.optional}</Text>
          </View>
        </ScrollView>
      </JobPage>
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
  // "you have no work". Ordered AFTER the loading and terminal checks so those still win.
  if (shouldShowJobError(jobQ.isError, order != null)) {
    // Offline cold-start: the fetch failed but we have the last-known job summary. Show it instead of a
    // bare error — the live query takes over the moment we reconnect.
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
    return (
      <Screen>
        <RiderErrorState onRetry={() => void jobQ.refetch()} retrying={jobQ.isFetching} onBack={() => router.replace("/rider")} backLabel="Back" />
      </Screen>
    );
  }
  // No live job — first wait for the durable terminal marker and the acknowledged hand-backs to load,
  // so neither screen flashes before the one the next frame would draw.
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

  const isActive = ACTIVE.includes(order.status);
  const stage = parcelStage(order.status, arrived);
  const beforePickup = RIDER_CANCELLABLE.includes(order.status);
  const fare = Number(order.agreedFare ?? order.proposedFare);
  const cod = parcelCashOnDelivery(order);
  const pickupPhone = (order.pickup as { contactPhone?: string | null }).contactPhone ?? order.counterpartyPhone;
  const dropPhone = (order.dropoff as { contactPhone?: string | null }).contactPhone ?? null;
  const name = senderName || R.theSender;
  const recipient = R.theRecipient;
  const away = (to: { lat: number; lng: number }): string | null => {
    if (!riderPoint) return null;
    const kmAway = haversineKm(riderPoint, to);
    return RF.away(kmAway, Math.max(1, Math.round(kmAway * 5)));
  };
  const nav = (to: { lat: number; lng: number }): void => void Linking.openURL(navUrl(prefs.navApp, to)).catch(() => undefined);
  const itemsOk = items.length === 0 || checkedItems.size > 0;
  const collectOk = itemsOk && !!photo.uri && order.status === "en_route_pickup";
  const collect = (): void => {
    if (items.length > 0) confirmAndCollect();
    else {
      void clearPickupPhotoDraft();
      advanceM.mutate("picked_up");
    }
  };
  const help = (): void => {
    setSheet(null);
    void raiseIssue(order.id, { type: "other", description: R.pHelp, idempotencyKey: uuidV4FromSeed(`${order.id}|help|${Math.floor(Date.now() / 60_000)}`) })
      .then(() => setJobToast({ text: R.helpSent, icon: "circle-check" }))
      .catch((e: unknown) => fail(e));
  };
  const sos = (): void => {
    haptic("alert");
    setSheet(null);
    void Linking.openURL(`tel:${SOS_POLICY.emergencyNumber}`).catch(() => undefined);
    void raiseSos(order.id, riderPoint ? { lat: riderPoint.lat, lng: riderPoint.lng } : {}).catch(() => undefined);
  };
  const strikes = meQ.data?.rider?.cancelStrikes ?? 0;
  const finalStrike = strikes >= 2;

  // Notices at the top of the sheet: job restored (X12), connection lost (X10/X11), and the live
  // states the app already knew about (customer offline, location off, a shop's cash on delivery).
  const stageLine = stage === "toPickup" ? R.tToPickup : stage === "atPickup" ? R.tAtPickup : R.tToDrop;
  const notices = (
    <>
      {restoredJobId === order.id && !restoreDismissed && isActive ? <Notice icon="history" tone="wash" text={RF.restored(stageLine.toLowerCase())} /> : null}
      {liveReconnecting ? (
        offlineSince != null && now - offlineSince >= 4 * 60_000 ? <Notice icon="wifi-off" tone="warn" text={R.offlineLong} /> : <Notice icon="wifi-off" text={R.offlineJob} />
      ) : null}
      {isActive && customerStale ? <Notice icon="triangle-alert" text="The customer's app looks offline — they may not be seeing live updates. Call them if you need to reach the sender." /> : null}
      {isActive && locationDenied ? <Notice icon="map-pin" tone="warn" text="Location is off — the customer can't see where you are." /> : null}
      {isActive && cod !== null ? <Notice icon="banknote" text={`Collect $${cod.toFixed(2)} cash from the buyer. It's the shop's money: take it back to the shop within 30 minutes of delivering.`} /> : null}
    </>
  );

  const overlays = (
    <>
      <ProblemSheet
        visible={sheet === "problem"}
        onClose={() => setSheet(null)}
        beforePickup={beforePickup}
        onCancel={() => setSheet("cancel")}
        onReach={() => {
          setReach((r) => r ?? { startedAt: Date.now(), calls: 0, wa: 0 });
          if (!arrived || arrived !== "drop") markArrived("drop");
          setSheet(null);
        }}
        onDeliver={() => {
          setUndelPick(null);
          setSheet("undeliver");
        }}
        onHelp={help}
        onReport={() => setSheet("report")}
        onSos={() => setSheet("sos")}
      />
      <MSheet
        visible={sheet === "cancel"}
        onClose={() => setSheet(null)}
        title={R.cxT}
        body={RF.cxB(name)}
        buttons={
          <>
            <CtaButton label={R.cxKeep} onPress={() => setSheet(null)} />
            <CtaButton ghost danger label={finalStrike ? R.cxYesFinal : R.cxYes} loading={!!pendingOrQueued(cancelM)} onPress={() => cancelM.mutate(undefined, { onSettled: () => setSheet(null) })} />
          </>
        }
      >
        {finalStrike ? <DangerNote text={R.cxFinal} /> : <Notice icon="circle-alert" text={RF.cxStrike(strikes, 3)} />}
      </MSheet>
      <MSheet
        visible={sheet === "undeliver"}
        onClose={() => setSheet(null)}
        title={R.undelT}
        buttons={
          <>
            {undelPick == null ? <Text style={{ fontSize: 13, color: tokens.color.muted, textAlign: "center" }}>{R.undelPick}</Text> : null}
            <CtaButton
              label={R.undelSend}
              disabled={undelPick == null}
              loading={!!pendingOrQueued(undeliverM)}
              onPress={() => {
                const reason = UNDELIVERED_CHOICES[undelPick ?? -1];
                if (reason) undeliverM.mutate(reason, { onSettled: () => setSheet(null) });
              }}
            />
          </>
        }
      >
        <Tags list={R.undelReasons} on={undelPick == null ? [] : [undelPick]} onToggle={(i) => setUndelPick((c) => (c === i ? null : i))} />
        <Notice icon="package" text={RF.undelNext(name)} />
      </MSheet>
      <ReportSheet orderId={order.id} counterpartyNoun="customer" visible={sheet === "report"} onClose={() => setSheet(null)} />
      <SosSheet visible={sheet === "sos"} onClose={() => setSheet(null)} onCall={sos} />
      <PhotoPreview uri={photo.preview?.uri ?? null} saving={photo.saving} onUse={photo.use} onRetake={photo.retake} onClose={photo.cancelPreview} />
    </>
  );

  // A8–A12 — the delivery code, on its own page with the number pad up.
  if (stage === "code" && !reach) {
    const left = DELIVERY_OTP_MAX_ATTEMPTS - otpTries;
    const locked = left <= 0;
    const wrong = otpTries > 0 && code.length === 6 && !deliverM.isPending && !locked;
    const queued = pendingOrQueued(deliverM) === "queued";
    return (
      <JobPage
        title={R.tArriving}
        help
        onBack={() => router.replace("/rider")}
        onHelp={() => setSheet("problem")}
        overlays={overlays}
        toast={jobToast}
        bar={
          locked ? (
            <CtaBar hint={RF.newCodeWait(name)}>
              <CtaButton icon="phone" label={RF.askResend(name)} onPress={() => dial(order.counterpartyPhone)} />
            </CtaBar>
          ) : (
            <CtaBar>
              <CtaButton label={R.confirmCta} disabled={code.length < 6 || order.status !== "en_route_dropoff"} loading={!!pendingOrQueued(deliverM) && !queued} onPress={() => deliverM.mutate()} />
            </CtaBar>
          )
        }
      >
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12 }} showsVerticalScrollIndicator={false}>
          {notices}
          <RSteps cur={2} />
          <JobTitle title={locked ? R.lockedT : RF.codeT(recipient)} body={locked ? RF.lockedB(name, recipient) : RF.codeB} />
          <CodeBoxes value={code} onChange={setCode} error={wrong} locked={locked} />
          {wrong ? <CodeError text={left === 1 ? RF.triesLast(recipient) : RF.triesLeft(left)} /> : null}
          {queued ? (
            <View style={{ flexDirection: "row", gap: 6, justifyContent: "center", alignItems: "center" }}>
              <Icon name="wifi-off" size={14} color={tokens.color.muted} />
              <Text style={{ fontSize: 13, color: tokens.color.muted }}>{R.offlineCode}</Text>
            </View>
          ) : null}
          <CashLine text={RF.cashParcel(fare)} />
        </ScrollView>
      </JobPage>
    );
  }

  // A1 / A2 / A6 / A7 / X3 — the map and the stage sheet.
  const reachElapsed = reach ? Math.max(0, Math.floor((now - reach.startedAt) / 1000)) : 0;
  const reachOpen = reach != null && reachElapsed * 1000 >= REACH_WAIT_MS;
  const title = reach ? R.tArriving : stage === "toPickup" ? R.tToPickup : stage === "atPickup" ? R.tAtPickup : R.tToDrop;
  let content: React.ReactNode;
  let bar: React.ReactNode;
  if (reach) {
    content = (
      <>
        {notices}
        <RSteps cur={2} />
        <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
          <IconDisc name="phone-off" size={48} />
          <Text style={{ flex: 1, fontSize: 20, lineHeight: 26, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>{RF.reachT(R.recipientRole)}</Text>
        </View>
        <Text style={{ fontSize: 14, lineHeight: 20, color: tokens.color.muted }}>{R.reachB}</Text>
        <View style={{ backgroundColor: tokens.color.surface, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, gap: 6 }}>
          <View style={{ flexDirection: "row" }}>
            <Text style={{ flex: 1, fontSize: 13, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink, fontVariant: ["tabular-nums"] }}>{RF.reachWait(Math.min(reachElapsed, REACH_WAIT_MS / 1000))}</Text>
            <Text style={{ fontSize: 13, color: tokens.color.muted }}>{RF.reachCalls(reach.calls, reach.wa)}</Text>
          </View>
          <Progress pct={Math.min(100, (reachElapsed * 1000 * 100) / REACH_WAIT_MS)} />
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <SmBtn
            flex={1}
            kind="fill"
            icon="phone"
            label={R.call}
            onPress={() => {
              setReach((r) => (r ? { ...r, calls: r.calls + 1 } : r));
              dial(dropPhone);
            }}
          />
          <SmBtn
            flex={1}
            icon="message-circle"
            label={R.whatsapp}
            onPress={() => {
              setReach((r) => (r ? { ...r, wa: r.wa + 1 } : r));
              wa(dropPhone);
            }}
          />
        </View>
      </>
    );
    bar = (
      <CtaBar hint={reachOpen ? undefined : R.undelHint}>
        <CtaButton
          ghost
          danger
          label={R.markUndel}
          disabled={!reachOpen}
          onPress={() => {
            setUndelPick(0);
            setSheet("undeliver");
          }}
        />
      </CtaBar>
    );
  } else if (stage === "atPickup") {
    content = (
      <>
        {notices}
        <RSteps cur={0} />
        <Text style={{ fontSize: 18, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>{R.checkItems}</Text>
        {items.map((it, i) => (
          <ItemTick key={i} label={`${it.description} × ${it.quantity}`} on={checkedItems.has(i)} onToggle={() => toggleItem(i)} />
        ))}
        <PhotoRow saved={!!photo.uri} thumb={photo.uri ? <Image source={{ uri: photo.uri }} style={{ width: 56, height: 56 }} accessibilityLabel={R.photoSaved} /> : undefined} onTake={photo.take} />
        {photo.uri && !photo.uploaded && liveReconnecting ? <Notice icon="wifi-off" text={R.photoFail} /> : null}
        <ProblemLink onPress={() => setSheet("problem")} />
      </>
    );
    bar = (
      <CtaBar hint={collectOk || (itemsOk && photo.uri) ? undefined : R.needPhoto}>
        <CtaButton label={R.collectedCta} disabled={!collectOk} loading={!!pendingOrQueued(advanceM)} onPress={collect} />
      </CtaBar>
    );
  } else {
    const pick = stage === "toPickup";
    const target = pick ? order.pickup : order.dropoff;
    const phone = pick ? pickupPhone : dropPhone;
    content = (
      <>
        {notices}
        <RSteps cur={stepFor(stage)} />
        <StopCard
          drop={!pick}
          name={target.landmark}
          line={away(target.point)}
          who={pick ? (senderName ? RF.who(senderName, "sender") : null) : R.recipientRole}
          onCall={phone ? () => dial(phone) : null}
          onWhatsApp={phone ? () => wa(phone) : null}
          onNavigate={() => nav(target.point)}
        />
        <CashLine text={RF.cashParcel(fare)} />
        <ProblemLink onPress={() => setSheet("problem")} />
      </>
    );
    bar = (
      <CtaBar>
        <CtaButton label={pick ? R.atPickupCta : R.atDropCta} onPress={() => markArrived(pick ? "pickup" : "drop")} />
      </CtaBar>
    );
  }

  return (
    <JobShell
      title={title}
      onBack={() => router.replace("/rider")}
      onHelp={() => setSheet("problem")}
      contentKey={`${stage}|${reach ? "r" : ""}|${liveReconnecting ? "o" : ""}`}
      toast={jobToast}
      map={(padBottom) => (
        <OrderMap
          pickup={order.pickup.point}
          dropoff={order.dropoff.point}
          rider={riderPoint}
          riderLabel={R.you}
          riderPaused={liveReconnecting}
          showRider
          toPickupLine={stage === "toPickup"}
          rings={false}
          dim={false}
          frame={stage === "toPickup" || stage === "atPickup" ? "pickupRider" : "riderDrop"}
          padBottom={padBottom}
          reduceMotion={reduceMotion}
        />
      )}
      content={content}
      bar={bar}
      overlays={overlays}
    />
  );
}

/** X4's five reasons, in the order drawn (u1–u5). */
const UNDELIVERED_CHOICES: readonly UndeliveredReason[] = ["unreachable", "refused", "wrong_address", "breakdown", "other"];
