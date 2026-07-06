import { CreateOrderRequest, quoteFare, tokens } from "@lynia/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, KeyboardAvoidingView, LayoutAnimation, Modal, Platform, Pressable, ScrollView, Text, UIManager, View } from "react-native";
import { ApiError } from "../src/api/client";
import { acceptDisclaimer, createOrder, type OrderSnapshot } from "../src/api/orders";
import { loadDisclaimerAccepted, saveDisclaimerAccepted } from "../src/auth/session";
import { clearDraft, type ComposeItemRow as ItemRow, emptyItem, type FormDraft, loadDraft, MAX_ITEMS, MAX_QTY, saveDraft } from "../src/logic/compose-draft";
import { isOutOfServiceArea, isWithinServiceCorridor } from "../src/logic/gates";
import { orderKey } from "../src/query/client";
import type { ResolvedPlace } from "../src/api/places";
import { Button, Card, ErrorText, Field, Heading, Icon, type IconName, Label, Screen, Sub } from "../src/ui";
import { AddressSearch } from "../src/ui/AddressSearch";
import { BottomSheet } from "../src/ui/BottomSheet";
import { MapPicker, type PickedPoint } from "../src/ui/MapPicker";
import { parseNum } from "../src/util";

// LayoutAnimation needs an explicit opt-in on old-architecture Android; a no-op on iOS / Fabric.
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// The liability-disclaimer policy the customer must accept before a first broadcast (A1-8). Bump this
// string when the disclaimer copy/terms change and the accept-to-continue gate re-shows.
const DISCLAIMER_POLICY_VERSION = "2026-07-01";

