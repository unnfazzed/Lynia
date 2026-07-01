import { CreateOrderRequest, quoteFare, tokens } from "@lynia/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { ApiError } from "../src/api/client";
import { createOrder, type OrderSnapshot } from "../src/api/orders";
import { orderKey } from "../src/query/client";
import { Button, Card, ErrorText, Field, Heading, Screen, Sub } from "../src/ui";
import { MapPicker, type PickedPoint } from "../src/ui/MapPicker";
import { parseNum } from "../src/util";

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
async function loadDraft(): Promise<FormDraft | null> {
  const raw = await SecureStore.getItemAsync(DRAFT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as FormDraft;
  } catch {
    return null;
  }
}
async function saveDraft(draft: FormDraft): Promise<void> {
  await SecureStore.setItemAsync(DRAFT_KEY, JSON.stringify(draft));
}
async function clearDraft(): Promise<void> {
  await SecureStore.deleteItemAsync(DRAFT_KEY);
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
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
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

          <Card>
            <MapPicker
              label="Pickup"
              value={pickupPoint}
              onChange={setPickupPoint}
              onReverseGeocode={onPickupReverseGeocode}
              showMyLocation
            />
            <Field
              label={pickupLandmarkFromMap ? "Pickup landmark  • from map" : "Pickup landmark"}
              value={pickupLandmark}
              onChangeText={editPickupLandmark}
              placeholder="Eastgate Mall, CBD"
              maxLength={160}
            />
            <Field label="Pickup contact phone" value={pickupPhone} onChangeText={setPickupPhone} placeholder="+263..." keyboardType="phone-pad" maxLength={20} />
          </Card>

          <Card>
            <MapPicker label="Drop-off" value={dropPoint} onChange={setDropPoint} onReverseGeocode={onDropReverseGeocode} />
            <Field
              label={dropLandmarkFromMap ? "Drop-off landmark  • from map" : "Drop-off landmark"}
              value={dropLandmark}
              onChangeText={editDropLandmark}
              placeholder="14 Glenara Ave, Avenues"
              maxLength={160}
            />
            <Field label="Recipient phone" value={dropPhone} onChangeText={setDropPhone} placeholder="+263..." keyboardType="phone-pad" maxLength={20} />
          </Card>

          <Card>
            <Field label="What are you sending?" value={itemDescription} onChangeText={setItemDescription} placeholder="Documents envelope" maxLength={280} />
            <Field label="Declared value (USD, max 150)" value={declaredValue} onChangeText={setDeclaredValue} placeholder="10" keyboardType="decimal-pad" />
            {quote ? (
              <View style={{ marginBottom: tokens.space.sm }}>
                <Text style={{ fontSize: 13, color: tokens.color.muted }}>
                  Suggested fare ${quote.suggestedFare.toFixed(2)} · {quote.distanceKm} km
                </Text>
                <Button label={`Use suggested $${quote.suggestedFare.toFixed(2)}`} variant="ghost" onPress={() => setProposedFare(quote.suggestedFare.toFixed(2))} />
              </View>
            ) : null}
            <Field label="Your price (USD)" value={proposedFare} onChangeText={setProposedFare} placeholder="2.50" keyboardType="decimal-pad" />
          </Card>

          <Button label="Broadcast request" onPress={submit} loading={busy} disabled={!canSubmit} />
          <ErrorText message={error} />
          <View style={{ height: tokens.space.xxl }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
