import { tokens } from "@lynia/shared";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Linking, ScrollView, Text } from "react-native";
import { ApiError } from "../../src/api/client";
import { becomeRider, completeProfile } from "../../src/api/riders";
import { Button, Card, ErrorText, Field, Heading, Screen, Sub } from "../../src/ui";

export default function BecomeRiderScreen(): React.ReactElement {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [bikeReg, setBikeReg] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const canSubmit =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    idNumber.trim().length >= 4 &&
    bikeReg.trim().length >= 3 &&
    photoUrl.trim().startsWith("http");

  const submit = async (): Promise<void> => {
    setError(null);
    setBusy(true);
    try {
      await completeProfile({ firstName: firstName.trim(), lastName: lastName.trim(), idNumber: idNumber.trim() });
      const res = await becomeRider({ bikeReg: bikeReg.trim(), photoUrl: photoUrl.trim() });
      // Only open an https URL — defense in depth against a bad/compromised vendor URL.
      if (res.verificationUrl && res.verificationUrl.startsWith("https://")) {
        await Linking.openURL(res.verificationUrl).catch(() => undefined);
      }
      setPending(
        res.kycStatus === "verified"
          ? "You're verified — you can go online."
          : "Verification started. Finish it in the browser, then come back and go online.",
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't start rider setup.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Heading>Become a rider</Heading>
        <Sub>Verify your ID and register your bike to start accepting deliveries.</Sub>

        {pending ? (
          <Card style={{ borderColor: tokens.color.accent }}>
            <Text style={{ color: tokens.color.accent, fontWeight: "700", fontSize: 15 }}>{pending}</Text>
          </Card>
        ) : (
          <>
            <Card>
              <Field label="First name" value={firstName} onChangeText={setFirstName} maxLength={80} />
              <Field label="Last name" value={lastName} onChangeText={setLastName} maxLength={80} />
              <Field label="National ID number" value={idNumber} onChangeText={setIdNumber} maxLength={40} />
            </Card>
            <Card>
              <Field label="Bike registration" value={bikeReg} onChangeText={setBikeReg} placeholder="ABZ 1234" maxLength={20} />
              <Field label="Photo URL" value={photoUrl} onChangeText={setPhotoUrl} placeholder="https://..." />
            </Card>
            <Text style={{ fontSize: 12, color: tokens.color.muted, lineHeight: 17, marginBottom: tokens.space.sm }}>
              By submitting, your national ID is checked by our verification partner (Didit) — an ID photo plus a
              quick selfie liveness check. You'll finish in your browser, then return here to go online.
            </Text>
            <Button label="Submit for verification" onPress={submit} loading={busy} disabled={!canSubmit} />
          </>
        )}
        <Button label="Back" variant="ghost" onPress={() => router.replace("/rider")} />
        <ErrorText message={error} />
      </ScrollView>
    </Screen>
  );
}
