import { CreateOrderRequest, normalizePhone, quoteFare } from "@lynia/shared";
import { tokens } from "@lynia/shared/tokens";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, KeyboardAvoidingView, LayoutAnimation, Platform, ScrollView, StyleSheet, Text, UIManager, useWindowDimensions, View } from "react-native";
import { ApiError } from "../src/api/client";
import { getMe } from "../src/api/auth";
import { acceptDisclaimer, createOrder, getActiveCustomerOrder, type OrderSnapshot } from "../src/api/orders";
import { loadDisclaimerAccepted, saveDisclaimerAccepted } from "../src/auth/session";
import { isAccountOnHold, isOutOfServiceArea, isWithinServiceCorridor } from "../src/logic/gates";
import {
  DISCLAIMER_POLICY_VERSION,
  draftFromParams,
  emptyItem,
  type ItemRow,
  MAX_ITEMS,
  type RebroadcastParams,
} from "../src/logic/order-draft";
import { usePickupAutolocate } from "../src/logic/use-pickup-autolocate";
import { invalidateIfStale, orderKey } from "../src/query/client";
import { invalidateCustomerOrderHistory } from "../src/query/use-history-feed";
import { useForegroundRefetch } from "../src/realtime/use-foreground-refetch";
import { fareBand, isBelowBand, isFarAboveBand } from "../src/logic/fare-band";
import { loadMyPickupPhone, loadRecipients, type Recipient, rememberRecipient, saveMyPickupPhone } from "../src/logic/saved-recipients";
import type { ResolvedPlace } from "../src/api/places";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Field, haptic, Icon, TestBuildBanner, useActionError, Tappable } from "../src/ui";
import { AddressConfirmSheet } from "../src/ui/AddressConfirmSheet";
import { AddressSearch } from "../src/ui/AddressSearch";
import { BottomSheet } from "../src/ui/BottomSheet";
import { DisclaimerSheet } from "../src/ui/home/DisclaimerSheet";
import { AddressHint, AddressRows, type AddressSlot, MapHomeTopBar } from "../src/ui/MapHome";
import type { PickedPoint } from "../src/ui/MapPicker";
import { ActiveOrderBanner, SendAccountOnHoldView } from "../src/ui/send/SendAccountOnHoldView";
import { SendItemsList } from "../src/ui/send/SendItemsList";
import { SendLandmarksDetails } from "../src/ui/send/SendLandmarksDetails";
import { SendPhoneFields } from "../src/ui/send/SendPhoneFields";
import { SendPriceQuote } from "../src/ui/send/SendPriceQuote";
import { parseNum, randomUuidV4, uuidV4FromSeed } from "../src/util";
// Foundation-F.c region-adopted fragments — generated, structure-parity views of the mock `Home`'s
// map canvas (FauxMap→ComposeMap) and submit sheet-footer. Mounted below in the mock's composition
// order; all live behaviour flows in through their props seam (see tools/parity/codegen/adopted.mjs).
import { SendMapView } from "./send-map.view";
import { SendComposeFooterView } from "./send-compose-footer.view";

