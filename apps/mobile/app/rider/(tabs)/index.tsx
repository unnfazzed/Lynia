import { haversineKm } from "@lynia/shared";
import { tokens } from "@lynia/shared/tokens";
import { ETA_SPEED_KMH } from "../../../src/logic/eta";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Location from "expo-location";
import * as WebBrowser from "expo-web-browser";
import { useFocusEffect, usePathname, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePrewarmRoutes, type PrewarmRoute } from "../../../src/boot/prewarm-routes";
import { FlatList, Linking, ScrollView, Text, View } from "react-native";
import { ApiError } from "../../../src/api/client";
import { getMe, type Me } from "../../../src/api/auth";
import { makeOffer } from "../../../src/api/offers";
import { getActiveOrder, getOpenOrders, type OpenOrder } from "../../../src/api/orders";
import { loadAcknowledgedHandbacks } from "../../../src/auth/session";
import { pushOnce } from "../../../src/push/push";
import { retryKyc, sendHeartbeat, setOnline } from "../../../src/api/riders";
import { useForegroundRefetch } from "../../../src/realtime/use-foreground-refetch";
import { useRiderBoard } from "../../../src/realtime/use-rider-board";
import { isKycLocked, kycDeclineLabel, onlineGateReason, ONLINE_GATE_COPY, type OnlineGateReason, resolveKycRetryFeedback } from "../../../src/logic/gates";
import { greetingFor, greetingLine } from "../../../src/logic/greeting";
import { useHomeLocation } from "../../../src/logic/home-location";
import { formatMoney } from "../../../src/logic/money";
import { useNow } from "../../../src/logic/use-now";
import { useNotificationsUnreadCount } from "../../../src/query/use-notifications-unread";
import {
  buildSentOfferEntry,
  clearRiderBidDraft,
  isRiderBidDraftExpired,
  isSentOfferExpired,
  isSentOfferStale,
  loadRiderBidDraft,
  loadRiderSentOffers,
  saveRiderBidDraft,
  saveRiderSentOffers,
  type SentOffer,
} from "../../../src/logic/rider-bid-draft";
import { AppScreen, Button, Card, EmptyState, haptic, HomeAddressRow, HomeHeader, HomeStatusRow, Icon, OfflineBanner, SkeletonList, statusPillLabel, Sub, useActionError } from "../../../src/ui";
import { useFeatureFlags } from "../../../src/net/use-feature-flags";
import { pendingOrQueued } from "../../../src/query/client";
import { JobCard } from "../../../src/ui/rider/JobCard";
import { RiderBoardListView, type RiderBoardJob } from "./board-list.view";
import { RiderBoardEmptyView } from "./board-empty.view";
import { RiderOfferParcelCardView } from "./offer-parcel-card.view";
import { SentOfferCard } from "../../../src/ui/rider/SentOfferCard";
import { SupportCallRow } from "../../../src/ui/safety";
import { parseNum, withTimeout } from "../../../src/util";

// GPS fix bound: `getCurrentPositionAsync` has no timeout of its own and a cold fix can hang forever,
// which matters here more than cosmetically — the server records a broadcast-eligible position only
// `if (online && location)`, so a rider whose first cold fix hangs goes online with NO position and is
// invisibly excluded from every broadcast. Race the fix against this and fall back to the last-known
// (cached) fix. Mirrors the same helper in src/ui/MapPicker.tsx (duplicated per the "don't over-abstract"
// convention — it's ~5 lines and this file may not reach across into ui/).
const LOCATE_TIMEOUT_MS = 9_000;

/** How many times a TRANSIENT activation failure is retried before the rider is left to reopen the
 *  tab, and how long to wait between attempts. Three attempts over ~45s covers a lift-doors network
 *  blip without turning a genuinely dead link into a request loop. */
const ACTIVATION_MAX_RETRIES = 3;
const ACTIVATION_RETRY_MS = 15_000;

// SentOffer moved to src/logic/rider-bid-draft.ts (buildSentOfferEntry) so its construction — using
// the SENT fare/eta, never live form state — is unit-testable without mounting this screen.

// UX20-01's rider-side banner ("Couldn't check for an active job" + Retry, rendered on bare
// `activeQ.isError`) is REMOVED — owner instruction, 2026-08-12, from a device photo of the board:
// error cards belong to actions the rider took, not to a background poll. The check runs every 8s
// (and on focus/foreground/socket-reconnect) against a query the rider never asked for, so any flaky
// link camped a red card at the top of the board — including on the KYC gate, where an unverified
// rider CANNOT have an assigned job and the card was pure noise, which is exactly what the photo
// caught. The way back is not lost: `activeJobBanner` re-renders itself the moment a fetch succeeds,
// and the poll self-heals. Do not reintroduce a bare-`isError` banner here; see KNOWN_BUGS UX20-01.

/** The board's two exits are the parcel job and the food job — the app's two heaviest routes after
 *  the food tracker (36 and 39 new modules, plus maps, socket.io-client and, for the parcel job, the
 *  image-picker/manipulator pair). A rider accepting work is the least patient tap in the product, so
 *  both are warmed from board idle. Scoped to the rider surface: the customer launcher never
 *  evaluates these graphs (src/boot/prewarm-routes.ts). */
const BOARD_PREWARM: readonly PrewarmRoute[] = ["riderJob", "riderFoodJob"];

