import { CreateOrderRequest, normalizePhone, quoteFare, tokens } from "@lynia/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, KeyboardAvoidingView, LayoutAnimation, Platform, Pressable, ScrollView, Text, UIManager, View } from "react-native";
import { ApiError } from "../src/api/client";
import { getMe } from "../src/api/auth";
import { acceptDisclaimer, createOrder, getActiveCustomerOrder, type OrderSnapshot } from "../src/api/orders";
import { loadDisclaimerAccepted, saveDisclaimerAccepted } from "../src/auth/session";
import { ACCOUNT_ON_HOLD_COPY, isAccountOnHold, isOutOfServiceArea, isWithinServiceCorridor } from "../src/logic/gates";
import {
  clearDraft,
  DISCLAIMER_POLICY_VERSION,
  draftFromParams,
  emptyItem,
  type ItemRow,
  loadDraft,
  MAX_ITEMS,
  type RebroadcastParams,
  saveDraft,
} from "../src/logic/order-draft";
import { orderKey } from "../src/query/client";
import { formatMoney } from "../src/logic/money";
import { useForegroundRefetch } from "../src/realtime/use-foreground-refetch";
import { fareBand, fareBandHint, isBelowBand, isFarAboveBand } from "../src/logic/fare-band";
import { loadMyPickupPhone, loadRecipients, type Recipient, rememberRecipient, saveMyPickupPhone } from "../src/logic/saved-recipients";
import type { ResolvedPlace } from "../src/api/places";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, EmptyState, ErrorText, Field, haptic, Icon, Label, Screen, statusPillLabel, TestBuildBanner } from "../src/ui";
import { SupportCallRow } from "../src/ui/safety";
import { AddressSearch } from "../src/ui/AddressSearch";
import { BottomSheet } from "../src/ui/BottomSheet";
import { ComposeMap } from "../src/ui/ComposeMap";
import { DisclaimerSheet } from "../src/ui/home/DisclaimerSheet";
import { QtyStepper } from "../src/ui/home/QtyStepper";
import { AddressRows, type AddressSlot, MapHomeTopBar } from "../src/ui/MapHome";
import type { PickedPoint } from "../src/ui/MapPicker";
import { parseNum, randomUuidV4, uuidV4FromSeed } from "../src/util";

// LayoutAnimation needs an explicit opt-in on old-architecture Android; a no-op on iOS / Fabric.
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/**
 * The "delivery in progress" restore banner — the always-available way back into a live order the
 * customer may have been killed away from (UX review #1). Extracted so both the normal compose home
 * AND the account-on-hold wall can render it: a hold only blocks composing NEW orders server-side, so a
 * customer put on hold mid-delivery must still be able to reach the order already in flight.
 */
function ActiveOrderBanner({ order }: { order: OrderSnapshot }): React.ReactElement {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open your delivery in progress"
      onPress={() => router.push(`/order/${order.id}`)}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: tokens.space.sm,
        backgroundColor: tokens.color.bg,
        borderRadius: tokens.radius.card,
        borderWidth: 1,
        borderColor: tokens.color.accent,
        padding: tokens.space.md,
        marginBottom: tokens.space.sm,
        ...tokens.shadow.card,
      }}
    >
      <Icon name="bike" size={20} color={tokens.color.accentText} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: tokens.font.size.body, fontWeight: "700", color: tokens.color.ink }}>
          Delivery in progress · {statusPillLabel(order.status)}
        </Text>
        <Text style={{ fontSize: tokens.font.size.caption, color: tokens.color.muted, fontVariant: ["tabular-nums"] }} numberOfLines={1}>
          {order.pickup.landmark || "Pickup"} → {order.dropoff.landmark || "Drop-off"} · {formatMoney(order.agreedFare ?? order.proposedFare)}
        </Text>
      </View>
      <Text style={{ fontSize: 13, fontWeight: "700", color: tokens.color.accentText }}>Track</Text>
    </Pressable>
  );
}