// LayoutAnimation needs an explicit opt-in on old-architecture Android; a no-op on iOS / Fabric.
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function HomeScreen(): React.ReactElement {
  const router = useRouter();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  // The compose sheet snaps over the full-bleed map at the kit's two heights (K.MapSheet `maxHeight`):
  // PEEK = 58% of the screen, EXPANDED = 88%. home_empty / home_pins both rest at PEEK.
  const { height: screenH } = useWindowDimensions();
  const SHEET_PEEK = 0.58;
  const SHEET_EXPANDED = 0.88;
  // C5: re-broadcast params from the order screen (rb…). Read once at mount to prefill the form when
  // the customer explicitly asked to re-send THIS order. `draftFromParams` is pure, so it is resolved
  // in a lazy initializer rather than inside the prefill effect: the pickup auto-locate below needs
  // the same answer BEFORE the first paint (a re-broadcast's own pickup wins over the device's
  // position), and racing it against an effect would let the locate fire for one tick anyway.
  const rbParams = useLocalSearchParams<RebroadcastParams>();
  const [rbDraft] = useState(() => draftFromParams(rbParams));

  // /send is a PUSHED route over the tab shell (home/orders/account/history/profile all router.push
  // it), so the tab bar is hidden while it is up — and the map-anchored composer, inheriting a mock
  // that was drawn when this screen was the app's root, shipped with no way out at all. Same escape
  // as `rider/become`: pop when there is a stack, otherwise land on the launcher so a deep link or a
  // notification cold-start can't strand the customer either.
  const goBack = useCallback((): void => {
    if (router.canGoBack()) router.back();
    else router.replace("/home");
  }, [router]);

  const [pickupPoint, setPickupPoint] = useState<PickedPoint | null>(null);
  const [pickupLandmark, setPickupLandmark] = useState("");
  // Has the customer taken ownership of the pickup pin — tapped/dragged the map, confirmed a searched
  // address, or arrived on a re-broadcast? The auto-locate below never writes once this is true, so a
  // slow GPS fix landing after the customer has already placed their own pin can't drag it away. A ref
  // (nothing renders off it) so the guard reads the value at callback time, not at closure time.
  const pickupPinTouched = useRef(rbDraft != null);
  const editPickupPoint = useCallback((p: PickedPoint): void => {
    pickupPinTouched.current = true;
    setPickupPoint(p);
  }, []);
  const [pickupPhone, setPickupPhone] = useState("");
  const [dropPoint, setDropPoint] = useState<PickedPoint | null>(null);
  const [dropLandmark, setDropLandmark] = useState("");
  const [dropPhone, setDropPhone] = useState("");
  // Recent recipients (on-device, PII, sign-out-cleared) — one-tap chips so a repeat send doesn't re-type
  // a phone. Loaded once on mount; the freshest is remembered after a successful broadcast.
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  useEffect(() => {
    void loadRecipients().then(setRecipients);
  }, []);
  // Map-anchored home (1·1): a single map hero edits whichever address the customer is placing. The
  // two address rows switch it; the search + map + "use my location" all bind to the active slot.
  const [activePin, setActivePin] = useState<AddressSlot>("pickup");
  // Tapping an address row must actually reach the search. The rows render a magnifier when empty, but
  // used to do nothing except flip `activePin` — so on a build with no Places key the icon promised a
  // search that did not exist, and even on a keyed build the customer had to find the separate field
  // themselves. The kit routes that tap to a full search screen; this one-screen composer's equivalent
  // is to focus the active slot's search. Bumping a nonce (rather than a boolean) re-fires focus on
  // every tap, including a second tap on the already-active row.
  const [searchFocus, setSearchFocus] = useState(0);
  const pickSlot = useCallback((slot: AddressSlot): void => {
    setActivePin(slot);
    setSearchFocus((n) => n + 1);
  }, []);
  const [items, setItems] = useState<ItemRow[]>([emptyItem()]);
  const [note, setNote] = useState("");
  const [declaredValue, setDeclaredValue] = useState("");
  const [proposedFare, setProposedFare] = useState("");
  const [busy, setBusy] = useState(false);
  // Action errors speak once as an auto-dismissing toast, never as a persistent card
  // (owner instruction 2026-08-12). Same `setError(msg)` shape as the useState setter it replaces.
  const setError = useActionError();
  // Q1 out-of-service-area (a distinct state, not a red error): set when a pin is outside the launch
  // corridor — either caught client-side pre-broadcast or from the server's service-corridor 4xx.
  const [outOfArea, setOutOfArea] = useState(false);
  // S·2: customer account-on-hold gate. Proactive — a lightweight `me` fetch flags a held account so
  // the blocking screen shows before the customer builds a whole order; the reactive flag is the
  // belt-and-suspenders for a hold applied mid-session, caught on the broadcast 403.
  // The on-hold screen carries no manual "Refresh status" any more (owner instruction 2026-08-16), so
  // this query owns noticing the lift: poll once a minute while the hold stands (an ops action lands
  // server-side with nothing to push it to the client), and stop the moment it clears — a customer who
  // isn't held pays nothing. `heldFromBroadcast` is deliberately NOT an input here: it's a client-only
  // flag set from a 403, and the poll's job is to read the server's own `onHold`, which is what clears it.
  const meQ = useQuery({
    queryKey: ["me"],
    queryFn: getMe,
    refetchInterval: (query) => (query.state.data?.onHold === true ? 60_000 : false),
  });
  const [heldFromBroadcast, setHeldFromBroadcast] = useState(false);
  const accountOnHold = heldFromBroadcast || meQ.data?.onHold === true;

  // Restore path (UX review #1): the customer may have a live order (auction or an active ride) that a
  // cold start / app-icon reopen would otherwise hide behind this blank compose form — the rider side
  // has the same restore via mine/active. Poll slowly + refetch on foreground so the banner reflects a
  // status change that happened while backgrounded. Seeds the per-order cache so tapping through paints
  // instantly.
  // PERF20-01: the poll is gated on this screen being the VISIBLE route. Home stays mounted beneath
  // /order/[id] for the whole auction+delivery (expo-router stack), and React Query's focusManager is
  // AppState-only — so this 30s FULL-snapshot poll used to run for the entire life of every order,
  // duplicating the order screen's own (socket-gated) snapshot stream on a second cache key over
  // metered data. Gated, it polls only while the banner it feeds is actually on screen; the
  // focus-effect below revalidates the instant the customer navigates back so the banner is never
  // stale on return.
  // A-O15: focus/foreground use `invalidateIfStale`, not a raw `invalidateQueries` — mirrors
  // home.tsx's identical fix. The two screens share this cache key, so a customer bouncing between
  // them within the staleness window shouldn't pay a round trip either place.
  const [homeFocused, setHomeFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setHomeFocused(true);
      invalidateIfStale(qc, ["activeCustomerOrder"]);
      return () => setHomeFocused(false);
    }, [qc]),
  );
  const activeOrderQ = useQuery({
    queryKey: ["activeCustomerOrder"],
    queryFn: getActiveCustomerOrder,
    refetchInterval: homeFocused ? 30_000 : false,
  });
  // WD-022: also refresh Trip History on resume — an order that completed/cancelled while backgrounded
  // must not leave a stale Trip History list behind the (now-correct) home banner.
  useForegroundRefetch(() => {
    invalidateIfStale(qc, ["activeCustomerOrder"]);
    invalidateCustomerOrderHistory(qc);
    // The other half of the removed "Refresh status": a hold lifted while the phone was in a pocket is
    // read the moment the customer looks at it again, rather than up to a poll period later. Unlike the
    // two above this is a plain invalidate — the on-hold wall is a blocking screen, so serving a
    // within-staleness cached "still held" is exactly the wrong answer to save a round trip on.
    void qc.invalidateQueries({ queryKey: ["me"] });
  });
  const activeOrder = activeOrderQ.data ?? null;
  // No failed-check banner here (owner instruction 2026-08-12) — a background poll must not raise an
  // error card over the compose screen. A failed check shows no way-back banner; the poll self-heals.
  // Only seed orderKey(id) while THIS screen is the visible route — mirrors home.tsx's identical
  // guard. When send.tsx is blurred beneath /order/[id], use-order-socket.ts owns that cache entry and
  // merges live position/status pushes with an anti-rollback guard; an unrelated foreground/focus
  // refetch of activeOrderQ must not trigger a raw full-object replace that could roll the rider's pin
  // backward on the live tracking map.
  useEffect(() => {
    if (homeFocused && activeOrder) qc.setQueryData<OrderSnapshot>(orderKey(activeOrder.id), activeOrder);
  }, [homeFocused, activeOrder, qc]);

  // Pre-broadcast liability disclaimer (A1-8). Gate the first broadcast behind an accept-to-continue
  // sheet; once accepted for the current policy version we don't re-show it. Kept in a ref (read at
  // tap time, not a render dependency) plus the modal's own visibility state.
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const disclaimerAccepted = useRef(false);
  // Has the async read of the persisted flag settled yet? Without this, a fast tapper who hits
  // "Broadcast request" before the SecureStore read resolves is re-shown the disclaimer they already
  // accepted. onBroadcast awaits the read (once) when this is still false before deciding to gate.
  const disclaimerLoaded = useRef(false);
  useEffect(() => {
    let alive = true;
    void loadDisclaimerAccepted().then((v) => {
      if (!alive) return;
      if (v === DISCLAIMER_POLICY_VERSION) disclaimerAccepted.current = true;
      disclaimerLoaded.current = true;
    });
    return () => {
      alive = false;
    };
  }, []);

  // Landmark auto-fill: once the user edits a landmark it's theirs — stop auto-filling from the map.
  const [pickupLandmarkTouched, setPickupLandmarkTouched] = useState(false);
  const [dropLandmarkTouched, setDropLandmarkTouched] = useState(false);
  // Whether the current landmark value came from the map (drives the "• from map" label hint).
  const [pickupLandmarkFromMap, setPickupLandmarkFromMap] = useState(false);
  const [dropLandmarkFromMap, setDropLandmarkFromMap] = useState(false);

  // Idempotency nonce: derives the create-order key (see uuidV4FromSeed) so a double-tap / timeout
  // retry of the SAME order within this session dedupes server-side. Seeded fresh per screen mount and
  // rotated after a successful create so the next order can't dedupe against the last one. No longer
  // persisted — the send flow keeps no on-device draft, so a killed-and-relaunched app starts afresh.
  const [idempotencyNonce, setIdempotencyNonce] = useState<string>(() => randomUuidV4());

  // "Add details (optional)" collapsible — secondary fields (landmarks, declared value) live here
  // so the required path (pins → item → phones → price → Broadcast) stays primary and always
  // visible. The contact phones are NOT in here: the contract requires both (min 6), so hiding
  // them behind an "optional" toggle would enable Broadcast only to fail it on submit.
  const [detailsOpen, setDetailsOpen] = useState(false);
  // Reduce-motion: read once (same pattern as LiveMap). When on, expand/collapse is instant, no anim.
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      if (!cancelled) setReduceMotion(on);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const toggleDetails = useCallback((): void => {
    if (!reduceMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setDetailsOpen((v) => !v);
  }, [reduceMotion]);

  // Collapse-to-peek is now the SHEET's own job: the compose sheet snaps over the full-bleed map
  // between a peek (58% of the screen) and an expanded (88%) state (kit K.MapSheet), so folding the form
  // away to see the map is a handle drag, not a bespoke in-form toggle. The footer CTA stays pinned in
  // both snaps.

  // Prefill the form once on mount from a re-broadcast / "send again" (rb… params) — the only prefill
  // path left. There is no stored draft to fall back on: the send flow keeps nothing on-device, so a
  // plain home entry (or a killed-and-relaunched app) opens a blank form.
  useEffect(() => {
    let cancelled = false;
    if (rbDraft) {
      setPickupPoint(rbDraft.pickupPoint);
      setPickupLandmark(rbDraft.pickupLandmark);
      setDropPoint(rbDraft.dropPoint);
      setDropLandmark(rbDraft.dropLandmark);
      setItems(rbDraft.items);
      setNote(rbDraft.note ?? "");
      setDeclaredValue(rbDraft.declaredValue);
      setProposedFare(rbDraft.proposedFare);
      // Prefilled landmarks are user-owned text (not live from the map): treat them as typed.
      if (rbDraft.pickupLandmark) setPickupLandmarkTouched(true);
      if (rbDraft.dropLandmark) setDropLandmarkTouched(true);
    }
    void (async () => {
      // Prefill the sender's OWN pickup phone (their own number, not third-party PII) — a repeat send /
      // re-broadcast shouldn't make them re-type it. Only when the field is still empty, so an edited
      // value always wins.
      const myPhone = await loadMyPickupPhone();
      if (!cancelled && myPhone) setPickupPhone((p) => p || myPhone);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Moving either pin is the fix for an out-of-area result — drop the state so it doesn't linger over
  // a now-valid route. Only fires on a real pin change (not on the submit that set it).
  useEffect(() => {
    setOutOfArea(false);
  }, [pickupPoint, dropPoint]);

  // Item-row edits — bounds mirror the contract (≥1 row always on screen, ≤MAX_ITEMS, qty 1–99).
  const updateItem = useCallback((i: number, patch: Partial<ItemRow>): void => {
    setItems((arr) => arr.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  }, []);
  const addItem = useCallback((): void => {
    setItems((arr) => (arr.length >= MAX_ITEMS ? arr : [...arr, emptyItem()]));
  }, []);
  const removeItem = useCallback((i: number): void => {
    setItems((arr) => (arr.length <= 1 ? arr : arr.filter((_, j) => j !== i)));
  }, []);

  // Landmark edits: mark the field user-owned and drop the "from map" hint.
  const editPickupLandmark = useCallback((t: string): void => {
    setPickupLandmark(t);
    setPickupLandmarkTouched(true);
    setPickupLandmarkFromMap(false);
  }, []);
  const editDropLandmark = useCallback((t: string): void => {
    setDropLandmark(t);
    setDropLandmarkTouched(true);
    setDropLandmarkFromMap(false);
  }, []);

  // Auto-fill from reverse geocode — only while the field is untouched (user hasn't typed one).
  const onPickupReverseGeocode = useCallback(
    (landmark: string): void => {
      if (pickupLandmarkTouched) return;
      setPickupLandmark(landmark);
      setPickupLandmarkFromMap(true);
    },
    [pickupLandmarkTouched],
  );
  const onDropReverseGeocode = useCallback(
    (landmark: string): void => {
      if (dropLandmarkTouched) return;
      setDropLandmark(landmark);
      setDropLandmarkFromMap(true);
    },
    [dropLandmarkTouched],
  );

  // Pickup auto-locate (owner instruction 2026-08-17): the pickup pin is prefilled from the device's
  // own position the moment this screen opens, so the standing-at-the-parcel case — the common one —
  // costs nothing but stays fully editable. Every existing way to change it still wins: these write
  // only while `pickupPinTouched` is false, and the hook is skipped entirely for a re-broadcast (that
  // order's pickup is the whole point of re-sending it). Failure is silent by design — see the hook's
  // header: nobody asked for this fix, so a refused permission or a dead GPS must leave the composer
  // exactly as the mock's `home_empty` draws it, tap-the-map hint and all.
  const onAutoPickupPoint = useCallback((p: PickedPoint): void => {
    if (pickupPinTouched.current) return;
    setPickupPoint(p);
  }, []);
  const onAutoPickupLandmark = useCallback(
    (landmark: string): void => {
      // Re-check the pin: the reverse geocode resolves after the point, so a customer who moved the pin
      // in that window must not be handed the OLD position's name. `onPickupReverseGeocode` then applies
      // the usual "only while the field is untouched" rule and flags the value as map-derived.
      if (pickupPinTouched.current) return;
      onPickupReverseGeocode(landmark);
    },
    [onPickupReverseGeocode],
  );
  usePickupAutolocate({ enabled: rbDraft == null, onPoint: onAutoPickupPoint, onLandmark: onAutoPickupLandmark });

  // Search-first addressing (§1·2). A resolved place does NOT commit straight to the composer any
  // more: it opens the kit's `addr_map_confirm` step, where the customer nudges the rooftop pin to the
  // actual gate and names the landmark in context. See AddressConfirmSheet's header for why that step
  // earns its place — chiefly that the landmark is contract-required but otherwise lives in a
  // collapsed section the Broadcast hint has to give directions to.
  const [confirming, setConfirming] = useState<{ place: ResolvedPlace; slot: AddressSlot } | null>(null);
  const onPickupResolved = useCallback((place: ResolvedPlace): void => {
    setConfirming({ place, slot: "pickup" });
  }, []);
  const onDropResolved = useCallback((place: ResolvedPlace): void => {
    setConfirming({ place, slot: "drop" });
  }, []);

  // Committed from the confirm sheet: the (possibly dragged) point plus the landmark the customer
  // actually typed. A landmark confirmed here is user-owned — it must not be overwritten by the
  // reverse geocode that fires when the map recenters on the new pin, so it's marked touched.
  const onConfirmAddress = useCallback(
    (point: PickedPoint, landmark: string): void => {
      const slot = confirming?.slot;
      setConfirming(null);
      if (slot === "pickup") {
        // editPickupPoint, not setPickupPoint: a confirmed address is the customer choosing their
        // pickup, so it must also close the auto-locate seam — otherwise a slow GPS fix arriving after
        // the confirm sheet would silently replace the address they just searched for and accepted.
        editPickupPoint(point);
        setPickupLandmark(landmark);
        setPickupLandmarkTouched(true);
        setPickupLandmarkFromMap(false);
      } else if (slot === "drop") {
        setDropPoint(point);
        setDropLandmark(landmark);
        setDropLandmarkTouched(true);
        setDropLandmarkFromMap(false);
      }
    },
    [confirming?.slot, editPickupPoint],
  );

  const fare = parseNum(proposedFare);
  const coordsOk = pickupPoint != null && dropPoint != null;
  const quote = coordsOk
    ? quoteFare(
        { lat: pickupPoint.lat, lng: pickupPoint.lng },
        { lat: dropPoint.lat, lng: dropPoint.lng },
      )
    : null;
  // Acceptance-band guidance around the suggestion + a soft "this may be too low" nudge.
  const priceBand = quote ? fareBand(quote.suggestedFare) : null;
  const belowBand = priceBand != null && isBelowBand(fare, priceBand);
  // Fat-finger guard: a price far above the band ($2.50 typed as $250) earns a calm confirm hint. Never
  // blocks (a genuinely high offer is the customer's right) — just makes an accidental extra digit visible.
  const farAboveBand = priceBand != null && isFarAboveBand(fare, priceBand);
  // D-31 (owner instruction 2026-08-17): "Your price" carries the suggested fare rather than opening
  // empty — the "Use suggested" button that used to type it is gone, so this IS how the suggestion
  // reaches the field. The owner chose re-suggest-always over keep-what-you-typed when asked, so every
  // NEW suggestion wins: move a pin, get the new number, even over a price already typed. It only fires
  // when the suggestion itself changes, so typing is never fought mid-keystroke — the customer's number
  // stands until the trip they priced stops being the trip on screen.
  const suggestedFare = quote?.suggestedFare ?? null;
  // A re-broadcast is the one exception, and not by preference: it opens with the ORIGINAL order's
  // price already in the field (that price is the point of re-sending it), and its pins are set at
  // mount — so the very first suggestion computed for those same pins would otherwise overwrite it
  // before the customer has touched anything. Only the FIRST suggestion is skipped; move a pin
  // afterwards and the rule above applies as normal.
  const isRebroadcast = rbDraft != null;
  const lastSuggestedFare = useRef<number | null>(null);
  useEffect(() => {
    if (suggestedFare == null || lastSuggestedFare.current === suggestedFare) return;
    const isFirst = lastSuggestedFare.current === null;
    lastSuggestedFare.current = suggestedFare;
    if (isFirst && isRebroadcast) return;
    setProposedFare(suggestedFare.toFixed(2));
  }, [suggestedFare, isRebroadcast]);
  // Mirror the contract's contactPhone floor (both waypoints) so Broadcast can't enable and then
  // bounce off a raw Zod message on submit. A bare length check let a 6-character typo ("abcdef")
  // through silently — the failure only surfaced mid-delivery when a rider's dialer opened on garbage.
  // normalizePhone (the same tolerant ZW-aware check used at sign-in) actually validates the shape.
  const pickupPhoneOk = normalizePhone(pickupPhone) !== null;
  const dropPhoneOk = normalizePhone(dropPhone) !== null;
  const pickupPhoneError = pickupPhone.trim().length > 0 && !pickupPhoneOk ? "That doesn't look like a phone number" : undefined;
  const dropPhoneError = dropPhone.trim().length > 0 && !dropPhoneOk ? "That doesn't look like a phone number" : undefined;
  // Every row needs a description — an empty row must block submit, not silently drop.
  const itemsOk = items.every((it) => it.description.trim().length > 0);
  // Landmarks are contract-required too (Waypoint.landmark min 1). They're normally auto-filled
  // from the reverse geocode, but that can fail offline / keyless — same never-fail-Zod rule.
  const landmarksOk = pickupLandmark.trim().length > 0 && dropLandmark.trim().length > 0;
  // C10: declaredValue is optional (defaults to 0) but the contract requires it nonnegative and caps
  // it at 150 — validate inline so a `500` (or a pasted negative) doesn't leave Broadcast enabled only
  // to bounce off a raw server Zod error on a field that's collapsed out of view. Empty/blank is fine;
  // a set value must be within [0, 150].
  const declaredValueNum = parseNum(declaredValue);
  const declaredValueOk = declaredValueNum === null || (declaredValueNum >= 0 && declaredValueNum <= 150);
  const canSubmit = coordsOk && fare !== null && fare > 0 && itemsOk && pickupPhoneOk && dropPhoneOk && landmarksOk && declaredValueOk;

  // Reveal the collapsed "Landmarks & details" section when what's left to fill is INSIDE it.
  // Landmarks are contract-required and normally auto-fill from the reverse geocode, so when they
  // don't (offline, keyless, a geocode miss) the customer was left with a disabled Broadcast and a
  // hint that had to give walking directions to a toggle. Gated on being the LAST blocker, so it
  // can't pop open mid-typing while other fields are still empty. Never auto-CLOSES — once it's open
  // it belongs to the customer.
  const onlyDetailsLeft =
    (!landmarksOk || !declaredValueOk) && coordsOk && itemsOk && pickupPhoneOk && dropPhoneOk && fare !== null && fare > 0;
  useEffect(() => {
    if (!onlyDetailsLeft) return;
    if (!reduceMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setDetailsOpen(true);
  }, [onlyDetailsLeft, reduceMotion]);

  // Idempotency key (BUG-HUNT): derived deterministically from the persisted nonce + the trip's
  // content, so it's stable across a timeout+retry, a double-tap on Send, AND an app kill-and-relaunch
  // (the nonce is restored from the draft) — the server dedupes on it and returns the original order
  // instead of opening a second live auction. Content is in the seed, so a genuinely different order
  // yields a different key; the nonce rotates after a successful create so a deliberate identical
  // re-send isn't mistaken for a stale retry.
  const idempotencyKey = useMemo(
    () =>
      uuidV4FromSeed(
        `${idempotencyNonce}|${pickupPoint?.lat},${pickupPoint?.lng}|${dropPoint?.lat},${dropPoint?.lng}|${JSON.stringify(items)}|${note}|${declaredValue}|${proposedFare}`,
      ),
    [idempotencyNonce, pickupPoint?.lat, pickupPoint?.lng, dropPoint?.lat, dropPoint?.lng, JSON.stringify(items), note, declaredValue, proposedFare],
  );

  const submit = async (): Promise<void> => {
    setError(null);
    setOutOfArea(false);
    if (!canSubmit || pickupPoint == null || dropPoint == null || fare === null) {
      setError("Drop a pin for pickup and drop-off, name an item, add both contact phones, and set a price.");
      return;
    }
    // Optional client-side pre-check (server stays the authority): if a pin is already outside the
    // launch corridor, show the out-of-area state now and skip the round-trip that would only 4xx.
    if (!isWithinServiceCorridor(pickupPoint) || !isWithinServiceCorridor(dropPoint)) {
      setOutOfArea(true);
      return;
    }
    const candidate = {
      // Send the canonical E.164 form (both phones are gated on normalizePhone above, so the ?? is
      // only a defensive fallback) — the number is stored/dialled server-side, so it must not depend
      // on however the customer happened to punctuate it (local 0-form, spaces, +263).
      pickup: { point: { lat: pickupPoint.lat, lng: pickupPoint.lng }, landmark: pickupLandmark.trim(), contactPhone: normalizePhone(pickupPhone) ?? pickupPhone.trim() },
      dropoff: { point: { lat: dropPoint.lat, lng: dropPoint.lng }, landmark: dropLandmark.trim(), contactPhone: normalizePhone(dropPhone) ?? dropPhone.trim() },
      // Line-items are the payload (the contract accepts either shape; `items` alone is the new
      // clients' path — the server derives the itemDesc summary).
      items: items.map((it) => ({ description: it.description.trim(), quantity: it.quantity })),
      note: note.trim() || undefined,
      declaredValue: parseNum(declaredValue) ?? 0,
      proposedFare: fare,
      // A1-8: bind the accepted disclaimer version onto the order itself; the server stamps the
      // acceptance time. The accept-to-continue gate guarantees this is set before broadcast.
      disclaimerVersion: DISCLAIMER_POLICY_VERSION,
      idempotencyKey,
    };
    const parsed = CreateOrderRequest.safeParse(candidate);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please complete the form.");
      return;
    }
    // Re-attach the Google place_id onto each waypoint. Zod's Waypoint object STRIPS unknown keys, so a
    // placeId on `candidate` wouldn't survive safeParse — we splice it back onto the validated data. It
    // rides in the waypoint JSON (no schema change); absent on the pin path, so this is a no-op there.
    const payload = {
      ...parsed.data,
      pickup: pickupPoint.placeId ? { ...parsed.data.pickup, placeId: pickupPoint.placeId } : parsed.data.pickup,
      dropoff: dropPoint.placeId ? { ...parsed.data.dropoff, placeId: dropPoint.placeId } : parsed.data.dropoff,
    };
    setBusy(true);
    try {
      const order = await createOrder(payload);
      // A light confirming tick the instant the request goes live — the broadcast is away.
      haptic("tap");
      // Remember this recipient for a one-tap re-send next time (best-effort, on-device only).
      void rememberRecipient({ name: "", phone: dropPhone.trim() });
      // Remember the sender's own pickup number so the next order prefills it instead of re-typing.
      void saveMyPickupPhone(pickupPhone.trim());
      // Seed the order cache from the response + the form we already have, so the order screen
      // paints the auction immediately instead of blank → skeleton → content on navigate.
      qc.setQueryData<OrderSnapshot>(orderKey(order.id), {
        id: order.id,
        status: order.status,
        agreedFare: null,
        proposedFare: order.proposedFare,
        pickup: { point: { lat: pickupPoint.lat, lng: pickupPoint.lng }, landmark: pickupLandmark.trim() },
        dropoff: { point: { lat: dropPoint.lat, lng: dropPoint.lng }, landmark: dropLandmark.trim() },
        items: candidate.items,
        rider: null,
        events: [],
        counterpartyPhone: null,
        expiresAt: order.expiresAt,
        // 2·b1: seed the supply count so the auction can render "no riders online" instantly from the
        // create response, before the first 15s snapshot refetch.
        ridersNearby: order.ridersNearby ?? null,
      });
      // Rotate the nonce so a later order with identical content can't dedupe against this one.
      setIdempotencyNonce(randomUuidV4());
      router.push(`/order/${order.id}`);
    } catch (e) {
      // The server is the authority on coverage: a service-corridor 4xx becomes the out-of-area state
      // (not a generic error), even if the client pre-check passed (corridor edge / stale constant).
      if (e instanceof ApiError && isAccountOnHold(e)) {
        // S·2: the server refused the broadcast because the account is held — swap to the blocking
        // on-hold screen (and refresh `me` so it stays held on the next mount too).
        setHeldFromBroadcast(true);
        void meQ.refetch();
      } else if (e instanceof ApiError && isOutOfServiceArea(e)) {
        setOutOfArea(true);
      } else {
        setError(e instanceof ApiError ? e.message : "Couldn't create the order.");
      }
    } finally {
      setBusy(false);
    }
  };

  // Broadcast tap: the disclaimer is an accept-to-continue GATE in front of the first order create.
  // If the customer has already accepted the current policy version, go straight to submit.
  const onBroadcast = async (): Promise<void> => {
    // Guard the race: if the persisted-flag read hasn't settled yet, resolve it now so a customer who
    // already accepted isn't re-shown the sheet just for tapping quickly.
    if (!disclaimerLoaded.current) {
      const v = await loadDisclaimerAccepted().catch(() => null);
      if (v === DISCLAIMER_POLICY_VERSION) disclaimerAccepted.current = true;
      disclaimerLoaded.current = true;
    }
    if (disclaimerAccepted.current) {
      void submit();
      return;
    }
    setShowDisclaimer(true);
  };
  const onAgreeAndBroadcast = (): void => {
    disclaimerAccepted.current = true;
    void saveDisclaimerAccepted(DISCLAIMER_POLICY_VERSION);
    // Record consent server-side (policyVersion + timestamp). Best-effort: a reject (incl. the route
    // not being wired yet) must never block the broadcast — the local flag already gates re-showing.
    void acceptDisclaimer({ policyVersion: DISCLAIMER_POLICY_VERSION }).catch(() => undefined);
    setShowDisclaimer(false);
    void submit();
  };

  // The submit sheet-footer is region-adopted (LJ.home_empty#footer): the mock draws a single
  // until-pins hint above the CTA, and the app used to render a live version of it naming every
  // still-missing requirement. D-31 (owner instruction 2026-08-17) takes that line off the screen
  // entirely — "remove the text that says Add pickup & drop off pins etc.. Leave that blank". The
  // asked-for consequence, stated plainly so nobody re-adds it as a bug fix: the CTA is now a SILENT
  // greyed control until the form is complete, with nothing on screen naming what is outstanding. The
  // owner was offered the alternative (a tappable CTA that toasts what is missing) and chose the
  // silent one. `submit()` still carries the same summary as an error toast — unreachable while the
  // button is disabled, kept as the belt-and-braces path.

  // S·2: a held customer can't broadcast — show a calm, blocking screen (not the compose form) with a
  // real "contact support" affordance, matching the mockup's OnHold. Overrides the whole home so a
  // held customer never reaches the map/compose UI.
  if (accountOnHold) {
    return <SendAccountOnHoldView activeOrder={activeOrder} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: tokens.color.surface }}>
      <TestBuildBanner />
      {/* Map-anchored home (1·1): ONE full-bleed map carrying both pins (pickup green, drop-off red) +
          the route line, BEHIND the compose sheet (kit Home: K.FauxMap `fill` under K.MapSheet). The
          floating brand pill + account avatar sit over its top; the compose sheet snaps up over its
          lower half. Tapping an address row (now inside the sheet) picks which pin the map edits. */}
      <View style={{ flex: 1 }}>
        <View style={StyleSheet.absoluteFill}>
          {/* Region-adopted map canvas (LJ.home_empty#map): the mock's full-bleed K.FauxMap, realized
              live as ComposeMap. SendMapView is a thin controlled wrapper — every prop below is
              forwarded straight through, geolocation + tap-to-pin unchanged. */}
          <SendMapView
            pickup={pickupPoint}
            drop={dropPoint}
            active={activePin}
            onChangePickup={editPickupPoint}
            onChangeDrop={setDropPoint}
            onReverseGeocodePickup={onPickupReverseGeocode}
            onReverseGeocodeDrop={onDropReverseGeocode}
            // Clear the floating brand row (avatar ends ~48px down) so the map's own top-band controls
            // (Use-my-location pill, tap hint) sit just below it, kit-style.
            topOffset={insets.top + tokens.space.sm + 48}
          />
        </View>
        {/* box-none: the map stays pannable/tappable everywhere except on the actual controls. */}
        <View
          pointerEvents="box-none"
          style={{ position: "absolute", top: insets.top + tokens.space.sm, left: tokens.space.screen, right: tokens.space.screen }}
        >
          {/* plan §5 A3: /profile is still a live route (the rider Account bridge still reaches it),
              but every customer-surface entry point now targets the richer Account tab instead —
              matches `(tabs)/home.tsx`'s BrandHeader `onProfile` already doing the same. Notifications
              are reached from the Account tab (kit draws a single top-right action here). */}
          <MapHomeTopBar onAccount={() => router.push("/account")} onBack={goBack} />

          {meQ.data?.rider?.isOnline ? (
            // A rider who switches to the customer view stayed online server-side with no reminder here
            // — they could lose track of their shift or miss a broadcast while browsing as a customer.
            <Tappable
              accessibilityRole="button"
              accessibilityLabel="You're online as a rider — go back to the rider dashboard"
              onPress={() => router.push("/rider")}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: tokens.space.sm,
                backgroundColor: tokens.color.accentWash,
                borderRadius: tokens.radius.pill,
                paddingHorizontal: tokens.space.md,
                paddingVertical: tokens.space.sm,
                marginBottom: tokens.space.sm,
                alignSelf: "flex-start",
              }}
            >
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tokens.color.accent }} />
              <Text style={{ fontSize: tokens.font.size.caption, fontWeight: "700", color: tokens.color.accentText }}>
                Online as a rider — tap to go back
              </Text>
            </Tappable>
          ) : null}

          {activeOrder ? (
            // UX review #1: a live order the customer can be killed away from — always offer the way back.
            <ActiveOrderBanner order={activeOrder} />
          ) : null}
        </View>

        {/* Compose sheet snapped OVER the map (kit K.MapSheet): peek 58% / expanded 88% of the screen,
            footer pinned. Absolutely anchored to the bottom so the map fills the whole screen behind it;
            KeyboardAvoidingView lifts it when the price/phone fields are focused. */}
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ position: "absolute", left: 0, right: 0, bottom: 0 }}
        >
          <BottomSheet
            maxHeight={screenH}
            snapPoints={[SHEET_PEEK, SHEET_EXPANDED]}
            initialSnap={0}
            style={{ paddingBottom: tokens.space.lg + insets.bottom }}
            footer={
            <>
              {outOfArea ? (
                // Q1: a distinct, calm out-of-area state (not a red error) — the fix is moving a pin,
                // so it names that rather than implying something went wrong.
                <View
                  accessibilityRole="text"
                  style={{
                    flexDirection: "row",
                    gap: tokens.space.sm,
                    padding: tokens.space.md,
                    borderRadius: tokens.radius.input,
                    backgroundColor: tokens.color.surface,
                    marginBottom: tokens.space.sm,
                  }}
                >
                  <Icon name="map-pin" size={18} color={tokens.color.accentText} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>
                      Outside our service area
                    </Text>
                    <Text style={{ fontSize: tokens.font.size.caption, color: tokens.color.muted, lineHeight: 18, marginTop: 1 }}>
                      We don&apos;t cover that pickup or drop-off yet. Move your pins closer to Harare to send your parcel, or check back as we expand.
                    </Text>
                  </View>
                </View>
              ) : null}
              {/* Region-adopted submit sheet-footer (LJ.home_empty#footer): the CTA, labelled "Proceed"
                  since D-31. onBroadcast runs the disclaimer gate + the idempotent create — unchanged.
                  The hint branch is kept in the generated tree (the mock draws it, so pruning the node
                  would break the structural snapshot) but is pinned OFF — see D-31 above. The
                  out-of-area notice above stays live glue (pruned from the composition; the static mock
                  draws neither). */}
              <SendComposeFooterView
                showHint={false}
                hint=""
                onBroadcast={() => void onBroadcast()}
                busy={busy}
                disabled={!canSubmit}
              />
            </>
          }
        >
          {/* The sheet body scrolls between the pinned handle and the pinned footer (kit K.MapSheet).
              There is no invented "Delivery details" heading — the mock opens straight into the address
              rows, then the compose fields. */}
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Address block — the FIRST content in the sheet (kit AddressFields): the pickup/drop-off
              rows, the search-or-tap caption, then the active slot's search. Tapping a row chooses which
              pin the map behind edits (pickup = green dot, drop-off = red square); on an unkeyed build
              the search renders its honest disabled explainer rather than nothing. */}
          <AddressRows pickup={pickupLandmark} drop={dropLandmark} active={activePin} onPick={pickSlot} />
          <AddressHint />
          {/* D-31 (owner instruction 2026-08-17): the search field carries the active slot's address
              instead of sitting empty. With the pickup pin now auto-located on open, an EMPTY box
              directly under a filled PICKUP row reads as the drop-off's box — the customer's own report.
              Feeding it the slot's landmark makes the field say which address it belongs to; the
              customer's own typing still wins until the underlying address changes. */}
          {activePin === "pickup" ? (
            <AddressSearch
              key="pickup-search"
              label="Pickup"
              placeholder="Search pickup address"
              prefill={pickupLandmark}
              onResolved={onPickupResolved}
              focusSignal={searchFocus}
            />
          ) : (
            <AddressSearch
              key="drop-search"
              label="Drop-off"
              placeholder="Search drop-off address"
              prefill={dropLandmark}
              onResolved={onDropResolved}
              focusSignal={searchFocus}
            />
          )}
          <SendItemsList items={items} updateItem={updateItem} addItem={addItem} removeItem={removeItem} />
          {/* Sender's note for the rider (contract `note`, ≤280) — the mockup's "ask for Rita at the
              pharmacy counter; keep it upright." Optional; shown to the assigned rider on the job. */}
          <Field
            label="Note for the rider (optional)"
            value={note}
            onChangeText={setNote}
            placeholder="Ask for Rita at the pharmacy counter; keep it upright."
            maxLength={280}
          />
          <SendPhoneFields
            pickupPhone={pickupPhone}
            onChangePickupPhone={setPickupPhone}
            pickupPhoneError={pickupPhoneError}
            recipients={recipients}
            dropPhone={dropPhone}
            onChangeDropPhone={setDropPhone}
            dropPhoneError={dropPhoneError}
          />
          <SendPriceQuote
            quote={quote}
            priceBand={priceBand}
            belowBand={belowBand}
            farAboveBand={farAboveBand}
            proposedFare={proposedFare}
            onChangeProposedFare={setProposedFare}
          />

          {/* Landmarks (contract-required, normally auto-filled from the pin) + optional declared value,
              behind a tap-to-expand toggle so the required path stays short. */}
          <SendLandmarksDetails
            detailsOpen={detailsOpen}
            toggleDetails={toggleDetails}
            landmarksOk={landmarksOk}
            declaredValueOk={declaredValueOk}
            pickupLandmark={pickupLandmark}
            pickupLandmarkFromMap={pickupLandmarkFromMap}
            onChangePickupLandmark={editPickupLandmark}
            dropLandmark={dropLandmark}
            dropLandmarkFromMap={dropLandmarkFromMap}
            onChangeDropLandmark={editDropLandmark}
            declaredValue={declaredValue}
            onChangeDeclaredValue={setDeclaredValue}
          />
          </ScrollView>
          </BottomSheet>
        </KeyboardAvoidingView>
      </View>
      <AddressConfirmSheet
        place={confirming?.place ?? null}
        slot={confirming?.slot ?? "pickup"}
        initialLandmark={confirming?.slot === "pickup" ? pickupLandmark : dropLandmark}
        onConfirm={onConfirmAddress}
        onCancel={() => setConfirming(null)}
      />
      <DisclaimerSheet visible={showDisclaimer} onAgree={onAgreeAndBroadcast} onBack={() => setShowDisclaimer(false)} />
    </View>
  );
}
