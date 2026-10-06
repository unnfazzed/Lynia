import { haversineKm, SOS_POLICY } from "@lynia/shared";
import { tokens } from "@lynia/shared/tokens";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { useFocusEffect, usePathname, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Linking, Text, useWindowDimensions, View } from "react-native";
import { ApiError } from "../../../src/api/client";
import { getMe, type Me } from "../../../src/api/auth";
import { withdrawOffer } from "../../../src/api/offers";
import { getActiveOrder, getOpenOrders, type OpenOrder } from "../../../src/api/orders";
import { getFoodDispatchOffer } from "../../../src/api/food-rider";
import { getDemandZones } from "../../../src/api/rider-v2";
import { noteKycLaunched, retryKyc, sendHeartbeat, setOnline } from "../../../src/api/riders";
import { loadAcknowledgedHandbacks, saveRolePreference } from "../../../src/auth/session";
import { useBootPhase } from "../../../src/boot/boot-phase";
import { usePrewarmRoutes, type PrewarmRoute } from "../../../src/boot/prewarm-routes";
import { supportWhatsAppUrl } from "../../../src/config";
import { KycCheckHost } from "../../../src/kyc/KycCheckHost";
import { takeKycLaunch } from "../../../src/kyc/launch-hint";
import { runKycVerification } from "../../../src/kyc/verify";
import {
  freshKycLaunch,
  KYC_COMPLETED_HINT_MS,
  type KycLaunchMark,
  kycPollMs,
  onlineGateReason,
  type OnlineGateReason,
  resolveKycGate,
  resolveKycRetryFeedback,
} from "../../../src/logic/gates";
import { useHomeLocation } from "../../../src/logic/home-location";
import { kycScreenFor } from "../../../src/logic/kyc-outcome";
import { startRiderPermFlow } from "../../../src/logic/rider-perm-flow";
import { markRiderWelcomeSeen, riderWelcomeSeen } from "../../../src/logic/rider-welcome";
import { isSentOfferExpired, isSentOfferStale } from "../../../src/logic/rider-bid-draft";
import { type GateId, kycTriesLeft, resolveGate } from "../../../src/logic/rider-gate";
import { telUri } from "../../../src/logic/safety";
import { useFeatureFlags } from "../../../src/net/use-feature-flags";
import { pushOnce } from "../../../src/push/push";
import { pendingOrQueued } from "../../../src/query/client";
import { useSentOffers, useSkippedJobs } from "../../../src/query/use-sent-offers";
import { useTabTop } from "../../../src/query/use-tab-top";
import { useWallet, useWalletConfig } from "../../../src/query/use-wallet";
import { useForegroundRefetch } from "../../../src/realtime/use-foreground-refetch";
import { useRiderBoard } from "../../../src/realtime/use-rider-board";
import { AppScreen, EmptyRow, EmptyState, emptyCopy, fillEmpty, haptic, Icon, type IconName, statusPillLabel, useActionError, useHideTabBar, useTabBarSpace } from "../../../src/ui";
import { IdCheckOutcome } from "../../../src/ui/firstrun";
import { CtaButton, SmBtn } from "../../../src/ui/order/kit";
import { OrderSheet } from "../../../src/ui/order/OrderSheet";
import { Notice } from "../../../src/ui/send/kit";
import { type BoardJob, BoardJobCard, BoardMap, Gate, type GateAction, RToast } from "../../../src/ui/rider/board";
import { RIDER_COPY as R, RF, usd } from "../../../src/ui/rider/copy";
import { MintTop, MSheet, RLabel } from "../../../src/ui/rider/kit";
import { useReduceMotion } from "../../../src/ui/useReduceMotion";
import { RiderSetupPending, RiderVerified } from "../../../src/ui/onboarding/rider";
import { withTimeout } from "../../../src/util";

// GPS fix bound: a cold fix can hang forever, and the server records a broadcast-eligible position only
// `if (online && location)` — so race the fix and fall back to the last-known one.
const LOCATE_TIMEOUT_MS = 9_000;
/** Transient activation failures retry this many times, this far apart. */
const ACTIVATION_MAX_RETRIES = 3;
const ACTIVATION_RETRY_MS = 15_000;
/** The Undo window on a withdrawn offer (J10); the API call fires after it. */
const WITHDRAW_UNDO_MS = 5_000;

const BOARD_PREWARM: readonly PrewarmRoute[] = ["riderJob", "riderFoodJob"];

type Toast = { text: string; icon?: IconName; undo?: () => void } | null;

/**
 * The Jobs board (Rider v2 J1–J14 + gates G8–G14, `packages/design/handoff/rider-v2/`, ledger D-54).
 *
 * Layout: the mint top card (greeting · Online / Reconnecting · detected street) → the board map (job
 * pins in sync with the cards, "You") → a snapping sheet (peek 50%, 44% when empty) → the tab bar. A
 * rider who can't work right now sees ONE gate in place of the map and sheet, picked by `resolveGate`
 * in the handoff's priority order; every gate clears on its own when its input changes.
 *
 * The ID check is First Run v2's (`packages/design/handoff/first-run-v2/`, ledger D-80): an unverified rider
 * sees the outcome page F1–F8 full screen (no tab bar, no mint top card; ✕ switches to the customer side),
 * Calm Mint v2 R2 while the automated check runs, R3 once verified — and an account with no rider record
 * goes to R1 (`/rider/become`, G1). The non-KYC gates (GPS, area, cooldown, hold, suspended, banned, top-up)
 * keep their Rider v2 walls.
 *
 * ALWAYS ONLINE (owner 2026-08-17): being here, past every gate, IS the shift — `online` is machine
 * state. NO manual refresh anywhere (D-30): the socket, the polls and the foreground re-read keep the
 * board current.
 */
