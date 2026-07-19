import { haversineKm, tokens } from "@lynia/shared";
import { ETA_SPEED_KMH } from "../../src/logic/eta";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Location from "expo-location";
import * as WebBrowser from "expo-web-browser";
import { useFocusEffect, usePathname, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { ApiError } from "../../src/api/client";
import { getMe } from "../../src/api/auth";
import { makeOffer } from "../../src/api/offers";
import { getActiveOrder, getOpenOrders, type OpenOrder } from "../../src/api/orders";
import { loadAcknowledgedHandbacks } from "../../src/auth/session";
import { pushOnce } from "../../src/push/push";
import { retryKyc, sendHeartbeat, setOnline } from "../../src/api/riders";
import { useForegroundRefetch } from "../../src/realtime/use-foreground-refetch";
import { useRiderBoard } from "../../src/realtime/use-rider-board";
import { isKycLocked, kycDeclineLabel, onlineGateReason, ONLINE_GATE_COPY, type OnlineGateReason, resolveKycRetryFeedback } from "../../src/logic/gates";
import { formatMoney } from "../../src/logic/money";
import { buildSentOfferEntry, clearRiderBidDraft, isRiderBidDraftExpired, loadRiderBidDraft, saveRiderBidDraft, type SentOffer } from "../../src/logic/rider-bid-draft";
import { Button, Card, EmptyState, ErrorText, Field, haptic, Heading, Icon, OfflineBanner, Screen, SkeletonList, StatusPill, statusPillLabel, Sub } from "../../src/ui";
import { SentOfferCard } from "../../src/ui/rider/SentOfferCard";
import { SupportCallRow } from "../../src/ui/safety";
import { parseNum } from "../../src/util";

// GPS fix bound: `getCurrentPositionAsync` has no timeout of its own and a cold fix can hang forever,
// which matters here more than cosmetically — the server records a broadcast-eligible position only
// `if (online && location)`, so a rider whose first cold fix hangs goes online with NO position and is
// invisibly excluded from every broadcast. Race the fix against this and fall back to the last-known
// (cached) fix. Mirrors the same helper in src/ui/MapPicker.tsx (duplicated per the "don't over-abstract"
// convention — it's ~5 lines and this file may not reach across into ui/).
const LOCATE_TIMEOUT_MS = 9_000;
/** Reject if `p` doesn't settle within `ms`. Clears the timer once the race settles so a fast fix
 *  doesn't leave a dangling timeout firing against an already-settled race. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    p,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error("location-timeout")), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

// SentOffer moved to src/logic/rider-bid-draft.ts (buildSentOfferEntry) so its construction — using
// the SENT fare/eta, never live form state — is unit-testable without mounting this screen.


export default function RiderHome(): React.ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();
  const [online, setOnlineState] = useState(false);
  // Set once the rider explicitly toggles this session (a successful onlineM), so the server-reconcile
  // below never overrides a deliberate go-offline by re-seeding from a stale `is_online`.
  const userToggledRef = useRef(false);
  // Runs the server-online reconcile at most once per mount (see the effect after meQ).
  const didSeedOnlineRef = useRef(false);
  // "Back to customer" used to be a single unconfirmed tap even while online/mid-job, unmounting the
  // board socket + heartbeat with no warning — a rider could go browse as a customer and lose track of
  // an accepted job, or go effectively deaf to new broadcasts while still marked online server-side.
  const [confirmSwitch, setConfirmSwitch] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
  const [bidIds, setBidIds] = useState<Set<string>>(() => new Set());
  // Offers the rider has sent this session — rendered with a live "customer's window closes in"
  // countdown, and flipped to a distinct "that window closed" state on a `bid:expired` push. The 1s
  // countdown clock itself lives INSIDE each SentOfferCard (PERF): a screen-level ticker used to
  // re-render this whole board — every open-order card, gate and the compose form — once a second
  // for the length of any auction the rider had bid into.
  const [sentOffers, setSentOffers] = useState<SentOffer[]>([]);

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
  const board = useRiderBoard(online, loc, bidIds);
  const activeQ = useQuery({ queryKey: ["activeJob"], queryFn: getActiveOrder, refetchInterval: board.connected ? false : 8000 });
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
  // While the check is `pending`, poll so a vendor webhook flipping the rider to verified clears the
  // gate on its own — no manual Refresh needed. Stop polling once it resolves (verified/failed).
  // Cadence by review mode (wave-2 perf): in `auto` mode the vendor answers within minutes, so 5s
  // keeps the "verified!" moment snappy; in `manual` mode the pending state is an OPS review lasting
  // hours or days — 5s polling there was ~17k requests/day of radio wakeups per waiting rider for a
  // transition that lands via ops, so it slows to a 60s safety net (the screen also refetches on
  // focus/foreground, so a rider actively checking still sees the flip quickly).
  const meQ = useQuery({
    queryKey: ["me"],
    queryFn: getMe,
    refetchInterval: (query) => {
      const rider = query.state.data?.rider;
      if (rider?.kycStatus !== "pending") return false;
      return rider.kycMode === "manual" ? 60_000 : 5000;
    },
  });
  // Reconcile the local toggle with the server's is_online on first load. is_online only flips on an
  // explicit toggle call — there's no server-side staleness sweep — so if the app was killed mid-shift
  // (Android kill) and relaunched, the server (and /home's "Online as a rider" chip) still believe the
  // rider is on shift, but this board booted to `false`, running no heartbeat: the rider is silently
  // deaf to broadcasts while a stale chip elsewhere says otherwise. Seed `online = true` once so the
  // heartbeat resumes (and re-records position on its next beat). Runs at most once per mount and never
  // after an explicit toggle, so a deliberate go-offline is never overridden and there's no loop.
  useEffect(() => {
    if (didSeedOnlineRef.current || userToggledRef.current) return;
    const rider = meQ.data?.rider;
    if (!rider) return; // wait for a real ["me"] resolve before deciding
    didSeedOnlineRef.current = true;
    if (rider.isOnline && !online) setOnlineState(true);
  }, [meQ.data, online]);

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
    mutationFn: (next: boolean) => setOnline(next, loc ?? undefined),
    onSuccess: (res) => {
      // An explicit toggle is authoritative for the rest of this session — freeze out the reconcile.
      userToggledRef.current = true;
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
              setError("You were taken offline. Tap Go online to retry.");
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
  const ranked = (openQ.data ?? [])
    .filter((o) => !bidIds.has(o.id)) // hide orders we've already bid on (one round per rider)
    .map((o) => ({ o, km: loc ? haversineKm(loc, o.pickup.point) : null }))
    .sort((a, b) => (a.km ?? Number.MAX_SAFE_INTEGER) - (b.km ?? Number.MAX_SAFE_INTEGER));

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
    setBidIds((prev) => new Set(prev).add(s.id));
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

  const chooseOrder = (o: OpenOrder): void => {
    setSelected(o);
    // One-tap accept is the default (3·1); countering opens the fare field.
    setOfferMode("accept");
    setFare(o.proposedFare);
    // Seed the ETA from the real distance to pickup instead of a constant "10", so the customer's
    // "Fastest" sort ranks on something real. Rider can still edit before sending.
    const km = loc ? haversineKm(loc, o.pickup.point) : null;
    setEta(km != null ? String(Math.max(3, Math.round((km / ETA_SPEED_KMH) * 60))) : "10");
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

        {activeJob ? (
          <Card style={{ borderColor: tokens.color.accent }}>
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
        ) : null}

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
              <Button label="Refresh status" variant="ghost" onPress={() => void meQ.refetch()} />
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
              <Button label="Re-verify my ID" onPress={() => retryM.mutate()} loading={retryM.isPending} />
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
                {/* R4: the lock tells the rider to "contact support" — make that a real, tappable action
                    instead of dead copy, so they aren't stranded with only a no-op "Refresh status". The
                    5 Jul design makes contact-support a `tel:` call, not a mailto dead end. */}
                <SupportCallRow />
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
              <Button label="Refresh status" variant="ghost" onPress={() => void meQ.refetch()} />
            </EmptyState>
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
            {/* A rider done for the day who revoked location had no way to end their shift from this gate —
                route it through the same offline toggle so state stays consistent with the normal path. */}
            {online ? (
              <Button label="Go offline" variant="ghost" onPress={() => onlineM.mutate(false)} loading={onlineM.isPending} />
            ) : null}
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
                    : "circle-alert"
            }
            title={ONLINE_GATE_COPY[gate].title}
            message={ONLINE_GATE_COPY[gate].message}
          >
            {/* Recoverable-by-retry states re-DRIVE the online toggle (the server re-checks and either
                lets them through or re-gates) — cooldown elapses and out-of-area clears once they ride
                back into the corridor. "Refresh status" alone only refetched ["me"], which never cleared
                `gate`, so these used to be dead ends. `on_hold` is NOT included: only an admin's
                `clearHold` action lifts it (see admin-riders.service.ts) — nothing this button does can
                change the outcome, so it's dropped in favour of the support-call row below, matching the
                "contact support" copy in ONLINE_GATE_COPY.on_hold. */}
            {gate === "cooldown" || gate === "out_of_area" ? (
              <Button label="Try again" onPress={() => onlineM.mutate(true)} loading={onlineM.isPending} />
            ) : null}
            {/* UX-2026-07-16: ONLINE_GATE_COPY.commission_low_balance's own copy promises "top up your
                prepaid balance and you're straight back on" and its doc comment claims this screen
                "deep-links the CTA into the wallet's top-up flow" — but no such branch existed, so the
                rider's only button was "Refresh status" re-showing the identical wall. Route straight to
                the top-up screen instead of leaving the rider to discover Profile → Earnings → Wallet. */}
            {gate === "commission_low_balance" ? (
              <Button label="Top up" onPress={() => router.push("/wallet/top-up")} />
            ) : null}
            {/* R4: suspended / on hold / banned all say "contact support" — a real `tel:` call row, not
                a dead mailto button. */}
            {gate === "suspended" || gate === "on_hold" || gate === "banned" ? <SupportCallRow /> : null}
            {/* Clear the gate too, so after support lifts a suspension/ban (or KYC verifies) the
                "Go online" card comes back instead of the rider being pinned on the gate screen. */}
            <Button
              label="Refresh status"
              variant="ghost"
              onPress={() => {
                setGate(null);
                void meQ.refetch();
              }}
            />
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
          {locHint ? (
            <Text style={{ fontSize: 12, color: tokens.color.danger, marginTop: 4 }}>{locHint}</Text>
          ) : null}
        </Card>

        {online && sentOffers.some((s) => s.order.id !== activeJob?.id) ? (
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
        ) : null}

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
            {ranked.map(({ o, km }) => (
              <Card key={o.id}>
                <Text style={{ fontWeight: "700", color: tokens.color.ink }}>{o.pickup.landmark} → {o.dropoff.landmark}</Text>
                <Text style={{ fontSize: 14, color: tokens.color.muted, fontVariant: ["tabular-nums"] }}>
                  {o.itemDesc} · {km != null ? `${km.toFixed(1)} km away` : `${o.distanceKm ?? "?"} km trip`} · asking {formatMoney(o.proposedFare)}
                </Text>
                <Button label="Make an offer" variant="ghost" onPress={() => chooseOrder(o)} />
              </Card>
            ))}
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
            <Text style={{ fontWeight: "700", marginBottom: 2 }}>
              {selected.pickup.landmark} → {selected.dropoff.landmark}
            </Text>
            <Text style={{ fontSize: 13, color: tokens.color.muted, marginBottom: tokens.space.md, fontVariant: ["tabular-nums"] }}>
              {selected.itemDesc} · asking ${selected.proposedFare}
            </Text>
            {/* Segmented accept-or-counter (3·1): take the asking price in one tap, OR counter with
                your own fare. One offer per order either way. */}
            <View
              accessibilityRole="tablist"
              style={{
                flexDirection: "row",
                gap: 4,
                padding: 4,
                backgroundColor: tokens.color.surface,
                borderRadius: tokens.radius.pill,
                marginBottom: tokens.space.md,
              }}
            >
              {(
                [
                  { key: "accept" as const, label: `Accept $${selected.proposedFare}` },
                  { key: "counter" as const, label: "Offer a different price" },
                ]
              ).map((seg) => {
                const on = offerMode === seg.key;
                return (
                  <Pressable
                    key={seg.key}
                    onPress={() => {
                      setOfferMode(seg.key);
                      // Accept = the customer's price, exactly; switching back re-seeds it.
                      if (seg.key === "accept") setFare(selected.proposedFare);
                    }}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: on }}
                    style={{
                      flex: 1,
                      minHeight: tokens.touchTargetMin,
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: tokens.radius.pill,
                      backgroundColor: on ? tokens.color.bg : "transparent",
                      ...(on ? tokens.shadow.card : null),
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: "700", color: on ? tokens.color.accentText : tokens.color.muted, fontVariant: ["tabular-nums"] }}>
                      {seg.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {offerMode === "counter" ? (
              <Field
                label="Your fare (USD)"
                value={fare}
                onChangeText={setFare}
                keyboardType="decimal-pad"
                hint="Ask for more if the trip's worth it — the customer accepts or declines."
              />
            ) : null}
            <Field label="ETA to pickup (min)" value={eta} onChangeText={setEta} keyboardType="number-pad" maxLength={3} />
            <Button
              label={offerSlow ? "Still sending — hang on" : offerMode === "accept" ? `Accept $${selected.proposedFare}` : "Send my price"}
              onPress={() => canOffer && offerM.mutate({ fare, fareNum: fareNum!, etaNum: etaNum! })}
              loading={offerM.isPending}
              disabled={!canOffer}
            />
            {/* BH-12: disabled while the offer send is in flight — mirrors BailSheet/UndeliveredSheet's
                dismiss guard. Without this, a tap here didn't abort the in-flight makeOffer call: on
                success the offer still landed and later reappeared unannounced as a "Your offers" card
                for a bid the rider believed they'd cancelled; on failure the resulting ErrorText rendered
                on an already-dismissed screen with no visible context. */}
            <Button label="Cancel" variant="ghost" onPress={() => setSelected(null)} disabled={offerM.isPending} />
          </Card>
        ) : null}

        <Button label="View earnings" variant="ghost" onPress={() => router.push("/earnings")} />
          </>
        )}
          </>
        )}

        {confirmSwitch ? (
          <Card style={{ backgroundColor: tokens.color.highlightWash, borderColor: tokens.color.highlightBorder }}>
            <Text style={{ fontWeight: "700", marginBottom: 6, color: tokens.color.ink }}>
              {activeJob ? "You have a job in progress" : "You're online for deliveries"}
            </Text>
            <Sub>
              {activeJob
                ? "Switching to the customer view won't cancel your job, but you'll stop seeing job updates here until you come back."
                : "Switching to the customer view takes you offline, so you'll stop receiving nearby deliveries."}
            </Sub>
            <Button
              label="Go to customer view"
              onPress={() => {
                // No-active-job path: the copy promises this takes you offline, so make it true —
                // fire the offline toggle best-effort (don't block leaving on it; the component
                // unmounts on navigate and the request still lands server-side). The active-job path
                // deliberately stays online (its copy says the job isn't cancelled), so only toggle
                // when there's no active job.
                if (!activeJob) onlineM.mutate(false);
                router.replace("/home");
              }}
            />
            <Button label="Stay online as a rider" variant="ghost" onPress={() => setConfirmSwitch(false)} />
          </Card>
        ) : (
          <Button
            label="Back to customer"
            variant="ghost"
            onPress={() => (online || activeJob ? setConfirmSwitch(true) : router.replace("/home"))}
          />
        )}
        <ErrorText message={error} />
        {info ? <Sub>{info}</Sub> : null}
        <View style={{ height: tokens.space.xxl }} />
      </ScrollView>
    </Screen>
  );
}
