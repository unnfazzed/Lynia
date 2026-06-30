import { CreateOrderRequest, quoteFare, tokens } from "@lynia/shared";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { ApiError } from "../src/api/client";
import { createOrder } from "../src/api/orders";
import { Button, Card, ErrorText, Field, Heading, Screen, Sub } from "../src/ui";
import { MapPicker, type PickedPoint } from "../src/ui/MapPicker";
import { parseNum } from "../src/util";

export default function HomeScreen(): React.ReactElement {
  const router = useRouter();

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

          <Card>
            <MapPicker label="Pickup" value={pickupPoint} onChange={setPickupPoint} showMyLocation />
            <Field label="Pickup landmark" value={pickupLandmark} onChangeText={setPickupLandmark} placeholder="Eastgate Mall, CBD" maxLength={160} />
            <Field label="Pickup contact phone" value={pickupPhone} onChangeText={setPickupPhone} placeholder="+263..." keyboardType="phone-pad" maxLength={20} />
          </Card>

          <Card>
            <MapPicker label="Drop-off" value={dropPoint} onChange={setDropPoint} />
            <Field label="Drop-off landmark" value={dropLandmark} onChangeText={setDropLandmark} placeholder="14 Glenara Ave, Avenues" maxLength={160} />
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
