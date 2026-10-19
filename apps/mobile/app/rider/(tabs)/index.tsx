import { COMMISSION, haversineKm, SOS_POLICY } from "@lynia/shared";
import { tokens } from "@lynia/shared/tokens";
import { onlineManager, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { useFocusEffect, usePathname, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Linking, Text, useWindowDimensions, View } from "react-native";
import { ApiError, currentProfileId } from "../../../src/api/client";
import { getMe, type Me } from "../../../src/api/auth";
import { withdrawOffer } from "../../../src/api/offers";
import { getActiveOrder, getOpenOrders, type OpenOrder } from "../../../src/api/orders";
import { getFoodDispatchOffers } from "../../../src/api/food-rider";
import { getFleetOffers, joinFleet } from "../../../src/api/fleet";
import { getDemandZones } from "../../../src/api/rider-v2";
import { noteKycLaunched, retryKyc, setOnline } from "../../../src/api/riders";
import { loadAcknowledgedHandbacks, saveRolePreference } from "../../../src/auth/session";
import { loadRiderFoodReturn, takeSignupAt } from "../../../src/auth/device-state";
import { usePrewarmRoutes, type PrewarmRoute } from "../../../src/boot/prewarm-routes";
import { supportWhatsAppUrl } from "../../../src/config";
import { KycCheckHost } from "../../../src/kyc/KycCheckHost";
import { clearStoredKycLaunch, loadStoredKycLaunch, peekStoredKycLaunch, rememberKycLaunch, storedKycLaunchLoaded, takeKycLaunch } from "../../../src/kyc/launch-hint";
import { endKycCheckHold, primeKycLaunch, runKycVerification } from "../../../src/kyc/verify";
import {
  freshKycLaunch,
  KYC_COMPLETED_HINT_MS,
  KYC_COMPLETED_HOLD_MS,
  KYC_RETRY_TRY_LATER,
  isKycRetryRateLimited,
  kycLaunchForGate,
  type KycLaunchMark,
  kycPollMs,
  onlineGateReason,
  type OnlineGateReason,
  resolveKycGate,
  resolveKycRetryFeedback,
} from "../../../src/logic/gates";
import { refreshHomeLocation, useHomeLocation } from "../../../src/logic/home-location";
import { openLocationSettings, readGps, switchOnLocation, useLocationReadyWatch } from "../../../src/permissions/location";
import { useKeepScreenOn } from "../../../src/logic/use-keep-screen-on";
import { replaceClearingStack } from "../../../src/logic/nav";
import { switchToCustomer } from "../../../src/logic/switch-to-customer";
import { kycScreenFor, parseIsoDay } from "../../../src/logic/kyc-outcome";
import { markRiderWelcomeSeen, riderWelcomeSeen, riderWelcomeSeenCached } from "../../../src/logic/rider-welcome";
import { boardPollMs } from "../../../src/logic/board-poll";
import { isRecentFix, LAST_KNOWN_MAX_ACCURACY_M, LAST_KNOWN_MAX_AGE_MS } from "../../../src/logic/last-known-fix";
import { EVENTS, track } from "../../../src/telemetry/events";
import { refusedJobCommission, topUpGate } from "../../../src/logic/topup";
import { useSettled } from "../../../src/logic/use-settled";
import { RIDER_PERM_ROUTES, startRiderPermFlow } from "../../../src/logic/rider-perm-flow";
import { RiderLocEmpty, RiderNotifOffRow } from "../../../src/ui/firstrun/RiderPermBoard";
import { SoftUpdateBanner } from "../../../src/ui/firstrun/SoftUpdateBanner";
import { isSentOfferExpired, isSentOfferStale, wasRaisedSinceBid } from "../../../src/logic/rider-bid-draft";
import { type GateId, kycTriesLeft, resolveGate } from "../../../src/logic/rider-gate";
import { telUri } from "../../../src/logic/safety";
import { useFeatureFlags } from "../../../src/net/use-feature-flags";
import { pushOnce } from "../../../src/push/push";
import { pendingOrQueued } from "../../../src/query/client";
import { useMyFleet } from "../../../src/query/use-my-fleet";
import { useSentOffers, useSkippedJobs } from "../../../src/query/use-sent-offers";
import { useTabTop } from "../../../src/query/use-tab-top";
import { useWallet, useWalletConfig } from "../../../src/query/use-wallet";
import { useForegroundRefetch } from "../../../src/realtime/use-foreground-refetch";
import { useRiderBoard } from "../../../src/realtime/use-rider-board";
import { useRiderHeartbeat } from "../../../src/realtime/use-rider-heartbeat";
import { AppScreen, EmptyRow, EmptyState, emptyCopy, fillEmpty, haptic, Icon, type IconName, statusPillLabel, useActionError, useHideTabBar, useTabBarSpace, useToast } from "../../../src/ui";
import { IdCheckOutcome } from "../../../src/ui/firstrun";
import { CtaButton, SkeletonOffer, SmBtn } from "../../../src/ui/order/kit";
import { OrderSheet, type OrderSheetHandle } from "../../../src/ui/order/OrderSheet";
import { Notice } from "../../../src/ui/send/kit";
import { type BoardJob, BoardJobCard, BoardMap, fleetBoardJob, Gate, type GateAction, RToast } from "../../../src/ui/rider/board";
import { RIDER_COPY as R, RF, usd } from "../../../src/ui/rider/copy";
import { FleetCountRow, FleetIdPending, FleetInviteWaiting, FleetJoinCard, FleetLoadFail, FleetRingsHint, FleetSkeletonCard } from "../../../src/ui/rider/fleet";
import { OBB } from "../../../src/ui/rider/fleet-copy";
import { MintTop, MSheet, RLabel } from "../../../src/ui/rider/kit";
import { RiderErrorState } from "../../../src/ui/rider/RiderErrorState";
import { useReduceMotion } from "../../../src/ui/useReduceMotion";
import { RiderSetupPending, RiderVerified } from "../../../src/ui/onboarding/rider";
import { withTimeout } from "../../../src/util";

// GPS fix bound: a cold fix can hang forever, and the server records a broadcast-eligible position only
// `if (online && location)` — so race the fix and fall back to the last-known one.
const LOCATE_TIMEOUT_MS = 9_000;
/** The cached-position read is a device call too — bounded so it can never hold the fresh fix up. */
const LAST_KNOWN_READ_TIMEOUT_MS = 2_000;
/** Transient activation failures retry forever: 15 s, doubling, capped at 2 min (B5). */
const ACTIVATION_RETRY_MS = 15_000;
const ACTIVATION_RETRY_MAX_MS = 120_000;
/** The Undo window on a withdrawn offer (J10); the API call fires after it. */
const WITHDRAW_UNDO_MS = 5_000;
/** How long the board's link may stay down before it says "Reconnecting…" (a cold open's socket handshake). */
const CONN_GRACE_MS = 8_000;

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
 * The ID check is First Run v2's (`packages/design/handoff/first-run-v2/`, ledger D-82): an unverified rider
 * sees the outcome page F1–F8 full screen (no tab bar, no mint top card; ✕ switches to the customer side),
 * Calm Mint v2 R2 while the automated check runs, R3 once verified — and an account with no rider record
 * goes to R1 (`/rider/become`, G1). The non-KYC gates (GPS, area, cooldown, hold, suspended, banned, top-up)
 * keep their Rider v2 walls.
 *
 * ALWAYS ONLINE (owner 2026-08-17): being here, past every gate, IS the shift — `online` is machine
 * state. NO manual refresh anywhere (D-30): the socket, the polls and the foreground re-read keep the
 * board current.
 */
/** FJ-H3: the return leg the board has already reopened this app run (so Back from it stays on the board). */
let broughtBackTo: string | null = null;
/** OB-R2 "Not now": the invite this app run set aside (it comes back on the next launch). */
let fleetInviteSetAside: string | null = null;

export default function RiderHome(): React.ReactElement {
  usePrewarmRoutes(BOARD_PREWARM);
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();
  const top = useTabTop("rider");
  const reduceMotion = useReduceMotion();
  const { height: winH } = useWindowDimensions();
  const { merchantDispatchAutoEnabled: foodOn } = useFeatureFlags();
  // Own bikers (D-117): a biker in a business's fleet gets that business's jobs (OB-R4), not the public board;
  // an invited one sees the Join card (OB-R2). Public reads wait for the answer, so a fleet biker never
  // flashes the public board's "Couldn't load" (its routes refuse a fleet biker).
  const myFleet = useMyFleet();
  const fleet = myFleet.fleet;
  const setError = useActionError();
  const { show: showNotice } = useToast();
  const [onlineFlag, setOnlineState] = useState(() => qc.getQueryData<Me>(["me"])?.rider?.kycStatus === "verified");
  const autoOnlineRef = useRef(false);
  const [activationRetry, setActivationRetry] = useState(0);
  // B5: bumped to make the auto-online effect re-test (a retry tick, focus, resume, network back).
  const [activationNudge, setActivationNudge] = useState(0);
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [locDenied, setLocDenied] = useState(false);
  // FR-H1: not granted but still askable (never asked — a C1 "Ride" signup — or denied once). Not a wall while
  // R3 is held: R3's "Go online" runs the flow, whose P1 explains and asks again (P5 after a second no).
  // Only a BLOCKED permission (can't ask again) walls past R3.
  const [locAskable, setLocAskable] = useState(false);
  const [locHint, setLocHint] = useState(false);
  // The phone's location switch is off (permission granted): "Open location settings" turns it on in one tap.
  const [gpsOff, setGpsOff] = useState(false);
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
  const { skipped, skip } = useSkippedJobs();
  const bidIds = useMemo(() => new Set(sentOffers.map((s) => s.order.id)), [sentOffers]);
  const sentById = useMemo(() => new Map(sentOffers.map((s) => [s.order.id, s])), [sentOffers]);
  // Offers withdrawn but still inside their 5 s Undo window — hidden now, sent to the API after.
  const [withdrawing, setWithdrawing] = useState<ReadonlySet<string>>(new Set());

  // ── Location ─────────────────────────────────────────────────────────────────────────────────────
  // First Run v2 (ledger D-82): the board only READS the permission. The ask is the rider flow's (P1 —
  // from R3's "Go online" or G8's "Turn on"), so no bare OS dialog ever pops over the board or the splash.
  const requestLocation = useCallback(async (): Promise<void> => {
    const perm = await Location.getForegroundPermissionsAsync().catch(() => null);
    const status = perm?.status ?? "denied";
    setLocAskable(status !== "granted" && perm?.canAskAgain !== false);
    if (status !== "granted") {
      setLocDenied(true);
      return;
    }
    setLocDenied(false);
    void readGps().then((on) => setGpsOff(!on));
    // The header's street label lives in the shared store, which only detects on mount — a grant made after
    // the board mounted (P1, the phone's settings) must reach it too, or the header stays blank.
    refreshHomeLocation();
    // Go online on a RECENT cached position at once (≤ 2 min, accurate enough — last-known-fix.ts) instead of
    // waiting up to LOCATE_TIMEOUT_MS for a fresh fix; the fresh fix below refines it when it lands.
    let seeded = false;
    try {
      const recent = await withTimeout(
        Location.getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS, requiredAccuracy: LAST_KNOWN_MAX_ACCURACY_M }),
        LAST_KNOWN_READ_TIMEOUT_MS,
      );
      if (recent && isRecentFix(recent, Date.now())) {
        setLoc({ lat: recent.coords.latitude, lng: recent.coords.longitude });
        setLocHint(false);
        seeded = true;
      }
    } catch {
      /* no cached position — wait for the fresh fix */
    }
    try {
      const p = await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), LOCATE_TIMEOUT_MS);
      setLoc({ lat: p.coords.latitude, lng: p.coords.longitude });
      setLocHint(false);
    } catch {
      if (seeded) return; // the recent cached position stands
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
    // BD-H1: location permission is re-read on resume too, so turning it off in settings shows G8 at once.
    const sub = AppState.addEventListener("change", (s) => {
      if (s !== "active") return;
      readNotif();
      void requestLocation();
    });
    return () => sub.remove();
  }, [readNotif, requestLocation]);

  // ── Identity / KYC ───────────────────────────────────────────────────────────────────────────────
  // The last ID-check launch on this board (or handed over by Become, R-4 / R-10) and when it landed.
  // A `completed` mark only counts while fresh (gates.ts freshKycLaunch); `failed` holds for the screen.
  // Seeded on the FIRST render (not a focus effect, which ran a frame late and flashed F3): Become's hand-off,
  // else the completed launch stored on this phone (launch-hint.ts) — so a restart, or a board mounted fresh
  // minutes after the check, still holds F8 / R2 while the vendor catches up instead of "Finish your ID check".
  const launchProfileId = qc.getQueryData<Me>(["me"])?.profileId ?? currentProfileId();
  const [kycLaunch, setKycLaunch] = useState<KycLaunchMark | null>(() => takeKycLaunch() ?? peekStoredKycLaunch(launchProfileId));
  // Whether the stored mark has been read this process — until it has, an F3 might be a check just finished.
  const [launchRead, setLaunchRead] = useState(() => storedKycLaunchLoaded());
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
      const g = isVerified ? null : resolveKycGate(r, kycLaunchForGate(kycLaunchRef.current, now, r));
      const since = inFlightSinceRef.current;
      return kycPollMs(g, isVerified, since == null ? 0 : now - since);
    },
  });
  const knownUnverified = meQ.data != null && meQ.data.rider?.kycStatus !== "verified";
  const meFailed = meQ.isError && meQ.data == null;
  const rider = meQ.data?.rider;
  const forceFreshSession = useRef(false);
  const spentForce = useRef(false);
  const retryCamera = useRef<Promise<boolean> | null>(null);
  // A launch on this board: shown now, and stored on the phone (a completed one survives a restart).
  const setLaunch = useCallback(
    (mark: KycLaunchMark): void => {
      setKycLaunch(mark);
      rememberKycLaunch(mark, qc.getQueryData<Me>(["me"])?.profileId ?? currentProfileId());
    },
    [qc],
  );
  // The gate bridges ("Use LyniaGo as a customer"): the same switch as the Account toggle — the side is
  // saved and the rider goes offline (online stays only for a job in hand), then customer Home with the
  // rider stack cleared from under it.
  const hasActiveJobRef = useRef(false);
  const leaveForCustomer = useCallback((): void => {
    void switchToCustomer(hasActiveJobRef.current).then((ok) => (ok ? undefined : setError(R.offFail)));
    replaceClearingStack(router, "/home");
  }, [router, setError]);
  // A completed launch holds the check in flight past F8 while the server can't yet tell it from an
  // unfinished one (gates.ts kycLaunchForGate) — R2, never a false F3.
  const kycGate = knownUnverified ? resolveKycGate(rider, kycLaunchForGate(kycLaunch, Date.now(), rider)) : null;
  if (kycGate?.kind === "in_flight") inFlightSinceRef.current ??= Date.now();
  else inFlightSinceRef.current = null;
  // A `completed` mark is F8 for KYC_COMPLETED_HINT_MS and holds the check in flight for at most
  // KYC_COMPLETED_HOLD_MS — re-render at each edge, so the next page shows even if no poll lands in between.
  const [, setHintTick] = useState(0);
  useEffect(() => {
    if (kycLaunch?.outcome !== "completed") return;
    const timers = [KYC_COMPLETED_HINT_MS, KYC_COMPLETED_HOLD_MS]
      .map((ms) => kycLaunch.at + ms - Date.now())
      .filter((left) => left > 0)
      .map((left) => setTimeout(() => setHintTick((n) => n + 1), left + 50));
    return () => timers.forEach(clearTimeout);
  }, [kycLaunch]);
  // The stored completed launch (a restart, or a board mounted fresh): read once, never over a newer launch.
  const meProfileId = meQ.data?.profileId ?? launchProfileId;
  useEffect(() => {
    if (!meProfileId) return;
    let alive = true;
    void loadStoredKycLaunch(meProfileId).then((m) => {
      if (!alive) return;
      if (m) setKycLaunch((prev) => prev ?? m);
      setLaunchRead(true);
    });
    return () => {
      alive = false;
    };
  }, [meProfileId]);
  // `me` moved past pending (verified, declined, expired): the stored mark has served its purpose.
  const pastPending = rider != null && rider.kycStatus !== "pending";
  useEffect(() => {
    if (pastPending) clearStoredKycLaunch();
  }, [pastPending]);
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
  // Seeded from what this process already read (a remount draws its answer on the first frame).
  const [welcomeSeen, setWelcomeSeen] = useState<boolean | null>(() => (profileId ? riderWelcomeSeenCached(profileId) : null));
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
  const onlineRef = useRef(online);
  onlineRef.current = online;

  // BD-H1: while online, follow the rider (Balanced, ~100 m) so the heartbeat, the open-jobs read, the
  // distances and the socket's area all use where they are now, not where the board was last focused.
  useEffect(() => {
    if (!online || locDenied) return;
    let alive = true;
    let sub: Location.LocationSubscription | null = null;
    Promise.resolve()
      .then(() =>
        Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, distanceInterval: 100 }, (p) => {
          setLoc({ lat: p.coords.latitude, lng: p.coords.longitude });
          setLocHint(false);
        }),
      )
      .then((s) => {
        if (alive) sub = s;
        else s.remove();
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      sub?.remove();
    };
  }, [online, locDenied]);

  // ── Board socket + active job ────────────────────────────────────────────────────────────────────
  // BD-M5: a next-round offer while the offer screen is already up refreshes it rather than stacking a copy.
  const board = useRiderBoard(
    online,
    loc,
    bidIds,
    foodOn && !fleet
      ? (orderId: string) => {
          void qc.invalidateQueries({ queryKey: ["foodOffers"] });
          // An offer already on screen stays there (it refreshes); the new one waits on the board as its card.
          if (pathname === "/rider/food-offer") void qc.invalidateQueries({ queryKey: ["foodOfferJob"] });
          else router.push({ pathname: "/rider/food-offer", params: { orderId } });
        }
      : undefined,
    // OB-R7: a fleet job rings full screen; one already on screen re-reads instead of stacking a copy.
    fleet
      ? (orderId: string) => {
          if (pathname === "/rider/fleet-offer") void qc.invalidateQueries({ queryKey: ["fleetOffer"] });
          else router.push({ pathname: "/rider/fleet-offer", params: { orderId } });
        }
      : undefined,
  );
  const activeQ = useQuery({
    queryKey: ["activeJob"],
    queryFn: getActiveOrder,
    // §5 item 10: no active-job read behind a KYC wall — an unverified rider can't hold a job.
    enabled: !knownUnverified,
    // BD-H3: a failed check retries silently every 8 s even while the socket is up (no card — owner 2026-08-12).
    refetchInterval: (query) => (query.state.status === "error" ? 8000 : board.connected ? false : online || query.state.data != null ? 8000 : false),
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
  // FJ-H3: a venue's cash or order still riding back (kept on the phone by the food job until the venue
  // confirms) — the server holds new offers until then, so open that leg again, once per app run.
  const noJob = activeQ.isSuccess && activeQ.data == null;
  useFocusEffect(
    useCallback(() => {
      if (!noJob) return;
      let alive = true;
      void loadRiderFoodReturn().then((m) => {
        if (!alive || !m || broughtBackTo === m.orderId) return;
        broughtBackTo = m.orderId;
        router.push("/rider/food-job");
      });
      return () => {
        alive = false;
      };
    }, [noJob, router]),
  );

  // J11: "Rudo picked you!" — once per assignment, with the job ping. BD-H5: parcel jobs only (a food or
  // shop job is accepted on its own offer screen), and only while the board is the screen on top.
  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  // Owner 2026-10-12: an online rider waiting on the board keeps the screen on, so the heartbeat keeps
  // beating (it stops when the phone locks) and their bids stay fresh. Locking by hand still works.
  useKeepScreenOn(online && focused);
  const [pickedSeen, setPickedSeen] = useState<string | null>(null);
  const picked = focused && activeJob?.status === "assigned" && activeJob.orderType !== "merchant" && pickedSeen !== activeJob.id ? activeJob : null;
  const prevJobStatus = useRef<string | undefined>(undefined);
  useEffect(() => {
    const s = activeJob?.status;
    if (s === "assigned" && prevJobStatus.current !== "assigned") haptic("success");
    prevJobStatus.current = s;
  }, [activeJob?.status]);
  const prevHadJobRef = useRef(false);
  const hasActiveJob = activeJob != null;
  hasActiveJobRef.current = hasActiveJob;
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
  // The commission a `commission_low_balance` refusal names (null when it names none) — the top-up wall's
  // "Top up at least" covers that job, not a floor (D-102).
  const [refusedCommission, setRefusedCommission] = useState<number | null>(null);
  // B5: a rider who should be online but isn't (failed go-online, a bare heartbeat 403) tries again now.
  const reactivate = useCallback((): void => {
    if (onlineRef.current) return;
    autoOnlineRef.current = false;
    setActivationRetry(0);
    setActivationNudge((n) => n + 1);
  }, []);
  // The `me` re-read on focus / resume is the KYC refresh path (pending, declined, unverified riders). A
  // VERIFIED rider's `me` has nothing for it to refresh — a revoked or expired ID is reported by the server's
  // go-online / heartbeat refusal (reason `kyc`), which re-reads `me` itself — so it isn't re-read each time.
  const refreshMeUnlessVerified = useCallback((): void => {
    if (qc.getQueryData<Me>(["me"])?.rider?.kycStatus === "verified") return;
    void qc.invalidateQueries({ queryKey: ["me"] });
  }, [qc]);
  useFocusEffect(
    useCallback(() => {
      setServerGate(null);
      reactivate();
      refreshMeUnlessVerified();
    }, [reactivate, refreshMeUnlessVerified]),
  );
  useForegroundRefetch(() => {
    setServerGate(null);
    reactivate();
    refreshMeUnlessVerified();
  });
  // …and the moment the network comes back.
  useEffect(() => onlineManager.subscribe((up) => up && reactivate()), [reactivate]);
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
      track(EVENTS.goOnline, { ok: true, with_position: loc != null });
      // Funnel: sign-up → first time online, once per account on this phone (no stamp ⇒ nothing sent).
      const pid = qc.getQueryData<Me>(["me"])?.profileId;
      if (pid && (res?.online ?? true)) {
        void takeSignupAt(pid).then((at) => {
          if (at != null) track(EVENTS.firstOnline, { ms_since_signup: Math.max(0, Date.now() - at) });
        });
      }
    },
    onError: (e) => {
      const reason = e instanceof ApiError ? onlineGateReason(e) : null;
      track(EVENTS.goOnline, { ok: false, reason: reason ?? (e instanceof ApiError ? `http_${e.status}` : "network") });
      if (reason) {
        setServerGate(reason);
        setRefusedCommission(e instanceof ApiError ? refusedJobCommission(e.body) : null);
        // The cooldown wall's "Clears at" reads `me` too — and a verified rider's `me` isn't re-read on focus.
        if (reason === "kyc" || reason === "cooldown") void qc.invalidateQueries({ queryKey: ["me"] });
        return;
      }
      setServerGate(null);
      setActivationRetry((n) => n + 1);
    },
  });

  // ALWAYS ONLINE: drive the server flag true the moment every wall is down.
  // R-9: a failed re-read keeps the last known `me` (TanStack keeps data on error), so the shift
  // follows what we know rather than dropping on one 5xx.
  const onlineAllowed = meQ.data != null && !knownUnverified && !holdForWelcome && !locDenied && serverGate == null;
  useEffect(() => {
    if (!onlineAllowed) {
      autoOnlineRef.current = false;
      return;
    }
    if (autoOnlineRef.current || onlineM.isPending) return;
    if (loc == null && !locHint) return;
    autoOnlineRef.current = true;
    onlineM.mutate(true);
    // B5: `onlineFlag` re-runs it after a heartbeat 403 takes the rider offline with no reason code.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlineAllowed, loc, locHint, onlineFlag, activationNudge]);

  const retryM = useMutation({
    mutationFn: () => {
      const force = forceFreshSession.current;
      if (force) spentForce.current = true;
      // The sheet's camera permission, the sheet itself and the prewarm start while the session is minted,
      // not after (verify.ts primeKycLaunch).
      retryCamera.current = primeKycLaunch();
      return retryKyc(force);
    },
    onSuccess: async (res) => {
      const feedback = resolveKycRetryFeedback(res);
      // Nothing to open (manual review, no session): the stand-in sheet goes before any notice is shown.
      if (!feedback.launch) endKycCheckHold();
      // No session to open in auto mode: the check couldn't open — F7, the page that says so (D-82).
      if (feedback.error) setLaunch({ outcome: "failed", at: Date.now() });
      // Manual review has nothing to open by design: say so calmly (the board shows F1 once `me` agrees).
      if (feedback.info) showNotice(feedback.info, "info");
      if (feedback.launch) {
        const launch = await runKycVerification(feedback.launch, { camera: retryCamera.current ?? undefined });
        setLaunch({ outcome: launch.outcome, at: Date.now() });
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
    // Backstop: the stand-in sheet never outlives the attempt.
    onSettled: () => endKycCheckHold(),
    // A rate limit is the one toast, in our words. Anything else — the vendor down (a 5xx), no
    // connection — is the check not opening: F7, whose "Try again" is this mutation again. A terminal
    // server state (a lock, a decline) still outranks it once `me` is re-read. Never the server's words.
    onError: (e) => {
      endKycCheckHold();
      if (e instanceof ApiError && isKycRetryRateLimited(e)) setError(KYC_RETRY_TRY_LATER);
      else setLaunch({ outcome: "failed", at: Date.now() });
      void qc.invalidateQueries({ queryKey: ["me"] });
    },
  });

  // B5: a transient go-online failure retries with a capped backoff and never gives up; the effect above
  // re-checks the walls before each try.
  useEffect(() => {
    if (activationRetry === 0) return;
    const t = setTimeout(
      () => {
        autoOnlineRef.current = false;
        setActivationNudge((n) => n + 1);
      },
      Math.min(ACTIVATION_RETRY_MAX_MS, ACTIVATION_RETRY_MS * 2 ** (activationRetry - 1)),
    );
    return () => clearTimeout(t);
  }, [activationRetry]);

  // Heartbeat: only a 403 takes the rider offline; two failed beats show "Reconnecting…". Coming back to
  // the app beats at once (see use-rider-heartbeat.ts).
  const { stale: beatStale } = useRiderHeartbeat(
    online,
    () => locRef.current,
    (e) => {
      setOnlineState(false);
      autoOnlineRef.current = false;
      const reason = onlineGateReason(e);
      setServerGate(reason);
      setRefusedCommission(refusedJobCommission(e.body));
      if (reason === "kyc") void qc.invalidateQueries({ queryKey: ["me"] });
    },
  );

  // ── Open jobs ────────────────────────────────────────────────────────────────────────────────────
  const openQ = useQuery({
    queryKey: ["openOrders"],
    queryFn: () => getOpenOrders(loc ?? undefined, 5000),
    enabled: online && myFleet.loaded && !fleet,
    // The socket keeps the list live; while it's down — or the last read failed (BD-H4) — re-read every
    // 10 s (J7: "Trying again in 10 s").
    refetchInterval: (query) => boardPollMs(online, board.connected, query.state.status === "error", 10_000),
  });
  useEffect(() => {
    if (!online || !loc) return;
    void qc.invalidateQueries({ queryKey: ["openOrders"] });
  }, [loc?.lat, loc?.lng, online, qc]);
  useForegroundRefetch(() => {
    void qc.invalidateQueries({ queryKey: ["openOrders"] });
    void qc.invalidateQueries({ queryKey: ["activeJob"] });
  }, online);

  // Owner 2026-10-01: food, shop and parcel jobs all show on the board, tagged. A food job is a live
  // dispatch offer the server is holding for THIS rider. Several orders can ring one rider at once (each
  // round goes to several riders), so each gets its own card (owner 2026-10-12); a new one still rings
  // full screen, and a card opens its own offer.
  // The board socket pushes each new offer (`food:offer` → this query is invalidated), so the 15 s poll only
  // runs while that socket is down or the last read failed — the same gating as the open-jobs read above.
  const foodOffersQ = useQuery({
    queryKey: ["foodOffers"],
    queryFn: getFoodDispatchOffers,
    enabled: online && !!foodOn && myFleet.loaded && !fleet,
    refetchInterval: (query) => boardPollMs(online && !!foodOn && !fleet, board.connected, query.state.status === "error", 15_000),
  });
  // OB-R4/R5: a fleet biker's jobs are the offers ringing them now. `fleet:offer` / `fleet:offer-closed` re-read
  // the list; the poll runs while the socket is down or the last read failed ("Trying again in 10 s").
  const fleetOn = online && !!fleet && !fleet.paused;
  const fleetOffersQ = useQuery({
    queryKey: ["fleetOffers"],
    queryFn: getFleetOffers,
    enabled: fleetOn,
    refetchInterval: (query) => boardPollMs(fleetOn, board.connected, query.state.status === "error", 10_000),
  });
  const liveFleetIds = fleet ? (fleetOffersQ.data ?? []).filter((o) => new Date(o.expiresAt).getTime() > Date.now()).map((o) => o.orderId).join(",") : "";
  // Expiry is re-checked on every render (an offer drops off as soon as it runs out, as before); the list
  // itself only changes when the set of live offers does, so `jobs` below stays memoised.
  const liveFoodIds = foodOn ? (foodOffersQ.data ?? []).filter((o) => new Date(o.expiresAt).getTime() > Date.now()).map((o) => o.orderId).join(",") : "";
  const foodOffers = useMemo(() => {
    const live = new Set(liveFoodIds.split(","));
    return (foodOffersQ.data ?? []).filter((o) => live.has(o.orderId));
  }, [liveFoodIds, foodOffersQ.data]);
  const jobs: BoardJob[] = useMemo(() => {
    if (fleet) {
      const live = new Set(liveFleetIds.split(","));
      return (fleetOffersQ.data ?? [])
        .filter((o) => live.has(o.orderId))
        .map((o) => fleetBoardJob(o, fleet.shop, loc))
        .sort((a, b) => (a.toPickupKm ?? Number.MAX_SAFE_INTEGER) - (b.toPickupKm ?? Number.MAX_SAFE_INTEGER));
    }
    const parcels = (Array.isArray(openQ.data) ? openQ.data : [])
      // A job the rider already bid on stays off the board — unless the sender has since raised the
      // price, which lets the rider answer the new one (owner 2026-10-12; the API replaces their offer).
      .filter((o) => {
        const sent = sentById.get(o.id);
        return (!sent || wasRaisedSinceBid(sent, o)) && !skipped.has(o.id);
      })
      .map((o) => toBoardJob(o, loc));
    const food: BoardJob[] = foodOffers.map((o) => ({
      id: `food:${o.orderId}`,
      pickup: { ...o.pickup.point, landmark: o.pickup.landmark },
      dropoff: { ...o.dropoff.point, landmark: o.dropoff.landmark },
      toPickupKm: loc ? haversineKm(loc, o.pickup.point) : null,
      tripKm: o.distanceKm,
      item: o.itemDesc,
      asking: o.deliveryFee ?? 0,
      kind: "food",
    }));
    return [...food, ...parcels].sort((a, b) => (a.toPickupKm ?? Number.MAX_SAFE_INTEGER) - (b.toPickupKm ?? Number.MAX_SAFE_INTEGER));
  }, [openQ.data, sentById, skipped, loc, foodOffers, fleet, liveFleetIds, fleetOffersQ.data]);
  const mixedKinds = jobs.some((j) => j.kind === "food" || j.kind === "shop");
  const effectiveSelected = selectedId && jobs.some((j) => j.id === selectedId) ? selectedId : (jobs[0]?.id ?? null);

  // J13: the job the rider was looking at was taken by someone else. BD-M2: the socket drops the card
  // first and marks it taken only after the active-job re-read, so remember a selected card that left the
  // list and say so when (if) it turns out to have been taken.
  const prevSelected = useRef<string | null>(null);
  const lostSelected = useRef<string | null>(null);
  useEffect(() => {
    const was = prevSelected.current;
    if (was && was !== effectiveSelected && !jobs.some((j) => j.id === was)) lostSelected.current = was;
    prevSelected.current = effectiveSelected;
    const lost = lostSelected.current;
    if (lost && board.takenOrderIds.has(lost)) {
      lostSelected.current = null;
      if (!bidIds.has(lost) && !skipped.has(lost)) showToast({ text: R.taken });
    }
  }, [effectiveSelected, jobs, board.takenOrderIds, bidIds, skipped, showToast]);

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
        const unhide = (): void => setWithdrawing((prev) => new Set([...prev].filter((id) => id !== orderId)));
        const drop = (): void => {
          resolvedRef.current.add(orderId);
          // The API refuses a second offer after a withdraw, so the job stays off the board.
          skip(orderId);
          setSentOffers((prev) => prev.filter((p) => p.order.id !== orderId));
          unhide();
          void qc.invalidateQueries({ queryKey: ["openOrders"] });
        };
        void withdrawOffer(orderId).then(drop, (e: unknown) => {
          // BD-H2: a 4xx is the server's final word (no offer left to withdraw) — drop it. A dropped link
          // or a 5xx means the offer still stands: put the card back and say so.
          if (e instanceof ApiError && !e.retryable) drop();
          else {
            unhide();
            showToast({ text: R.withdrawFail });
          }
        });
      }, WITHDRAW_UNDO_MS),
    );
  };
  const myOffers = sentOffers.filter((s) => s.order.id !== activeJob?.id && !withdrawing.has(s.order.id));

  // ── Demand (busy zones) ──────────────────────────────────────────────────────────────────────────
  const zonesQ = useQuery({ queryKey: ["demandZones", loc?.lat.toFixed(2), loc?.lng.toFixed(2)], queryFn: () => getDemandZones(loc), enabled: online && myFleet.loaded && !fleet, staleTime: 2 * 60_000, refetchInterval: online ? 2 * 60_000 : false });
  const zones = zonesQ.data ?? [];
  const busiest = zones.length ? zones.reduce((a, b) => (b.level > a.level ? b : a)) : null;
  const busyLine = busiest && loc ? RF.busyLine(busiest.place, haversineKm(loc, busiest)) : null;

  // ── Gates ────────────────────────────────────────────────────────────────────────────────────────
  // §5 item 10: the balance only matters past the KYC walls (the top-up gate) — no read behind one.
  const { wallet } = useWallet({ enabled: !knownUnverified });
  const { config: walletConfig } = useWalletConfig();
  // R-9: keyed on DATA, not on the query status: a failed re-read keeps the last good `me` (TanStack keeps
  // data on error), so a pending, declined or locked rider stays behind their wall through a 5xx.
  const gate: GateId | null = meQ.data == null ? null : resolveGate({ kyc: kycGate, server: serverGate, locDenied: locDenied && !(holdForWelcome && locAskable) });
  // Location granted or switched on by any route — P1, the phone's settings, the one-tap dialog, the
  // quick-settings shade (which never backgrounds the app) — re-reads at once, so the board never sits on
  // "Can't find your location" or a blank header after location is on.
  useLocationReadyWatch(locDenied || gpsOff || locHint || gate === "gps", () => void requestLocation());
  // G8's primary: the switch off → Google's one-tap dialog (the Location screen where it doesn't exist);
  // the switch on but no fix → the Location screen, as before.
  const turnOnLocation = useCallback((): void => {
    if (!gpsOff) return openLocationSettings();
    void switchOnLocation().then((on) => {
      if (on) void requestLocation();
    });
  }, [gpsOff, requestLocation]);
  // G10 "Clears at" (BD-M3): the cooldown's end from /auth/me (absent on an older server). The facts tick
  // each minute, and the wall lifts by itself when the timer ends.
  const coolUntil = rider?.cooldownUntil ? new Date(rider.cooldownUntil) : null;
  const coolUntilMs = coolUntil && !Number.isNaN(coolUntil.getTime()) ? coolUntil.getTime() : null;
  const [coolNow, setCoolNow] = useState(() => Date.now());
  useEffect(() => {
    if (gate !== "cooldown" || coolUntilMs == null) return;
    const tick = (): void => setCoolNow(Date.now());
    tick();
    const iv = setInterval(tick, 60_000);
    // Only a timer that is still running on this phone's clock lifts the wall — a phone clock ahead of the
    // server's must not re-try go-online in a loop (the wall then waits for focus / resume, as before).
    const left = coolUntilMs - Date.now();
    const end = left > 0 ? setTimeout(() => setServerGate(null), left + 1000) : null;
    return () => {
      clearInterval(iv);
      if (end) clearTimeout(end);
    };
  }, [gate, coolUntilMs]);
  const conn = online && board.connected && !beatStale;
  // Owner 2026-10-12: the board opened on "Reconnecting…" on good Wi-Fi — the live socket and go-online
  // are still in flight for the first seconds of every open. So the not-connected states only show once
  // the link has stayed down past a grace period (or go-online has actually failed), and clear at once.
  const connDown = useSettled(!conn, CONN_GRACE_MS);
  const goOnlineStuck = useSettled(onlineAllowed && !online, CONN_GRACE_MS);

  // ── ID check (First Run v2 F / G, ledger D-82) ───────────────────────────────────────────────────
  const kycScreen = kycScreenFor({ gate, kyc: kycGate, launch: freshKycLaunch(kycLaunch, Date.now()), declineReason: rider?.kycDeclineReason });
  // F1–F8 are full screens: no tab bar (D-82 §2 #3).
  useHideTabBar(kycScreen?.kind === "outcome");
  // ✕ switches to the customer side (Home), as the Account toggle does; reopening the rider side re-resolves
  // the same page from the server's state (G3).
  const exitToCustomer = useCallback((): void => {
    void saveRolePreference("customer");
    replaceClearingStack(router, "/home");
  }, [router]);
  // G1: no rider record → R1 (`/rider/become`); the "Earn with your bike" interstitial is gone. Only once the
  // mount's re-read of `me` has landed: right after Become a rider registers, a cached customer `me` (no rider
  // yet) must not bounce the new rider straight back to R1.
  const toBecome = kycScreen?.kind === "become" && !meQ.isFetching;
  useEffect(() => {
    if (toBecome) router.replace("/rider/become");
  }, [toBecome, router]);

  // BD-M4: a pin tap brings its card into view in the sheet (BoardMap spec).
  const sheetRef = useRef<OrderSheetHandle>(null);
  const listY = useRef(0);
  const cardY = useRef(new Map<string, number>());
  const onPinSelect = useCallback((id: string): void => {
    setSelectedId(id);
    const y = cardY.current.get(id);
    if (y != null) sheetRef.current?.scrollTo(listY.current + y);
  }, []);

  const offerFor = (j: BoardJob): void => {
    if (j.kind === "food") {
      router.push({ pathname: "/rider/food-offer", params: { orderId: j.id.slice("food:".length) } });
      return;
    }
    router.push({ pathname: "/rider/offer/[jobId]", params: { jobId: j.id, toKm: j.toPickupKm != null ? j.toPickupKm.toFixed(1) : "" } });
  };

  // ── Layout ───────────────────────────────────────────────────────────────────────────────────────
  const [areaH, setAreaH] = useState(0);
  const [sheetVisible, setSheetVisible] = useState(0);
  // OB-R5/R6: the fleet board's own states. No demand line, no offers of the biker's own on it.
  const fleetLoadFailed = !!fleet && fleetOffersQ.isError && fleetOffersQ.data == null;
  const fleetLoading = !!fleet && !fleet.paused && !fleetLoadFailed && fleetOffersQ.data == null;
  const empty = fleet
    ? fleet.paused || (fleetOffersQ.isSuccess && jobs.length === 0)
    : online && openQ.isSuccess && jobs.length === 0 && myOffers.length === 0;
  const loadFailed = openQ.isError && openQ.data == null;
  // The first seconds after sign-in: go-online and the first open-jobs read are still in flight. Rider v2
  // draws no loading state for the board, so the sheet holds no list chrome (no "N near you", no food line)
  // until that read lands — then it is J1 or J4 straight away, never J1's chrome over an empty list first.
  const boardLoading = !openQ.isError && openQ.data == null && jobs.length === 0 && myOffers.length === 0;
  // Peek 50% of the screen (44% when empty), measured from the screen's top, as the handoff draws it. The
  // floating tab bar (tab bar v1, D-56) takes no layout space, so the area runs to the screen's bottom
  // and everything above it is the mint top card; the sheet continues behind the bar.
  const tabSpace = useTabBarSpace();
  const mapShare = areaH > 0 ? Math.min(0.8, Math.max(0.2, (winH * (empty ? 0.56 : 0.5) - (winH - areaH)) / areaH)) : 0.5;

  const banner = <MintTop {...top} online={!connDown} loc={location.label} />;

  const gateView = gate ? renderGate(gate) : null;
  function renderGate(g: GateId): React.ReactElement | null {
    const call: GateAction = { label: R.callSupport, icon: "phone", onPress: callSupport };
    const floor = walletConfig?.floor ?? COMMISSION.lowBalanceBlockBelow;
    const balance = wallet?.balance ?? null;
    switch (g) {
      // The KYC gates (Rider v2 G1–G7) are retired: `kycScreen` draws R1 / R2 / F1–F8 in their place (D-82).
      case "notRider":
      case "pending":
      case "unfinished":
      case "failed":
      case "failed2":
      case "expired":
      case "cantOpen":
        return null;
      case "gps":
        // Permission granted but no fix (or the server refused a position-less go-online): the Rider v2 wall.
        if (!locDenied)
          return (
            <Gate
              icon="map-pin"
              tone="danger"
              title={R.gGpsT}
              body={R.gGpsB}
              primary={{ label: R.openLoc, icon: "settings", onPress: turnOnLocation }}
              ghost={{ label: R.gpsOn, icon: "check", onPress: () => void requestLocation() }}
            />
          );
        // First Run v2 P14 (D-82): no permission — G8, the Empty States v2 mark, "Turn on" → P1 (or P6 when
        // blocked); J8 above it.
        return (
          <View style={{ flex: 1, paddingTop: 16, paddingHorizontal: 16 }}>
            {notifOff ? <RiderNotifOffRow onTurnOn={() => router.push(RIDER_PERM_ROUTES.notifications as never)} /> : null}
            <RiderLocEmpty onTurnOn={() => router.push(RIDER_PERM_ROUTES.location as never)} />
          </View>
        );
      case "area":
        return <Gate icon="map-pin" tone="calm" title={R.gAreaT} body={R.gAreaB} bridge={leaveForCustomer} />;
      case "cooldown":
        return (
          <Gate
            icon="clock"
            tone="calm"
            title={R.gCoolT}
            body={R.gCoolB}
            facts={coolUntilMs != null && coolUntilMs > coolNow ? [[R.gCoolK, RF.gCoolV(new Date(coolUntilMs), new Date(coolNow))]] : null}
            ghost={{ label: R.rJobHist, icon: "history", onPress: () => router.push("/history?side=rider") }}
            bridge={leaveForCustomer}
          />
        );
      case "hold":
        return <Gate icon="circle-alert" tone="danger" title={R.gHoldT} body={R.gHoldB} primary={call} bridge={leaveForCustomer} />;
      case "suspended":
        return <Gate icon="ban" tone="danger" title={R.gSuspT} body={RF.gSuspB(null)} primary={call} bridge={leaveForCustomer} />;
      case "banned":
        return <Gate icon="ban" tone="danger" title={R.gBanT} body={R.gBanB} ghost={call} bridge={leaveForCustomer} />;
      case "topup": {
        // No floor any more (PR #1154): the drawn floor sentence only while the server serves one above $0.
        const top = topUpGate({ floor, balance: balance ?? 0, minTopUp: walletConfig?.minTopUp ?? COMMISSION.minTopUp, commission: refusedCommission });
        return (
          <Gate
            icon="wallet"
            tone="danger"
            title={R.gTopT}
            body={top.body}
            facts={balance != null ? [[R.gTopK, usd(balance)], [R.gTopK2, usd(top.atLeast)]] : null}
            factsDanger
            primary={{ label: R.goTopUp, icon: "plus", onPress: () => router.push("/wallet/top-up") }}
          />
        );
      }
    }
  }

  const activeJobBar = activeJob ? (
    <SmBtn
      kind="fill"
      icon="package"
      // BD-L2: a cancelled job isn't "in progress" — the same title the job screen's handback uses.
      label={
        activeJob.status !== "cancelled"
          ? RF.swJobBar(statusPillLabel(activeJob.status))
          : activeJob.cancelledBy === "customer"
            ? RF.custCxT(activeJob.customerFirstName || R.theSender)
            : R.cancelled
      }
      onPress={() => pushOnce(router, pathname, jobRoute)}
    />
  ) : null;

  // OB-R2/R3 (Own bikers): the invite to the business's bikers, on the public board until they join or set it
  // aside. A refusal shows the server's sentence; a dropped connection is a toast and the card stays.
  const invite = !fleet ? (myFleet.invites[0] ?? null) : null;
  const [inviteSetAside, setInviteSetAside] = useState(fleetInviteSetAside);
  const [joinRefusal, setJoinRefusal] = useState<{ inviteId: string; text: string } | null>(null);
  const joinM = useMutation({
    mutationFn: (inviteId: string) => joinFleet(inviteId),
    onSuccess: (mine) => {
      qc.setQueryData(["myFleet"], mine);
      void qc.invalidateQueries({ queryKey: ["fleetOffers"] });
    },
    onError: (e: unknown, inviteId) => {
      if (e instanceof ApiError && e.status !== 0) setJoinRefusal({ inviteId, text: e.message });
      else showToast({ text: OBB.refNet, icon: "wifi-off" });
    },
  });
  const joinCard =
    invite && invite.canJoin && inviteSetAside !== invite.id ? (
      <FleetJoinCard
        shop={invite.shop}
        joining={joinM.isPending}
        refusal={joinRefusal?.inviteId === invite.id ? joinRefusal.text : null}
        onJoin={() => joinM.mutate(invite.id)}
        onNotNow={() => {
          fleetInviteSetAside = invite.id;
          setInviteSetAside(invite.id);
        }}
      />
    ) : null;

  const fleetShop = fleet?.shop ?? "";
  const fleetSheet = fleet ? (
    <>
      {notifOff ? <RiderNotifOffRow onTurnOn={() => router.push(RIDER_PERM_ROUTES.notifications as never)} /> : null}
      {/* OB-R5 reconnecting (J6): the header says so; a calm notice; the list is kept. */}
      {online && connDown && !empty ? <Notice icon="wifi-off" text={OBB.staleB} /> : null}
      {activeJobBar}
      {fleet.paused ? (
        <EmptyState inSheet offsetTop={24} tone="info" icon="pause" title={OBB.pausedT(fleetShop)} body={OBB.pausedB(fleetShop)} />
      ) : fleetLoadFailed ? (
        <>
          <FleetCountRow shop={fleetShop} count={null} />
          <FleetLoadFail shop={fleetShop} />
        </>
      ) : fleetLoading ? (
        <>
          <FleetCountRow shop={fleetShop} count={null} />
          <FleetSkeletonCard />
          <FleetSkeletonCard />
        </>
      ) : jobs.length === 0 ? (
        <>
          <FleetCountRow shop={fleetShop} count={0} />
          <EmptyState inSheet offsetTop={24} icon="bike" title={OBB.emptyT(fleetShop)} />
        </>
      ) : (
        <>
          <FleetCountRow shop={fleetShop} count={jobs.length} />
          <FleetRingsHint shop={fleetShop} />
          <View style={{ gap: 10, opacity: online && connDown ? 0.6 : 1 }} onLayout={(e) => (listY.current = e.nativeEvent.layout.y)}>
            {jobs.map((j) => (
              <View key={j.id} collapsable={false} onLayout={(e) => cardY.current.set(j.id, e.nativeEvent.layout.y)}>
                <BoardJobCard job={j} selected={j.id === effectiveSelected} onSelect={() => setSelectedId(j.id)} />
              </View>
            ))}
          </View>
        </>
      )}
    </>
  ) : null;

  const publicSheet = (
    <>
      {joinCard}
      {/* First Run v2 P14 J8 (D-82): "Turn on" reopens P9 (or P11/P12), not the phone's settings. */}
      {notifOff ? <RiderNotifOffRow onTurnOn={() => router.push(RIDER_PERM_ROUTES.notifications as never)} /> : null}
      {/* Empty board: reconnecting shows only in the header's status line (empty-states v2 J4, D-78). */}
      {/* B5: also while the rider is allowed online but going online keeps failing. */}
      {(online ? connDown : onlineAllowed && (onlineM.isError || goOnlineStuck)) && !empty ? <Notice icon="wifi-off" text={R.staleB} /> : null}
      {openQ.isError ? <Notice icon="wifi-off" text={R.loadFail} /> : null}
      {locHint ? <Notice icon="map-pin" tone="warn" text={R.gGpsB} /> : null}
      {/* BD-H5: `assigned` too — the way back once "picked you" is closed (or never shown, for food). */}
      {activeJobBar}
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
              <Text style={{ fontSize: tokens.font.size.caption, color: tokens.color.muted }}>{R.nearest}</Text>
            </View>
          ) : null}
          {!myOffers.length && !loadFailed && !boardLoading && (busyLine || foodOn) ? (
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
          {/* J7: nothing loaded yet — two skeleton cards under the "Couldn't load" notice (BD-H4). */}
          {loadFailed ? (
            <>
              <SkeletonOffer />
              <SkeletonOffer />
            </>
          ) : null}
          <View style={{ gap: 10, opacity: online && connDown ? 0.6 : 1 }} onLayout={(e) => (listY.current = e.nativeEvent.layout.y)}>
            {jobs.map((j) => (
              <View key={j.id} collapsable={false} onLayout={(e) => cardY.current.set(j.id, e.nativeEvent.layout.y)}>
                <BoardJobCard job={j} selected={j.id === effectiveSelected} onSelect={() => setSelectedId(j.id)} onOffer={() => offerFor(j)} />
              </View>
            ))}
          </View>
        </>
      )}
    </>
  );

  const sheetContent = fleetSheet ?? publicSheet;

  // Funnel analytics: the rider page on screen — R2, R3, F1–F8 and the board all share the `/rider` route.
  const screenId =
    kycScreen?.kind === "outcome"
      ? kycScreen.id
      : kycScreen?.kind === "r2"
        ? "R2"
        : kycScreen?.kind === "become"
          ? "become"
          : showWelcome && !gate
            ? "R3"
            : gate
              ? `gate_${gate}`
              : meQ.data
                ? "board"
                : null;
  useEffect(() => {
    if (screenId) track(EVENTS.riderScreen, { screen: screenId });
  }, [screenId]);

  // Still reading this phone's stored launch: an F3 now may be a check the rider just finished (F8 / R2) —
  // draw nothing for that moment rather than flash "Finish your ID check".
  if (!launchRead && kycScreen?.kind === "outcome" && kycScreen.id === "F3") return <View testID="rider-reading" style={{ flex: 1, backgroundColor: tokens.color.bg }} />;
  // G1: on the way to R1 — nothing of the board under it.
  if (kycScreen?.kind === "become") return <View testID="rider-to-become" style={{ flex: 1, backgroundColor: tokens.color.bg }} />;
  // F1–F8 (First Run v2, D-82): one full-screen shell, the ✕ its only way out. KycCheckHost presents the ID
  // check that "Try again" / "Finish ID check" / "Re-verify my ID" reopen.
  if (kycScreen?.kind === "outcome") {
    return (
      <>
        <IdCheckOutcome
          id={kycScreen.id}
          firstName={meQ.data?.firstName}
          triesLeft={kycTriesLeft(rider?.kycAttempts)}
          // F6 "Expired 2 Oct 2026" (D-82 §4): `rider.kycExpiredOn`; an older server omits it and F6 drops the date.
          expiredAt={parseIsoDay(rider?.kycExpiredOn)}
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
  // OB-R1 (Own bikers): an invited biker whose ID check is still running sees the invite above "Your ID is under
  // review", under the mint top card.
  const pendingInvite = myFleet.invites[0] ?? null;
  if (kycScreen?.kind === "r2" && pendingInvite && !fleet) {
    return (
      <AppScreen banner={<MintTop {...top} online loc={null} />}>
        <View testID="fleet-invite-waiting" style={{ flex: 1, padding: 16, gap: 12 }}>
          <FleetInviteWaiting shop={pendingInvite.shop} />
          <FleetIdPending />
        </View>
      </AppScreen>
    );
  }
  if (kycScreen?.kind === "r2") {
    return (
      <View style={{ flex: 1, backgroundColor: tokens.color.bg }}>
        <RiderSetupPending onSendParcel={() => router.push("/send")} />
      </View>
    );
  }
  // R2 → R3: the welcome flag is still being read — draw nothing (not a frame of the offline board).
  if (holdForWelcome && welcomeSeen === null && !gate && !kycScreen) return <View testID="rider-reading" style={{ flex: 1, backgroundColor: tokens.color.bg }} />;
  if (showWelcome && !gate) {
    return (
      <RiderVerified
        firstName={meQ.data?.firstName?.trim() || null}
        // D-70: "Commission-free jobs · N of 5 left", served by /auth/me (absent on an older server).
        freeJobs={rider?.freeJobs && rider.freeJobs.total > 0 ? rider.freeJobs : null}
        // Owner decision D-82 §2 #5: R3's "Go online" starts the rider permission flow (P1…); P13's "Go online"
        // goes online (it runs this callback). A rider who has granted everything goes straight online.
        onGoOnline={() => {
          // Stored NOW, not from P13's callback: the flow marks itself done when P13 shows, so an app killed
          // mid-flow came back to R3 (and its flow again). The in-memory hold stays until P13 goes online.
          if (profileId) void markRiderWelcomeSeen(profileId);
          void startRiderPermFlow(router, () => setWelcomeSeen(true));
        }}
        onPapers={() => router.push("/rider/documents")}
      />
    );
  }

  return (
    <AppScreen banner={banner}>
      {/* First Run v2 U4b (D-82): the violet "new version" banner under the mint top card, on the live board only. */}
      {meQ.isLoading || gateView || meFailed ? null : <SoftUpdateBanner tone="violet" />}
      {meQ.isLoading ? null : meFailed ? (
        // BD-M1: the profile read failed with nothing cached — say so and retry by itself.
        <RiderErrorState onRetry={() => void meQ.refetch()} retrying={meQ.isFetching} />
      ) : gateView ? (
        gateView
      ) : (
        <View testID="rider-board-area" style={{ flex: 1 }} onLayout={(e) => setAreaH(e.nativeEvent.layout.height)}>
          <BoardMap jobs={jobs} selectedId={effectiveSelected} onSelect={onPinSelect} you={loc} zones={zones.map((z) => ({ ...z, busiest: z === busiest }))} padBottom={sheetVisible} />
          {areaH > 0 ? (
            <OrderSheet ref={sheetRef} areaHeight={areaH} fallbackShare={mapShare} floor={0} bottomInset={tabSpace} contentKey={empty ? "empty" : "list"} reduceMotion={reduceMotion} onVisibleHeight={setSheetVisible}>
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

function DemandLine({ text }: { text: string }): React.ReactElement {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <IconSmall name="map-pin" color={tokens.color.accentText} />
      <Text style={{ flex: 1, fontSize: 13, fontWeight: tokens.font.weight.semibold, color: tokens.color.accentText }}>{text}</Text>
    </View>
  );
}
