import { tokens } from "@lynia/shared";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as WebBrowser from "expo-web-browser";
import React, { useState } from "react";
import { Image, Linking, ScrollView, Text } from "react-native";
import { ApiError } from "../../src/api/client";
import { becomeRider, completeProfile } from "../../src/api/riders";
import { type ImageContentType, requestKycPhotoUpload, uploadImage } from "../../src/api/uploads";
import { Button, Card, ErrorText, Field, Heading, Label, Screen, Sub } from "../../src/ui";

// Where the "what we do with your data" copy links. Kept as a constant so the consent block and any
// future settings screen point at the same policy.
const PRIVACY_URL = "https://lyniago.lyniafinance.com/privacy";

// Per-field validation. Rules are deliberately forgiving (KYC does the real ID check) — this only
// catches obviously-empty/too-short input before we spend a Didit session on it. Returns null = valid.
type FieldName = "firstName" | "lastName" | "idNumber" | "bikeReg";
function validateField(name: FieldName, raw: string): string | null {
  const v = raw.trim();
  switch (name) {
    case "firstName":
      return v.length === 0 ? "Enter your first name." : null;
    case "lastName":
      return v.length === 0 ? "Enter your last name." : null;
    case "idNumber":
      // Zimbabwean national IDs are digits with a check letter (e.g. 63-1234567 A 42), so allow digits +
      // a letter + separators — don't force a specific mask, just reject clearly-too-short input.
      if (v.length === 0) return "Enter your national ID number.";
      if (v.replace(/[^0-9a-z]/gi, "").length < 6) return "That ID number looks too short.";
      return null;
    case "bikeReg":
      return v.length < 3 ? "Enter your bike registration." : null;
  }
}

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
  // Inline per-field errors, keyed by field. A field validates on blur and again on submit, so the rider
  // sees the problem next to the input rather than only a single top-level message.
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldName, string>>>({});

  const fieldValues: Record<FieldName, string> = { firstName, lastName, idNumber, bikeReg };
  const validateOnBlur = (name: FieldName): void =>
    setFieldErrors((prev) => ({ ...prev, [name]: validateField(name, fieldValues[name]) ?? undefined }));

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
    // Re-run every rule on submit so nothing slips through un-blurred, and surface each problem inline.
    const errs: Partial<Record<FieldName, string>> = {};
    (Object.keys(fieldValues) as FieldName[]).forEach((name) => {
      const msg = validateField(name, fieldValues[name]);
      if (msg) errs[name] = msg;
    });
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) {
      setError("Please fix the highlighted fields.");
      return;
    }
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
              <Field
                label="First name"
                value={firstName}
                onChangeText={setFirstName}
                maxLength={80}
                autoCapitalize="words"
                error={fieldErrors.firstName}
                onBlur={() => validateOnBlur("firstName")}
              />
              <Field
                label="Last name"
                value={lastName}
                onChangeText={setLastName}
                maxLength={80}
                autoCapitalize="words"
                error={fieldErrors.lastName}
                onBlur={() => validateOnBlur("lastName")}
              />
              <Field
                label="National ID number"
                value={idNumber}
                onChangeText={setIdNumber}
                // "numeric" (not "number-pad"): ZIM IDs carry a check letter (e.g. 63-1234567 A 42), and
                // the numeric keyboard still exposes letters/symbols on Android, so the letter is enterable.
                keyboardType="numeric"
                maxLength={40}
                error={fieldErrors.idNumber}
                onBlur={() => validateOnBlur("idNumber")}
              />
            </Card>
            <Card>
              <Field
                label="Bike registration"
                value={bikeReg}
                onChangeText={setBikeReg}
                placeholder="ABZ 1234"
                maxLength={20}
                autoCapitalize="characters"
                error={fieldErrors.bikeReg}
                onBlur={() => validateOnBlur("bikeReg")}
              />
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
            {/* Consent block — an ID+selfie ask needs to earn trust in a low-trust cash market: name the
                partner, say what's collected, why it's kept, and link the policy. ≥14px and tokenised. */}
            <Card style={{ backgroundColor: tokens.color.surface }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: tokens.color.ink, marginBottom: 4 }}>
                How your ID is verified
              </Text>
              <Text style={{ fontSize: 14, color: tokens.color.ink, lineHeight: 21 }}>
                Your ID photo and a quick selfie liveness check are sent to <Text style={{ fontWeight: "700" }}>Didit</Text>,
                our identity-verification partner, to confirm you are who you say you are. We keep your name, ID number
                and verification result to run rides and meet the law — not for marketing — and delete the photos once
                the check is done. You'll finish in your browser, then return here to go online.
              </Text>
              <Text
                accessibilityRole="link"
                onPress={() => void Linking.openURL(PRIVACY_URL)}
                style={{ fontSize: 14, fontWeight: "700", color: tokens.color.accent, marginTop: tokens.space.sm }}
              >
                Read our privacy policy
              </Text>
            </Card>
            <Button label="Submit for verification" onPress={submit} loading={busy} disabled={!canSubmit} />
          </>
        )}
        <Button label="Back" variant="ghost" onPress={() => router.replace("/rider")} />
        <ErrorText message={error} />
      </ScrollView>
    </Screen>
  );
}