export default function RiderHome(): React.ReactElement {
  usePrewarmRoutes(BOARD_PREWARM);
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();
  // Plan §5 B2 "one board": food jobs land in this same list once Lane C ships a rider-facing feed
  // for them (today `merchant/food-dispatch.service.ts` only pushes a `food_offer` notification + the
  // merchant-facing queue reads — there's no rider GET/WS the board can consume yet). Gate on the
  // dispatch-specific flag, not the whole-vertical one, so the board's copy doesn't promise food jobs
  // before dispatch itself is live; this stays a no-op read until that feed exists.
  const { merchantDispatchAutoEnabled } = useFeatureFlags();
  // ALWAYS ONLINE (owner decision 2026-08-17): the rider no longer toggles a shift. Being on this
  // screen, past every gate, IS the shift — so `online` is machine state now, not user state, and the
  // only question left is whether the rider is ALLOWED to work (verified, located, not refused).
  //
  // Seeded from the warm `["me"]` (persisted across launches — src/query/persist.ts — and pre-seeded
  // by useBootstrap) on the same test the gates apply, VERIFIED — not on the server's `is_online`,
  // which no longer means anything, and not on merely being a rider, which would start the heartbeat
  // and the board socket for someone the gates are about to block. With the cache warm `meQ.isLoading`
  // is false on the first render, so a flat `false` would paint a boardless screen for a tick before
  // the effect below flipped it; a cold cache still renders the meQ.isLoading skeleton instead.
  const [online, setOnlineState] = useState(() => qc.getQueryData<Me>(["me"])?.rider?.kycStatus === "verified");
  // Lets the auto-online effect below try again after something took the rider offline (a heartbeat
  // refusal, a gate that has since cleared). Reset wherever `online` is forced false.
  const autoOnlineRef = useRef(false);
  // Bumped by a TRANSIENT activation failure (a network blip, not a refusal) to schedule one more
  // attempt. Without it a single failed `setOnline` at launch left the rider offline for the life of
  // the screen: the auto-online effect had already consumed its ref and nothing else re-armed it.
  const [activationRetry, setActivationRetry] = useState(0);
  // Action errors speak once as an auto-dismissing toast, never as a persistent card
  // (owner instruction 2026-08-12). Same `setError(msg)` shape as the useState setter it replaces.
  const setError = useActionError();
  // BH-03: a calm (non-error) status line — distinct from `error` — for feedback that isn't a
  // failure, e.g. "Continue verification" in manual KYC mode where there's no browser step to open.
  const [info, setInfo] = useState<string | null>(null);
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(null);
  // S·4 no-GPS gate: location permission was denied — riding needs GPS (parcels near you, navigate
  // to pickups), so this blocks going online with an "open settings" recovery, per the journey map.
  const [locDenied, setLocDenied] = useState(false);
  // A non-blocking hint shown near the toggle when the OS permission is granted but we still couldn't
  // get a fix (cold-GPS timeout AND no cached last-known) — so a rider going online with no position
  // isn't lied to with a confident "new orders arrive live" while being excluded from broadcasts.
  const [locHint, setLocHint] = useState<string | null>(null);
  const [selected, setSelected] = useState<OpenOrder | null>(null);
  const [fare, setFare] = useState("");
  const [eta, setEta] = useState("");
  // Offer mode (3·1): "accept" takes the asking price in one tap; "counter" opens the fare field.
  const [offerMode, setOfferMode] = useState<"accept" | "counter">("accept");
  // Offers the rider has sent this session — rendered with a live "customer's window closes in"
  // countdown, and flipped to a distinct "that window closed" state on a `bid:expired` push. The 1s
  // countdown clock itself lives INSIDE each SentOfferCard (PERF): a screen-level ticker used to
  // re-render this whole board — every open-order card, gate and the compose form — once a second
  // for the length of any auction the rider had bid into.
  // BH-21: persisted to SecureStore (hydrate/save effects below) so a process death mid-auction
  // doesn't wipe the record of what the rider already bid on — see rider-bid-draft.ts.
  const [sentOffers, setSentOffers] = useState<SentOffer[]>([]);
  // `bidIds` is purely derived from `sentOffers` (the ids of orders already bid on this session) —
  // deriving instead of a parallel setBidIds means the two can never drift, and the persistence/offline
  // clear below (`setSentOffers([])`) covers both for free.
  const bidIds = useMemo(() => new Set(sentOffers.map((s) => s.order.id)), [sentOffers]);
  // BH-21: restore any sent offers that survived a kill/relaunch, dropping ones whose 90s auction
  // window already closed while the app was dead (same treatment as the compose-draft hydrate below —
  // a cold start never receives the live bid:expired/order:taken event that would otherwise clear them).
  const sentOffersHydrated = useRef(false);
  useEffect(() => {
    let cancelled = false;
    void loadRiderSentOffers().then((offers) => {
      if (!cancelled) {
        const now = Date.now();
        setSentOffers(offers.filter((o) => !isSentOfferExpired(o, now)));
      }
      if (!cancelled) sentOffersHydrated.current = true;
    });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (!sentOffersHydrated.current) return;
    void saveRiderSentOffers(sentOffers);
  }, [sentOffers]);

  // JOURNEY-BUGS: restore a bid-compose card that survived a kill/rotation mid-auction (see the
  // save effect below). Gate saving on this — otherwise the initial blank state would overwrite a
  // real stored draft before the async load resolves.
  const bidDraftHydrated = useRef(false);
  useEffect(() => {
    let cancelled = false;
    void loadRiderBidDraft().then((draft) => {
      if (!cancelled && draft) {
        // The restored order's own 90s auction window may already have closed while the app was
        // killed/backgrounded — a cold start never receives the live bid:expired/order:taken event
        // that's the ONLY other thing that clears a dead `selected`. Drop a stale draft instead of
        // showing a phantom "Accept $X" card for an auction that's already gone.
        if (isRiderBidDraftExpired(draft, Date.now())) {
          void clearRiderBidDraft();
        } else {
          setSelected(draft.selected);
          setFare(draft.fare);
          setEta(draft.eta);
          setOfferMode(draft.offerMode);
        }
      }
      if (!cancelled) bidDraftHydrated.current = true;
    });
    return () => {
      cancelled = true;
    };
  }, []);
  // Persist the compose card (PII-free) whenever it changes, once hydrated. The board's own
  // expired/taken-dismiss effect (below) already clears `selected` for a dead order — this effect then
  // clears the stored draft right along with it, so a restored card is never stale.
  useEffect(() => {
    if (!bidDraftHydrated.current) return;
    if (selected) void saveRiderBidDraft({ selected, fare, eta, offerMode });
    else void clearRiderBidDraft();
  }, [selected, fare, eta, offerMode]);

  const requestLocation = useCallback(async (): Promise<void> => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      setLocDenied(true);
      return;
    }
    setLocDenied(false);
    try {
      // Bound the cold fix so it can't hang indefinitely (see LOCATE_TIMEOUT_MS above).
      const p = await withTimeout(
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        LOCATE_TIMEOUT_MS,
      );
      setLoc({ lat: p.coords.latitude, lng: p.coords.longitude });
      setLocHint(null);
    } catch {
      // Timed out or failed — fall back to the last-known cached fix (instant, may be null) rather than
      // leaving `loc` unset, so we go online WITH a position and stay broadcast-eligible.
      try {
        const last = await Location.getLastKnownPositionAsync();
        if (last) {
          setLoc({ lat: last.coords.latitude, lng: last.coords.longitude });
          setLocHint(null);
          return;
        }
      } catch {
        /* fall through to the hint */
      }
      setLocHint("Couldn't get your location — nearby orders may not reach you.");
    }
  }, []);
  // Re-read the rider's position every time this screen regains focus (covers the initial mount too,
  // since the screen is focused on first render), not just once at mount. The board's REST radius, the
  // WS geo-room, distance labels and ETA seed are all anchored to `loc`; a single mount-time fix left
  // them pinned to wherever the rider opened the app. Refreshing on focus re-scopes the board after the
  // rider has ridden somewhere else (e.g. back from a completed job, or from another tab). Deliberately
  // NOT a continuous watchPositionAsync stream — that's a battery drain; these are the discrete
  // checkpoints where position is likely to have moved materially.
  useFocusEffect(
    useCallback(() => {
      void requestLocation();
    }, [requestLocation]),
  );
  // Belt-and-braces for the in-place case: if an active job finishes (non-null → null) while this
  // board is already focused, re-anchor immediately rather than waiting for the next focus event.
  const prevHadJobRef = useRef(false);
  // Read inside the heartbeat interval via ref, not as an effect dependency — restarting the 20s
  // interval on every location tick would keep deferring the heartbeat once GPS refreshes more often
  // than the beat cadence (see the focus/interval-based refresh in the GPS-staleness fix below).
  const locRef = useRef(loc);
  useEffect(() => {
    locRef.current = loc;
  }, [loc]);

  // Board push (declared here, ahead of its other uses below) already invalidates ["activeJob"] live
  // on every `orderTaken` event — so the REST poll only needs to run as a self-heal fallback while the
  // board socket is down, the same pattern job.tsx already uses for its own active-job query.
  // D5: a live food-dispatch offer takes the rider straight to the intake screen — gated on the same
  // dispatch-specific flag as the (still dormant) food-job-card board read above, dormant-off.
  const board = useRiderBoard(online, loc, bidIds, merchantDispatchAutoEnabled ? () => router.push("/rider/food-offer") : undefined);
  // The 8c header's own inputs: a minute-granularity clock for the greeting + sticker, and the
  // unread count behind the bell's gold dot (the same hook the customer home and Account row use).
  const clock = useNow();
  const unreadCount = useNotificationsUnreadCount();
  // The detected current location, the same row the customer home carries (owner instruction
  // 2026-08-17). Detect-only here: the board's job ranking is keyed off `loc` below — the live GPS
  // fix this screen requests itself — and the server targets pushes off the heartbeat position, so
  // this row reports where the rider is rather than offering to change it.
  // detectOnly: the stored slot is shared with the customer home, which persists a MANUAL deliver-to
  // there. Without this the rider would see that customer-picked address labelled "Your location",
  // and tapping refresh would overwrite the customer's choice.
  const location = useHomeLocation({ detectOnly: true });
  // A-O4: unlike `openOrders` below (which is `enabled: online` outright — an offline rider can't be
  // offered new work), this poll can't just gate on `online`: the "Go offline" button has no
  // active-job guard, so a rider can go offline mid-delivery and still needs this to keep tracking
  // that job to completion, and a cold app open while offline still needs the one-shot initial fetch
  // to discover a leftover active job from a prior session. So `enabled` stays default-on (the mount
  // fetch always runs), and only the recurring interval gates on online-or-already-has-a-job — once a
  // completed fetch confirms offline-with-no-job, the 8s self-heal poll has nothing left to surface.
  const activeQ = useQuery({
    queryKey: ["activeJob"],
    queryFn: getActiveOrder,
    refetchInterval: (query) => {
      if (board.connected) return false;
      return online || query.state.data != null ? 8000 : false;
    },
  });
  // R8 follow-up: hide the "active job" card for a cancelled order the rider has already handed back.
  // activeForRider keeps surfacing a collected-then-cancelled order for 24h (so a backgrounded rider
  // can reopen it), but once they've acknowledged the hand-back it must not keep nagging as "active".
  const [ackedHandbacks, setAckedHandbacks] = useState<Set<string>>(() => new Set());
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void loadAcknowledgedHandbacks().then((ids) => {
        if (alive) setAckedHandbacks(new Set(ids));
      });
      return () => {
        alive = false;
      };
    }, []),
  );
  const activeJob =
    activeQ.data && !(activeQ.data.status === "cancelled" && ackedHandbacks.has(activeQ.data.id)) ? activeQ.data : null;

  // The win: a customer just picked this rider. Fire the warm success cue on the transition INTO
  // `assigned` (not on every poll of an already-assigned job), so "A customer picked you!" lands with
  // a buzz even if the phone is in a jacket while riding.
  const prevJobStatus = useRef<string | undefined>(undefined);
  useEffect(() => {
    const s = activeJob?.status;
    if (s === "assigned" && prevJobStatus.current !== "assigned") haptic("success");
    prevJobStatus.current = s;
  }, [activeJob?.status]);

  // Re-anchor the board GPS the moment an active job clears (delivery finished / cancelled) — see the
  // focus-based refresh above; this covers the case where the board is already focused when the job
  // transitions non-null → null and no fresh focus event fires.
  const hasActiveJob = activeJob != null;
  useEffect(() => {
    if (prevHadJobRef.current && !hasActiveJob) void requestLocation();
    prevHadJobRef.current = hasActiveJob;
  }, [hasActiveJob, requestLocation]);

  // Gate the dashboard behind KYC: a rider goes online only once verified (the backend enforces it on
  // makeOffer too — the UI shouldn't pretend otherwise). `rider: null` = hasn't started rider setup.
  //
  // Owner instruction (2026-08-16): there is NO manual "Refresh status" button anywhere on this screen
  // any more — every blocked state resolves itself. So this poll can no longer cover only `pending`:
  // it has to cover EVERY state that blocks the rider, because whatever the button used to do on tap
  // is now this interval's job. Three inputs keep a walled rider current, and none of them is a tap:
  //   1. this interval (below),
  //   2. the app-foreground refetch + gate clear (the AppState effect further down), which is what
  //      catches a decision that landed while the phone was in a pocket,
  //   3. the KYC-decision push invalidating ["me"] on arrival (src/push/use-push-registration.ts), so
  //      a rider sitting on the wall sees it flip the instant the notification lands.
  // Cadence by state (wave-2 perf): in `auto` mode the vendor answers within minutes, so 5s keeps the
  // "verified!" moment snappy; every other blocked state resolves through ops or a re-verify over
  // hours-to-days, where 5s would be ~17k radio wakeups/day per waiting rider — those get a 60s safety
  // net under the push + foreground paths. A verified rider polls nothing.
  const meQ = useQuery({
    queryKey: ["me"],
    queryFn: getMe,
    refetchInterval: (query) => {
      const me = query.state.data;
      if (!me) return false; // nothing resolved yet — the mount fetch/retry owns this window
      const rider = me.rider;
      if (!rider) return 60_000; // not a rider yet: /rider/become completing elsewhere lands here
      if (rider.kycStatus === "verified") return false; // through the gate — nothing left to watch
      if (rider.kycStatus === "pending") return rider.kycMode === "manual" ? 60_000 : 5000;
      return 60_000; // failed / expired — an ops reset or a fresh check clears it
    },
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
  //
  // `setGate(null)` rides along because the online-gate wall has no manual refresh any more. `gate` is
  // pure client state set from a refused toggle — no ["me"] field carries suspended/on_hold/cooldown —
  // so nothing the server sends can clear it, and without this a rider refused once would be pinned on
  // the wall for the life of the mount. Focus (not a timer) is the right boundary: it can't fire while
  // the rider is reading the wall, so the wall never yanks itself out from under them mid-sentence; it
  // fires when they come back from the Money/Account tab, which is exactly when re-testing is honest.
  useFocusEffect(
    useCallback(() => {
      setGate(null);
      void qc.invalidateQueries({ queryKey: ["me"] });
    }, [qc]),
  );

  // The other half of that: an app-FOREGROUND transition. The interval above is paused while the app is
  // backgrounded (wireFocusManager in src/query/client.ts), and this tab stays focused across a
  // background/foreground cycle — so no focus event fires when a rider pockets the phone during a
  // pending check and pulls it back out. Without this, the very case the removed button existed for
  // (come back later and look) would wait a whole poll period. Re-arm on every active transition:
  // refetch ["me"] and drop a stale gate so the board reflects server truth by the time they've looked.
  // Unconditional (no `enabled` gate): the states this serves — pending KYC, a gate wall — are exactly
  // the ones where the rider is NOT online, so the `online`-gated call below can't cover them.
  useForegroundRefetch(() => {
    setGate(null);
    void qc.invalidateQueries({ queryKey: ["me"] });
  });

  const onlineM = useMutation({
    mutationFn: (next: boolean) => setOnline(next, loc ?? undefined),
    onSuccess: (res) => {
      setActivationRetry(0); // a good beat clears the retry budget
      // Anything but an EXPLICIT `online: false` counts as online. We asked to be online and the call
      // did not throw, so a response that omits the flag (an older API, a proxy that ate the body)
      // must not read as a refusal — under "always online" this mutation now runs on every mount, so
      // a missing field would silently blank the board for a rider who is, in fact, on shift. A real
      // refusal arrives as a 403 and is handled in onError.
      setOnlineState(res?.online ?? true);
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
      // Transient, so try again shortly rather than stranding the rider offline. Bounded, and NOT a
      // synchronous re-arm of `autoOnlineRef` — that would re-run the effect immediately and turn a
      // dead link into a request loop.
      setActivationRetry((n) => n + 1);
    },
  });

  // ALWAYS ONLINE: drive the server flag true the moment the rider is allowed to work, instead of
  // waiting for a switch that no longer exists. Every wall still holds — KYC, no-GPS, a server
  // refusal — and each of them resets `autoOnlineRef` so this retries the moment the wall clears.
  //
  // Guarded by the ref rather than by `online` alone: a failed `setOnline` flips `onlineM.isPending`
  // back, which would otherwise re-run this effect and hammer the endpoint in a retry loop.
  useEffect(() => {
    const allowed = !meQ.isLoading && !meQ.isError && !knownUnverified && !locDenied && gate == null;
    if (!allowed) {
      autoOnlineRef.current = false; // re-arm: the next time the walls clear, try again
      return;
    }
    // Deliberately NOT gated on the local `online` flag. That flag is seeded optimistically from the
    // warm cache, so gating on it would skip the call for a rider the SERVER still has as off-shift —
    // and a rider who is locally-online but server-offline is silently deaf to every broadcast, which
    // is the exact failure MOB-BOOT-02 was about. One assertion per mount is the price of being sure.
    if (autoOnlineRef.current) return;
    // Wait for the position when one is still coming. The server records a broadcast-eligible
    // position only `if (online && location)` (see LOCATE_TIMEOUT_MS at the top of this file), so
    // going online the instant the gates clear — before the cold fix lands — would put the rider on
    // shift INVISIBLE to every broadcast until the next 20s heartbeat carried a position. `locHint`
    // is the "no fix is coming" signal (the cold fix timed out AND there was no cached last-known),
    // and going online position-less is still right then: the rider is working, the hint says why
    // the board may be thin, and the heartbeat keeps retrying.
    if (loc == null && locHint == null) return;
    autoOnlineRef.current = true;
    onlineM.mutate(true);
    // `onlineM` is stable for the life of the screen; listing it would re-run this on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meQ.isLoading, meQ.isError, knownUnverified, locDenied, gate, loc, locHint]);

  // Pending/failed riders re-run KYC: mint a FRESH Didit session and open it (no re-keying the form).
  const retryM = useMutation({
    mutationFn: retryKyc,
    onSuccess: async (res) => {
      // In-app browser tab (not the system browser): it returns to the app when the rider closes it,
      // so we can immediately re-check status rather than leaving them stranded outside the app.
      const feedback = resolveKycRetryFeedback(res.verificationUrl, res.mode);
      setError(feedback.error);
      setInfo(feedback.info);
      if (feedback.openUrl) {
        await WebBrowser.openAuthSessionAsync(feedback.openUrl).catch(() => undefined);
      }
      void qc.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Couldn't restart verification."),
  });

  // The bounded retry itself. Each failure schedules exactly one more attempt, up to the cap, with a
  // real timer that is cleared on unmount — so a rider who opens the tab on a dead link is put online
  // as soon as it comes back, and a rider on a link that never comes back costs three requests, not a
  // loop. A REFUSAL never lands here: `onError` returns early on a recognised gate reason, which puts
  // the rider on the matching wall instead.
  useEffect(() => {
    if (activationRetry === 0 || activationRetry > ACTIVATION_MAX_RETRIES) return;
    const t = setTimeout(() => {
      autoOnlineRef.current = true; // this timer IS the attempt
      onlineM.mutate(true);
    }, ACTIVATION_RETRY_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activationRetry]);

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
      // Send the rider's last-known position on every heartbeat (not just the initial go-online) so an
      // idle online rider stays in the server's nearby-rider index and keeps receiving nearby-order
      // broadcasts. sendHeartbeat hits the lightweight beat endpoint (wave-2 W3) and self-falls-back to
      // the legacy setOnline beat on an older API. Read via ref so a location tick can't reset this timer.
      sendHeartbeat(locRef.current ?? undefined)
        .then(() => {
          failures = 0;
          setBeatStale(false);
        })
        .catch((e: unknown) => {
          if (e instanceof ApiError && e.status === 403) {
            setOnlineState(false);
            autoOnlineRef.current = false; // let the auto-online effect retry once the reason clears
            // Same gate-resolution as onlineM.onError — a heartbeat 403 means the server has already
            // taken the rider offline for a specific reason (cooldown/suspended/on_hold/kyc), so show
            // that reason instead of a vague "connection issue" that invites a retry that can't work.
            const reason = onlineGateReason(e);
            if (reason) {
              setGate(reason);
              setError(null);
              if (reason === "kyc") void qc.invalidateQueries({ queryKey: ["me"] });
            } else {
              setGate(null);
              // No "Go online" button exists any more — say what the app is doing instead of naming
              // a control the rider cannot find.
              setError("You were taken offline. Reconnecting…");
            }
          } else {
            failures += 1;
            if (failures >= 2) setBeatStale(true);
          }
        });
    }, 20_000);
    return () => clearInterval(t);
  }, [online]);

  // 2·b1: a single, self-clearing "a nearby order was just taken" line. Ticks up each time an un-bid
  // board order is assigned to another rider; the timer resets so a flurry stays one calm line, then
  // clears after a few seconds. Silent removal was the old behaviour — this gives the "why did that
  // card vanish?" answer without permanent clutter.
  const [takenNotice, setTakenNotice] = useState(false);
  useEffect(() => {
    if (board.boardTakenNudge === 0) return;
    setTakenNotice(true);
    const t = setTimeout(() => setTakenNotice(false), 4500);
    return () => clearTimeout(t);
  }, [board.boardTakenNudge]);

  // Sent offers are a live-board artifact: clear them when the rider goes offline (the board room is
  // gone and the countdowns are meaningless).
  useEffect(() => {
    if (!online) setSentOffers([]);
  }, [online]);

  // B-T3: the wipe-on-offline above was the ONLY removal path — a taken/expired resolution just
  // flipped the card's own display state (board.takenOrderIds/expiredOrderIds) but never dropped the
  // entry, so a busy-market rider who stayed online for a long shift accumulated one permanent card
  // per bid. Periodically sweep offers whose auction closed more than SENT_OFFER_RETENTION_MS ago —
  // long enough to have shown the resolution message, short enough the list (and its SecureStore
  // mirror, saved below) stays bounded regardless of shift length or how many orders were bid on.
  useEffect(() => {
    if (!online) return;
    const iv = setInterval(() => {
      setSentOffers((prev) => {
        if (prev.length === 0) return prev;
        const now = Date.now();
        const next = prev.filter((o) => !isSentOfferStale(o, now));
        return next.length === prev.length ? prev : next;
      });
    }, 15_000);
    return () => clearInterval(iv);
  }, [online]);

  // JOURNEY-BUGS: the compose card stayed open for an order that expired or was taken by another rider
  // while the rider was still typing a price — `selected` was only ever cleared on offer success/error
  // or a manual Cancel. Dismiss it the moment the board says this order is gone, same signal the
  // sent-offer cards already key off (board.expiredOrderIds / board.takenOrderIds).
  useEffect(() => {
    if (selected && (board.expiredOrderIds.has(selected.id) || board.takenOrderIds.has(selected.id))) {
      setSelected(null);
    }
  }, [selected, board.expiredOrderIds, board.takenOrderIds]);
  const openQ = useQuery({
    queryKey: ["openOrders"],
    // Pass the rider's position so the server geo-scopes to nearby, distance-sorted orders; with no
    // loc yet it fetches city-wide (backward compat). The key stays exactly ["openOrders"] — do NOT
    // add loc — because useRiderBoard merges live pushes into that exact key. When loc arrives/changes
    // the useEffect below invalidates this query to re-run the geo-scoped fetch.
    queryFn: () => getOpenOrders(loc ?? undefined, 5000),
    enabled: online,
    // UX-2026-07-15: useRiderBoard already pushes board:new_order/bid:expired/order:taken live into this
    // exact ["openOrders"] cache — full lifecycle coverage, unlike order/[id].tsx's single-order auction
    // poll (deliberately unconditional there because ridersNearby has no WS signal). Here there's no such
    // gap, so gate the poll on the socket being down, mirroring activeQ just above — an unconditional 15s
    // REST round-trip over an N-order list on top of an already-live channel was pure metered-data waste.
    refetchInterval: online ? (board.connected ? false : 15_000) : false,
  });

  // Once the rider's position is known (or moves), re-run the geo-scoped fetch. We invalidate rather
  // than key the query on loc so the live-board merge into ["openOrders"] keeps working.
  useEffect(() => {
    if (!online || !loc) return;
    void qc.invalidateQueries({ queryKey: ["openOrders"] });
  }, [loc?.lat, loc?.lng, online, qc]);

  // Warm-resume: refetch the board the moment the app returns to foreground. Without this, an order
  // taken/expired while backgrounded serves a stale board for up to the 15s poll — the live-board
  // socket usually beats that, but a reconnect can lag behind the OS reporting the app foregrounded
  // (mirrors rider/job.tsx's and order/[id].tsx's warm-resume). Also invalidate ["activeJob"]: a
  // `orderTaken` (bid win) missed while backgrounded is the same gap useRiderBoard's own reconnect
  // self-heal closes — foreground can race ahead of the socket reconnecting, so this must self-heal too.
  useForegroundRefetch(() => {
    void qc.invalidateQueries({ queryKey: ["openOrders"] });
    void qc.invalidateQueries({ queryKey: ["activeJob"] });
  }, online);

  // Client-side haversine sort. Now largely a no-op when the server already distance-sorted, but it's
  // kept as the sort for the loc-absent (city-wide) fallback and to visually reconcile live WS pushes
  // (which are still global) against the geo-scoped REST results.
  // B-O9: this used to run inline in the render body, so a keystroke in the compose card's fare/ETA
  // field (plain top-level useState, unrelated to any of this) re-ran the O(n log n) sort and hand out
  // a brand-new array + row objects every board render — defeating JobCard's B-O2 memo boundary even
  // though the underlying orders hadn't changed. useMemo keeps the array (and each row) referentially
  // stable across renders that don't actually touch openQ.data/bidIds/loc.
  const ranked = useMemo(
    () =>
      (openQ.data ?? [])
        .filter((o) => !bidIds.has(o.id)) // hide orders we've already bid on (one round per rider)
        .map((o) => ({ o, km: loc ? haversineKm(loc, o.pickup.point) : null }))
        .sort((a, b) => (a.km ?? Number.MAX_SAFE_INTEGER) - (b.km ?? Number.MAX_SAFE_INTEGER)),
    [openQ.data, bidIds, loc],
  );

  // A new nearby order opened while online — a single attention buzz so the rider doesn't have to
  // stare at the board. We seed the baseline on the FIRST SUCCESSFUL board load (not merely on going
  // online, when the fetch hasn't returned and the count is still 0), so the initial populate is
  // silent; only a genuine later increase buzzes, and a decrease (bid on one / it left) never does.
  // `-1` is the "not yet seeded" sentinel — one ref, reset when the rider goes offline.
  const prevOpenCount = useRef(-1);
  useEffect(() => {
    if (!online) {
      prevOpenCount.current = -1;
      return;
    }
    if (!openQ.isSuccess) return; // wait for a real load before seeding/buzzing
    if (prevOpenCount.current === -1) {
      prevOpenCount.current = ranked.length;
      return;
    }
    if (ranked.length > prevOpenCount.current) haptic("notify");
    prevOpenCount.current = ranked.length;
  }, [online, openQ.isSuccess, ranked.length]);

  const fareNum = parseNum(fare);
  const etaNum = parseNum(eta);
  const canOffer = selected != null && fareNum != null && fareNum > 0 && etaNum != null && etaNum > 0;

  // Shared by onSuccess and the "already responded" reconciliation below — both mean the offer is
  // confirmed live server-side, so both must land the rider in the same "your offer is in" state.
  // BH-05: takes the SENT fare/eta as params rather than reading live `fare`/`etaNum` state — the
  // rider can edit the form between a failed send and the "already responded" 409 retry (the error
  // state re-enables editing), and reading live state here showed the just-edited, never-sent price.
  const recordSentOffer = (s: OpenOrder, sentFare: string, sentEtaNum: number): void => {
    const entry = buildSentOfferEntry(s, sentFare, sentEtaNum);
    setSentOffers((prev) => [entry, ...prev.filter((p) => p.order.id !== s.id)]);
  };

  const offerM = useMutation({
    mutationFn: (vars: { fare: string; fareNum: number; etaNum: number }) => {
      // Accept = take the customer's price; any other fare is a counter.
      const type = vars.fareNum === Number(selected!.proposedFare) ? "accept" : "counter";
      return makeOffer(selected!.id, { type, offeredFare: vars.fareNum, etaMinutes: Math.round(vars.etaNum) });
    },
    onSuccess: (_data, vars) => {
      if (selected) recordSentOffer(selected, vars.fare, vars.etaNum);
      setSelected(null);
      setFare("");
      setEta("");
      setError(null);
      void qc.invalidateQueries({ queryKey: ["openOrders"] });
    },
    onError: (e, vars) => {
      const msg = e instanceof ApiError ? e.message : "Couldn't send the offer.";
      // A retry after a client-side timeout can land on an offer the server already committed —
      // the API's own idempotency guard says so verbatim. Without this the rider is told "you
      // already responded" but the board never shows the offer as sent, so they can't tell if it
      // actually went through.
      if (msg === "You already responded to this order (one round only)" && selected) {
        recordSentOffer(selected, vars.fare, vars.etaNum);
        setSelected(null);
        setFare("");
        setEta("");
        setError(null);
        void qc.invalidateQueries({ queryKey: ["openOrders"] });
        return;
      }
      // The 90s auction closed right as this landed — same calm framing as a live bid:expired
      // card, not a generic error that invites a retry into the same wall.
      if (msg === "This order is not open for offers") {
        setError("That request's window just closed — someone else may already have it.");
        setSelected(null);
        return;
      }
      setError(msg);
    },
  });

  // A bare spinner reads as "frozen" on a slow link — after a few seconds of waiting, say so, so it
  // reads as "still trying" instead of "stuck" during the high-anxiety 90s auction window.
  const [offerSlow, setOfferSlow] = useState(false);
  useEffect(() => {
    if (!offerM.isPending) {
      setOfferSlow(false);
      return;
    }
    const t = setTimeout(() => setOfferSlow(true), 4500);
    return () => clearTimeout(t);
  }, [offerM.isPending]);

  // B-O9: stable across renders (useCallback) — both so `renderItem` below (which closes over it) can
  // itself stay stable, and as the FlatList fallback ScrollView's `.map()` onAction, unchanged.
  const chooseOrder = useCallback(
    (o: OpenOrder): void => {
      setSelected(o);
      // One-tap accept is the default (3·1); countering opens the fare field.
      setOfferMode("accept");
      setFare(o.proposedFare);
      // Seed the ETA from the real distance to pickup instead of a constant "10", so the customer's
      // "Fastest" sort ranks on something real. Rider can still edit before sending.
      const km = loc ? haversineKm(loc, o.pickup.point) : null;
      setEta(km != null ? String(Math.max(3, Math.round((km / ETA_SPEED_KMH) * 60))) : "10");
    },
    [loc],
  );
  // B-O9: the FlatList `renderItem` prop, memoized. `VirtualizedList`'s `CellRenderer` is a
  // `React.PureComponent` keyed on (among other props) `item` and `renderItem` — with `ranked` (data)
  // and this both referentially stable across an unrelated re-render (a keystroke in the compose
  // card's fare/ETA field), `CellRenderer` bails on its OWN shallow-prop check and never calls
  // `renderItem` again for a row whose order didn't change, so JobCard's B-O2 memo boundary never even
  // needs to run — the row simply isn't re-created. (An inline arrow prop here, recreated every board
  // render, would have defeated that bail-out regardless of how stable `ranked`/`chooseOrder` were.)
  const renderJobCard = useCallback(
    ({ item: { o, km } }: { item: { o: OpenOrder; km: number | null } }) => (
      <JobCard
        jobType="parcel"
        from={o.pickup.landmark}
        to={o.dropoff.landmark}
        distanceLabel={km != null ? `${km.toFixed(1)} km away` : `${o.distanceKm ?? "?"} km trip`}
        fare={o.proposedFare}
        note={`${o.itemDesc} · asking $${o.proposedFare}`}
        actionLabel="Make an offer"
        onAction={() => chooseOrder(o)}
      />
    ),
    [chooseOrder],
  );

  // RJM.board `list` region (mock→RN codegen): the SAME open-orders rows the FlatList branch renders,
  // shaped as the adopted `RiderBoardListView`'s data seam. Purely presentational — `jobType`/copy are
  // display, and `onAction` forwards the UNCHANGED `chooseOrder` (the offer-compose seam). Kept stable
  // (deps: ranked + chooseOrder) so the fallback list doesn't churn on unrelated board re-renders.
  const rankedJobs = useMemo<RiderBoardJob[]>(
    () =>
      ranked.map(({ o, km }) => ({
        id: o.id,
        jobType: "parcel" as const,
        from: o.pickup.landmark,
        to: o.dropoff.landmark,
        distanceLabel: km != null ? `${km.toFixed(1)} km away` : `${o.distanceKm ?? "?"} km trip`,
        fare: o.proposedFare,
        note: `${o.itemDesc} · asking $${o.proposedFare}`,
        actionLabel: "Make an offer",
        onAction: () => chooseOrder(o),
      })),
    [ranked, chooseOrder],
  );

  // B-O1b: the ScrollView + `.map()` board screen (same shape B-O1 fixed for history/notifications
  // and B-T3 fixed for the restaurant catalog) mounted every JobCard concurrently regardless of how
  // many open orders were nearby. `showOpenOrdersList` is exactly the condition the inline
  // `ranked.map()` below used to render under: meQ resolved, not knownUnverified, not locDenied, no
  // online-gate refusal, and online. Every OTHER state (loading / getMe error / KYC / no-GPS / gate
  // refusal / offline) still renders through the untouched ScrollView return further down — this
  // early return only ever fires for the one state that actually has a `ranked` list to virtualize,
  // so a gated screen can never see a stale `ranked` leak through a FlatList `data` prop.
  // Every wall between a rider and a shift, in one place: resolved identity, verified KYC, location,
  // and no server-side gate refusal. The board list is exactly this, plus actually being online — so
  // the header's "Go online" action and the list branch can never disagree about whether a shift is
  // possible.
  const canGoOnline = !meQ.isLoading && !meQ.isError && !knownUnverified && !locDenied && gate == null;
  const showOpenOrdersList = online && canGoOnline;

  // Shared JSX, hoisted out of both returns below so the FlatList branch and the untouched ScrollView
  // branch render byte-identical markup for the pieces they have in common — a change to one can't
  // silently drift from the other.
  const activeJobBanner = activeJob ? (
    <Card accent>
      {activeJob.status === "assigned" ? (
        // The win state (3·3): a customer just picked this rider — say so, don't mumble.
        <>
          <View style={{ flexDirection: "row", alignItems: "center", gap: tokens.space.sm, marginBottom: 2 }}>
            <Icon name="check" size={18} color={tokens.color.accentText} />
            <Text style={{ fontWeight: "700", color: tokens.color.ink }}>A customer picked you!</Text>
          </View>
          <Text style={{ fontSize: tokens.font.size.body, color: tokens.color.muted, fontVariant: ["tabular-nums"] }}>
            {activeJob.pickup.landmark} → {activeJob.dropoff.landmark} · {formatMoney(activeJob.agreedFare ?? activeJob.proposedFare)}
          </Text>
        </>
      ) : (
        <Text style={{ fontWeight: "700", color: tokens.color.ink }}>You have an active job ({statusPillLabel(activeJob.status)})</Text>
      )}
      {/* Ghost: the accent-bordered card already carries the emphasis — one primary per state. */}
      <Button label="Open job" variant="ghost" onPress={() => pushOnce(router, pathname, "/rider/job")} />
    </Card>
  ) : null;

  // Was the online/offline toggle Card (a status pill, a Go online/Go offline button and a line of
  // "what arrives when you're online" copy). All three went with the switch: the rider is always
  // online, so the pill stated a constant, the button had nothing to do, and the copy explained a
  // choice nobody makes any more. The location warning it carried is real and stays — it tells a
  // rider why the board might be empty.
  const locationWarning = locHint ? (
    <Text style={{ fontSize: 12, color: tokens.color.danger, marginBottom: tokens.space.md }}>{locHint}</Text>
  ) : null;

  const sentOffersSection =
    online && sentOffers.some((s) => s.order.id !== activeJob?.id) ? (
      <View>
        <Sub>Your offers</Sub>
        {sentOffers
          .filter((s) => s.order.id !== activeJob?.id)
          .map((s) => (
            // Primitive props only, so the memo holds and each card's internal 1s ticker is the
            // only thing that repaints while its countdown runs. The taken/expired resolutions
            // stay driven by the same board pushes as before (expiredOrderIds/takenOrderIds).
            <SentOfferCard
              key={s.order.id}
              pickupLandmark={s.order.pickup.landmark}
              dropoffLandmark={s.order.dropoff.landmark}
              fare={s.fare}
              etaMinutes={s.etaMinutes}
              expiresAt={s.expiresAt}
              taken={board.takenOrderIds.has(s.order.id)}
              expired={board.expiredOrderIds.has(s.order.id)}
            />
          ))}
      </View>
    ) : null;

  // RJM `board_empty`: the board carries PARCELS; "Jobs that get taken simply leave the list" states
  // the board's own no-countdown rule out loud, so a card vanishing never reads as a glitch. Food is
  // not on the board — it arrives as a full-screen offer — so the flag-ON copy names where each shows
  // up instead of implying a merged queue here. This message is a data-seam LEAF fed to the adopted
  // `RiderBoardEmptyView` (RJM.board_empty#empty) — the mock's Card+EmptyState structure is adopted,
  // the flag-honest copy stays container-owned (structurally invisible; the normalizer drops text).
  const boardEmptyMessage = merchantDispatchAutoEnabled
    ? "Parcels show up here the moment they're posted near you; a food offer arrives full-screen when it's your turn. Jobs that get taken simply leave the list."
    : "You'll see parcels here the moment they're posted near you. Jobs that get taken simply leave the list.";

  // RJM `offer_parcel`: the parcel offer-compose card, restructured to the mock's Card (TypeTag ·
  // "Sender asking" · Money, then the "Your fare (USD)" + "You'll be there in" fields). The mock draws ONE
  // always-visible fare field and derives accept-vs-counter from its VALUE — exactly as `makeOffer` already
  // does (`fareNum === Number(proposedFare) ? "accept" : "counter"`) — so the old segmented accept/counter
  // tablist is retired (not-drawn⇒not-rendered); it never fed `makeOffer`, so removing it changes no money
  // logic. `offerMode` state + its bid-draft persistence are byte-identical (still set by chooseOrder /
  // draft-restore, still saved); only the toggle is gone and the fare field is always shown (seeded with
  // the asking price by chooseOrder, so a one-tap "Send offer" still submits the asking price → "accept").
  // The card is the codegen-adopted, guardrail-locked region (RJM.offer_parcel#offer → offer-parcel-card.view).
  const offerParcelFareHint = "Ask for more if the trip's worth it — the customer accepts or declines. One offer per job.";
  const offerParcelCard = selected ? (
    <RiderOfferParcelCardView
      proposedFare={selected.proposedFare}
      fare={fare}
      onChangeFare={setFare}
      fareHint={offerParcelFareHint}
      eta={eta}
      onChangeEta={setEta}
    />
  ) : null;
  // The mock's `S(…,{footer})` Send + ghost "Skip this job" pair — container glue (pruned from the
  // composition; the region locator does not reach the S() opts). The AGREED-PRICE submit is byte-identical:
  // `canOffer && offerM.mutate({ fare, fareNum, etaNum })`. "Skip this job" keeps the old Cancel's
  // `setSelected(null)` + in-flight guard (BH-12: a tap while the send is in flight must NOT abort it — on
  // success the offer still lands and would reappear unannounced as a "Your offers" card for a bid the rider
  // believed they'd skipped). Only the ghost's label changed (mock copy "Skip this job"); the handler is the
  // old Cancel's, unchanged.
  const offerParcelFooter = selected ? (
    <>
      <Button
        label={offerSlow ? "Still sending — hang on" : "Send offer"}
        onPress={() => canOffer && offerM.mutate({ fare, fareNum: fareNum!, etaNum: etaNum! })}
        loading={pendingOrQueued(offerM)}
        disabled={!canOffer}
      />
      <Button label="Skip this job" variant="ghost" onPress={() => setSelected(null)} disabled={offerM.isPending} />
    </>
  ) : null;

  // Unconditional trailing content — must render regardless of meQ/knownUnverified/locDenied/gate
  // state, so it's shared between both returns below rather than living only in the FlatList's footer.
  // The "Back to customer" action that used to anchor this footer now lives on the Account tab (owner
  // instruction 2026-08-16) — a rider stuck on ANY gated screen still reaches it there, because the tab
  // bar is drawn below every one of those walls.
  const trailingFooterContent = (
    <>
      {info ? <Sub>{info}</Sub> : null}
      <View style={{ height: tokens.space.xxl }} />
    </>
  );

  // The 8c mint header, shared with the customer home (owner instruction 2026-08-17): greeting +
  // time-of-day sticker + bell, and NO search bar — a rider has nothing to search from here; the
  // board IS the list. The `subRow` slot the customer fills with the deliver-to address carries the
  // rider's equivalent live state: the shift. Rendered on BOTH return paths below, so the Jobs tab
  // has ONE header whatever state it is in (open board, empty board, KYC wall, no-GPS wall).
  const boardBanner = (
    <HomeHeader
      greeting={greetingLine(greetingFor(clock).phrase, meQ.data?.firstName)}
      evening={greetingFor(clock).evening}
      unread={unreadCount > 0}
      onBell={() => router.push("/notifications")}
      // Same row, same component as the customer home — in DETECT mode (owner decision 2026-08-17).
      // Tapping re-detects; it does not open a picker. See HomeAddressRow: the board ranks jobs off
      // the live GPS fix it requests itself and the server pushes off the heartbeat position, so a
      // picked address could re-label this row without moving a single job.
      subRow={
        <HomeAddressRow
          address={location.label}
          mode="detect"
          busy={location.locating}
          onPress={() => void location.useCurrentLocation()}
        />
      }
      // A dropped board socket keeps the TOP of the screen, above the greeting, exactly where it sat
      // before this header existed (owner instruction 2026-08-17).
      topSlot={online && (!board.connected || beatStale) ? <OfflineBanner state="reconnecting" /> : null}
    />
  );

  // Shift row: status ONLY, no control (owner decisions 2026-08-17 "you are always online", then
  // 2026-08-20 "bring back the toggle" → resolved to the status row without an action). The rider
  // is still always online, so there is nothing to toggle — but "am I taking work?" previously had
  // no answer here, because the reconnecting banner only speaks when something is WRONG. A healthy
  // board was silent, and silence read as both "online" and "broken". The row is rendered in the
  // list header below; see the note there for why the dot and the banner are not the same message.

  // No "Jobs near you" heading and no queue subtitle (owner instruction 2026-08-17): the greeting
  // names the screen, the tab bar names the tab, and the cards are self-evidently the jobs — a
  // heading over the only content on the screen was labelling the obvious.

  // RJM `board` `OnlinePill`: a compact status row (online/reconnecting pill · "one queue" subtitle ·
  // a "Go offline" text action), not the big go-online Card — that Card is the OFFLINE presentation
  // (RJM `offline`), kept on the ScrollView path below. The reconnecting state is honest: the parity
  // socket is inert, so the chip reads "Reconnecting" rather than a faked "Online".
  if (showOpenOrdersList) {
    return (
      // The Jobs tab's ONE header is the 8c mint block (owner instruction 2026-08-17): greeting,
      // detected location, bell — with the connectivity banner pinned above the greeting inside it.
      // The tab bar below already carries Jobs/Money/Account.
      <AppScreen banner={boardBanner}>
        <View style={{ flex: 1, paddingHorizontal: tokens.space.screen }}>
          <FlatList
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingTop: tokens.space.md }}
            data={ranked}
            keyExtractor={({ o }) => o.id}
            renderItem={renderJobCard}
            ListHeaderComponent={
              <>
                {/* Shift status, at the RJM mock's `OnlinePill` position — the first thing in the
                    list header, above the warnings. STATUS ONLY, no control (owner decision
                    2026-08-20): the rider is still always online (D-29), so there is nothing to
                    toggle, but "am I actually taking work?" had no answer on this screen at all.
                    The reconnecting BANNER only appears when something is wrong, so a healthy board
                    said nothing — silence read as both "online" and "broken".

                    THE CONDITION IS THE POINT: this renders only when the connection is healthy,
                    which is exactly when the banner above is absent. The two never appear together.
                    A first cut rendered the row in both states with the label switching to
                    "Reconnecting", and the parity render showed the result — the banner's
                    "Reconnecting… your data may be a moment behind" with a second "Reconnecting"
                    120px under it. Same word twice on one screen is noise, not honesty; the banner
                    already owns the failure case and says more about it than a dot can.

                    So the split is by state, not by component: banner speaks when something is
                    wrong, row speaks when nothing is. `connected` is therefore always true here —
                    passed explicitly rather than hardcoded inside HomeStatusRow, because the
                    component's honest-dot contract belongs to the component (see its test).

                    Deliberately no "one queue" subtitle and no "Go offline" action — both were
                    removed by owner instruction (D-29) and neither is being brought back. */}
                {online && board.connected && !beatStale ? (
                  <View style={{ marginBottom: tokens.space.sm }}>
                    <HomeStatusRow label="Online" connected />
                  </View>
                ) : null}
                {/* Before anything else: a rider with no fix is online but may see an empty board,
                    and this is the only line that says why. It used to live in the offline toggle
                    Card — a screen state that no longer exists — so without this it became
                    unreachable for precisely the rider who needs it. */}
                {locationWarning}
                {activeJobBanner}
                {sentOffersSection}
                {/* 2·b1: muted, self-clearing notice when a nearby order the rider hadn't bid on is
                    taken by someone else — so a card vanishing off the board reads as "someone was
                    faster", not a glitch. Never an alarm; one line regardless of how many go at once.
                    No "Open orders" label — the mock leads straight from the pill into the cards. */}
                {takenNotice ? (
                  <View
                    accessibilityRole="text"
                    accessibilityLiveRegion="polite"
                    style={{ flexDirection: "row", alignItems: "center", gap: tokens.space.sm, paddingHorizontal: tokens.space.md, paddingVertical: tokens.space.sm, borderRadius: tokens.radius.input, backgroundColor: tokens.color.surface, marginBottom: tokens.space.sm }}
                  >
                    <Icon name="bike" size={15} color={tokens.color.muted} />
                    <Text style={{ flex: 1, fontSize: tokens.font.size.caption, color: tokens.color.muted, lineHeight: 18 }}>
                      A nearby order was just taken by another rider. Stay online — more come through fast.
                    </Text>
                  </View>
                ) : null}
              </>
            }
            ListEmptyComponent={
              openQ.isError ? (
                <EmptyState icon="wifi-off" title="Couldn't load nearby orders" message="Check your connection and try again.">
                  <Button label="Retry" onPress={() => void openQ.refetch()} />
                </EmptyState>
              ) : openQ.isLoading ? (
                // The initial geo-scoped fetch can take up to the client's ~15s timeout on a slow link.
                // Show the skeleton while it's in flight (matching rider/job.tsx's convention) instead of
                // asserting the definitive "No open orders near you" conclusion before the first fetch returns.
                <SkeletonList />
              ) : (
                <RiderBoardEmptyView message={boardEmptyMessage} />
              )
            }
            ListFooterComponent={
              <>
                {offerParcelCard}
                {offerParcelFooter}
                {trailingFooterContent}
              </>
            }
          />
        </View>
      </AppScreen>
    );
  }

  return (
    // The same mint header as the list branch above, so a rider crossing between a live board and a
    // gated wall (KYC, no-GPS, offline) never sees the tab's identity change underneath them.
    // Inner screens (rider/job, rider/become, …) keep their plain white Screen bars, unchanged.
    <AppScreen banner={boardBanner}>
      <View style={{ flex: 1, paddingHorizontal: tokens.space.screen }}>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: tokens.space.md }}>
        {activeJobBanner}

        {meQ.isLoading ? (
          <View style={{ marginTop: tokens.space.lg }}>
            <SkeletonList count={2} />
          </View>
        ) : meQ.isError ? (
          // getMe failed — knownUnverified is false with no data, so without this branch we'd render the
          // online dashboard as if verified and let the rider go online into a backend that then refuses.
          // Show an explicit error/retry instead of optimistically trusting an unknown KYC state.
          <EmptyState
            icon="wifi-off"
            title="Couldn't load your rider status"
            message="Check your connection and try again."
          >
            <Button label="Retry" onPress={() => void meQ.refetch()} loading={meQ.isFetching} />
          </EmptyState>
        ) : knownUnverified ? (
          !meQ.data?.rider ? (
            // Not a rider yet → the full onboarding form (name, ID, bike, photo).
            <EmptyState
              icon="id-card"
              title="Set up as a rider"
              message="Verify your ID and register your bike to start accepting deliveries."
            >
              <Button label="Become a rider" onPress={() => router.push("/rider/become")} />
            </EmptyState>
          ) : kyc === "expired" ? (
            // 1·b2: a previously-verified rider whose ID lapsed. Distinct from the first-time "verify"
            // and the "declined" states — the rider was good, the document aged out. Re-verify mints a
            // fresh Didit session (the A-02 counter was reset server-side, so they're never locked out).
            <EmptyState
              icon="triangle-alert"
              title="Your ID has expired"
              message="You can't go online until you re-verify. Re-submit a valid national ID to keep riding."
            >
              <Button label="Re-verify my ID" onPress={() => retryM.mutate()} loading={pendingOrQueued(retryM)} />
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
                {/* R4: the lock tells the rider to "contact support" — make that a real, tappable action
                    instead of dead copy, so they aren't stranded with only a no-op "Refresh status". The
                    5 Jul design makes contact-support a `tel:` call, not a mailto dead end. */}
                <SupportCallRow />
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
                <Button label="Try again" onPress={() => retryM.mutate()} loading={pendingOrQueued(retryM)} />
              </EmptyState>
            )
          ) : rider?.kycMode === "manual" ? (
            // BH-03: manual KYC mode has no vendor browser step — the old copy told every pending
            // rider to "continue in the browser" and go there via a "Continue verification" tap that
            // silently no-oped server-side, which read as a stuck/broken flow. Be honest: this is ops
            // review, not something the rider can push forward themselves.
            <EmptyState
              icon="id-card"
              title="Your ID is under review"
              message="Your documents are being checked by our team. We'll notify you as soon as it's done — no action needed from you."
            >
            </EmptyState>
          ) : (
            // Pending — let them re-open a working verification session instead of re-keying the form.
            <EmptyState
              icon="id-card"
              title="Finish verifying your ID"
              message="Your ID check is still pending. Continue in the browser, then come back — riders go online once verified."
            >
              <Button label="Continue verification" onPress={() => retryM.mutate()} loading={pendingOrQueued(retryM)} />
            </EmptyState>
          )
        ) : locDenied ? (
          // S·4 no-GPS gate: riding needs location (parcels near you, navigation) — a calm blocking
          // state with the real recovery (OS settings), not a silent city-wide fallback.
          <EmptyState
            icon="wifi-off"
            title="Can't find your location"
            message={
              online
                ? // The heartbeat is keyed on [online] and keeps firing regardless of locDenied, so a rider
                  // whose OS permission was revoked mid-shift is STILL online server-side — be honest about
                  // that and give them a real way out, rather than a dead "you can't go online" wall.
                  "You're still online, so orders may still reach you — but without location we can't show parcels near you or navigate to pickups. Turn location back on to keep receiving nearby orders, or go offline to end your shift."
                : "Turn on location so we can show parcels near you and navigate to pickups. You can't go online without it."
            }
          >
            <Button label="Open location settings" onPress={() => void Linking.openSettings()} />
            <Button label="I've turned it on" variant="ghost" onPress={() => void requestLocation()} />
            {/* No "Go offline" here any more: the rider is always online (D-29), so a shift control on
                this wall would be the one place in the app still offering a switch that was removed
                everywhere else. Closing the app is what ends a shift. */}
          </EmptyState>
        ) : (
          <>
        {gate ? (
          // The rules API refused going online — a distinct, calm state per reason (on hold / suspended /
          // banned / cooldown / out-of-area / KYC), not a red error. The recoverable states keep a
          // retry (cooldown → try again; out-of-area → refresh once back in range); the terminal ones
          // (suspended / on hold / banned) expose a `tel:` support call row — the mandatory exit so no
          // state is a dead end. Suspended + banned read as triangle-alert (harder states); out-of-area
          // + on-hold as circle-alert.
          <EmptyState
            icon={
              gate === "suspended" || gate === "banned"
                ? "triangle-alert"
                : gate === "cooldown"
                  ? "clock"
                  : gate === "kyc"
                    ? "id-card"
                    : gate === "commission_low_balance"
                      ? "banknote"
                      : "circle-alert"
            }
            title={ONLINE_GATE_COPY[gate].title}
            message={ONLINE_GATE_COPY[gate].message}
            // B3/gate_topup: a real money block reads as danger (dangerWash/dangerInk), distinct from
            // the merely-inconvenient states (cooldown, out-of-area) that share this same EmptyState.
            tone={gate === "commission_low_balance" ? "danger" : "accent"}
          >
            {/* Recoverable-by-retry states re-DRIVE the online toggle (the server re-checks and either
                lets them through or re-gates) — cooldown elapses and out-of-area clears once they ride
                back into the corridor. This is a real RETRY, not a refresh: it re-runs the decision
                server-side, so it survives the no-manual-refresh rule the removed button fell under.
                `on_hold` is NOT included: only an admin's `clearHold` action lifts it (see
                admin-riders.service.ts) — nothing this button does can change the outcome, so it's
                dropped in favour of the support-call row below, matching the "contact support" copy in
                ONLINE_GATE_COPY.on_hold. */}
            {gate === "cooldown" || gate === "out_of_area" ? (
              <Button label="Try again" onPress={() => onlineM.mutate(true)} loading={pendingOrQueued(onlineM)} />
            ) : null}
            {/* UX-2026-07-16: ONLINE_GATE_COPY.commission_low_balance's own copy promises "top up your
                prepaid balance and you're straight back on" and its doc comment claims this screen
                "deep-links the CTA into the wallet's top-up flow" — but no such branch existed, so the
                rider's only button re-showed the identical wall. B3: the wallet
                is now the Money tab (RJM gate_topup) rather than a standalone screen, so this re-targets
                there — the rider sees their real balance + the Top up button in one place, instead of
                being deep-linked past it straight into the top-up form. */}
            {gate === "commission_low_balance" ? (
              <Button label="Go to Money" onPress={() => router.push("/rider/money")} />
            ) : null}
            {/* R4: suspended / on hold / banned all say "contact support" — a real `tel:` call row, not
                a dead mailto button. */}
            {gate === "suspended" || gate === "on_hold" || gate === "banned" ? <SupportCallRow /> : null}
            {/* No "Refresh status" here any more (owner instruction 2026-08-16). What it did — clear the
                gate and refetch ["me"] — now happens on its own at the two boundaries that matter: the
                app returning to foreground and this tab regaining focus (see the useFocusEffect +
                useForegroundRefetch pair above). So after support lifts a suspension/ban the "Go online"
                card comes back without a tap, and the rider is never pinned on this wall. */}
          </EmptyState>
        ) : (
          <>
        {locationWarning}

        {sentOffersSection}

        {online ? (
          <View>
            <Sub>Open orders{openQ.isFetching ? " …" : ""}</Sub>
            {/* 2·b1: muted, self-clearing notice when a nearby order the rider hadn't bid on is taken by
                someone else — so a card vanishing off the board reads as "someone was faster", not a
                glitch. Never an alarm; one line regardless of how many go at once. */}
            {takenNotice ? (
              <View
                accessibilityRole="text"
                accessibilityLiveRegion="polite"
                style={{ flexDirection: "row", alignItems: "center", gap: tokens.space.sm, paddingHorizontal: tokens.space.md, paddingVertical: tokens.space.sm, borderRadius: tokens.radius.input, backgroundColor: tokens.color.surface, marginBottom: tokens.space.sm }}
              >
                <Icon name="bike" size={15} color={tokens.color.muted} />
                <Text style={{ flex: 1, fontSize: tokens.font.size.caption, color: tokens.color.muted, lineHeight: 18 }}>
                  A nearby order was just taken by another rider. Stay online — more come through fast.
                </Text>
              </View>
            ) : null}
            {/* RJM.board `list` region — the adopted `RiderBoardListView` (board-list.view.tsx), mounted
                here in the main/fallback branch (the one the composition guardrail reduces). The
                virtualized happy-path list stays the `showOpenOrdersList` FlatList above, untouched. */}
            <RiderBoardListView jobs={rankedJobs} />
            {openQ.isError ? (
              <EmptyState icon="wifi-off" title="Couldn't load nearby orders" message="Check your connection and try again.">
                <Button label="Retry" onPress={() => void openQ.refetch()} />
              </EmptyState>
            ) : openQ.isLoading ? (
              // The initial geo-scoped fetch can take up to the client's ~15s timeout on a slow link.
              // Show the skeleton while it's in flight (matching rider/job.tsx's convention) instead of
              // asserting the definitive "No open orders near you" conclusion before the first fetch returns.
              <SkeletonList />
            ) : ranked.length === 0 ? (
              // RJM.board_empty#empty — `RiderBoardEmptyView` (board-empty.view.tsx), mounted INLINE
              // here in the fallback ScrollView as well as in the list branch above, so the empty state
              // is the same on both paths. It carries NO action: the mock's ghost "Refresh" is undrawn
              // by owner instruction (DESIGN-DEVIATIONS D-30) — the board re-fetches on its own.
              <RiderBoardEmptyView message={boardEmptyMessage} />
            ) : null}
          </View>
        ) : null}

        {/* RJM offer_parcel#offer — mounted INLINE here (not via the const) so the composition guardrail,
            which reduces THIS final return, sees the region element. Same card the FlatList branch shows;
            the footer glue follows it. */}
        {selected ? (
          <RiderOfferParcelCardView
            proposedFare={selected.proposedFare}
            fare={fare}
            onChangeFare={setFare}
            fareHint={offerParcelFareHint}
            eta={eta}
            onChangeEta={setEta}
          />
        ) : null}
        {offerParcelFooter}
          </>
        )}
          </>
        )}

        {trailingFooterContent}
      </ScrollView>
      </View>
    </AppScreen>
  );
}
