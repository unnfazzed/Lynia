import { CreateOrderRequest, quoteFare, tokens } from "@lynia/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, KeyboardAvoidingView, LayoutAnimation, Platform, Pressable, ScrollView, Text, UIManager, View } from "react-native";
import { ApiError } from "../src/api/client";
import { createOrder, type OrderSnapshot } from "../src/api/orders";
import { orderKey } from "../src/query/client";
import { Button, Card, ErrorText, Field, Heading, Screen, Sub } from "../src/ui";
import { BottomSheet } from "../src/ui/BottomSheet";
import { MapPicker, type PickedPoint } from "../src/ui/MapPicker";
import { parseNum } from "../src/util";

// LayoutAnimation needs an explicit opt-in on old-architecture Android; a no-op on iOS / Fabric.
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// The form draft persisted between visits. PII (the two contact phone numbers) is DELIBERATELY
// excluded — a courier app must not stash a third party's phone in on-device storage. Everything
// here is the sender's own routing/pricing intent, which is safe to restore.
interface FormDraft {
  pickupPoint: PickedPoint | null;
  pickupLandmark: string;
  dropPoint: PickedPoint | null;
  dropLandmark: string;
  itemDescription: string;
  declaredValue: string;
  proposedFare: string;
}

// Reuse the same on-device primitive the auth session uses (expo-secure-store); a single key.
const DRAFT_KEY = "lynia.orderDraft";
// All three are best-effort: a SecureStore reject (native read/write failure) must never reject —
// otherwise a failed read would leave `hydrated` unset and silently disable draft saving for the
// whole session. A draft is a convenience, never load-bearing.
async function loadDraft(): Promise<FormDraft | null> {
  try {
    const raw = await SecureStore.getItemAsync(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as FormDraft) : null;
  } catch {
    return null;
  }
}
async function saveDraft(draft: FormDraft): Promise<void> {
  try {
    await SecureStore.setItemAsync(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* best-effort */
  }
}
async function clearDraft(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(DRAFT_KEY);
  } catch {
    /* best-effort */
  }
}