export default function HomeScreen(): React.ReactElement {
  const router = useRouter();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  // C5: re-broadcast params from the order screen (rb…). Read once at mount and prefer them over any
  // stored draft — the customer explicitly asked to re-send THIS order.
  const rbParams = useLocalSearchParams<RebroadcastParams>();

  const [pickupPoint, setPickupPoint] = useState<PickedPoint | null>(null);
  const [pickupLandmark, setPickupLandmark] = useState("");
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
  const [items, setItems] = useState<ItemRow[]>([emptyItem()]);
  const [note, setNote] = useState("");
  const [declaredValue, setDeclaredValue] = useState("");
  const [proposedFare, setProposedFare] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Q1 out-of-service-area (a distinct state, not a red error): set when a pin is outside the launch
  // corridor — either caught client-side pre-broadcast or from the server's service-corridor 4xx.
  const [outOfArea, setOutOfArea] = useState(false);
  // S·2: customer account-on-hold gate. Proactive — a lightweight `me` fetch flags a held account so
  // the blocking screen shows before the customer builds a whole order; the reactive flag is the
  // belt-and-suspenders for a hold applied mid-session, caught on the broadcast 403.
  const meQ = useQuery({ queryKey: ["me"], queryFn: getMe });
  const [heldFromBroadcast, setHeldFromBroadcast] = useState(false);
  const accountOnHold = heldFromBroadcast || meQ.data?.onHold === true;

  // Restore path (UX review #1): the customer may have a live order (auction or an active ride) that a
  // cold start / app-icon reopen would otherwise hide behind this blank compose form — the rider side
  // has the same restore via mine/active. Poll slowly + refetch on foreground so the banner reflects a
  // status change that happened while backgrounded. Seeds the per-order cache so tapping through paints
  // instantly.
  const activeOrderQ = useQuery({
    queryKey: ["activeCustomerOrder"],
    queryFn: getActiveCustomerOrder,
    refetchInterval: 30_000,
  });
  useForegroundRefetch(() => void qc.invalidateQueries({ queryKey: ["activeCustomerOrder"] }));
  const activeOrder = activeOrderQ.data ?? null;
  useEffect(() => {
    if (activeOrder) qc.setQueryData<OrderSnapshot>(orderKey(activeOrder.id), activeOrder);
  }, [activeOrder, qc]);

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

  // "Draft restored" chip — shown when a draft is rehydrated on mount, dismissed on clear/submit.
  const [draftRestored, setDraftRestored] = useState(false);
  // Gate persistence until the initial load has run, so we don't clobber the stored draft with empties.
  const hydrated = useRef(false);
  // Idempotency nonce: persisted with the draft so the derived create-order key survives an app kill
  // (see uuidV4FromSeed). Seeded fresh; replaced by the restored draft's nonce on hydrate; rotated
  // after a successful create so the next order can't dedupe against the last one.
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

  // Collapse-to-peek: let the customer fold the compose form away to give the MAP room to breathe while
  // placing pins, then bring it back to fill in details. We hide the form BODY only — the Broadcast CTA
  // and its "what's still missing" hint stay pinned in the footer, so collapsing never drags the primary
  // action off-screen (the exact regression that deferred a full drag re-architecture of this sheet).
  const [composeCollapsed, setComposeCollapsed] = useState(false);
  const toggleCompose = useCallback((): void => {
    if (!reduceMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setComposeCollapsed((v) => !v);
  }, [reduceMotion]);

  // Rehydrate the draft once on mount.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // A re-broadcast (rb… params) wins over the stored draft; otherwise fall back to the last draft.
      const draft = draftFromParams(rbParams) ?? (await loadDraft());
      if (cancelled) {
        hydrated.current = true;
        return;
      }
      if (draft) {
        setPickupPoint(draft.pickupPoint);
        setPickupLandmark(draft.pickupLandmark);
        setDropPoint(draft.dropPoint);
        setDropLandmark(draft.dropLandmark);
        setItems(draft.items);
        setNote(draft.note ?? "");
        setDeclaredValue(draft.declaredValue);
        setProposedFare(draft.proposedFare);
        // Restored landmarks are user-owned text (not live from the map): treat them as typed.
        if (draft.pickupLandmark) setPickupLandmarkTouched(true);
        if (draft.dropLandmark) setDropLandmarkTouched(true);
        // Reuse the restored draft's nonce so a retry of a killed-mid-send order derives the SAME
        // idempotency key. A re-broadcast (rbParams) or an old draft without one keeps the fresh nonce.
        if (draft.idempotencyNonce) setIdempotencyNonce(draft.idempotencyNonce);
        setDraftRestored(true);
      }
      // Prefill the sender's OWN pickup phone (not third-party PII, so not in the PII-free draft) — a
      // repeat send / re-broadcast shouldn't make them re-type their own number every time. Only when
      // the field is still empty, so a restored/edited value always wins.
      const myPhone = await loadMyPickupPhone();
      if (!cancelled && myPhone) setPickupPhone((p) => p || myPhone);
      hydrated.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist the draft (PII-free) whenever a persisted field changes, after initial hydration.
  useEffect(() => {
    if (!hydrated.current) return;
    void saveDraft({
      pickupPoint,
      pickupLandmark,
      dropPoint,
      dropLandmark,
      items,
      note,
      declaredValue,
      proposedFare,
      idempotencyNonce,
    });
  }, [pickupPoint, pickupLandmark, dropPoint, dropLandmark, items, note, declaredValue, proposedFare, idempotencyNonce]);

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

  // Search-first addressing (§1·2): a resolved place sets the point (with its place_id) AND fills the
  // landmark from the chosen address — the same picked-point the MapPicker feeds, just via search. The
  // map recenters on the new value; a later pin tap/drag re-emits without the placeId, invalidating it.
  const onPickupResolved = useCallback((place: ResolvedPlace): void => {
    setPickupPoint({ lat: place.lat, lng: place.lng, placeId: place.placeId });
    if (place.landmark) {
      setPickupLandmark(place.landmark);
      setPickupLandmarkFromMap(true);
      setPickupLandmarkTouched(false);
    }
  }, []);
  const onDropResolved = useCallback((place: ResolvedPlace): void => {
    setDropPoint({ lat: place.lat, lng: place.lng, placeId: place.placeId });
    if (place.landmark) {
      setDropLandmark(place.landmark);
      setDropLandmarkFromMap(true);
      setDropLandmarkTouched(false);
    }
  }, []);

  const clearForm = useCallback((): void => {
    setPickupPoint(null);
    setPickupLandmark("");
    setDropPoint(null);
    setDropLandmark("");
    setItems([emptyItem()]);
    setNote("");
    setDeclaredValue("");
    setProposedFare("");
    setPickupLandmarkTouched(false);
    setDropLandmarkTouched(false);
    setPickupLandmarkFromMap(false);
    setDropLandmarkFromMap(false);
    setDraftRestored(false);
    void clearDraft();
  }, []);

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
      pickup: { point: { lat: pickupPoint.lat, lng: pickupPoint.lng }, landmark: pickupLandmark.trim(), contactPhone: pickupPhone.trim() },
      dropoff: { point: { lat: dropPoint.lat, lng: dropPoint.lng }, landmark: dropLandmark.trim(), contactPhone: dropPhone.trim() },
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
      // Draft fulfilled — wipe it so the next visit starts clean, and rotate the nonce so a later order
      // with identical content can't dedupe against this one.
      setDraftRestored(false);
      setIdempotencyNonce(randomUuidV4());
      void clearDraft();
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

  // S·2: a held customer can't broadcast — show a calm, blocking screen (not the compose form) with a
  // real "contact support" affordance, matching the mockup's OnHold. Overrides the whole home so a
  // held customer never reaches the map/compose UI.
  if (accountOnHold) {
    return (
      <Screen>
        {/* A hold blocks composing NEW orders server-side, not viewing/tracking/cancelling/rating an order
            already in flight (getSnapshot/cancel/rating all still work for a held customer). So a customer
            put on hold mid-delivery keeps a way into that live order — the only nav entry point on this
            headerless screen — rather than being locked out of it entirely by the wall below. */}
        {activeOrder ? <ActiveOrderBanner order={activeOrder} /> : null}
        <EmptyState icon="triangle-alert" title={ACCOUNT_ON_HOLD_COPY.title} message={ACCOUNT_ON_HOLD_COPY.message}>
          <SupportCallRow />
          <Button label="Refresh status" variant="ghost" onPress={() => void meQ.refetch()} loading={meQ.isFetching} />
        </EmptyState>
      </Screen>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: tokens.color.surface }}>
      <TestBuildBanner />
      {/* Full-bleed map hero (1·1): ONE map carrying both pins (pickup green, drop-off red) + the route
          line, with the floating chrome (brand pill, notifications, account, and the search-first
          address rows) laid over its top. Tapping a row picks which pin the map edits. */}
      <View style={{ flex: 1 }}>
        <ComposeMap
          pickup={pickupPoint}
          drop={dropPoint}
          active={activePin}
          onChangePickup={setPickupPoint}
          onChangeDrop={setDropPoint}
          onReverseGeocodePickup={onPickupReverseGeocode}
          onReverseGeocodeDrop={onDropReverseGeocode}
        />
        {/* box-none: the map stays pannable/tappable everywhere except on the actual controls. */}
        <View
          pointerEvents="box-none"
          style={{ position: "absolute", top: insets.top + tokens.space.sm, left: tokens.space.screen, right: tokens.space.screen }}
        >
          <MapHomeTopBar onNotifications={() => router.push("/notifications")} onAccount={() => router.push("/profile")} />

          {meQ.data?.rider?.isOnline ? (
            // A rider who switches to the customer view stayed online server-side with no reminder here
            // — they could lose track of their shift or miss a broadcast while browsing as a customer.
            <Pressable
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
            </Pressable>
          ) : null}

          {activeOrder ? (
            // UX review #1: a live order the customer can be killed away from — always offer the way back.
            <ActiveOrderBanner order={activeOrder} />
          ) : null}

          {draftRestored ? (
            <View
              accessibilityRole="text"
              style={{
                flexDirection: "row",
                alignItems: "center",
                alignSelf: "flex-start",
                backgroundColor: tokens.color.bg,
                borderRadius: tokens.radius.pill,
                paddingLeft: 10,
                paddingRight: 4,
                paddingVertical: 4,
                marginBottom: tokens.space.sm,
                ...tokens.shadow.card,
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: "700", color: tokens.color.accentText }}>Draft restored</Text>
              <Pressable
                onPress={clearForm}
                accessibilityRole="button"
                accessibilityLabel="Clear the restored draft"
                style={({ pressed }) => ({
                  minHeight: tokens.touchTargetMin,
                  justifyContent: "center",
                  paddingHorizontal: tokens.space.sm,
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <Text style={{ fontSize: 12, fontWeight: "700", color: tokens.color.muted }}>Clear</Text>
              </Pressable>
            </View>
          ) : null}

          {/* Search-first address rows: tapping one chooses which pin the map edits (pickup = green
              dot, drop-off = red square). The CTA is gated on both points being set. */}
          <AddressRows pickup={pickupLandmark} drop={dropLandmark} active={activePin} onPick={setActivePin} />

          {/* The active slot's search (key-gated; renders nothing without a Places key), floating over
              the map so a resolved place drops the active pin. */}
          {activePin === "pickup" ? (
            <AddressSearch key="pickup-search" label="Pickup" placeholder="Search pickup address" onResolved={onPickupResolved} />
          ) : (
            <AddressSearch key="drop-search" label="Drop-off" placeholder="Search drop-off address" onResolved={onDropResolved} />
          )}
        </View>
      </View>

      {/* Docked compose sheet BELOW the map — a flex sibling (not an overlay), so KeyboardAvoidingView
          lifts it cleanly when the price/phone fields are focused. The form scrolls inside; the
          Broadcast CTA stays pinned in the footer, always reachable. */}
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <BottomSheet
          style={{ paddingBottom: tokens.space.lg + insets.bottom }}
          footer={
            <>
              {!canSubmit ? (
                // A disabled Pressable swallows the tap, so name what's still missing here rather
                // than only on an edge-complete submit — never a silent greyed dead-end.
                <Text style={{ fontSize: 14, color: tokens.color.muted, marginBottom: tokens.space.xs }}>
                  {`Add ${[
                    !coordsOk ? "pickup & drop-off pins" : null,
                    !itemsOk ? (items.length > 1 ? "a description for every item" : "an item") : null,
                    !pickupPhoneOk ? "a pickup contact phone" : null,
                    !dropPhoneOk ? "a recipient phone" : null,
                    !landmarksOk ? "pickup & drop-off landmarks (under \u201cLandmarks & details\u201d)" : null,
                    !declaredValueOk ? "a declared value between 0 and 150 (under \u201cLandmarks & details\u201d)" : null,
                    !(fare !== null && fare > 0) ? "a price" : null,
                  ]
                    .filter(Boolean)
                    .join(", ")} to send.`}
                </Text>
              ) : null}
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
              <Button label="Send to riders" onPress={() => void onBroadcast()} loading={busy} disabled={!canSubmit} />
              <ErrorText message={error} />
            </>
          }
        >
          {/* Collapse header — tap to fold the form away and give the map room, or bring it back. The
              footer CTA stays pinned regardless, so this never hides the primary action. */}
          <Pressable
            onPress={toggleCompose}
            accessibilityRole="button"
            accessibilityState={{ expanded: !composeCollapsed }}
            accessibilityLabel={composeCollapsed ? "Show delivery details" : "Hide delivery details to see more of the map"}
            style={{ flexDirection: "row", alignItems: "center", minHeight: tokens.touchTargetMin }}
          >
            <Text style={{ flex: 1, fontSize: 14, fontWeight: "700", color: tokens.color.ink }}>Delivery details</Text>
            <Icon name={composeCollapsed ? "chevron-up" : "chevron-down"} size={16} color={tokens.color.muted} />
          </Pressable>
          {/* The form scrolls inside the sheet (capped height) so it never pushes the pinned CTA off
              the bottom, and the map behind stays visible above the sheet. Hidden when collapsed. */}
          {composeCollapsed ? null : (
          <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Line items — repeatable description + quantity rows (ITEM-DESIGN-REVIEW: multiple
              {description, quantity}, nothing more for the pilot). Description stacks above the
              qty stepper so a row still works at 320px. */}
          <Label>What are you sending?</Label>
          {items.map((it, i) => (
            <View key={i}>
              <Field
                value={it.description}
                onChangeText={(t) => updateItem(i, { description: t })}
                placeholder={i === 0 ? "Documents" : "Another item"}
                maxLength={140}
              />
              <View style={{ flexDirection: "row", alignItems: "center", marginTop: -tokens.space.sm, marginBottom: tokens.space.sm }}>
                <Text style={{ fontSize: 12, fontWeight: "600", color: tokens.color.muted, marginRight: tokens.space.sm }}>Quantity</Text>
                <QtyStepper value={it.quantity} onChange={(q) => updateItem(i, { quantity: q })} />
                <View style={{ flex: 1 }} />
                {items.length > 1 ? (
                  <Pressable
                    onPress={() => removeItem(i)}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove item ${i + 1}`}
                    style={({ pressed }) => ({
                      minHeight: tokens.touchTargetMin,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: tokens.space.xs,
                      paddingHorizontal: tokens.space.xs,
                      opacity: pressed ? 0.6 : 1,
                    })}
                  >
                    <Icon name="x" size={16} color={tokens.color.muted} />
                    {/* Icons are always paired with a text label (low-literacy market). */}
                    <Text style={{ fontSize: 12, fontWeight: "600", color: tokens.color.muted }}>Remove</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ))}
          {items.length < MAX_ITEMS ? (
            <Button label="Add another item" variant="ghost" onPress={addItem} />
          ) : (
            // The control never just vanishes — say why it's gone (every dead-end explains itself).
            <Text style={{ fontSize: 12, color: tokens.color.muted, marginBottom: tokens.space.sm }}>Up to 10 items per order.</Text>
          )}
          {/* Sender's note for the rider (contract `note`, ≤280) — the mockup's "ask for Rita at the
              pharmacy counter; keep it upright." Optional; shown to the assigned rider on the job. */}
          <Field
            label="Note for the rider (optional)"
            value={note}
            onChangeText={setNote}
            placeholder="Ask for Rita at reception; keep it upright."
            maxLength={280}
          />
          {/* Contract-required (both waypoints, min 6) — they live on the required path, not in the
              "optional" collapse, so Broadcast never enables only to fail Zod on submit. */}
          <Field label="Pickup contact phone" value={pickupPhone} onChangeText={setPickupPhone} placeholder="+263..." keyboardType="phone-pad" maxLength={20} error={pickupPhoneError} />
          {/* Recent-recipient quick-fill: one tap drops a past drop-off number into the field instead of
              re-typing. Only shown before the customer starts typing one, so it never fights their input. */}
          {recipients.length > 0 && dropPhone.trim().length === 0 ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: tokens.space.xs, marginBottom: tokens.space.sm }}>
              {recipients.map((r) => (
                <Pressable
                  key={r.phone}
                  onPress={() => setDropPhone(r.phone)}
                  accessibilityRole="button"
                  accessibilityLabel={`Use recipient ${r.name || r.phone}`}
                  style={({ pressed }) => ({
                    minHeight: tokens.touchTargetMin,
                    justifyContent: "center",
                    paddingHorizontal: tokens.space.md,
                    borderRadius: tokens.radius.pill,
                    borderWidth: 1,
                    borderColor: tokens.color.line,
                    backgroundColor: pressed ? tokens.color.accentWash : tokens.color.surface,
                  })}
                >
                  <Text style={{ fontSize: 12, fontWeight: "600", color: tokens.color.accentText, fontVariant: ["tabular-nums"] }}>
                    {r.name ? `${r.name} · ${r.phone}` : r.phone}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <Field label="Recipient phone" value={dropPhone} onChangeText={setDropPhone} placeholder="+263..." keyboardType="phone-pad" maxLength={20} error={dropPhoneError} />
          {quote ? (
            <View style={{ marginBottom: tokens.space.sm }}>
              <Text style={{ fontSize: 14, color: tokens.color.muted, fontVariant: ["tabular-nums"] }}>
                Suggested fare ${quote.suggestedFare.toFixed(2)} · {quote.distanceKm} km
              </Text>
              {priceBand ? (
                // Soft acceptance band (guidance, never a hard floor) — anchors the customer away from an
                // unfillable lowball. "usually", not "must".
                <Text style={{ fontSize: 12, color: tokens.color.muted, marginTop: 1, fontVariant: ["tabular-nums"] }}>{fareBandHint(priceBand)}</Text>
              ) : null}
              <Button label={`Use suggested $${quote.suggestedFare.toFixed(2)}`} variant="ghost" onPress={() => setProposedFare(quote.suggestedFare.toFixed(2))} />
            </View>
          ) : null}
          <Field
            label="Your price (USD)"
            value={proposedFare}
            onChangeText={setProposedFare}
            placeholder="2.50"
            keyboardType="decimal-pad"
            // Below the band is not an error (there's no hard floor) — a gentle hint that a low ask may
            // draw no riders. Far above the band nudges the "did you add a digit?" case. Both read as
            // guidance under the field, not a red validation failure.
            hint={
              belowBand
                ? "That's below what riders usually take — they may pass. Nudge it up for a faster match."
                : farAboveBand
                  ? "That's a lot more than usual for this trip — double-check you didn't add a digit by mistake."
                  : undefined
            }
          />

          {/* Landmarks (contract-required, normally auto-filled from the pin) + optional declared value,
              behind a tap-to-expand toggle so the required path stays short. */}
          <Pressable
            onPress={toggleDetails}
            accessibilityRole="button"
            accessibilityState={{ expanded: detailsOpen }}
            accessibilityLabel={[
              "Landmarks and details",
              !landmarksOk ? "landmarks required" : null,
              !declaredValueOk ? "declared value must be between 0 and 150" : null,
            ]
              .filter(Boolean)
              .join(", ")}
            style={{ flexDirection: "row", alignItems: "center", minHeight: tokens.touchTargetMin }}
          >
            <Text style={{ flex: 1, fontSize: 14, fontWeight: "700", color: tokens.color.ink }}>
              Landmarks &amp; details
              {!landmarksOk || !declaredValueOk ? (
                <Text style={{ color: tokens.color.danger, fontWeight: "700" }}>
                  {` — ${[!landmarksOk ? "landmarks required" : null, !declaredValueOk ? "declared value must be $0–150" : null].filter(Boolean).join(", ")}`}
                </Text>
              ) : null}
            </Text>
            <Icon name={detailsOpen ? "chevron-down" : "chevron-right"} size={16} color={tokens.color.muted} />
          </Pressable>
          {detailsOpen ? (
            <View style={{ marginTop: tokens.space.sm }}>
              <Field
                label={pickupLandmarkFromMap ? "Pickup landmark  • from map" : "Pickup landmark"}
                value={pickupLandmark}
                onChangeText={editPickupLandmark}
                placeholder="Eastgate Mall, CBD"
                maxLength={160}
              />
              <Field
                label={dropLandmarkFromMap ? "Drop-off landmark  • from map" : "Drop-off landmark"}
                value={dropLandmark}
                onChangeText={editDropLandmark}
                placeholder="14 Glenara Ave, Avenues"
                maxLength={160}
              />
              <Field label="Declared value (USD, max 150)" value={declaredValue} onChangeText={setDeclaredValue} placeholder="10" keyboardType="decimal-pad" />
              {!declaredValueOk ? (
                <Text accessibilityRole="alert" style={{ fontSize: tokens.font.size.caption, color: tokens.color.danger, marginTop: -tokens.space.xs, marginBottom: tokens.space.sm }}>
                  Declared value must be between $0 and $150.
                </Text>
              ) : null}
            </View>
          ) : null}
          </ScrollView>
          )}
        </BottomSheet>
      </KeyboardAvoidingView>
      <DisclaimerSheet visible={showDisclaimer} onAgree={onAgreeAndBroadcast} onBack={() => setShowDisclaimer(false)} />
    </View>
  );
}
