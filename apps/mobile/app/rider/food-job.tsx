import { DELIVERY_OTP_MAX_ATTEMPTS, haversineKm, PICKUP_CODE_DIGITS, SOS_POLICY, type AdvanceStatusRequest, type DoorProofReason, type MerchantOrderResponse } from "@lynia/shared";
import { tokens } from "@lynia/shared/tokens";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Linking, ScrollView, Text, TextInput, View } from "react-native";
import { ApiError } from "../../src/api/client";
import {
  attachFoodPickupProof,
  confirmFoodCollected,
  confirmFoodPickup,
  confirmFoodRiderCash,
  confirmRxSawOriginal,
  disputeFoodCash,
  dropFoodDispatch,
  getFoodOrderAsRider,
  logFoodDoorstepCall,
  reportFoodCustomerRefused,
  reportFoodNoShow,
} from "../../src/api/food-rider";
import { advanceStatus, confirmDelivery, getActiveOrder, rateSender, type OrderSnapshot } from "../../src/api/orders";
import { raiseIssue, raiseSos } from "../../src/api/safety";
import { acknowledgeHandback, loadAcknowledgedHandbacks } from "../../src/auth/session";
import { pendingOrQueued } from "../../src/query/client";
import { usePickupPhoto } from "../../src/query/use-pickup-photo";
import { uploadFoodDoorProof } from "../../src/logic/delivery-proof";
import type { UploadImageSource } from "../../src/logic/image-downscale";
import { useWalletConfig } from "../../src/query/use-wallet";
import { handshakeState, codeEligible } from "../../src/logic/food-doorstep";
import { FOOD_DROPPABLE, foodCashBreakdown, noShowStatus, returnLegNeeded } from "../../src/logic/food-rider-job";
import { ACTIVE, reconcileOtpAttempts } from "../../src/logic/rider-job";
import { type Arrival, type ArrivalMark, AUTO_ADVANCE, clearArrival, type FoodStage, loadArrival, saveArrival, stepFor } from "../../src/logic/rider-job-stage";
import { navUrl, useRiderPrefs } from "../../src/logic/rider-prefs";
import { uuidV4FromSeed } from "../../src/util";
import { invalidateRiderJobQueries } from "../../src/query/use-history-feed";
import { useForegroundRefetch } from "../../src/realtime/use-foreground-refetch";
import { useRiderJobSocket } from "../../src/realtime/use-rider-job-socket";
import { useRiderLocationStream } from "../../src/realtime/use-rider-location";
import { AppBar, haptic, Heading, Icon, Screen, SkeletonList, Sub, Tappable, useActionError, useToast } from "../../src/ui";
import { O, ofFmt } from "../../src/ui/orderflow/copy";
import { CameraStep, OfNote, Shutter, TickRow } from "../../src/ui/rider/proof-kit";
import { useReduceMotion } from "../../src/ui/useReduceMotion";
import { ORDER_COPY as A } from "../../src/ui/order/copy";
import { IconDisc, Stars } from "../../src/ui/order/kit";
import { OrderMap } from "../../src/ui/order/OrderMap";
import { Notice } from "../../src/ui/send/kit";
import { hhmm, RIDER_COPY as R, RF, usd } from "../../src/ui/rider/copy";
import { CashLine, CashSplit, MSheet } from "../../src/ui/rider/kit";
import {
  CodeBoxes,
  CodeError,
  CtaBar,
  CtaButton,
  JobPage,
  JobShell,
  JobTitle,
  type JobToast,
  KV,
  ProblemLink,
  ProblemSheet,
  RSteps,
  SosSheet,
  StopCard,
  TerminalBody,
  WaitLine,
} from "../../src/ui/rider/job-kit";
import { ReturnToRestaurantCard } from "../../src/ui/rider/ReturnToRestaurantCard";
import { type DoorRow, RiderDoorCard } from "../../src/ui/rider/RiderDoorCard";
import { RiderErrorState } from "../../src/ui/rider/RiderErrorState";
import { wasJobRestored } from "../../src/ui/rider/job-resume";
import { clearLastActiveJob, loadLastActiveJob, saveLastActiveJob } from "../../src/net/last-active-store";
import { RiderCashHandshakeCard } from "../../src/ui/food/RiderCashHandshakeCard";
import { UnreachableCustomerCard } from "../../src/ui/food/UnreachableCustomerCard";
import { ReportSheet } from "../../src/ui/safety";

/**
 * D5 — the rider's active FOOD job: accept → navigate → N-16 pickup code → collect → navigate →
 * doorstep handshake → delivery code → delivered → (collect-and-return CASH only) return-the-cash
 * leg → hand-back confirm. Sits alongside job.tsx (the parcel screen) rather than forking it — see
 * job.tsx's own early redirect for the split. Reuses the SAME generic order machinery a parcel does
 * (advanceStatus for assigned→confirmed→en_route_pickup and picked_up→en_route_dropoff, confirmDelivery
 * for the final 6-digit code, rateSender, the safety controls, JobDetailsCard/Stepper via its
 * `jobType` prop) — only the pickup-code gate (N-16), the cash handshake, and the debt/return-leg are
 * genuinely food-specific.
 *
 * Open items (surfaced, not silently decided): no durable app-kill-survives terminal marker like
 * job.tsx's saveRiderJobTerminal (a kill in the narrow window between confirmDelivery landing and this
 * screen freezing its acknowledgement loses that screen on relaunch — debtStatus stays server-enforced
 * either way, so this is a UX-recall gap, not a money-safety one). A-O9: `activeJob` now resyncs on a
 * `useRiderJobSocket` push (a mid-job customer cancel included) instead of a bare 8s poll; `foodQ`
 * (kitchen/cash-handshake fields) and the cash-return-leg poll stay poll-only — deliberately left alone
 * this run since they carry the cash-handshake/debt-ledger state and the lane rules bar trading
 * correctness for bytes on a money-adjacent path.
 *
 * Order flow v2 round 2 (ledger D-59): at the venue the rider ticks "Bag is sealed" and photographs the
 * bag (RD2b–RD2d) — required for shops and pharmacies (the server won't complete their pickup without
 * it, so the code waits on the photo), optional for restaurants; at a pharmacy order's door the rider
 * ticks "I saw the original prescription" before handing over (RD3); and when the code can't be used,
 * "Can't use the code?" asks why and who, then takes the door photo (RD4c/RD4d) — evidence for our team,
 * who then finish the delivery.
 */
