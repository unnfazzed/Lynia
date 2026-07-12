import { tokens } from "@lynia/shared";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as WebBrowser from "expo-web-browser";
import React, { useEffect, useRef, useState } from "react";
import { Image, ScrollView, Text } from "react-native";
import { ApiError } from "../../src/api/client";
import { becomeRider, completeProfile } from "../../src/api/riders";
import { clearKycDraft, kycDraftHasContent, loadKycDraft, saveKycDraft } from "../../src/logic/kyc-draft";
import { type ImageContentType, requestKycPhotoUpload, uploadImage } from "../../src/api/uploads";
import { Button, Card, ErrorText, Field, Heading, isTestBuild, Label, Screen, Sub } from "../../src/ui";

export default function BecomeRiderScreen(): React.ReactElement {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [bikeReg, setBikeReg] = useState("");
  const [photoUri, setPhotoUri] = useState<string | null>(null); // local preview
  const [photoKey, setPhotoKey] = useState<string | null>(null); // uploaded object key
  const [uploading, setUploading] = useState(false);
  // A bare "Uploading…" reads as frozen on a slow link — mirrors the "Still sending — hang on" pattern
  // already shipped for rider offers and customer rider-select.
  const [uploadSlow, setUploadSlow] = useState(false);
  // The asset that just failed to upload, kept so "Try again" can re-PUT the SAME captured/picked file
  // instead of forcing a brand-new camera capture when the capture itself was fine and only the upload
  // (the actual point of failure on a flaky link) needs retrying.
  const [failedAsset, setFailedAsset] = useState<{ uri: string; contentType: ImageContentType } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [draftRestored, setDraftRestored] = useState(false);
  // Gate persistence until the initial load runs, so we don't clobber a stored draft with empty state.
  const hydrated = useRef(false);

  // Rehydrate the KYC draft once on mount — launching the camera can OOM-kill the app on a low-end
  // phone; without this the whole form (including a re-typed national ID) would be lost on relaunch.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const d = await loadKycDraft();
      if (cancelled) {
        hydrated.current = true;
        return;
      }
      if (d && kycDraftHasContent(d)) {
        setFirstName(d.firstName);
        setLastName(d.lastName);
        setIdNumber(d.idNumber);
        setBikeReg(d.bikeReg);
        setPhotoKey(d.photoKey);
        setPhotoUri(d.photoUri);
        setDraftRestored(true);
      }
      hydrated.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist the draft (encrypted, on-device only) as fields change, after initial hydration.
  useEffect(() => {
    if (!hydrated.current) return;
    void saveKycDraft({ firstName, lastName, idNumber, bikeReg, photoKey, photoUri });
  }, [firstName, lastName, idNumber, bikeReg, photoKey, photoUri]);

  const canSubmit =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    idNumber.trim().length >= 4 &&
    bikeReg.trim().length >= 3 &&
    photoKey != null &&
    !uploading;

  // Shared by a fresh capture/pick and a "Try again" retry of the same asset.
  const doUpload = async (uri: string, contentType: ImageContentType): Promise<void> => {
    // Keep the previously-uploaded photo intact until the retake succeeds — a failed retry must NOT wipe
    // a good photo (which would drop canSubmit to false). Only commit the new uri/key on success; on
    // failure roll back to whatever we already had.
    const prevUri = photoUri;
    const prevKey = photoKey;
    setUploading(true);
    try {
      const { uploadUrl, key, headers } = await requestKycPhotoUpload(contentType);
      // Send the exact headers the signature was minted over (Content-Type + size range); fall back to
      // just the content type for an older API that didn't return them.
      await uploadImage(uploadUrl, uri, headers ?? { "Content-Type": contentType });
      setPhotoUri(uri);
      setPhotoKey(key);
      setFailedAsset(null);
    } catch (e) {
      setPhotoUri(prevUri);
      setPhotoKey(prevKey);
      setFailedAsset({ uri, contentType });
      setError(e instanceof ApiError ? e.message : "Couldn't upload the photo. Check your connection and try again.");
    } finally {
      setUploading(false);
    }
  };

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
    await doUpload(asset.uri, contentType);
  };

  // R6/07-11: retry the SAME failed upload instead of forcing the rider to re-pose for a fresh capture
  // when the capture itself succeeded and only the upload (the real point of failure on a flaky link)
  // needs another attempt.
  const retryUpload = async (): Promise<void> => {
    if (!failedAsset) return;
    setError(null);
    await doUpload(failedAsset.uri, failedAsset.contentType);
  };

  useEffect(() => {
    if (!uploading) {
      setUploadSlow(false);
      return;
    }
    const t = setTimeout(() => setUploadSlow(true), 4500);
    return () => clearTimeout(t);
  }, [uploading]);

  const submit = async (): Promise<void> => {
    if (!photoKey) return;
    setError(null);
    setBusy(true);
    try {
      await completeProfile({ firstName: firstName.trim(), lastName: lastName.trim(), idNumber: idNumber.trim() });
      const res = await becomeRider({ bikeReg: bikeReg.trim(), photoUrl: photoKey });
      // KYC is submitted — the draft has served its purpose. Wipe the stored national ID immediately
      // rather than leaving it in the keystore any longer than needed.
      void clearKycDraft();
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

        {draftRestored && !pending ? (
          <Text style={{ fontSize: 12, fontWeight: "600", color: tokens.color.accentText, marginTop: tokens.space.xs }}>
            We saved what you&apos;d filled in — pick up where you left off.
          </Text>
        ) : null}

        {pending ? (
          <Card style={{ borderColor: tokens.color.accent }}>
            <Text style={{ color: tokens.color.accentText, fontWeight: "700", fontSize: 16 }}>{pending}</Text>
          </Card>
        ) : (
          <>
            <Card>
              <Field label="First name" value={firstName} onChangeText={setFirstName} maxLength={80} />
              <Field label="Last name" value={lastName} onChangeText={setLastName} maxLength={80} />
              {/* Default (text) keyboard — Zimbabwean national IDs are alphanumeric (e.g. "63-123456 A 12"),
                  so a number-pad would make the letter suffix untypeable and block KYC submission. */}
              <Field label="National ID number" value={idNumber} onChangeText={setIdNumber} maxLength={40} />
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
                label={uploading ? (uploadSlow ? "Still uploading — hang on" : "Uploading…") : photoKey ? "Retake photo" : "Take photo"}
                variant="ghost"
                onPress={() => void pickFrom("camera")}
                loading={uploading}
              />
              <Button label="Choose from gallery" variant="ghost" onPress={() => void pickFrom("library")} disabled={uploading} />
              {/* R6: retry the SAME captured file — the everyday failure on this market's links is the
                  upload, not the capture, so re-posing for a fresh photo every retry is unnecessary friction. */}
              {failedAsset && !uploading ? (
                <Button label="Try again" variant="ghost" onPress={() => void retryUpload()} />
              ) : null}
              {photoKey ? (
                <Text style={{ fontSize: 12, color: tokens.color.accentText, fontWeight: "600", marginTop: 4 }}>Photo added ✓</Text>
              ) : null}
            </Card>
            <Text style={{ fontSize: 12, color: tokens.color.muted, lineHeight: 18, marginBottom: tokens.space.sm }}>
              {isTestBuild()
                ? "Test build: ID verification is bypassed — submit and you'll be verified straight away so you can go online."
                : "By submitting, your national ID is verified — an ID photo plus a quick selfie liveness check. You'll finish in your browser, then return here to go online."}
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