export default function RiderHome(): React.ReactElement {
  usePrewarmRoutes(BOARD_PREWARM);
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();
  const top = useTabTop("rider");
  const reduceMotion = useReduceMotion();
  const { height: winH } = useWindowDimensions();
  const { merchantDispatchAutoEnabled: foodOn } = useFeatureFlags();
  const setError = useActionError();
  const [onlineFlag, setOnlineState] = useState(() => qc.getQueryData<Me>(["me"])?.rider?.kycStatus === "verified");
  const autoOnlineRef = useRef(false);
  const [activationRetry, setActivationRetry] = useState(0);
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [locDenied, setLocDenied] = useState(false);
  const [locHint, setLocHint] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((t: NonNullable<Toast>, ms = 4000) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(t);
    toastTimer.current = setTimeout(() => setToast(null), ms);
  }, []);
  useEffect(() => () => void (toastTimer.current && clearTimeout(toastTimer.current)), []);

  const { offers: sentOffers, setOffers: setSentOffers } = useSentOffers();
  const { skipped } = useSkippedJobs();
  const bidIds = useMemo(() => new Set(sentOffers.map((s) => s.order.id)), [sentOffers]);
  // Offers withdrawn but still inside their 5 s Undo window — hidden now, sent to the API after.
  const [withdrawing, setWithdrawing] = useState<ReadonlySet<string>>(new Set());

  // ── Location ─────────────────────────────────────────────────────────────────────────────────────
  // No OS permission prompt over the cold-start splash (S-6, as Home's useHomeLocation): while the boot
  // runs, an already-granted permission still reads the position, but the ASK waits for the boot to end.
  const { booting } = useBootPhase();
  const bootingRef = useRef(booting);
  bootingRef.current = booting;
  const askAfterBoot = useRef(false);
  const requestLocation = useCallback(async (): Promise<void> => {
    let status: string;
    if (bootingRef.current) {
      const current = await Location.getForegroundPermissionsAsync().catch(() => null);
      if (current?.status !== "granted") {
        askAfterBoot.current = true;
        return;
      }
      status = current.status;
    } else {
      status = (await Location.requestForegroundPermissionsAsync()).status;
    }
    if (status !== "granted") {
      setLocDenied(true);
      return;
    }
    setLocDenied(false);
    try {
      const p = await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), LOCATE_TIMEOUT_MS);
      setLoc({ lat: p.coords.latitude, lng: p.coords.longitude });
      setLocHint(false);
    } catch {
      try {
        const last = await Location.getLastKnownPositionAsync();
        if (last) {
          setLoc({ lat: last.coords.latitude, lng: last.coords.longitude });
          setLocHint(false);
          return;
        }
      } catch {
        /* fall through */
      }
      setLocHint(true);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void requestLocation();
    }, [requestLocation]),
  );
  // The ask a boot deferred runs the moment the splash hands off.
  useEffect(() => {
    if (booting || !askAfterBoot.current) return;
    askAfterBoot.current = false;
    void requestLocation();
  }, [booting, requestLocation]);
  const locRef = useRef(loc);
  useEffect(() => {
    locRef.current = loc;
  }, [loc]);
  const location = useHomeLocation({ detectOnly: true });

  // ── Notifications permission (J8): read on focus and on resume ───────────────────────────────────
  const [notifOff, setNotifOff] = useState(false);
  const readNotif = useCallback(() => {
    void Notifications.getPermissionsAsync()
      .then((p) => setNotifOff(!p.granted))
      .catch(() => undefined);
  }, []);
  useFocusEffect(readNotif);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => s === "active" && readNotif());
    return () => sub.remove();
  }, [readNotif]);

  // ── Identity / KYC ───────────────────────────────────────────────────────────────────────────────
  // The last ID-check launch on this board (or handed over by Become, R-4 / R-10) and when it landed.
  // A `completed` mark only counts while fresh (gates.ts freshKycLaunch); `failed` holds for the screen.
  const [kycLaunch, setKycLaunch] = useState<KycLaunchMark | null>(null);
  const kycLaunchRef = useRef(kycLaunch);
  kycLaunchRef.current = kycLaunch;
  // When this board first saw the current check in flight — the poll's fast window counts from here.
  const inFlightSinceRef = useRef<number | null>(null);
  const meQ = useQuery({
    queryKey: ["me"],
    queryFn: getMe,
    // R-3 / §5: 5 s only for the first minutes of an automated check, then 30 s; a hold or a manual review
    // 60 s; nothing once verified (gates.ts kycPollMs).
    refetchInterval: (query) => {
      const me = query.state.data;
      if (!me) return false;
      const r = me.rider;
      const isVerified = r?.kycStatus === "verified";
      const now = Date.now();
      const g = isVerified ? null : resolveKycGate(r, freshKycLaunch(kycLaunchRef.current, now));
      const since = inFlightSinceRef.current;
      return kycPollMs(g, isVerified, since == null ? 0 : now - since);
    },
  });
  const knownUnverified = meQ.data != null && meQ.data.rider?.kycStatus !== "verified";
  const rider = meQ.data?.rider;
  const forceFreshSession = useRef(false);
  const spentForce = useRef(false);
  const leaveForCustomer = useCallback((): void => router.replace("/home"), [router]);
  const kycGate = knownUnverified ? resolveKycGate(rider, freshKycLaunch(kycLaunch, Date.now())) : null;
  if (kycGate?.kind === "in_flight") inFlightSinceRef.current ??= Date.now();
  else inFlightSinceRef.current = null;
  // A `completed` mark stops counting after KYC_COMPLETED_HINT_MS — re-render then, so the server's own
  // answer takes over even if no poll lands in between.
  const [, setHintTick] = useState(0);
  useEffect(() => {
    if (kycLaunch?.outcome !== "completed") return;
    const left = kycLaunch.at + KYC_COMPLETED_HINT_MS - Date.now();
    if (left <= 0) return;
    const t = setTimeout(() => setHintTick((n) => n + 1), left + 50);
    return () => clearTimeout(t);
  }, [kycLaunch]);
  // R-4 / R-10: the launch Become a rider just ran, handed over on focus (this board may have been
  // mounted below Become all along). Taken once.
  useFocusEffect(
    useCallback(() => {
      const handed = takeKycLaunch();
      if (handed) setKycLaunch(handed);
    }, []),
  );
  // Calm Mint v2 R3 (D-55): the first time this account opens the board verified, "You're verified"
  // takes the board's place once. `null` = still reading the flag (nothing shown, no flash).
  const profileId = meQ.data?.profileId ?? null;
  const verified = rider?.kycStatus === "verified";
  const [welcomeSeen, setWelcomeSeen] = useState<boolean | null>(null);
  useEffect(() => {
    if (!profileId || !verified) return;
    let alive = true;
    void riderWelcomeSeen(profileId).then((seen) => {
      if (alive) setWelcomeSeen(seen);
    });
    return () => {
      alive = false;
    };
  }, [profileId, verified]);
  // New riders only: a rider with trips behind them is not "just verified" (no verified-at date is served).
  const showWelcome = verified && welcomeSeen === false && (rider?.tripsCount ?? 0) === 0;
  // R-7: while R3 "You're verified" is up — or still being decided (the flag is being read) — the rider is
  // NOT online: its "Go online" is what starts the shift. Otherwise heartbeats, job pushes and the
  // food-offer screen were live behind "You're verified", and the button only dismissed the page.
  const holdForWelcome = verified && (rider?.tripsCount ?? 0) === 0 && welcomeSeen !== true;
  // The live shift: the server flag, held while R3 is up (a warm cache can start `online` true on frame 1).
  const online = onlineFlag && !holdForWelcome;

  // ── Board socket + active job ────────────────────────────────────────────────────────────────────
  const board = useRiderBoard(online, loc, bidIds, foodOn ? () => router.push("/rider/food-offer") : undefined);
  const activeQ = useQuery({
    queryKey: ["activeJob"],
    queryFn: getActiveOrder,
    // §5 item 10: no active-job read behind a KYC wall — an unverified rider can't hold a job.
    enabled: !knownUnverified,
    refetchInterval: (query) => (board.connected ? false : online || query.state.data != null ? 8000 : false),
  });
  const [ackedHandbacks, setAckedHandbacks] = useState<Set<string>>(() => new Set());
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void loadAcknowledgedHandbacks().then((ids) => alive && setAckedHandbacks(new Set(ids)));
      return () => {
        alive = false;
      };
    }, []),
  );
  const activeJob = activeQ.data && !(activeQ.data.status === "cancelled" && ackedHandbacks.has(activeQ.data.id)) ? activeQ.data : null;
  const jobRoute = activeJob?.orderType === "merchant" ? "/rider/food-job" : "/rider/job";

  // J11: "Rudo picked you!" — once per assignment, with the job ping.
  const [pickedSeen, setPickedSeen] = useState<string | null>(null);
  const picked = activeJob?.status === "assigned" && pickedSeen !== activeJob.id ? activeJob : null;
  const prevJobStatus = useRef<string | undefined>(undefined);
  useEffect(() => {
    const s = activeJob?.status;
    if (s === "assigned" && prevJobStatus.current !== "assigned") haptic("success");
    prevJobStatus.current = s;
  }, [activeJob?.status]);
  const prevHadJobRef = useRef(false);
  const hasActiveJob = activeJob != null;
  useEffect(() => {
    if (prevHadJobRef.current && !hasActiveJob) void requestLocation();
    prevHadJobRef.current = hasActiveJob;
  }, [hasActiveJob, requestLocation]);

  const callSupport = (): void => {
    const uri = telUri(SOS_POLICY.safetyLine);
    if (uri) void Linking.openURL(uri);
  };
  const whatsappSupport = (): void => {
    const url = supportWhatsAppUrl();
    if (url) void Linking.openURL(url);
    else callSupport();
  };

  // The server's last refusal (go-online / heartbeat 403). Cleared on focus and on resume, so a lifted
  // gate re-tests without a tap.
  const [serverGate, setServerGate] = useState<OnlineGateReason | null>(null);
  useFocusEffect(
    useCallback(() => {
      setServerGate(null);
      void qc.invalidateQueries({ queryKey: ["me"] });
    }, [qc]),
  );
  useForegroundRefetch(() => {
    setServerGate(null);
    void qc.invalidateQueries({ queryKey: ["me"] });
  });
  // E2E 2026-10-05 FS-7: a go-online refused for want of a position clears the moment GPS fixes, so the
  // auto-online below retries with coordinates without a tap.
  useEffect(() => {
    if (loc && serverGate === "location_required") setServerGate(null);
  }, [loc, serverGate]);

  const onlineM = useMutation({
    mutationFn: (next: boolean) => setOnline(next, loc ?? undefined),
    onSuccess: (res) => {
      setActivationRetry(0);
      setOnlineState(res?.online ?? true);
      setServerGate(null);
    },
    onError: (e) => {
      const reason = e instanceof ApiError ? onlineGateReason(e) : null;
      if (reason) {
        setServerGate(reason);
        if (reason === "kyc") void qc.invalidateQueries({ queryKey: ["me"] });
        return;
      }
      setServerGate(null);
      setActivationRetry((n) => n + 1);
    },
  });

  // ALWAYS ONLINE: drive the server flag true the moment every wall is down.
  useEffect(() => {
    // R-9: a failed re-read keeps the last known `me` (TanStack keeps data on error), so the shift
    // follows what we know rather than dropping on one 5xx.
    const allowed = meQ.data != null && !knownUnverified && !holdForWelcome && !locDenied && serverGate == null;
    if (!allowed) {
      autoOnlineRef.current = false;
      return;
    }
    if (autoOnlineRef.current) return;
    if (loc == null && !locHint) return;
    autoOnlineRef.current = true;
    onlineM.mutate(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meQ.data != null, knownUnverified, holdForWelcome, locDenied, serverGate, loc, locHint]);

  const retryM = useMutation({
    mutationFn: () => {
      const force = forceFreshSession.current;
      if (force) spentForce.current = true;
      return retryKyc(force);
    },
    onSuccess: async (res) => {
      const feedback = resolveKycRetryFeedback(res);
      if (feedback.error) setError(feedback.error);
      if (feedback.launch) {
        const launch = await runKycVerification(feedback.launch);
        setKycLaunch({ outcome: launch.outcome, at: Date.now() });
        forceFreshSession.current = launch.sessionUnusable && !spentForce.current;
        if (launch.outcome !== "failed") spentForce.current = false;
        // R-4: the retry put the rider back to `pending` server-side (a failed or expired rider included),
        // so the cached `me` must stop showing the old decline / expiry wall while the refetch is out; a
        // completed launch is in flight on top of that.
        qc.setQueryData<Me>(["me"], (prev) =>
          prev?.rider
            ? {
                ...prev,
                rider: {
                  ...prev.rider,
                  kycStatus: res.kycStatus ?? prev.rider.kycStatus,
                  ...(launch.outcome === "completed" ? { kycPendingState: "in_flight" as const, kycHeld: false } : {}),
                },
              }
            : prev,
        );
        // …and the server drops what it cached about the session, so that refetch reads the vendor afresh.
        if (launch.outcome === "completed") void noteKycLaunched();
      }
      void qc.invalidateQueries({ queryKey: ["me"] });
    },
    onMutate: () => setKycLaunch(null),
    onError: (e) => setError(e instanceof ApiError ? e.message : "Couldn't restart verification."),
  });

  useEffect(() => {
    if (activationRetry === 0 || activationRetry > ACTIVATION_MAX_RETRIES) return;
    const t = setTimeout(() => {
      autoOnlineRef.current = true;
      onlineM.mutate(true);
    }, ACTIVATION_RETRY_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activationRetry]);

  // Heartbeat: only a 403 takes the rider offline; two failed beats show "Reconnecting…".
  const [beatStale, setBeatStale] = useState(false);
  useEffect(() => {
    if (!online) {
      setBeatStale(false);
      return;
    }
    let failures = 0;
    const t = setInterval(() => {
      sendHeartbeat(locRef.current ?? undefined)
        .then(() => {
          failures = 0;
          setBeatStale(false);
        })
        .catch((e: unknown) => {
          if (e instanceof ApiError && e.status === 403) {
            setOnlineState(false);
            autoOnlineRef.current = false;
            const reason = onlineGateReason(e);
            setServerGate(reason);
            if (reason === "kyc") void qc.invalidateQueries({ queryKey: ["me"] });
          } else {
            failures += 1;
            if (failures >= 2) setBeatStale(true);
          }
        });
    }, 20_000);
    return () => clearInterval(t);
  }, [online, qc]);

  // ── Open jobs ────────────────────────────────────────────────────────────────────────────────────
  const openQ = useQuery({
    queryKey: ["openOrders"],
    queryFn: () => getOpenOrders(loc ?? undefined, 5000),
    enabled: online,
    // The socket keeps the list live; while it's down, re-read every 10 s (J7: "Trying again in 10 s").
    refetchInterval: online ? (board.connected ? false : 10_000) : false,
  });
  useEffect(() => {
    if (!online || !loc) return;
    void qc.invalidateQueries({ queryKey: ["openOrders"] });
  }, [loc?.lat, loc?.lng, online, qc]);
  useForegroundRefetch(() => {
    void qc.invalidateQueries({ queryKey: ["openOrders"] });
    void qc.invalidateQueries({ queryKey: ["activeJob"] });
  }, online);

  // Owner 2026-10-01: food, shop and parcel jobs all show on the board, tagged. A food job is the
  // live dispatch offer the server is holding for THIS rider (food is offered to one rider at a time);
  // it still rings full screen, and its card opens the same offer.
  const foodOfferQ = useQuery({ queryKey: ["foodOffer"], queryFn: getFoodDispatchOffer, enabled: online && !!foodOn, refetchInterval: online && foodOn ? 15_000 : false });
  const foodOffer = foodOn && foodOfferQ.data && new Date(foodOfferQ.data.expiresAt).getTime() > Date.now() ? foodOfferQ.data : null;
  const jobs: BoardJob[] = useMemo(() => {
    const parcels = (Array.isArray(openQ.data) ? openQ.data : [])
      .filter((o) => !bidIds.has(o.id) && !skipped.has(o.id))
      .map((o) => toBoardJob(o, loc));
    const food: BoardJob[] = foodOffer
      ? [
          {
            id: `food:${foodOffer.orderId}`,
            pickup: { ...foodOffer.pickup.point, landmark: foodOffer.pickup.landmark },
            dropoff: { ...foodOffer.dropoff.point, landmark: foodOffer.dropoff.landmark },
            toPickupKm: loc ? haversineKm(loc, foodOffer.pickup.point) : null,
            tripKm: foodOffer.distanceKm,
            item: foodOffer.itemDesc,
            asking: foodOffer.deliveryFee ?? 0,
            kind: "food",
          },
        ]
      : [];
    return [...food, ...parcels].sort((a, b) => (a.toPickupKm ?? Number.MAX_SAFE_INTEGER) - (b.toPickupKm ?? Number.MAX_SAFE_INTEGER));
  }, [openQ.data, bidIds, skipped, loc, foodOffer]);
  const mixedKinds = jobs.some((j) => j.kind === "food" || j.kind === "shop");
  const effectiveSelected = selectedId && jobs.some((j) => j.id === selectedId) ? selectedId : (jobs[0]?.id ?? null);

  // J13: the job the rider was looking at was taken by someone else.
  const prevSelected = useRef<string | null>(null);
  useEffect(() => {
    const was = prevSelected.current;
    if (was && board.takenOrderIds.has(was) && !bidIds.has(was)) showToast({ text: R.taken });
    prevSelected.current = effectiveSelected;
  }, [effectiveSelected, board.takenOrderIds, bidIds, showToast]);

  // A new nearby job — one attention buzz (never on the first load, never on a decrease).
  const prevCount = useRef(-1);
  useEffect(() => {
    if (!online) {
      prevCount.current = -1;
      return;
    }
    if (!openQ.isSuccess) return;
    if (prevCount.current === -1) {
      prevCount.current = jobs.length;
      return;
    }
    if (jobs.length > prevCount.current) haptic("notify");
    prevCount.current = jobs.length;
  }, [online, openQ.isSuccess, jobs.length]);

  // ── Your offers: resolution toasts (J12 / J14) and the stale sweep ───────────────────────────────
  const resolvedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const s of sentOffers) {
      if (resolvedRef.current.has(s.order.id) || s.order.id === activeJob?.id) continue;
      const name = s.order.customerFirstName || R.theSender;
      if (board.takenOrderIds.has(s.order.id)) {
        resolvedRef.current.add(s.order.id);
        showToast({ text: RF.notChosen(name) });
        setSentOffers((prev) => prev.filter((p) => p.order.id !== s.order.id));
      } else if (board.expiredOrderIds.has(s.order.id) || isSentOfferExpired(s, Date.now())) {
        resolvedRef.current.add(s.order.id);
        showToast({ text: RF.bidExpired(name) });
        setSentOffers((prev) => prev.filter((p) => p.order.id !== s.order.id));
      }
    }
  }, [sentOffers, board.takenOrderIds, board.expiredOrderIds, activeJob?.id, showToast, setSentOffers]);
  useEffect(() => {
    if (!online) return;
    const iv = setInterval(() => {
      const now = Date.now();
      setSentOffers((prev) => {
        const next = prev.filter((o) => !isSentOfferStale(o, now));
        return next.length === prev.length ? prev : next;
      });
    }, 15_000);
    return () => clearInterval(iv);
  }, [online, setSentOffers]);

  // J10: Withdraw → hidden at once, an Undo toast for 5 s, the API call after the window.
  const withdrawTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const timers = withdrawTimers.current;
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);
  const onWithdraw = (orderId: string): void => {
    setWithdrawing((prev) => new Set([...prev, orderId]));
    const undo = (): void => {
      const t = withdrawTimers.current.get(orderId);
      if (t) clearTimeout(t);
      withdrawTimers.current.delete(orderId);
      setWithdrawing((prev) => new Set([...prev].filter((id) => id !== orderId)));
      setToast(null);
    };
    showToast({ text: R.withdrawn, icon: "check", undo }, WITHDRAW_UNDO_MS);
    withdrawTimers.current.set(
      orderId,
      setTimeout(() => {
        withdrawTimers.current.delete(orderId);
        void withdrawOffer(orderId)
          .catch(() => undefined)
          .finally(() => {
            resolvedRef.current.add(orderId);
            setSentOffers((prev) => prev.filter((p) => p.order.id !== orderId));
            setWithdrawing((prev) => new Set([...prev].filter((id) => id !== orderId)));
            void qc.invalidateQueries({ queryKey: ["openOrders"] });
          });
      }, WITHDRAW_UNDO_MS),
    );
  };
  const myOffers = sentOffers.filter((s) => s.order.id !== activeJob?.id && !withdrawing.has(s.order.id));

  // ── Demand (busy zones) ──────────────────────────────────────────────────────────────────────────
  const zonesQ = useQuery({ queryKey: ["demandZones", loc?.lat.toFixed(2), loc?.lng.toFixed(2)], queryFn: () => getDemandZones(loc), enabled: online, staleTime: 2 * 60_000, refetchInterval: online ? 2 * 60_000 : false });
  const zones = zonesQ.data ?? [];
  const busiest = zones.length ? zones.reduce((a, b) => (b.level > a.level ? b : a)) : null;
  const busyLine = busiest && loc ? RF.busyLine(busiest.place, haversineKm(loc, busiest)) : null;

  // ── Gates ────────────────────────────────────────────────────────────────────────────────────────
  // §5 item 10: the balance only matters past the KYC walls (the top-up gate) — no read behind one.
  const { wallet } = useWallet({ enabled: !knownUnverified });
  const { config: walletConfig } = useWalletConfig();
  // R-9: keyed on DATA, not on the query status: a failed re-read keeps the last good `me` (TanStack keeps
  // data on error), so a pending, declined or locked rider stays behind their wall through a 5xx.
  const gate: GateId | null = meQ.data == null ? null : resolveGate({ kyc: kycGate, server: serverGate, locDenied });
  const conn = online && board.connected && !beatStale;

  // ── ID check (First Run v2 F / G, ledger D-80) ───────────────────────────────────────────────────
  const kycScreen = kycScreenFor({ gate, kyc: kycGate, launch: freshKycLaunch(kycLaunch, Date.now()), declineReason: rider?.kycDeclineReason });
  // F1–F8 are full screens: no tab bar (D-80 §2 #3).
  useHideTabBar(kycScreen?.kind === "outcome");
  // ✕ switches to the customer side (Home), as the Account toggle does; reopening the rider side re-resolves
  // the same page from the server's state (G3).
  const exitToCustomer = useCallback((): void => {
    void saveRolePreference("customer");
    router.replace("/home");
  }, [router]);
  // G1: no rider record → R1 (`/rider/become`); the "Earn with your bike" interstitial is gone. Only once the
  // mount's re-read of `me` has landed: right after Become a rider registers, a cached customer `me` (no rider
  // yet) must not bounce the new rider straight back to R1.
  const toBecome = kycScreen?.kind === "become" && !meQ.isFetching;
  useEffect(() => {
    if (toBecome) router.replace("/rider/become");
  }, [toBecome, router]);

  const offerFor = (j: BoardJob): void => {
    if (j.kind === "food") {
      router.push("/rider/food-offer");
      return;
    }
    router.push({ pathname: "/rider/offer/[jobId]", params: { jobId: j.id, toKm: j.toPickupKm != null ? j.toPickupKm.toFixed(1) : "" } });
  };

  // ── Layout ───────────────────────────────────────────────────────────────────────────────────────
  const [areaH, setAreaH] = useState(0);
  const [sheetVisible, setSheetVisible] = useState(0);
  const empty = online && openQ.isSuccess && jobs.length === 0 && myOffers.length === 0;
  // Peek 50% of the screen (44% when empty), measured from the screen's top, as the handoff draws it. The
  // floating tab bar (tab bar v1, D-56) takes no layout space, so the area runs to the screen's bottom
  // and everything above it is the mint top card; the sheet continues behind the bar.
  const tabSpace = useTabBarSpace();
  const mapShare = areaH > 0 ? Math.min(0.8, Math.max(0.2, (winH * (empty ? 0.56 : 0.5) - (winH - areaH)) / areaH)) : 0.5;

  const banner = <MintTop {...top} online={conn} loc={location.label} />;

  const gateView = gate ? renderGate(gate) : null;
  function renderGate(g: GateId): React.ReactElement | null {
    const call: GateAction = { label: R.callSupport, icon: "phone", onPress: callSupport };
    const floor = walletConfig?.floor ?? 2;
    const balance = wallet?.balance ?? null;
    switch (g) {
      // The KYC gates (Rider v2 G1–G7) are retired: `kycScreen` draws R1 / R2 / F1–F8 in their place (D-80).
      case "notRider":
      case "pending":
      case "unfinished":
      case "failed":
      case "failed2":
      case "expired":
      case "cantOpen":
        return null;
      case "gps":
        return (
          <Gate
            icon="map-pin"
            tone="danger"
            title={R.gGpsT}
            body={R.gGpsB}
            primary={{ label: R.openLoc, icon: "settings", onPress: () => void Linking.openSettings() }}
            ghost={{ label: R.gpsOn, icon: "check", onPress: () => void requestLocation() }}
          />
        );
      case "area":
        return <Gate icon="map-pin" tone="calm" title={R.gAreaT} body={R.gAreaB} bridge={leaveForCustomer} />;
      case "cooldown":
        return <Gate icon="clock" tone="calm" title={R.gCoolT} body={R.gCoolB} ghost={{ label: R.rJobHist, icon: "history", onPress: () => router.push("/history?side=rider") }} bridge={leaveForCustomer} />;
      case "hold":
        return <Gate icon="circle-alert" tone="danger" title={R.gHoldT} body={R.gHoldB} primary={call} bridge={leaveForCustomer} />;
      case "suspended":
        return <Gate icon="ban" tone="danger" title={R.gSuspT} body={RF.gSuspB(null)} primary={call} bridge={leaveForCustomer} />;
      case "banned":
        return <Gate icon="ban" tone="danger" title={R.gBanT} body={R.gBanB} ghost={call} bridge={leaveForCustomer} />;
      case "topup":
        return (
          <Gate
            icon="wallet"
            tone="danger"
            title={R.gTopT}
            body={RF.gTopB(floor)}
            facts={balance != null ? [[R.gTopK, usd(balance)], [R.gTopK2, usd(Math.max(0.01, floor - balance))]] : null}
            factsDanger
            primary={{ label: R.goTopUp, icon: "plus", onPress: () => router.push("/wallet/top-up") }}
          />
        );
    }
  }

  const sheetContent = (
    <>
      {notifOff ? (
        <View style={{ flexDirection: "row", gap: 10, alignItems: "center", borderWidth: 1, borderColor: tokens.color.danger, borderRadius: 12, paddingVertical: 6, paddingRight: 6, paddingLeft: 12 }}>
          <IconDiscBell />
          <Text style={{ flex: 1, fontSize: 13, lineHeight: 18, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink }}>{R.notifOff}</Text>
          <SmBtn kind="fill" label={R.turnOn} onPress={() => void Linking.openSettings()} />
        </View>
      ) : null}
      {/* Empty board: reconnecting shows only in the header's status line (empty-states v2 J4, D-78). */}
      {online && !conn && !empty ? <Notice icon="wifi-off" text={R.staleB} /> : null}
      {openQ.isError ? <Notice icon="wifi-off" text={R.loadFail} /> : null}
      {locHint ? <Notice icon="map-pin" tone="warn" text={R.gGpsB} /> : null}
      {activeJob && activeJob.status !== "assigned" ? (
        <SmBtn kind="fill" icon="package" label={RF.swJobBar(statusPillLabel(activeJob.status))} onPress={() => pushOnce(router, pathname, jobRoute)} />
      ) : null}
      {empty ? (
        // J4 / J5 — empty-states v2 (D-78): the quiet mark, one line, then the busiest zone if there is one.
        <View style={{ gap: 24 }}>
          <EmptyState inSheet offsetTop={24} icon="bike" title={emptyCopy.rider.noJobs.title} body={emptyCopy.rider.noJobs.body} />
          {busiest && loc ? (
            <EmptyRow
              centred
              icon="map-pin"
              iconSize={16}
              iconColor={tokens.color.accent}
              gap={8}
              text={fillEmpty(emptyCopy.rider.demandRow, { place: busiest.place, km: haversineKm(loc, busiest).toFixed(1) })}
            />
          ) : null}
        </View>
      ) : (
        <>
          {myOffers.length ? (
            <>
              <RLabel>{R.yourOffers}</RLabel>
              {myOffers.map((s) => (
                <BoardJobCard key={s.order.id} job={toBoardJob(s.order, loc)} offer={{ fare: Number(s.fare) }} onWithdraw={() => onWithdraw(s.order.id)} />
              ))}
              <RLabel style={{ marginTop: 4 }}>{R.nearbyJobs}</RLabel>
            </>
          ) : jobs.length ? (
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
              <Text style={{ flex: 1, fontSize: 17, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>{mixedKinds ? RF.jobsNearYou(jobs.length) : RF.nearYou(jobs.length)}</Text>
              <Text style={{ fontSize: 12, color: tokens.color.muted }}>{R.nearest}</Text>
            </View>
          ) : null}
          {!myOffers.length && (busyLine || foodOn) ? (
            <View style={{ gap: 4 }}>
              {busyLine ? <DemandLine text={busyLine} /> : null}
              {foodOn ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <IconSmall name="utensils" />
                  <Text style={{ flex: 1, fontSize: 13, color: tokens.color.muted }}>{R.foodRings}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
          <View style={{ gap: 10, opacity: online && !conn ? 0.6 : 1 }}>
            {jobs.map((j) => (
              <BoardJobCard key={j.id} job={j} selected={j.id === effectiveSelected} onSelect={() => setSelectedId(j.id)} onOffer={() => offerFor(j)} />
            ))}
          </View>
        </>
      )}
    </>
  );

  // G1: on the way to R1 — nothing of the board under it.
  if (kycScreen?.kind === "become") return <View testID="rider-to-become" style={{ flex: 1, backgroundColor: tokens.color.bg }} />;
  // F1–F8 (First Run v2, D-80): one full-screen shell, the ✕ its only way out. KycCheckHost presents the ID
  // check that "Try again" / "Finish ID check" / "Re-verify my ID" reopen.
  if (kycScreen?.kind === "outcome") {
    return (
      <>
        <IdCheckOutcome
          id={kycScreen.id}
          firstName={meQ.data?.firstName}
          triesLeft={kycTriesLeft(rider?.kycAttempts)}
          // NEEDS BACKEND (D-80 §4): the server doesn't serve when the ID expired yet; F6 drops the date.
          expiredAt={null}
          onExit={exitToCustomer}
          onRetry={() => retryM.mutate()}
          retrying={!!pendingOrQueued(retryM)}
          onHelp={whatsappSupport}
        />
        <KycCheckHost />
      </>
    );
  }
  // R2 and R3 are whole pages in the handoff (no mint top card), so they replace the board outright.
  // Calm Mint v2 R2 (D-55): "Rider setup" while the automated check is with the vendor (README G3 "or R2").
  if (kycScreen?.kind === "r2") {
    return (
      <View style={{ flex: 1, backgroundColor: tokens.color.bg }}>
        <RiderSetupPending onSendParcel={() => router.push("/send")} />
      </View>
    );
  }
  if (showWelcome && !gate) {
    return (
      <RiderVerified
        firstName={meQ.data?.firstName?.trim() || null}
        // D-70: "Commission-free jobs · N of 5 left", served by /auth/me (absent on an older server).
        freeJobs={rider?.freeJobs && rider.freeJobs.total > 0 ? rider.freeJobs : null}
        // D-80 §2 #5: R3's "Go online" starts the rider permission flow (P1…); P13's "Go online" is what goes
        // online. R3 is marked seen first, so the board the flow hands back to opens on the live board.
        onGoOnline={() => {
          void (async () => {
            if (profileId) await markRiderWelcomeSeen(profileId).catch(() => undefined);
            startRiderPermFlow(router);
          })();
        }}
        onPapers={() => router.push("/rider/documents")}
      />
    );
  }

  return (
    <AppScreen banner={banner}>
      {/*
        ── FIRST RUN v2 MOUNT SLOT (D-80) — wired by the integrator after the other phases merge ──
        · Worker A (P14): `RiderPermBoardRow` (J8, "Notifications are off…" + "Turn on" → P9) replaces the
          `notifOff` row at the top of `sheetContent`, and `RiderLocEmpty` (G8, Empty States v2 mark + "Turn on" → P1)
          takes the "gps" gate's place for a rider who skipped location.
        · Worker B (U4b): `<SoftUpdateBanner tone="violet" />` goes right here, under the mint top card.
      */}
      {meQ.isLoading ? null : gateView ? (
        gateView
      ) : (
        <View testID="rider-board-area" style={{ flex: 1 }} onLayout={(e) => setAreaH(e.nativeEvent.layout.height)}>
          <BoardMap jobs={jobs} selectedId={effectiveSelected} onSelect={setSelectedId} you={loc} zones={zones.map((z) => ({ ...z, busiest: z === busiest }))} padBottom={sheetVisible} />
          {areaH > 0 ? (
            <OrderSheet areaHeight={areaH} fallbackShare={mapShare} floor={0} bottomInset={tabSpace} contentKey={empty ? "empty" : "list"} reduceMotion={reduceMotion} onVisibleHeight={setSheetVisible}>
              {sheetContent}
            </OrderSheet>
          ) : null}
        </View>
      )}
      {toast ? (
        <View style={{ position: "absolute", left: 12, right: 12, bottom: tabSpace + 10, zIndex: 30 }}>
          <RToast text={toast.text} icon={toast.icon} action={toast.undo ? R.undo : undefined} onAction={toast.undo} />
        </View>
      ) : null}
      <MSheet
        visible={picked != null && !gate}
        locked
        onClose={() => undefined}
        icon="circle-check"
        iconTone="ok"
        title={picked ? RF.picked(picked.customerFirstName || R.theSender) : undefined}
        body={picked ? RF.pickedB(picked.pickup.landmark, picked.dropoff.landmark, Number(picked.agreedFare ?? picked.proposedFare)) : undefined}
        buttons={
          <CtaButton
            label={R.openJob}
            icon="arrow-right"
            onPress={() => {
              setPickedSeen(picked?.id ?? null);
              pushOnce(router, pathname, jobRoute);
            }}
          />
        }
      />
      <KycCheckHost />
    </AppScreen>
  );
}

function toBoardJob(o: OpenOrder, loc: { lat: number; lng: number } | null): BoardJob {
  return {
    id: o.id,
    pickup: { ...o.pickup.point, landmark: o.pickup.landmark },
    dropoff: { ...o.dropoff.point, landmark: o.dropoff.landmark },
    toPickupKm: loc ? haversineKm(loc, o.pickup.point) : null,
    tripKm: o.distanceKm ?? haversineKm(o.pickup.point, o.dropoff.point),
    item: o.itemDesc,
    asking: Number(o.proposedFare),
    kind: o.kind === "shop" ? "shop" : "parcel",
  };
}

function IconSmall({ name, color = tokens.color.muted }: { name: IconName; color?: string }): React.ReactElement {
  return <Icon name={name} size={15} color={color} />;
}

function IconDiscBell(): React.ReactElement {
  return <IconSmall name="bell" color={tokens.color.danger} />;
}

function DemandLine({ text }: { text: string }): React.ReactElement {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <IconSmall name="map-pin" color={tokens.color.accentText} />
      <Text style={{ flex: 1, fontSize: 13, fontWeight: tokens.font.weight.semibold, color: tokens.color.accentText }}>{text}</Text>
    </View>
  );
}