export default function HomeScreen(): React.ReactElement {
  const router = useRouter();
  const qc = useQueryClient();

  const [pickupPoint, setPickupPoint] = useState<PickedPoint | null>(null);
  const [pickupLandmark, setPickupLandmark] = useState("");
  const [pickupPhone, setPickupPhone] = useState("");
  const [dropPoint, setDropPoint] = useState<PickedPoint | null>(null);
  const [dropLandmark, setDropLandmark] = useState("");
  const [dropPhone, setDropPhone] = useState("");
  const [items, setItems] = useState<ItemRow[]>([emptyItem()]);
  const [note, setNote] = useState("");
  const [declaredValue, setDeclaredValue] = useState("");
  const [proposedFare, setProposedFare] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Q1 out-of-service-area (a distinct state, not a red error): set when a pin is outside the launch
  // corridor — either caught client-side pre-broadcast or from the server's service-corridor 4xx.
  const [outOfArea, setOutOfArea] = useState(false);

  // Pre-broadcast liability disclaimer (A1-8). Gate the first broadcast behind an accept-to-continue
  // sheet; once accepted for the current policy version we don't re-show it. Kept in a ref (read at
  // tap time, not a render dependency) plus the modal's own visibility state.
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const disclaimerAccepted = useRef(false);
  useEffect(() => {
    let alive = true;
    void loadDisclaimerAccepted().then((v) => {
      if (alive && v === DISCLAIMER_POLICY_VERSION) disclaimerAccepted.current = true;
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

  // Rehydrate the draft once on mount.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const draft = await loadDraft();
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
        setDraftRestored(true);
      }
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
    });
  }, [pickupPoint, pickupLandmark, dropPoint, dropLandmark, items, note, declaredValue, proposedFare]);

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
  // Mirror the contract's contactPhone floor (min 6, both waypoints) so Broadcast can't enable and
  // then bounce off a raw Zod message on submit.
  const pickupPhoneOk = pickupPhone.trim().length >= 6;
  const dropPhoneOk = dropPhone.trim().length >= 6;
  // Every row needs a description — an empty row must block submit, not silently drop.
  const itemsOk = items.every((it) => it.description.trim().length > 0);
  // Landmarks are contract-required too (Waypoint.landmark min 1). They're normally auto-filled
  // from the reverse geocode, but that can fail offline / keyless — same never-fail-Zod rule.
  const landmarksOk = pickupLandmark.trim().length > 0 && dropLandmark.trim().length > 0;
  const canSubmit = coordsOk && fare !== null && fare > 0 && itemsOk && pickupPhoneOk && dropPhoneOk && landmarksOk;

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
      });
      // Draft fulfilled — wipe it so the next visit starts clean.
      setDraftRestored(false);
      void clearDraft();
      router.push(`/order/${order.id}`);
    } catch (e) {
      // The server is the authority on coverage: a service-corridor 4xx becomes the out-of-area state
      // (not a generic error), even if the client pre-check passed (corridor edge / stale constant).
      if (e instanceof ApiError && isOutOfServiceArea(e)) {
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
  const onBroadcast = (): void => {
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

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: tokens.space.lg }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: tokens.space.md }}>
            <Heading>Send a parcel</Heading>
            <View style={{ flex: 1 }} />
            <Button label="Trips" variant="ghost" onPress={() => router.push("/history")} />
            <Button label="Account" variant="ghost" onPress={() => router.push("/profile")} />
          </View>
          <Sub>Drop a pin for pickup and drop-off, name your price, and riders will offer.</Sub>

          {draftRestored ? (
            <View
              accessibilityRole="text"
              style={{
                flexDirection: "row",
                alignItems: "center",
                alignSelf: "flex-start",
                backgroundColor: tokens.color.surface,
                borderWidth: 1,
                borderColor: tokens.color.line,
                borderRadius: tokens.radius.pill,
                paddingLeft: 10,
                paddingRight: 4,
                paddingVertical: 4,
                marginBottom: tokens.space.md,
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

          {/* Required path — the pins. Search-first: an address search sits above each map (only when a
              Places key is configured — otherwise it renders nothing and the pin stays the primary path).
              Drop pickup + drop-off; these gate the CTA. */}
          <Card>
            <AddressSearch label="Pickup" placeholder="Search pickup address" onResolved={onPickupResolved} />
            <MapPicker
              label="Pickup"
              value={pickupPoint}
              onChange={setPickupPoint}
              onReverseGeocode={onPickupReverseGeocode}
              showMyLocation
              height={180}
            />
            <AddressSearch label="Drop-off" placeholder="Search drop-off address" onResolved={onDropResolved} />
            <MapPicker
              label="Drop-off"
              value={dropPoint}
              onChange={setDropPoint}
              onReverseGeocode={onDropReverseGeocode}
              height={180}
            />
          </Card>

          {/* Secondary fields — collapsed by default under a tap-to-expand toggle so the required
              path stays short. Landmarks keep their "• from map" auto-fill hint (unchanged). */}
          <Card>
            <Pressable
              onPress={toggleDetails}
              accessibilityRole="button"
              accessibilityState={{ expanded: detailsOpen }}
              accessibilityLabel="Add details (optional)"
              style={{
                flexDirection: "row",
                alignItems: "center",
                minHeight: tokens.touchTargetMin,
              }}
            >
              <Text style={{ flex: 1, fontSize: 14, fontWeight: "700", color: tokens.color.ink }}>Add details (optional)</Text>
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
              </View>
            ) : null}
          </Card>
        </ScrollView>

        {/* Hero action in the thumb zone: what you're sending, name your price, broadcast. */}
        <BottomSheet
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
                    !landmarksOk ? "pickup & drop-off landmarks (under \u201cAdd details\u201d)" : null,
                    !(fare !== null && fare > 0) ? "a price" : null,
                  ]
                    .filter(Boolean)
                    .join(", ")} to broadcast.`}
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
                      We don&apos;t cover that pickup or drop-off yet. Move your pins closer to Harare to broadcast, or check back as we expand.
                    </Text>
                  </View>
                </View>
              ) : null}
              <Button label="Broadcast request" onPress={onBroadcast} loading={busy} disabled={!canSubmit} />
              <ErrorText message={error} />
            </>
          }
        >
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
          <Field label="Pickup contact phone" value={pickupPhone} onChangeText={setPickupPhone} placeholder="+263..." keyboardType="phone-pad" maxLength={20} />
          <Field label="Recipient phone" value={dropPhone} onChangeText={setDropPhone} placeholder="+263..." keyboardType="phone-pad" maxLength={20} />
          {quote ? (
            <View style={{ marginBottom: tokens.space.sm }}>
              <Text style={{ fontSize: 14, color: tokens.color.muted, fontVariant: ["tabular-nums"] }}>
                Suggested fare ${quote.suggestedFare.toFixed(2)} · {quote.distanceKm} km
              </Text>
              <Button label={`Use suggested $${quote.suggestedFare.toFixed(2)}`} variant="ghost" onPress={() => setProposedFare(quote.suggestedFare.toFixed(2))} />
            </View>
          ) : null}
          <Field label="Your price (USD)" value={proposedFare} onChangeText={setProposedFare} placeholder="2.50" keyboardType="decimal-pad" />
        </BottomSheet>
      </KeyboardAvoidingView>
      <DisclaimerSheet visible={showDisclaimer} onAgree={onAgreeAndBroadcast} onBack={() => setShowDisclaimer(false)} />
    </Screen>
  );
}

/**
 * A1-8 pre-broadcast liability disclaimer — an accept-to-continue sheet shown before the first order
 * is created. The primary "Agree & broadcast" stays disabled until the customer ticks the consent
 * box; agreeing records consent (policy version + timestamp) and proceeds. Modeled on the
 * new-flows.html disclaimer: three plain-language terms, then a mint consent row.
 */
const DISCLAIMER_ROWS: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "triangle-alert",
    title: "Sending is at your own risk",
    body: "If your parcel is lost, damaged or not delivered, Lynia isn't liable — you're hiring an independent rider.",
  },
  {
    icon: "banknote",
    title: "Payment is between you and your rider",
    body: "You agree the price in the app and pay cash directly. Lynia isn't involved in payment or any money dispute.",
  },
  {
    icon: "user",
    title: "Lynia connects you — that's all",
    body: "We match you with a nearby rider. We don't carry, insure or guarantee your parcel.",
  },
];

function DisclaimerSheet({ visible, onAgree, onBack }: { visible: boolean; onAgree: () => void; onBack: () => void }): React.ReactElement {
  const [checked, setChecked] = useState(false);
  // Reset the consent tick each time the sheet opens — consent is per-broadcast, never pre-ticked.
  useEffect(() => {
    if (visible) setChecked(false);
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onBack} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: "rgba(20,24,27,0.45)", justifyContent: "flex-end" }}>
        <View
          style={{
            backgroundColor: tokens.color.bg,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            paddingHorizontal: tokens.space.lg,
            paddingTop: tokens.space.md,
            paddingBottom: tokens.space.xl,
            maxHeight: "94%",
            ...tokens.shadow.sheet,
          }}
        >
          <View style={{ width: 36, height: 4, borderRadius: tokens.radius.pill, backgroundColor: tokens.color.line, alignSelf: "center", marginBottom: tokens.space.md }} />
          <Heading>Before you send</Heading>
          <Sub>Please read and accept — this is how Lynia works.</Sub>
          <ScrollView showsVerticalScrollIndicator={false} style={{ flexShrink: 1 }}>
            {DISCLAIMER_ROWS.map((r) => (
              <View key={r.title} style={{ flexDirection: "row", gap: tokens.space.md, marginBottom: tokens.space.md }}>
                <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: tokens.color.surface, alignItems: "center", justifyContent: "center" }}>
                  <Icon name={r.icon} size={17} color={tokens.color.accentText} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>{r.title}</Text>
                  <Text style={{ fontSize: tokens.font.size.caption, color: tokens.color.muted, lineHeight: 18, marginTop: 1 }}>{r.body}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
          <Pressable
            onPress={() => setChecked((v) => !v)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked }}
            accessibilityLabel="I understand and accept these terms"
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: tokens.space.sm,
              padding: tokens.space.md,
              borderRadius: tokens.radius.input,
              backgroundColor: tokens.color.accentWash,
              marginTop: tokens.space.xs,
              minHeight: tokens.touchTargetMin,
            }}
          >
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                // Bright accent is a non-text fill here (the tick box) — the check glyph is white on it.
                backgroundColor: checked ? tokens.color.accent : tokens.color.bg,
                borderWidth: checked ? 0 : 1.5,
                borderColor: tokens.color.line,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {checked ? <Icon name="check" size={14} color={tokens.color.onAccent} /> : null}
            </View>
            <Text style={{ flex: 1, fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink }}>
              I understand and accept these terms
            </Text>
          </Pressable>
          <Button label="Agree & broadcast" onPress={onAgree} disabled={!checked} />
          <Button label="Back" variant="ghost" onPress={onBack} />
        </View>
      </View>
    </Modal>
  );
}

/** Compact − / count / + quantity stepper. 44px round targets (touchTargetMin) so it's tappable on
 *  a cheap phone; the count renders in tabular numerals so rows don't shimmy as digits change. */
function QtyStepper({ value, onChange }: { value: number; onChange: (n: number) => void }): React.ReactElement {
  const btn = (glyph: "−" | "+", next: number, disabled: boolean, label: string): React.ReactElement => (
    <Pressable
      onPress={() => onChange(next)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        width: tokens.touchTargetMin,
        height: tokens.touchTargetMin,
        borderRadius: tokens.touchTargetMin / 2,
        borderWidth: 1,
        borderColor: tokens.color.line,
        backgroundColor: pressed ? tokens.color.accentWash : tokens.color.bg,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.4 : 1,
      })}
    >
      <Text style={{ fontSize: 20, fontWeight: "700", lineHeight: 22, color: tokens.color.accentText }}>{glyph}</Text>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: tokens.space.sm }}>
      {btn("−", Math.max(1, value - 1), value <= 1, "Decrease quantity")}
      <Text style={{ minWidth: 26, textAlign: "center", fontSize: 16, fontWeight: "700", color: tokens.color.ink, fontVariant: ["tabular-nums"] }}>
        {value}
      </Text>
      {btn("+", Math.min(MAX_QTY, value + 1), value >= MAX_QTY, "Increase quantity")}
    </View>
  );
}