export default function HomeScreen(): React.ReactElement {
  const router = useRouter();
  const qc = useQueryClient();

  const [pickupPoint, setPickupPoint] = useState<PickedPoint | null>(null);
  const [pickupLandmark, setPickupLandmark] = useState("");
  const [pickupPhone, setPickupPhone] = useState("");
  const [dropPoint, setDropPoint] = useState<PickedPoint | null>(null);
  const [dropLandmark, setDropLandmark] = useState("");
  const [dropPhone, setDropPhone] = useState("");
  const [itemDescription, setItemDescription] = useState("");
  const [declaredValue, setDeclaredValue] = useState("");
  const [proposedFare, setProposedFare] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // "Add details (optional)" collapsible — secondary fields (landmarks, phones, declared value) live
  // here so the required path (pins → item → price → Broadcast) stays primary and always visible.
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
        setItemDescription(draft.itemDescription);
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
      itemDescription,
      declaredValue,
      proposedFare,
    });
  }, [pickupPoint, pickupLandmark, dropPoint, dropLandmark, itemDescription, declaredValue, proposedFare]);

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

  const clearForm = useCallback((): void => {
    setPickupPoint(null);
    setPickupLandmark("");
    setDropPoint(null);
    setDropLandmark("");
    setItemDescription("");
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
  const canSubmit = coordsOk && fare !== null && fare > 0 && itemDescription.trim().length > 0;

  const submit = async (): Promise<void> => {
    setError(null);
    if (!canSubmit || pickupPoint == null || dropPoint == null || fare === null) {
      setError("Drop a pin for pickup and drop-off, name an item, and set a price.");
      return;
    }
    const candidate = {
      pickup: { point: { lat: pickupPoint.lat, lng: pickupPoint.lng }, landmark: pickupLandmark.trim(), contactPhone: pickupPhone.trim() },
      dropoff: { point: { lat: dropPoint.lat, lng: dropPoint.lng }, landmark: dropLandmark.trim(), contactPhone: dropPhone.trim() },
      itemDescription: itemDescription.trim(),
      declaredValue: parseNum(declaredValue) ?? 0,
      proposedFare: fare,
    };
    const parsed = CreateOrderRequest.safeParse(candidate);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please complete the form.");
      return;
    }
    setBusy(true);
    try {
      const order = await createOrder(parsed.data);
      // Seed the order cache from the response + the form we already have, so the order screen
      // paints the auction immediately instead of blank → skeleton → content on navigate.
      qc.setQueryData<OrderSnapshot>(orderKey(order.id), {
        id: order.id,
        status: order.status,
        agreedFare: null,
        proposedFare: order.proposedFare,
        pickup: { point: { lat: pickupPoint.lat, lng: pickupPoint.lng }, landmark: pickupLandmark.trim() },
        dropoff: { point: { lat: dropPoint.lat, lng: dropPoint.lng }, landmark: dropLandmark.trim() },
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
      setError(e instanceof ApiError ? e.message : "Couldn't create the order.");
    } finally {
      setBusy(false);
    }
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
              <Text style={{ fontSize: 12, fontWeight: "700", color: tokens.color.accent }}>Draft restored</Text>
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

          {/* Required path — the pins. Drop pickup + drop-off; these gate the CTA. */}
          <Card>
            <MapPicker
              label="Pickup"
              value={pickupPoint}
              onChange={setPickupPoint}
              onReverseGeocode={onPickupReverseGeocode}
              showMyLocation
              height={180}
            />
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
              <Text style={{ flex: 1, fontSize: 15, fontWeight: "700", color: tokens.color.ink }}>Add details (optional)</Text>
              <Text style={{ fontSize: 15, fontWeight: "700", color: tokens.color.muted }}>{detailsOpen ? "▾" : "▸"}</Text>
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
                <Field label="Pickup contact phone" value={pickupPhone} onChangeText={setPickupPhone} placeholder="+263..." keyboardType="phone-pad" maxLength={20} />
                <Field
                  label={dropLandmarkFromMap ? "Drop-off landmark  • from map" : "Drop-off landmark"}
                  value={dropLandmark}
                  onChangeText={editDropLandmark}
                  placeholder="14 Glenara Ave, Avenues"
                  maxLength={160}
                />
                <Field label="Recipient phone" value={dropPhone} onChangeText={setDropPhone} placeholder="+263..." keyboardType="phone-pad" maxLength={20} />
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
                <Text style={{ fontSize: 13, color: tokens.color.muted, marginBottom: tokens.space.xs }}>
                  {`Add ${[
                    !coordsOk ? "pickup & drop-off pins" : null,
                    itemDescription.trim().length === 0 ? "an item" : null,
                    !(fare !== null && fare > 0) ? "a price" : null,
                  ]
                    .filter(Boolean)
                    .join(", ")} to broadcast.`}
                </Text>
              ) : null}
              <Button label="Broadcast request" onPress={submit} loading={busy} disabled={!canSubmit} />
              <ErrorText message={error} />
            </>
          }
        >
          <Field label="What are you sending?" value={itemDescription} onChangeText={setItemDescription} placeholder="Documents envelope" maxLength={280} />
          {quote ? (
            <View style={{ marginBottom: tokens.space.sm }}>
              <Text style={{ fontSize: 13, color: tokens.color.muted }}>
                Suggested fare ${quote.suggestedFare.toFixed(2)} · {quote.distanceKm} km
              </Text>
              <Button label={`Use suggested $${quote.suggestedFare.toFixed(2)}`} variant="ghost" onPress={() => setProposedFare(quote.suggestedFare.toFixed(2))} />
            </View>
          ) : null}
          <Field label="Your price (USD)" value={proposedFare} onChangeText={setProposedFare} placeholder="2.50" keyboardType="decimal-pad" />
        </BottomSheet>
      </KeyboardAvoidingView>
    </Screen>
  );
}
