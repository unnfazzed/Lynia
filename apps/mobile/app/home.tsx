import { CreateOrderRequest, quoteFare, tokens } from "@lynia/shared";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { ApiError } from "../src/api/client";
import { createOrder } from "../src/api/orders";
import { Button, Card, ErrorText, Field, Heading, Label, Screen, Sub } from "../src/ui";
import { parseNum } from "../src/util";

export default function HomeScreen(): React.ReactElement {
  const router = useRouter();

  const [pickupLat, setPickupLat] = useState("");
  const [pickupLng, setPickupLng] = useState("");
  const [pickupLandmark, setPickupLandmark] = useState("");
  const [pickupPhone, setPickupPhone] = useState("");
  const [dropLat, setDropLat] = useState("");
  const [dropLng, setDropLng] = useState("");
  const [dropLandmark, setDropLandmark] = useState("");
  const [dropPhone, setDropPhone] = useState("");
  const [itemDescription, setItemDescription] = useState("");
  const [declaredValue, setDeclaredValue] = useState("");
  const [proposedFare, setProposedFare] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pLat = parseNum(pickupLat);
  const pLng = parseNum(pickupLng);
  const dLat = parseNum(dropLat);
  const dLng = parseNum(dropLng);
  const fare = parseNum(proposedFare);
  const coordsOk = pLat !== null && pLng !== null && dLat !== null && dLng !== null;
  const quote = coordsOk ? quoteFare({ lat: pLat, lng: pLng }, { lat: dLat, lng: dLng }) : null;
  const canSubmit = coordsOk && fare !== null && fare > 0 && itemDescription.trim().length > 0;

  const useMyLocation = async (): Promise<void> => {
    setError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setError("Location permission denied — enter the pickup coordinates manually.");
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setPickupLat(loc.coords.latitude.toFixed(6));
      setPickupLng(loc.coords.longitude.toFixed(6));
    } catch {
      setError("Couldn't get your location — turn on location services or enter it manually.");
    }
  };

  const submit = async (): Promise<void> => {
    setError(null);
    if (!canSubmit || pLat === null || pLng === null || dLat === null || dLng === null || fare === null) {
      setError("Enter valid pickup and drop-off coordinates, an item, and a price.");
      return;
    }
    const candidate = {
      pickup: { point: { lat: pLat, lng: pLng }, landmark: pickupLandmark.trim(), contactPhone: pickupPhone.trim() },
      dropoff: { point: { lat: dLat, lng: dLng }, landmark: dropLandmark.trim(), contactPhone: dropPhone.trim() },
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
          <Sub>Set pickup and drop-off, name your price, and riders will offer.</Sub>

          <Card>
            <Label>Pickup</Label>
            <Button label="Use my location" variant="ghost" onPress={() => void useMyLocation()} />
            <Field label="Pickup latitude" value={pickupLat} onChangeText={setPickupLat} placeholder="-17.8292" keyboardType="decimal-pad" />
            <Field label="Pickup longitude" value={pickupLng} onChangeText={setPickupLng} placeholder="31.0522" keyboardType="decimal-pad" />
            <Field label="Pickup landmark" value={pickupLandmark} onChangeText={setPickupLandmark} placeholder="Eastgate Mall, CBD" maxLength={160} />
            <Field label="Pickup contact phone" value={pickupPhone} onChangeText={setPickupPhone} placeholder="+263..." keyboardType="phone-pad" maxLength={20} />
          </Card>

          <Card>
            <Label>Drop-off</Label>
            <Field label="Drop-off latitude" value={dropLat} onChangeText={setDropLat} placeholder="-17.8192" keyboardType="decimal-pad" />
            <Field label="Drop-off longitude" value={dropLng} onChangeText={setDropLng} placeholder="31.0622" keyboardType="decimal-pad" />
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
