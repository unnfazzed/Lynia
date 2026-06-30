import { tokens } from "@lynia/shared";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as WebBrowser from "expo-web-browser";
import React, { useState } from "react";
import { Image, ScrollView, Text } from "react-native";
import { ApiError } from "../../src/api/client";
import { becomeRider, completeProfile } from "../../src/api/riders";
import { type ImageContentType, requestKycPhotoUpload, uploadImage } from "../../src/api/uploads";
import { Button, Card, ErrorText, Field, Heading, Label, Screen, Sub } from "../../src/ui";

export default function BecomeRiderScreen(): React.ReactElement {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [bikeReg, setBikeReg] = useState("");
  const [photoUri, setPhotoUri] = useState<string | null>(null); // local preview
  const [photoKey, setPhotoKey] = useState<string | null>(null); // uploaded object key
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const canSubmit =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    idNumber.trim().length >= 4 &&
    bikeReg.trim().length >= 3 &&
    photoKey != null &&
    !uploading;

  // Capture or choose a photo, then upload it straight to storage and keep the returned object key.
  const pickFrom = async (source: "camera" | "library"): Promise<void> => {
    setError(null);
    const perm =
      source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError(source === "camera" ? "Camera permission is needed to take your photo." : "Photo permission is needed.");
      return;
    }
    const result =
      source === "camera"
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.6 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.6 });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    const contentType: ImageContentType = asset.mimeType === "image/png" ? "image/png" : "image/jpeg";
    setPhotoUri(asset.uri);
    setPhotoKey(null);
    setUploading(true);
    try {
      const { uploadUrl, key } = await requestKycPhotoUpload(contentType);
      await uploadImage(uploadUrl, asset.uri, contentType);
      setPhotoKey(key);
    } catch (e) {
      setPhotoUri(null);
      setError(e instanceof ApiError ? e.message : "Couldn't upload the photo. Check your connection and try again.");
    } finally {
      setUploading(false);
    }
  };

  const submit = async (): Promise<void> => {
    if (!photoKey) return;
    setError(null);
    setBusy(true);
    try {
      await completeProfile({ firstName: firstName.trim(), lastName: lastName.trim(), idNumber: idNumber.trim() });
      const res = await becomeRider({ bikeReg: bikeReg.trim(), photoUrl: photoKey });
      // Hand off in an in-app browser tab (not the system browser) — it returns deterministically to
      // the app when the rider finishes/closes, so the gate can re-check on focus instead of stranding
      // them in Chrome. Only ever open an https URL (defense against a bad/compromised vendor URL).
      if (res.verificationUrl && res.verificationUrl.startsWith("https://")) {
        await WebBrowser.openAuthSessionAsync(res.verificationUrl).catch(() => undefined);
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
              <Field
                label="National ID number"
                value={idNumber}
                onChangeText={setIdNumber}
                keyboardType="number-pad"
                maxLength={40}
              />
            </Card>
            <Card>
              <Field label="Bike registration" value={bikeReg} onChangeText={setBikeReg} placeholder="ABZ 1234" maxLength={20} />
              <Label>Your photo</Label>
              {photoUri ? (
                <Image
                  source={{ uri: photoUri }}
                  style={{ width: "100%", height: 180, borderRadius: tokens.radius.input, marginBottom: tokens.space.sm }}
                />
              ) : null}
              <Button
                label={uploading ? "Uploading…" : photoKey ? "Retake photo" : "Take photo"}
                variant="ghost"
                onPress={() => void pickFrom("camera")}
                loading={uploading}
              />
              <Button label="Choose from gallery" variant="ghost" onPress={() => void pickFrom("library")} disabled={uploading} />
              {photoKey ? (
                <Text style={{ fontSize: 13, color: tokens.color.accent, fontWeight: "700", marginTop: 4 }}>Photo added ✓</Text>
              ) : null}
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