export default function RiderFoodJob(): React.ReactElement {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  // Action errors speak once as an auto-dismissing toast, never as a persistent card
  // (owner instruction 2026-08-12). Same `setError(msg)` shape as the useState setter it replaces.
  const setError = useActionError();

  // A-O9: the job socket (below) resyncs `activeJob` on connect/connect_error/order:status already —
  // same fallback discipline as job.tsx's `jobPollFallback` (the parcel sibling) — so only fall back to
  // the plain 8s REST poll while it isn't connected, instead of a redundant round-trip every 8s for the
  // whole active leg.
  const [jobPollFallback, setJobPollFallback] = useState(true);
  const jobQ = useQuery({ queryKey: ["activeJob"], queryFn: getActiveOrder, refetchInterval: jobPollFallback ? 8000 : false });
  const order = jobQ.data ?? null;
  const orderId = order?.id ?? null;

  // job.tsx owns every parcel order — a food order landing there redirects to this screen (see its own
  // early check); the mirror image here in case this screen is reached (deep link, stale bookmark) for
  // a parcel job.
  useEffect(() => {
    if (order && order.orderType !== "merchant") router.replace("/rider/job");
  }, [order, router]);

  const foodQ = useQuery({
    queryKey: ["foodOrderAsRider", orderId],
    queryFn: () => getFoodOrderAsRider(orderId as string),
    enabled: !!orderId && order?.orderType === "merchant",
    refetchInterval: 5000,
  });
  const foodOrder = foodQ.data ?? null;

  const orderRef = useRef<OrderSnapshot | null>(order);
  orderRef.current = order;
  const foodOrderRef = useRef<MerchantOrderResponse | null>(foodOrder);
  foodOrderRef.current = foodOrder;

  const refresh = (): void => {
    invalidateRiderJobQueries(qc);
    if (orderId) void qc.invalidateQueries({ queryKey: ["foodOrderAsRider", orderId] });
  };
  useForegroundRefetch(refresh);

  // B-O2: memoized off the primitive lat/lng — a fresh `{lat,lng}` object literal every render (even
  // with identical values) would defeat JobDetailsCard's memo boundary for every OTHER re-render this
  // screen goes through that has nothing to do with the rider's actual position.
  const riderPoint = useMemo(
    () =>
      order?.rider != null && order.rider.currentLat != null && order.rider.currentLng != null
        ? { lat: order.rider.currentLat, lng: order.rider.currentLng }
        : null,
    [order?.rider?.currentLat, order?.rider?.currentLng],
  );
  const { permissionDenied: locationDenied, getLastFix } = useRiderLocationStream(order && ACTIVE.includes(order.status) ? orderId : null);

  // A-O9: mirrors job.tsx's `useRiderJobSocket` wiring verbatim — the room this joins
  // (`orderRoom(orderId)`) and the events it listens for (`order:status`, `job:cancelled`) are keyed off
  // the shared, orderType-agnostic `Order` row, so the SAME hook subscribes correctly for a food job.
  // Unlike the parcel screen, this screen doesn't freeze a separate `cancelledJob` snapshot on
  // `job:cancelled` — it already reads `order.status === "cancelled"` straight off `activeJob` (see the
  // render branch below), which the generic `order:status` handler's `refetchJob()` keeps current, so
  // the callback here has nothing extra to do.
  const { connected: jobSocketConnected } = useRiderJobSocket(
    order && order.orderType === "merchant" && ACTIVE.includes(order.status) ? orderId : null,
    () => {},
  );
  useEffect(() => {
    setJobPollFallback(!jobSocketConnected);
  }, [jobSocketConnected]);

  const fail = (e: unknown): void => setError(e instanceof ApiError ? e.message : "Couldn't update this delivery. Check your connection and try again.");

  // ── `offline_resume` (kit r-rider.jsx RR.offline_resume) ────────────────────────────────────────
  // Mirrors job.tsx's last-known-job slot exactly: persist once per status transition, clear on a
  // terminal or an authoritative "no job". Two things ride on it — job.tsx's offline cold-start card
  // (a food job now gets the same last-known summary a parcel already did, instead of nothing), and
  // the restore check below. The projection (`toLastActive`) is order-type agnostic: id, status, fare,
  // the two landmarks. Wiped at sign-out with the rest of device state (device-state.ts owns JOB_KEY).
  // Read the slot ONCE on mount, before this process has had a chance to overwrite it — a summary of
  // THIS order written by an earlier process is the proof the app was killed mid-job. See job-resume.ts.
  // `resumeChecked` gates the persist effect below so the write can't beat this read (both fire on the
  // same mount whenever the persisted query cache already has `activeJob`).
  const [restoredJobId, setRestoredJobId] = useState<string | null>(null);
  const [restoreDismissed, setRestoreDismissed] = useState(false);
  const [resumeChecked, setResumeChecked] = useState(false);
  useEffect(() => {
    let alive = true;
    void loadLastActiveJob().then((la) => {
      if (!alive) return;
      if (la) setRestoredJobId(wasJobRestored(la, la.id) ? la.id : null);
      setResumeChecked(true);
    });
    return () => {
      alive = false;
    };
  }, []);

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
    else void clearLastActiveJob();
  }, [jobQ.data, resumeChecked]);

  // ── Pre-pickup drop (D-33) ──────────────────────────────────────────────────────────────────────
  const dropM = useMutation({
    mutationFn: () => dropFoodDispatch(orderId!),
    onSuccess: () => {
      void clearArrival();
      toast.show("Job dropped — it's back with the kitchen for another rider.", "warning");
      router.replace("/rider");
    },
    onError: (e) => fail(e),
  });

  // ── Generic forward advance (assigned→confirmed→en_route_pickup, picked_up→en_route_dropoff) ─────
  const advanceM = useMutation({
    mutationFn: (to: AdvanceStatusRequest["to"]) => advanceStatus(orderId!, to),
    onSuccess: () => setError(null),
    onError: (e) => fail(e),
    onSettled: refresh,
  });

  // ── N-16 pickup code ────────────────────────────────────────────────────────────────────────────
  const [pickupCode, setPickupCode] = useState("");
  const [pickupAttempts, setPickupAttempts] = useState(0);
  useEffect(() => {
    const next = reconcileOtpAttempts({ local: pickupAttempts, serverAttempts: foodOrder?.pickupCodeAttempts });
    if (next != null) setPickupAttempts(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reconcile off a FRESH server value only.
  }, [foodOrder?.pickupCodeAttempts]);
  const confirmPickupM = useMutation({
    mutationFn: () => confirmFoodPickup(orderId!, pickupCode.trim()),
    onSuccess: () => {
      haptic("success");
      setPickupCode("");
      setPickupAttempts(0);
      setError(null);
      setCamera(null);
      refresh();
    },
    onError: (e) => {
      // confirmPickup's own error shapes differ from confirmDelivery's: a wrong code is 400
      // (BadRequestException), the lockout is 403 (ForbiddenException) — not 401/403.
      if (e instanceof ApiError && e.status === 403) {
        haptic("warning");
        setCamera(null);
        setPickupAttempts(DELIVERY_OTP_MAX_ATTEMPTS);
      } else if (e instanceof ApiError && e.status === 400) {
        haptic("warning");
        setCamera(null);
        setPickupAttempts((n) => n + 1);
      } else {
        fail(e);
      }
      refresh();
    },
  });

  // ── Auto-accept "Collected" (no pickup code) ─────────────────────────────────────────────────────
  // The position comes from the GPS stream this screen already runs (useRiderLocationStream) — its
  // freshest fix, else the last one the server has on file — so there's no second permission prompt.
  const [collectedError, setCollectedError] = useState<string | null>(null);
  const collectedM = useMutation({
    mutationFn: (point: { lat: number; lng: number }) => confirmFoodCollected(orderId!, point),
    onSuccess: () => {
      haptic("success");
      setCollectedError(null);
      setError(null);
      setCamera(null);
      refresh();
    },
    onError: (e) => {
      haptic("warning");
      setCamera(null);
      if (e instanceof ApiError && e.status === 409 && e.code === "not_at_restaurant") {
        setCollectedError("You're not at the restaurant yet. Move closer and try again.");
      } else {
        setCollectedError(e instanceof ApiError ? e.message : "Couldn't confirm the pickup — try again.");
      }
      refresh();
    },
  });
  const onCollected = (): void => {
    // Location switched off mid-job: don't fall back to a stale server fix — say so instead.
    const point = locationDenied ? null : (getLastFix() ?? riderPoint);
    if (!point) {
      haptic("warning");
      setCollectedError("We can't find your location. Turn on location and try again.");
      return;
    }
    setCollectedError(null);
    collectedM.mutate(point);
  };

  // ── Order flow v2 RD2b–RD2d: "Bag is sealed" + the sealed-bag photo at the counter ───────────────
  const [camera, setCamera] = useState<null | "bag" | "door">(null);
  const [bagSealed, setBagSealed] = useState(false);
  const bagSealedRef = useRef(false);
  bagSealedRef.current = bagSealed;
  useEffect(() => {
    if (foodOrder?.pickupProof?.bagSealed) setBagSealed(true);
  }, [foodOrder?.pickupProof?.bagSealed]);
  const bagPhoto = usePickupPhoto(order?.orderType === "merchant" ? orderId : null, foodOrder?.pickupProof?.photoUrl, (id, key) =>
    attachFoodPickupProof(id, { key, bagSealed: bagSealedRef.current }),
  );
  const [photoQueued, setPhotoQueued] = useState(false);
  // The phone's camera hands the shot back as a preview; on the camera step it is used straight away.
  useEffect(() => {
    if (camera === "bag" && bagPhoto.preview && !bagPhoto.saving) bagPhoto.use();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires on a fresh shot only.
  }, [camera, bagPhoto.preview]);
  const tickBag = (next: boolean): void => {
    haptic("tap");
    setBagSealed(next);
    if (orderId) void attachFoodPickupProof(orderId, { bagSealed: next }).catch(() => undefined);
  };
  // "I've collected the order": the photo goes up first (a shop's pickup needs it), then the code.
  const collectAfterPhoto = async (): Promise<void> => {
    const ok = await bagPhoto.flush();
    if (!ok && foodOrderRef.current?.pickupProofRequired) {
      setPhotoQueued(true);
      return;
    }
    setPhotoQueued(false);
    if (foodOrderRef.current?.autoAccepted) onCollected();
    else confirmPickupM.mutate();
  };

  // ── Order flow v2 RD3: "I saw the original prescription" at a prescription order's door ─────────
  const rxM = useMutation({
    mutationFn: () => confirmRxSawOriginal(orderId!),
    onSuccess: () => {
      haptic("success");
      refresh();
    },
    onError: (e) => fail(e),
  });

  // ── Order flow v2 RD4c/RD4d: the code can't be used — why, who, and the door photo ───────────────
  const [why, setWhy] = useState<DoorProofReason | null>(null);
  const [handedTo, setHandedTo] = useState("");
  const [doorShot, setDoorShot] = useState<UploadImageSource | null>(null);
  const takeDoorPhoto = (): void => {
    void (async () => {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return;
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.6 });
      const a = result.canceled ? null : result.assets[0];
      if (a) setDoorShot({ uri: a.uri, width: a.width, height: a.height, contentType: a.mimeType === "image/png" ? "image/png" : "image/jpeg" });
    })();
  };
  const doorM = useMutation({
    mutationFn: async () => {
      const reason = why!;
      const name = handedTo.trim();
      await uploadFoodDoorProof(orderId!, doorShot!, { reason, handedTo: name || undefined }, (getLastFix() ?? riderPoint) ?? undefined);
      // Evidence only: our team finishes a delivery made without the code, so they are told now.
      await raiseIssue(orderId!, {
        type: "other",
        description: [O.rd.whyT, O.rd.why[DOOR_REASONS.indexOf(reason)], name ? `${O.rd.whoT} ${name}` : null].filter(Boolean).join(" · "),
        idempotencyKey: uuidV4FromSeed(`${orderId}|door-proof|${reason}`),
      });
    },
    onSuccess: () => {
      haptic("success");
      setCamera(null);
      setDoorShot(null);
      setJobToast({ text: R.helpSent, icon: "circle-check" });
      refresh();
    },
    onError: (e) => fail(e),
  });

  // ── Doorstep dual-confirm handshake (R-04/R-05) ────────────────────────────────────────────────
  const confirmCashM = useMutation({
    mutationFn: () => confirmFoodRiderCash(orderId!),
    onSuccess: () => {
      haptic("success");
      setError(null);
      refresh();
    },
    onError: (e) => {
      fail(e);
      refresh();
    },
  });
  const disputeCashM = useMutation({
    mutationFn: () => disputeFoodCash(orderId!),
    onSuccess: refresh,
    onError: (e) => {
      fail(e);
      refresh();
    },
  });
  const [nowMs, setNowMs] = useState(() => Date.now());
  // RD4a (1): "Hand over the order" is the rider's own tap, kept on this phone (the server has no mark for it).
  const [handedOver, setHandedOver] = useState<{ orderId: string; at: string } | null>(null);

  // ── Delivery code (6-digit, generic — reused verbatim) ─────────────────────────────────────────
  const [deliveryCode, setDeliveryCode] = useState("");
  const [otpTries, setOtpTries] = useState(0);
  useEffect(() => {
    const next = reconcileOtpAttempts({ local: otpTries, serverAttempts: order?.deliveryOtpAttempts });
    if (next != null) setOtpTries(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reconcile off a FRESH server value only.
  }, [order?.deliveryOtpAttempts]);

  // ── Delivered terminal (frozen — `delivered` drops out of the active feed) ────────────────────
  const [deliveredFood, setDeliveredFood] = useState<{
    orderId: string;
    pickupPoint: { lat: number; lng: number } | null;
    merchantCashRule: string | null;
    paymentMethod: string | null;
    merchantGoodsTotal: number | null;
    deliveryFee: number | null;
  } | null>(null);
  const deliverM = useMutation({
    mutationFn: () => confirmDelivery(orderId!, deliveryCode.trim()),
    onSuccess: () => {
      haptic("success");
      setDeliveryCode("");
      setOtpTries(0);
      const fo = foodOrderRef.current;
      const o = orderRef.current;
      if (o) {
        setDeliveredFood({
          orderId: o.id,
          pickupPoint: o.pickup.point,
          merchantCashRule: fo?.merchantCashRule ?? null,
          paymentMethod: fo?.paymentMethod ?? null,
          merchantGoodsTotal: fo?.merchantGoodsTotal ?? null,
          deliveryFee: fo?.deliveryFee ?? null,
        });
      }
      refresh();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 403) {
        haptic("warning");
        setOtpTries(DELIVERY_OTP_MAX_ATTEMPTS);
        setError("Too many attempts — ask the customer to re-issue the delivery code.");
      } else if (e instanceof ApiError && e.status === 401) {
        haptic("warning");
        setOtpTries((n) => n + 1);
        setError(null);
      } else {
        fail(e);
      }
      refresh();
    },
  });
  // RD4b draws no button under the boxes: the sixth digit sends the code. Only once the code may be used
  // (both cash confirms, or a non-cash order) and the order is on its way to the door; a wrong code
  // waits for the rider to change a digit, which sends it again.
  useEffect(() => {
    const o = orderRef.current;
    const fo = foodOrderRef.current;
    if (deliveryCode.length !== 6 || deliverM.isPending || otpTries >= DELIVERY_OTP_MAX_ATTEMPTS) return;
    if (!o || !fo || o.status !== "en_route_dropoff") return;
    if (!codeEligible({ paymentMethod: fo.paymentMethod, customerCashConfirmedAt: fo.customerCashConfirmedAt, riderCashConfirmedAt: fo.riderCashConfirmedAt, cashHandshakeFrozenAt: fo.cashHandshakeFrozenAt })) return;
    // RD3: an approved prescription order is handed over only after the rider saw the original.
    if (fo.prescription?.status === "approved" && !fo.prescription.riderSawOriginalAt) return;
    deliverM.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires on the typed code only.
  }, [deliveryCode]);
  // Poll the return-leg state directly against the frozen order id — `delivered` drops out of
  // activeForRider, so this is a second, independent source of truth, not the `foodQ` above.
  const returnLegQ = useQuery({
    queryKey: ["foodReturnLeg", deliveredFood?.orderId],
    queryFn: () => getFoodOrderAsRider(deliveredFood!.orderId),
    enabled: deliveredFood != null,
    refetchInterval: (q) => (q.state.data ? (returnLegNeeded(q.state.data) ? 5000 : false) : 5000),
  });

  // ── No-show / refusal (N-10/R-08) ──────────────────────────────────────────────────────────────
  // Frozen the same way `deliveredFood` is, and for the same reason: an `undelivered` order drops out
  // of activeForRider on the next poll, taking the restaurant's pin and the cash-rule with it — and
  // those are exactly what the `return_rest` leg below needs to tell the rider where the food goes.
  const [undeliveredFood, setUndeliveredFood] = useState<{
    reason: "unreachable" | "refused";
    orderId: string;
    pickupLandmark: string | null;
    pickupPoint: { lat: number; lng: number } | null;
    merchantCashRule: "collect_and_return" | "pay_upfront" | null;
    merchantGoodsTotal: number | null;
  } | null>(null);
  const freezeUndelivered = (reason: "unreachable" | "refused"): void => {
    const o = orderRef.current;
    const fo = foodOrderRef.current;
    if (!o) return;
    setUndeliveredFood({
      reason,
      orderId: o.id,
      pickupLandmark: o.pickup.landmark || null,
      pickupPoint: o.pickup.point,
      merchantCashRule: fo?.merchantCashRule ?? null,
      merchantGoodsTotal: fo?.merchantGoodsTotal ?? null,
    });
  };
  const logCallM = useMutation({
    mutationFn: () => logFoodDoorstepCall(orderId!),
    onSuccess: refresh,
    onError: (e) => {
      fail(e);
      refresh();
    },
  });
  const noShowM = useMutation({
    mutationFn: () => reportFoodNoShow(orderId!),
    onSuccess: () => {
      freezeUndelivered("unreachable");
      refresh();
    },
    onError: (e) => fail(e),
  });
  const refusedM = useMutation({
    mutationFn: () => reportFoodCustomerRefused(orderId!),
    onSuccess: () => {
      freezeUndelivered("refused");
      refresh();
    },
    onError: (e) => fail(e),
  });

  // The `return_rest` leg's one server-confirmed beat: `collect_and_return` opens a merchant debt at
  // pickup and the merchant's own `confirmGoodsReturned` settles it as `settled_goods`. Polled off the
  // frozen id (the order is out of activeForRider by now), and stopped the moment it's no longer open —
  // same shape as `returnLegQ` on the delivered branch, a separate key because it's a separate leg.
  const goodsReturnQ = useQuery({
    queryKey: ["foodGoodsReturn", undeliveredFood?.orderId],
    queryFn: () => getFoodOrderAsRider(undeliveredFood!.orderId),
    enabled: undeliveredFood != null,
    refetchInterval: (q) => (q.state.data ? (q.state.data.debtStatus === "open" ? 5000 : false) : 5000),
  });

  // ── Rate the customer (optional, recorded-only — mirrors job.tsx's rate-the-sender) ──────────────
  const [customerScore, setCustomerScore] = useState(0);
  const rateM = useMutation({
    mutationFn: (score: number) => rateSender(deliveredFood!.orderId, { score }),
    onError: () => setCustomerScore(0),
  });

  // ── Cancelled-while-active handback (24h reopen window — same activeForRider fallback a
  //    collected-then-cancelled parcel already gets; `collectedAt`/`counterpartyPhone` are generic). ──
  // `"loading"` sentinel, mirroring rider/job.tsx: an empty Set asserts "nothing acknowledged", so the
  // not-yet-read state would re-show the full-screen cancelled terminal for an order this rider already
  // handed back, then swap it out once the read lands.
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

  // B-O8: `nowMs` only feeds the no-show wait-countdown and the cash-handshake card, both reachable
  // only from the main active-job render below — the delivered/undelivered/cancelled-handback terminal
  // screens (and the loading/redirect states above) never read it. Gating the interval on reaching that
  // branch (rather than ticking for the order's whole lifetime) stops the once/sec re-render once the
  // job has nothing left for a clock to drive.
  // A cancelled order this rider has NOT already handed back — the full-screen terminal at the render
  // branch below. False while `ackedHandbacks` is still loading: unknown is not "unacknowledged", and
  // the guard beside that branch holds the screen on a skeleton until the read settles.
  const handbackPending = order != null && order.status === "cancelled" && ackedHandbacks !== "loading" && !ackedHandbacks.has(order.id);
  const needsClock = order != null && !deliveredFood && !undeliveredFood && !handbackPending;
  useEffect(() => {
    if (!needsClock) return;
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [needsClock]);

  // ── Rider v2 (ledger D-54): arrivals, sheets, toast, the auto-advanced server steps ─────────────
  const { prefs } = useRiderPrefs();
  const reduceMotion = useReduceMotion();
  const { config: walletConfig } = useWalletConfig();
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
  const [sheet, setSheet] = useState<null | "problem" | "drop" | "reach" | "report" | "sos" | "why">(null);
  const [jobToast, setJobToast] = useState<JobToast | null>(null);
  useEffect(() => {
    if (!jobToast) return;
    const t = setTimeout(() => setJobToast(null), 4000);
    return () => clearTimeout(t);
  }, [jobToast]);
  const autoKey = useRef<string | null>(null);
  useEffect(() => {
    if (!order || order.orderType !== "merchant") return;
    const to = AUTO_ADVANCE[order.status];
    const key = `${order.id}:${order.status}`;
    if (!to || autoKey.current === key || advanceM.isPending) return;
    autoKey.current = key;
    advanceM.mutate(to);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the order's id + status only.
  }, [order?.id, order?.status, advanceM.isPending]);
  const wasConnected = useRef(false);
  if (jobSocketConnected) wasConnected.current = true;
  const liveReconnecting = !!order && ACTIVE.includes(order.status) && wasConnected.current && !jobSocketConnected;
  const [offlineSince, setOfflineSince] = useState<number | null>(null);
  useEffect(() => {
    setOfflineSince((cur) => (liveReconnecting ? (cur ?? Date.now()) : null));
  }, [liveReconnecting]);
  const backToJobs = (): void => {
    void clearArrival();
    router.replace("/rider");
  };
  const dial = (phone: string | null | undefined): void => {
    if (phone) void Linking.openURL(`tel:${phone}`).catch(() => undefined);
  };
  const wa = (phone: string | null | undefined): void => {
    const digits = (phone ?? "").replace(/\D/g, "");
    if (digits) void Linking.openURL(`https://wa.me/${digits}`).catch(() => undefined);
  };
  const lastOrder = useRef<OrderSnapshot | null>(null);
  if (order) lastOrder.current = order;

  // ── Render ──────────────────────────────────────────────────────────────────────────────────────
  const kitchenName = (o: OrderSnapshot | null): string => o?.merchantName || o?.pickup.landmark || R.kitchen;
  const customer = (order ?? lastOrder.current)?.customerFirstName || R.theCustomer;

  if (deliveredFood) {
    const cashCollect = deliveredFood.paymentMethod === "cash" && deliveredFood.merchantCashRule === "collect_and_return";
    const breakdown = cashCollect ? foodCashBreakdown(deliveredFood) : null;
    const stillOwed = returnLegQ.data ? returnLegNeeded(returnLegQ.data) : cashCollect;
    const snap = lastOrder.current && lastOrder.current.id === deliveredFood.orderId ? lastOrder.current : null;
    // B5 — return the cash: blocking until the kitchen confirms it in its app.
    if (cashCollect && stillOwed && breakdown) {
      const kitchenPhone = (snap?.pickup as { contactPhone?: string | null } | undefined)?.contactPhone ?? null;
      return (
        <JobPage
          title={R.tReturn}
          help
          onBack={() => router.replace("/rider")}
          onHelp={() => setSheet("problem")}
          centred
          bar={
            <CtaBar>
              <CtaButton ghost icon="phone" label={R.callKitchen} disabled={!kitchenPhone} onPress={() => dial(kitchenPhone)} />
            </CtaBar>
          }
          overlays={
            <ProblemSheet
              visible={sheet === "problem"}
              onClose={() => setSheet(null)}
              beforePickup={false}
              food
              onHelp={() => helpFor(deliveredFood.orderId)}
              onReport={() => setSheet("report")}
              onSos={() => setSheet("sos")}
            />
          }
        >
          <TerminalBody icon="banknote" title={RF.returnT(breakdown.owed, kitchenName(snap))} body={R.returnB}>
            <View style={{ alignSelf: "stretch" }}>
              <CashSplit title={R.cashNow} yours={breakdown.kept} owed={breakdown.owed} />
            </View>
            <WaitLine text={R.returnWait} />
          </TerminalBody>
        </JobPage>
      );
    }
    // B6 — delivered.
    const fee = deliveredFood.deliveryFee;
    const rate = walletConfig?.ratePct ?? 0;
    return (
      <JobPage title={R.tDone} onBack={backToJobs} bar={<CtaBar><CtaButton label={R.nextJobs} onPress={backToJobs} /></CtaBar>}>
        <ScrollView contentContainerStyle={{ gap: 14, paddingTop: 6 }} showsVerticalScrollIndicator={false}>
          <View style={{ alignItems: "center", gap: 10 }}>
            <IconDisc name="circle-check" tone="ok" size={64} />
            <Text accessibilityRole="header" style={{ fontSize: 22, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, textAlign: "center" }}>{R.doneT}</Text>
          </View>
          {fee != null ? (
            <>
              <View style={{ backgroundColor: tokens.color.accentWash, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 16, flexDirection: "row", alignItems: "baseline" }}>
                <Text style={{ flex: 1, fontSize: 15, fontWeight: tokens.font.weight.semibold, color: tokens.color.accentText }}>{R.doneEarn}</Text>
                <Text style={{ fontSize: 28, fontWeight: tokens.font.weight.bold, color: tokens.color.accentText, fontVariant: ["tabular-nums"] }}>+{usd(fee)}</Text>
              </View>
              <View style={{ paddingHorizontal: 4 }}>
                {deliveredFood.paymentMethod === "cash" ? <KV k={R.doneCash} v={usd(fee)} /> : null}
                {breakdown ? <KV k={R.lReturned} v={usd(breakdown.owed)} /> : null}
                {rate > 0 ? <KV k={R.doneComm} v={`−${usd((fee * rate) / 100)}`} /> : null}
              </View>
            </>
          ) : null}
          <View style={{ borderTopWidth: 1, borderTopColor: tokens.color.line, paddingTop: 14, gap: 6, alignItems: "center" }}>
            <Text style={{ fontSize: 16, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>{RF.rateSender(customer)}</Text>
            <Stars
              value={customerScore}
              onChange={(n) => {
                if (rateM.isSuccess || rateM.isPending) return;
                setCustomerScore(n);
                rateM.mutate(n);
              }}
            />
            <Text style={{ fontSize: 12, color: tokens.color.muted }}>{A.optional}</Text>
          </View>
        </ScrollView>
      </JobPage>
    );
  }

  if (undeliveredFood) {
    // `return_rest`: the food is still on the bike until the kitchen confirms it back.
    const returned = goodsReturnQ.data?.debtStatus != null && goodsReturnQ.data.debtStatus !== "open";
    return (
      <JobPage
        title={R.undelDoneT}
        onBack={backToJobs}
        bar={
          <CtaBar>
            <CtaButton ghost={!returned} label={R.nextJobs} onPress={backToJobs} />
          </CtaBar>
        }
      >
        <ScrollView contentContainerStyle={{ gap: 12, alignItems: "stretch" }} showsVerticalScrollIndicator={false}>
          <View style={{ alignItems: "center", gap: 12 }}>
            <TerminalBody
              icon="package"
              title={R.undelDoneT}
              body={
                undeliveredFood.reason === "refused"
                  ? "The customer's cash access is now on hold for food orders — mobile money only from here on."
                  : "Recorded after your wait and logged calls. The customer has been told."
              }
              note={R.undelNoStrike}
            />
          </View>
          <ReturnToRestaurantCard
            merchantName={undeliveredFood.pickupLandmark}
            pickupPoint={undeliveredFood.pickupPoint}
            cashRule={undeliveredFood.merchantCashRule}
            frontedAmount={undeliveredFood.merchantGoodsTotal}
            debtStatus={goodsReturnQ.data?.debtStatus ?? null}
          />
        </ScrollView>
      </JobPage>
    );
  }

  // Hold on the skeleton rather than guess which of the two cancelled-order screens applies while the
  // acknowledged-list read is in flight.
  if (order && order.status === "cancelled" && ackedHandbacks === "loading") {
    return (
      <Screen>
        <SkeletonList />
      </Screen>
    );
  }

  if (handbackPending && order) {
    // X9 — cancelled after collection (activeForRider only surfaces a cancelled food order once collected).
    const title = order.cancelledBy === "customer" ? RF.custCxT(customer) : R.cancelled;
    const leave = (): void => {
      void acknowledgeHandback(order.id);
      backToJobs();
    };
    return (
      <JobPage
        title={title.length > 22 ? R.tDone : title}
        onBack={leave}
        centred
        bar={
          <CtaBar>
            <CtaButton label={R.nextJobs} onPress={leave} />
            {order.counterpartyPhone ? <CtaButton ghost icon="phone" label={RF.callName(customer)} onPress={() => dial(order.counterpartyPhone)} /> : null}
          </CtaBar>
        }
      >
        <TerminalBody icon="x" title={title} body={RF.custCxB(customer)} note={R.custCxNoStrike} />
      </JobPage>
    );
  }

  if (jobQ.isLoading || (order && order.orderType === "merchant" && foodQ.isLoading && !foodOrder)) {
    return (
      <Screen>
        <SkeletonList />
      </Screen>
    );
  }

  // `generic_error`: a FAILED READ is not "you have no work".
  if ((jobQ.isError && !order) || (foodQ.isError && !foodOrder)) {
    return (
      <Screen>
        <RiderErrorState
          onRetry={() => {
            void jobQ.refetch();
            void foodQ.refetch();
          }}
          retrying={jobQ.isFetching || foodQ.isFetching}
          onBack={() => router.replace("/rider")}
        />
      </Screen>
    );
  }

  if (!order || order.status === "cancelled") {
    return (
      <Screen>
        <AppBar onBack={() => router.replace("/rider")} />
        <Heading>No active job</Heading>
        <Sub>Accept an offer to start a delivery.</Sub>
      </Screen>
    );
  }

  if (order.orderType !== "merchant" || !foodOrder) {
    // Redirect effect above handles the mismatched-type case; this is the brief frame before it fires.
    return (
      <Screen>
        <SkeletonList />
      </Screen>
    );
  }

  const isActive = ACTIVE.includes(order.status);
  const cashOrder = foodOrder.paymentMethod === "cash";
  const hState = handshakeState({
    paymentMethod: foodOrder.paymentMethod,
    customerCashConfirmedAt: foodOrder.customerCashConfirmedAt,
    riderCashConfirmedAt: foodOrder.riderCashConfirmedAt,
    cashHandshakeFrozenAt: foodOrder.cashHandshakeFrozenAt,
  });
  const goods = foodOrder.merchantGoodsTotal ?? 0;
  const fee = foodOrder.deliveryFee ?? 0;
  const total = foodOrder.merchantGoodsTotal != null && foodOrder.deliveryFee != null ? foodOrder.merchantGoodsTotal + foodOrder.deliveryFee : null;
  const collectAtDoor = foodOrder.cashHandshakeAmount ?? total ?? 0;
  const noShow = noShowStatus(foodOrder.noShowCallTimestamps, nowMs);
  const upfront = cashOrder && foodOrder.merchantCashRule === "pay_upfront";
  const owedToKitchen = cashOrder && foodOrder.merchantCashRule === "collect_and_return" ? goods : 0;
  const beforePickup = FOOD_DROPPABLE.has(order.status);
  const before = order.status === "assigned" || order.status === "confirmed" || order.status === "en_route_pickup";
  const stage: FoodStage = before ? (arrived === "pickup" ? "atKitchen" : "toKitchen") : arrived === "drop" ? "code" : "toCustomer";
  const kitchenPhone = (order.pickup as { contactPhone?: string | null }).contactPhone ?? null;
  const restored = restoredJobId != null && restoredJobId === order.id && !restoreDismissed && isActive;
  const kitchen = kitchenName(order);
  // Order flow v2 (D-59): the venue's word ("kitchen", "shop", "pharmacy"), the sealed-bag rule, the Rx tick.
  const venueKind = foodOrder.venue?.businessType === "shop" ? (foodOrder.venue.shopKind === "pharmacy" ? "pharmacy" : "shops") : "food";
  const venuePlace = O.svc[venueKind].place;
  const venueTag = venueKind === "pharmacy" ? R.pharmacy : venueKind === "shops" ? R.shop : undefined;
  const photoRequired = foodOrder.pickupProofRequired === true;
  const codeReady = foodOrder.autoAccepted === true || (pickupCode.trim().length === PICKUP_CODE_DIGITS && pickupAttempts < DELIVERY_OTP_MAX_ATTEMPTS);
  const canCollectNow = order.status === "en_route_pickup" && codeReady;
  const rx = foodOrder.prescription?.status === "approved" ? foodOrder.prescription : null;
  const rxSeen = !!rx?.riderSawOriginalAt;
  const rxBlock = rx ? (
    <>
      <OfNote tone="hi" icon="file-text" bold text={O.rd.rxStop} />
      <TickRow title={O.rd.rxTick} sub={RF.rxName(rx.patientName)} on={rxSeen} disabled={rxSeen || rxM.isPending} onPress={() => rxM.mutate()} />
    </>
  ) : null;
  const cantCode = (
    <Tappable accessibilityRole="button" onPress={() => setSheet("why")} style={{ minHeight: 44, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontSize: 14, fontWeight: tokens.font.weight.semibold, color: tokens.color.accentText }}>{O.rd.cantCode}</Text>
    </Tappable>
  );
  const orderNo = order.id.slice(0, 8).toUpperCase();
  const readyIn =
    foodOrder.readyAt != null
      ? 0
      : foodOrder.prepStartedAt != null && foodOrder.prepMinutes != null
        ? Math.max(0, Math.round((new Date(foodOrder.prepStartedAt).getTime() + foodOrder.prepMinutes * 60_000 - nowMs) / 60_000))
        : null;
  const away = (to: { lat: number; lng: number }): string | null => {
    if (!riderPoint) return null;
    const kmAway = haversineKm(riderPoint, to);
    return RF.away(kmAway, Math.max(1, Math.round(kmAway * 5)));
  };
  const nav = (to: { lat: number; lng: number }): void => void Linking.openURL(navUrl(prefs.navApp, to)).catch(() => undefined);
  // RD2a: "At the shop" / "Ask the shop for the pickup code" (`O.rd.atVenue`, `O.rd.code`); a kitchen keeps
  // Rider v2's own words.
  const atVenueT = venueKind === "food" ? R.tAtKitchen : ofFmt(O.rd.atVenue, { place: venuePlace });
  const pickupCodeL = venueKind === "food" ? R.pickupCodeL : ofFmt(O.rd.code, { place: venuePlace });
  const stageLine = stage === "toKitchen" ? R.tToKitchen : stage === "atKitchen" ? atVenueT : R.tToDrop;
  const notices = (
    <>
      {restored ? <Notice icon="history" tone="wash" text={RF.restored(stageLine.toLowerCase())} /> : null}
      {liveReconnecting ? (
        offlineSince != null && nowMs - offlineSince >= 4 * 60_000 ? <Notice icon="wifi-off" tone="warn" text={R.offlineLong} /> : <Notice icon="wifi-off" text={R.offlineJob} />
      ) : null}
      {isActive && locationDenied ? <Notice icon="map-pin" tone="warn" text="Location is off — the customer can't see where you are." /> : null}
    </>
  );
  const sos = (): void => {
    haptic("alert");
    setSheet(null);
    void Linking.openURL(`tel:${SOS_POLICY.emergencyNumber}`).catch(() => undefined);
    void raiseSos(order.id, riderPoint ? { lat: riderPoint.lat, lng: riderPoint.lng } : {}).catch(() => undefined);
  };
  const overlays = (
    <>
      <ProblemSheet
        visible={sheet === "problem"}
        onClose={() => setSheet(null)}
        beforePickup={beforePickup}
        food
        onCancel={() => setSheet("drop")}
        onReach={() => setSheet("reach")}
        onDeliver={() => setSheet("reach")}
        onHelp={() => helpFor(order.id)}
        onReport={() => setSheet("report")}
        onSos={() => setSheet("sos")}
      />
      <MSheet
        visible={sheet === "drop"}
        onClose={() => setSheet(null)}
        title={R.dropT}
        body={R.dropB}
        buttons={
          <>
            <CtaButton label={R.cxKeep} onPress={() => setSheet(null)} />
            <CtaButton ghost danger label={R.dropYes} loading={!!pendingOrQueued(dropM)} onPress={() => dropM.mutate(undefined, { onSettled: () => setSheet(null) })} />
          </>
        }
      />
      <MSheet visible={sheet === "reach"} onClose={() => setSheet(null)} title={RF.reachT(customer)} body={R.reachB}>
        <UnreachableCustomerCard
          customerPhone={order.counterpartyPhone}
          callsLogged={noShow.callsLogged}
          callsNeeded={noShow.callsNeeded}
          waitRemainingMs={noShow.waitRemainingMs}
          eligible={noShow.eligible}
          onLogCall={() => logCallM.mutate()}
          onReportNoShow={() => noShowM.mutate()}
          onReportRefused={() => refusedM.mutate()}
          logPending={pendingOrQueued(logCallM)}
          reportPending={pendingOrQueued(noShowM, refusedM)}
        />
      </MSheet>
      <ReportSheet orderId={order.id} counterpartyNoun="customer" visible={sheet === "report"} onClose={() => setSheet(null)} />
      <SosSheet visible={sheet === "sos"} onClose={() => setSheet(null)} onCall={sos} />
      <MSheet
        visible={sheet === "why"}
        onClose={() => setSheet(null)}
        title={O.rd.whyT}
        buttons={
          <CtaButton
            icon="camera"
            label={R.nextPhoto}
            disabled={!why}
            onPress={() => {
              setSheet(null);
              setCamera("door");
            }}
          />
        }
      >
        <View accessibilityRole="radiogroup">
          {DOOR_REASONS.map((r, k) => (
            <Tappable
              key={r}
              accessibilityRole="radio"
              accessibilityState={{ checked: why === r }}
              onPress={() => setWhy(r)}
              style={{ minHeight: 56, flexDirection: "row", alignItems: "center", gap: 12, borderTopWidth: 1, borderTopColor: tokens.color.surface }}
            >
              <Text style={{ flex: 1, fontSize: 15, lineHeight: 20, color: tokens.color.ink }}>{O.rd.why[k]}</Text>
              <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: why === r ? 7 : 2, borderColor: why === r ? tokens.color.accent : tokens.color.line }} />
            </Tappable>
          ))}
        </View>
      </MSheet>
      <CameraStep visible={camera === "bag"} title={O.rd.photoT} photoUri={bagPhoto.uri} onClose={() => setCamera(null)}>
        <TickRow title={O.rd.sealed} sub={bagPhoto.uri ? null : O.rd.sealedSub} on={bagSealed} onPress={() => tickBag(!bagSealed)} />
        {bagPhoto.uri ? (
          <>
            {photoQueued || (!bagPhoto.uploaded && liveReconnecting) ? <OfNote icon="clock" text={O.rd.queued} /> : null}
            <CtaButton ghost icon="camera" label={O.rd.retake} onPress={bagPhoto.retake} />
            <CtaButton
              label={O.rd.collected}
              disabled={!canCollectNow}
              loading={!!pendingOrQueued(foodOrder.autoAccepted ? collectedM : confirmPickupM)}
              onPress={() => void collectAfterPhoto()}
            />
          </>
        ) : (
          <>
            <Text style={{ fontSize: 13, lineHeight: 18, color: tokens.color.muted, textAlign: "center" }}>{photoRequired ? O.rd.photoReq : O.rd.photoOpt}</Text>
            <Shutter label={O.rd.photoT} disabled={(photoRequired && !bagSealed) || bagPhoto.saving} onPress={bagPhoto.take} />
          </>
        )}
      </CameraStep>
      <CameraStep visible={camera === "door"} title={O.rd.doorPhotoT} photoUri={doorShot?.uri ?? null} onClose={() => setCamera(null)}>
        {why === "handed_to_someone_else" || why === "left_at_gate" ? (
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 13, fontWeight: tokens.font.weight.semibold, color: tokens.color.muted }}>{O.rd.whoT}</Text>
            <TextInput
              value={handedTo}
              onChangeText={setHandedTo}
              placeholder={O.rd.whoPh}
              placeholderTextColor={tokens.color.muted}
              maxLength={60}
              accessibilityLabel={O.rd.whoT}
              style={{ minHeight: 48, borderRadius: 12, borderWidth: 1.5, borderColor: tokens.color.accent, paddingHorizontal: 12, fontSize: 15, color: tokens.color.ink }}
            />
          </View>
        ) : null}
        <Text style={{ fontSize: 13, lineHeight: 18, color: tokens.color.muted }}>{ofFmt(O.rd.doorPhotoSub, { place: venuePlace }).replace("Rudo", customer)}</Text>
        {doorShot ? (
          <>
            <CtaButton ghost icon="camera" label={O.rd.retake} onPress={takeDoorPhoto} />
            <CtaButton
              label={O.rd.finish}
              disabled={why === "handed_to_someone_else" && !handedTo.trim()}
              loading={!!pendingOrQueued(doorM)}
              onPress={() => doorM.mutate()}
            />
          </>
        ) : (
          <Shutter label={O.rd.doorPhotoT} onPress={takeDoorPhoto} />
        )}
      </CameraStep>
    </>
  );

  // RD4a / RD4b (Order flow v2, ledger D-59) — at the door: the rider's mirror of the customer's door
  // card ((1) hand over the order · (2) collect the cash · (3) enter the delivery code), then the code itself.
  let content: React.ReactNode;
  let bar: React.ReactNode;
  if (stage === "code") {
    const left = DELIVERY_OTP_MAX_ATTEMPTS - otpTries;
    const locked = left <= 0;
    const wrong = otpTries > 0 && deliveryCode.length === 6 && !deliverM.isPending && !locked;
    const queued = pendingOrQueued(deliverM) === "queued";
    const handshake = cashOrder && hState !== "confirmed";
    if (handshake) {
      // (1) ticks once the rider taps "Hand over the order" (this phone only — the server has no hand-over
      // mark yet) or the customer has already confirmed paying, which can only follow the hand-over.
      const handed = handedOver?.orderId === order.id || hState !== "pending";
      const rows: DoorRow[] = [
        { title: R.door1, state: handed ? "done" : "now", sub: handed && handedOver?.orderId === order.id ? RF.handedOver(handedOver.at) : null },
        {
          title: RF.door2(collectAtDoor),
          state: handed ? "now" : "todo",
          body: handed ? <CashSplit title={RF.collectFood(collectAtDoor)} yours={collectAtDoor - owedToKitchen} owed={owedToKitchen} /> : null,
        },
        { title: R.door3, sub: RF.door3Sub(customer), state: "todo" },
      ];
      content = (
        <>
          {notices}
          <RSteps cur={2} />
          <StopCard drop food tag={venueTag} name={order.dropoff.landmark} here who={order.customerFirstName ? RF.who(order.customerFirstName, "customer") : null} />
          {hState === "frozen" ? (
            <RiderCashHandshakeCard
              state={hState}
              amount={collectAtDoor}
              confirmedAt={foodOrder.customerCashConfirmedAt ?? null}
              nowMs={nowMs}
              onConfirm={() => confirmCashM.mutate()}
              onDispute={() => disputeCashM.mutate()}
              busy={pendingOrQueued(confirmCashM, disputeCashM)}
            />
          ) : (
            <>
              {handed ? null : rxBlock}
              <RiderDoorCard rows={rows} />
            </>
          )}
          <ProblemLink onPress={() => setSheet("problem")} />
        </>
      );
      bar =
        hState === "frozen" ? null : handed ? (
          <CtaBar>
            <CtaButton icon="banknote" label={RF.door2Btn(collectAtDoor)} loading={!!pendingOrQueued(confirmCashM)} onPress={() => confirmCashM.mutate()} />
          </CtaBar>
        ) : (
          <CtaBar>
            <CtaButton
              label={R.door1}
              disabled={!!rx && !rxSeen}
              onPress={() => {
                haptic("tap");
                setHandedOver({ orderId: order.id, at: hhmm(new Date()) });
              }}
            />
          </CtaBar>
        );
    } else {
      // RD4b: the six boxes; a full code sends itself (no button drawn).
      content = (
        <>
          {notices}
          <RSteps cur={2} />
          {locked ? (
            <JobTitle title={R.lockedT} />
          ) : cashOrder ? (
            <View style={{ gap: 4 }}>
              <Text accessibilityRole="header" style={{ fontSize: 17, lineHeight: 22, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, textAlign: "center" }}>
                {R.door3}
              </Text>
              <Text style={{ fontSize: 13, lineHeight: 18, color: tokens.color.muted, textAlign: "center" }}>{`${RF.door3Sub(customer)} · ${R.codeTries}`}</Text>
            </View>
          ) : (
            <JobTitle title={RF.codeT(customer)} body={RF.codeB} />
          )}
          {rxSeen ? null : rxBlock}
          <CodeBoxes value={deliveryCode} onChange={setDeliveryCode} error={wrong} locked={locked} />
          {wrong ? <CodeError text={left === 1 ? RF.triesLast(customer) : RF.triesLeft(left)} /> : null}
          {cantCode}
          {queued ? (
            <View style={{ flexDirection: "row", gap: 6, justifyContent: "center", alignItems: "center" }}>
              <Icon name="wifi-off" size={14} color={tokens.color.muted} />
              <Text style={{ fontSize: 13, color: tokens.color.muted }}>{R.offlineCode}</Text>
            </View>
          ) : null}
          <ProblemLink onPress={() => setSheet("problem")} />
        </>
      );
      bar = locked ? (
        <CtaBar hint={RF.newCodeWait(customer)}>
          <CtaButton icon="phone" label={RF.callName(customer)} onPress={() => dial(order.counterpartyPhone)} />
        </CtaBar>
      ) : null;
    }
    return (
      <JobShell
        title={R.tAtDrop}
        onBack={() => router.replace("/rider")}
        onHelp={() => setSheet("problem")}
        contentKey={`code|${handshake ? hState : "code"}|${liveReconnecting ? "o" : ""}`}
        toast={jobToast}
        map={(padBottom) => (
          <OrderMap
            pickup={order.pickup.point}
            dropoff={order.dropoff.point}
            rider={riderPoint}
            riderLabel={R.you}
            riderPaused={liveReconnecting}
            showRider
            toPickupLine={false}
            rings={false}
            dim={false}
            frame="riderDrop"
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

  // B1 / B2 / B3 — the map and the stage sheet.
  if (stage === "atKitchen") {
    const auto = foodOrder.autoAccepted === true;
    const pickupLocked = pickupAttempts >= DELIVERY_OTP_MAX_ATTEMPTS;
    const canCollect = order.status === "en_route_pickup" && (auto || (pickupCode.trim().length === PICKUP_CODE_DIGITS && !pickupLocked));
    content = (
      <>
        {notices}
        <RSteps cur={0} />
        <StopCard food tag={venueTag} name={kitchen} here who={RF.kitchenReady(orderNo, readyIn)} onCall={kitchenPhone ? () => dial(kitchenPhone) : null} />
        {upfront ? (
          <>
            <View style={{ borderWidth: 1.5, borderColor: tokens.color.ink, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Icon name="banknote" size={20} color={tokens.color.ink} />
              <Text style={{ flex: 1, fontSize: 15, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>{RF.payNow(goods)}</Text>
            </View>
            <Text style={{ fontSize: 13, lineHeight: 18, color: tokens.color.muted }}>{RF.collectFoodB(fee, goods)}</Text>
          </>
        ) : null}
        {auto ? null : (
          <>
            <Text style={{ fontSize: 14, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink, textAlign: "center" }}>{pickupCodeL}</Text>
            <CodeBoxes length={PICKUP_CODE_DIGITS} label={pickupCodeL} autoFocus={false} value={pickupCode} onChange={setPickupCode} error={pickupAttempts > 0 && pickupCode.length === PICKUP_CODE_DIGITS && !confirmPickupM.isPending} locked={pickupLocked} />
            {pickupAttempts > 0 && !pickupLocked && pickupCode.length === PICKUP_CODE_DIGITS && !confirmPickupM.isPending ? <CodeError text={RF.triesLeft(DELIVERY_OTP_MAX_ATTEMPTS - pickupAttempts)} /> : null}
          </>
        )}
        {collectedError ? <Notice icon="map-pin" tone="warn" text={collectedError} /> : null}
        <ProblemLink onPress={() => setSheet("problem")} />
      </>
    );
    // RD2b: a shop's pickup waits on the sealed-bag photo, so its code leads to the camera; a restaurant
    // may add one (optional) before collecting.
    const needPhoto = photoRequired && !bagPhoto.uri;
    bar = (
      <CtaBar>
        {needPhoto ? (
          <CtaButton icon="camera" label={O.rd.photoT} disabled={!canCollect} onPress={() => setCamera("bag")} />
        ) : (
          <CtaButton
            label={upfront ? R.paidCta : photoRequired ? O.rd.collected : R.collectedFood}
            disabled={!canCollect}
            loading={!!pendingOrQueued(auto ? collectedM : confirmPickupM)}
            onPress={() => {
              if (bagPhoto.uri) void collectAfterPhoto();
              else if (auto) onCollected();
              else confirmPickupM.mutate();
            }}
          />
        )}
        {!photoRequired && !bagPhoto.uri ? <CtaButton ghost icon="camera" label={O.rd.photoT} onPress={() => setCamera("bag")} /> : null}
      </CtaBar>
    );
  } else {
    const kit = stage === "toKitchen";
    const target = kit ? order.pickup : order.dropoff;
    content = (
      <>
        {notices}
        <RSteps cur={stepFor(stage)} />
        <StopCard
          food
          tag={venueTag}
          drop={!kit}
          name={kit ? kitchen : target.landmark}
          line={away(target.point)}
          who={kit ? RF.kitchenReady(orderNo, readyIn) : order.customerFirstName ? RF.who(order.customerFirstName, "customer") : null}
          onCall={kit ? (kitchenPhone ? () => dial(kitchenPhone) : null) : order.counterpartyPhone ? () => dial(order.counterpartyPhone) : null}
          onWhatsApp={!kit && order.counterpartyPhone ? () => wa(order.counterpartyPhone) : null}
          onNavigate={() => nav(target.point)}
        />
        {kit ? (
          upfront && total != null ? <CashLine text={RF.payKitchenB(goods, total)} /> : null
        ) : cashOrder ? (
          <CashSplit title={RF.collectFood(collectAtDoor)} yours={collectAtDoor - owedToKitchen} owed={owedToKitchen} />
        ) : null}
        <ProblemLink onPress={() => setSheet("problem")} />
      </>
    );
    bar = (
      <CtaBar>
        <CtaButton label={kit ? R.atKitchenCta : R.atDropCta} onPress={() => markArrived(kit ? "pickup" : "drop")} />
      </CtaBar>
    );
  }

  return (
    <JobShell
      title={stage === "toKitchen" ? R.tToKitchen : stage === "atKitchen" ? atVenueT : R.tToDrop}
      onBack={() => router.replace("/rider")}
      onHelp={() => setSheet("problem")}
      contentKey={`${stage}|${liveReconnecting ? "o" : ""}|${upfront ? "u" : ""}`}
      toast={jobToast}
      map={(padBottom) => (
        <OrderMap
          pickup={order.pickup.point}
          dropoff={order.dropoff.point}
          rider={riderPoint}
          riderLabel={R.you}
          riderPaused={liveReconnecting}
          showRider
          toPickupLine={stage === "toKitchen"}
          rings={false}
          dim={false}
          frame={before ? "pickupRider" : "riderDrop"}
          padBottom={padBottom}
          reduceMotion={reduceMotion}
        />
      )}
      content={content}
      bar={bar}
      overlays={overlays}
    />
  );

  function helpFor(id: string): void {
    setSheet(null);
    void raiseIssue(id, { type: "other", description: R.pHelp, idempotencyKey: uuidV4FromSeed(`${id}|help|${Math.floor(Date.now() / 60_000)}`) })
      .then(() => setJobToast({ text: R.helpSent, icon: "circle-check" }))
      .catch((e: unknown) => fail(e));
  }
}

/** RD4c's three answers, in `O.rd.why`'s order. */
const DOOR_REASONS: readonly DoorProofReason[] = ["customer_unreachable", "handed_to_someone_else", "left_at_gate"];
