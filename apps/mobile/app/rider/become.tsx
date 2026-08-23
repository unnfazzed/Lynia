import { normalizeNationalId } from "@lynia/shared";
import { tokens } from "@lynia/shared/tokens";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useRef, useState } from "react";
import { Image, Linking, ScrollView, Text, View } from "react-native";
import { ApiError } from "../../src/api/client";
import { becomeRider, completeProfile } from "../../src/api/riders";
import { KycCheckHost } from "../../src/kyc/KycCheckHost";
import { runKycVerification } from "../../src/kyc/verify";
import { shouldOfferPermissionSettings } from "../../src/logic/gates";
import { downscaleForUpload, type UploadImageSource } from "../../src/logic/image-downscale";
import { clearKycDraft, kycDraftHasContent, loadKycDraft, saveKycDraft, type PendingKycPhoto } from "../../src/logic/kyc-draft";
import { type ImageContentType, requestKycPhotoUpload, uploadImage } from "../../src/api/uploads";
import { AppBar, Button, Card, Field, Heading, Icon, isTestBuild, Label, Screen, Sub, useActionError } from "../../src/ui";
import { PhotoCaptureGuide, PhotoReviewCard } from "../../src/ui/rider/PhotoReviewCard";

export default function BecomeRiderScreen(): React.ReactElement {
  const router = useRouter();
  // CF-04-SIB: same-tick double-submit guard for `submit` below — see the ref's use for why a plain
  // `busy` state boolean isn't enough.
  const submitInFlightRef = useRef(false);
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
  // (the actual point of failure on a flaky link) needs retrying. Holds the ORIGINAL capture (uri +
  // dimensions), so a retry re-runs the downscale in doUpload — cheap and local — rather than caching
  // a derived file that may have been evicted from the manipulator's cache dir.
  const [failedAsset, setFailedAsset] = useState<UploadImageSource | null>(null);
  // Why the "Try again" button below is showing. NOT an action error and deliberately NOT a toast: it
  // is set on MOUNT (restoring a draft after an app kill), and it explains a persistent affordance —
  // a 4s toast would vanish and leave an unexplained button. Rendered as a calm muted line beside the
  // button, never a red card. (Owner rule 2026-08-12 is about error CARDS raised by background work;
  // an in-flow explanation of a control that is right there is the opposite of get-in-the-way.)
  const [uploadResumeNote, setUploadResumeNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Action errors speak once as an auto-dismissing toast, never as a persistent card
  // (owner instruction 2026-08-12). Same `setError(msg)` shape as the useState setter it replaces.
  const setError = useActionError();
  // BH-11: which capture source is blocked by an OS-level "don't ask again" permission denial — the
  // photo is MANDATORY for KYC, unlike PickupChecklist's optional one, so an error string with no way
  // to recover is a real onboarding dead end. Mirrors the location-permission gate's "Open settings"
  // affordance elsewhere in the app.
  const [permissionBlocked, setPermissionBlocked] = useState<"camera" | "library" | null>(null);
  // The kit's `photo_preview` review step (rider-screens-safety.jsx): a just-captured asset is HELD here
  // for the rider to check before it's committed, instead of going straight up the upload chain. Carries
  // the source it came from so "Retake" re-opens the same picker rather than guessing camera. Purely
  // in-memory and deliberately NOT persisted: an unreviewed photo isn't a promise to anyone, and the
  // C-O8 resume marker below is only written once the rider has actually chosen this photo.
  const [reviewAsset, setReviewAsset] = useState<{ asset: UploadImageSource; source: "camera" | "library" } | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [draftRestored, setDraftRestored] = useState(false);
  // Gate persistence until the initial load runs, so we don't clobber a stored draft with empty state.
  const hydrated = useRef(false);
  // C-O8 (LC-C11): mirrors the draft's `pendingPhoto` field so the generic field-persistence effect
  // below can include it in every write without re-running just because it changed (a ref, not state
  // — doUpload sets/clears it directly, synchronously, ahead of/alongside the explicit persist calls).
  const pendingPhotoRef = useRef<PendingKycPhoto | null>(null);

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
        // C-O8 (LC-C11): a photo capture that never finished uploading before the app was killed —
        // offer the same one-tap "Try again" resume a network-only failure already gets, with the
        // SAME captured asset, instead of forcing a fresh camera shot.
        if (d.pendingPhoto) {
          pendingPhotoRef.current = d.pendingPhoto;
          setFailedAsset({
            uri: d.pendingPhoto.uri,
            width: d.pendingPhoto.width,
            height: d.pendingPhoto.height,
            contentType: d.pendingPhoto.contentType,
          });
          setUploadResumeNote("We didn't confirm your last photo uploaded — tap \"Try again\" to finish adding it.");
        }
      }
      hydrated.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist the draft (encrypted, on-device only) as fields change, after initial hydration.
  // `pendingPhoto` rides along from the ref (not a dependency — doUpload persists it directly and
  // synchronously at the moments that matter; this just keeps every OTHER field-triggered write from
  // clobbering it with a stale value).
  useEffect(() => {
    if (!hydrated.current) return;
    void saveKycDraft({ firstName, lastName, idNumber, bikeReg, photoKey, photoUri, pendingPhoto: pendingPhotoRef.current });
  }, [firstName, lastName, idNumber, bikeReg, photoKey, photoUri]);

  const canSubmit =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    idNumber.trim().length >= 4 &&
    bikeReg.trim().length >= 3 &&
    photoKey != null &&
    !uploading;

  // Shared by a fresh capture/pick and a "Try again" retry of the same asset.
  const doUpload = async (asset: UploadImageSource): Promise<void> => {
    // Keep the previously-uploaded photo intact until the retake succeeds — a failed retry must NOT wipe
    // a good photo (which would drop canSubmit to false). Only commit the new uri/key on success; on
    // failure roll back to whatever we already had.
    const prevUri = photoUri;
    const prevKey = photoKey;
    setUploading(true);
    // C-O8 (LC-C11): persist the captured asset BEFORE the upload chain fires (mirrors C-O5/C-O7's
    // "write the marker before the request" pattern) — an app kill anywhere in the downscale/presign/
    // PUT chain below then leaves this draft in place, so a relaunch can offer a one-tap resume with
    // the SAME captured asset instead of forcing a fresh camera re-shoot.
    pendingPhotoRef.current = { uri: asset.uri, width: asset.width, height: asset.height, contentType: asset.contentType };
    void saveKycDraft({ firstName, lastName, idNumber, bikeReg, photoKey, photoUri, pendingPhoto: pendingPhotoRef.current });
    try {
      // Downscale before the presign (07-08 deferred item: full camera resolution over expensive,
      // flaky data). Never throws — any manipulation failure hands back the original file. The
      // returned contentType is what the signature must be minted over: the downscaled output is
      // JPEG even for a PNG source, so presigning the ORIGINAL type would fail the PUT.
      const prepared = await downscaleForUpload(asset);
      const { uploadUrl, key, headers } = await requestKycPhotoUpload(prepared.contentType);
      // Send the exact headers the signature was minted over (Content-Type + size range); fall back to
      // just the content type for an older API that didn't return them.
      await uploadImage(uploadUrl, prepared.uri, headers ?? { "Content-Type": prepared.contentType });
      // B-O11: preview the already-downscaled upload asset, not the original 3000-4000px camera
      // capture — this preview stays mounted for the rest of the multi-field KYC form, and the
      // original is real avoidable peak-memory pressure on a 1-2GB device (become.tsx's own OOM
      // comment above flags exactly this flow).
      setPhotoUri(prepared.uri);
      setPhotoKey(key);
      setFailedAsset(null);
      setUploadResumeNote(null);
      // The upload landed — clear the pending marker (both the ref and the persisted draft) now,
      // rather than leaving it for the generic field-effect to notice next render.
      pendingPhotoRef.current = null;
      void saveKycDraft({ firstName, lastName, idNumber, bikeReg, photoKey: key, photoUri: prepared.uri, pendingPhoto: null });
    } catch (e) {
      setPhotoUri(prevUri);
      setPhotoKey(prevKey);
      setFailedAsset(asset);
      setError(e instanceof ApiError ? e.message : "Couldn't upload the photo. Check your connection and try again.");
      // pendingPhoto (and its persisted draft copy, written above) stay in place — a genuinely failed
      // or interrupted attempt is exactly what "Try again" resumes, whether within this session or
      // after a full app kill.
    } finally {
      setUploading(false);
    }
  };

  // Capture or choose a photo, then upload it straight to storage and keep the returned object key.
  const pickFrom = async (source: "camera" | "library"): Promise<void> => {
    setError(null);
    setPermissionBlocked(null);
    const perm =
      source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError(source === "camera" ? "Camera permission is needed to take your photo." : "Photo permission is needed.");
      // BH-11: `canAskAgain: false` means the OS won't show its own prompt again (a prior "Don't
      // Allow") — the only way forward is the device's Settings screen. Without this, denying both
      // the camera AND the gallery permanently blocks `photoKey` from ever being set, and KYC
      // submission (which requires a photo) is a permanent dead end for that rider.
      if (shouldOfferPermissionSettings(perm)) setPermissionBlocked(source);
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
    // Kit `photo_preview`: review before commit. The OS picker's own confirm asks "is this the photo you
    // meant?"; this asks the question KYC actually fails on — "can a verifier read the ID number?".
    setReviewAsset({ asset: { uri: asset.uri, width: asset.width, height: asset.height, contentType }, source });
  };

  // R6/07-11: retry the SAME failed upload instead of forcing the rider to re-pose for a fresh capture
  // when the capture itself succeeded and only the upload (the real point of failure on a flaky link)
  // needs another attempt.
  const retryUpload = async (): Promise<void> => {
    if (!failedAsset) return;
    setError(null);
    await doUpload(failedAsset);
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
    // CF-04-SIB: `busy` (React state) only reflects the FIRST of two same-tick taps — the second
    // tap's re-render hasn't landed yet, so a fast double-tap on "Submit for verification" fired
    // becomeRider() twice (each opening its own paid Didit session server-side, no client
    // idempotency key). Same guard shape as CF-02's admin/merchant ConfirmModal fix: a synchronous
    // ref checked-and-set before any await.
    if (submitInFlightRef.current) return;
    submitInFlightRef.current = true;
    setError(null);
    setBusy(true);
    try {
      await completeProfile({ firstName: firstName.trim(), lastName: lastName.trim(), idNumber: normalizeNationalId(idNumber) });
      const res = await becomeRider({ bikeReg: bikeReg.trim(), photoUrl: photoKey });
      // KYC is submitted — the draft has served its purpose. Wipe the stored national ID immediately
      // rather than leaving it in the keystore any longer than needed.
      void clearKycDraft();
      // The check opens over this screen — the in-app ID-check sheet (KycCheckHost, mounted below),
      // falling back to the in-app browser tab when the sheet can't present. The old
      // `.catch(() => undefined)` here was the same swallow the board's retry path had: when the
      // launch failed the rider saw a line describing a check that never opened. `runKycVerification`
      // never throws and names the outcome instead.
      const launch =
        res.sessionToken || res.verificationUrl
          ? await runKycVerification({ sessionToken: res.sessionToken, verificationUrl: res.verificationUrl })
          : null;
      setPending(
        res.kycStatus === "verified"
          ? "You're verified — you can go online."
          : res.mode === "manual"
            // BH-03: manual mode has no vendor step at all — describing one here would name a step
            // that never happened.
            ? "Verification submitted. Our team will review it and notify you — no action needed from you."
            : // The three auto-mode outcomes say three different things, mirroring the board's walls:
              // a finished flow is with Didit, a closed one is resumable, and one that never opened is
              // not the rider's doing. Sending everyone the same line is what made the old copy wrong.
              launch?.outcome === "completed"
              ? "Verification submitted. We'll let you know as soon as it's checked."
              : launch?.outcome === "cancelled"
                ? "You didn't finish verifying. Pick it up again from your rider board."
                : "We couldn't open the ID check. Try again from your rider board.",
      );
    } catch (e) {
      // BH-04: a lost-response retry on `becomeRider` hits this exact 409 — the FIRST submit
      // already landed server-side, so this isn't a failure to explain, it's a stale form to leave.
      // `/rider` re-reads the real (already-registered) state instead of stranding the rider on a
      // dead-end "Already registered as a rider" error with a submit button that can only 409 again.
      if (e instanceof ApiError && e.code === "already_rider") {
        void clearKycDraft();
        router.replace("/rider");
        return;
      }
      setError(e instanceof ApiError ? e.message : "Couldn't start rider setup.");
    } finally {
      submitInFlightRef.current = false;
      setBusy(false);
    }
  };

  return (
    <Screen>
      {/* Back-only AppBar chrome: the KYC flow keeps its in-body Heading (kit KYC layout). Return to
          the actual referrer (customer Account, /profile, or the board — KYC is always pushed) so the
          drawn chevron and Android hardware-back land in the SAME place; a bare replace('/rider') sent
          a customer who tapped "Become a rider" from their Account straight to the rider board instead.
          Falls back to /rider only when there's no history to pop (e.g. an unexpected cold-start entry). */}
      <AppBar onBack={() => (router.canGoBack() ? router.back() : router.replace("/rider"))} />
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Heading>Become a rider</Heading>
        <Sub>Verify your ID and register your bike to start accepting deliveries.</Sub>

        {draftRestored && !pending ? (
          <Text style={{ fontSize: 12, fontWeight: "600", color: tokens.color.accentText, marginTop: tokens.space.xs }}>
            We saved what you&apos;d filled in — pick up where you left off.
          </Text>
        ) : null}

        {pending ? (
          <Card accent>
            <Text style={{ color: tokens.color.accentText, fontWeight: "700", fontSize: 16 }}>{pending}</Text>
          </Card>
        ) : reviewAsset ? (
          /* Kit `photo_preview` is a step of its own, not an inline slot — the whole screen is the
             question "can you read everything?". Either answer returns to the form below with every
             field exactly as it was (nothing here touches the draft). */
          <PhotoReviewCard
            uri={reviewAsset.asset.uri}
            hasExistingPhoto={photoKey != null}
            onUse={() => {
              const { asset } = reviewAsset;
              setReviewAsset(null);
              void doUpload(asset);
            }}
            onRetake={() => {
              const { source } = reviewAsset;
              setReviewAsset(null);
              void pickFrom(source);
            }}
          />
        ) : (
          <>
            <Card>
              <Field label="First name" value={firstName} onChangeText={setFirstName} maxLength={80} />
              <Field label="Last name" value={lastName} onChangeText={setLastName} maxLength={80} />
              {/* Default (text) keyboard — Zimbabwean national IDs are alphanumeric (e.g. "63123456A12"),
                  so a number-pad would make the letter suffix untypeable and block KYC submission.
                  Placeholder is dash-free; spaces/dashes are normalised out on submit. */}
              <Field label="National ID number" value={idNumber} onChangeText={setIdNumber} placeholder="63123456A42" maxLength={40} />
            </Card>
            <Card>
              <Field label="Bike registration" value={bikeReg} onChangeText={setBikeReg} placeholder="ABZ 1234" maxLength={20} />
              <Label>Your photo</Label>
              {photoUri ? (
                <Image
                  source={{ uri: photoUri }}
                  style={{ width: "100%", height: 180, borderRadius: tokens.radius.input, marginBottom: tokens.space.sm }}
                />
              ) : (
                /* The actionable half of the kit's camera-frame overlay — see PhotoReviewCard's own
                   note on why the live in-app frame isn't built. */
                <PhotoCaptureGuide />
              )}
              <Button
                label={uploading ? (uploadSlow ? "Still uploading — hang on" : "Uploading…") : photoKey ? "Retake photo" : "Take photo"}
                variant="ghost"
                onPress={() => void pickFrom("camera")}
                loading={uploading}
              />
              <Button label="Choose from gallery" variant="ghost" onPress={() => void pickFrom("library")} disabled={uploading} />
              {/* BH-11: the OS won't re-prompt after a "Don't Allow" — only Settings can fix it. */}
              {permissionBlocked ? (
                <Button label="Open settings" variant="ghost" onPress={() => void Linking.openSettings()} />
              ) : null}
              {/* R6: retry the SAME captured file — the everyday failure on this market's links is the
                  upload, not the capture, so re-posing for a fresh photo every retry is unnecessary friction. */}
              {failedAsset && !uploading ? (
                <>
                  {uploadResumeNote ? (
                    <Text style={{ fontSize: 12, color: tokens.color.muted, marginTop: 4 }}>{uploadResumeNote}</Text>
                  ) : null}
                  <Button label="Try again" variant="ghost" onPress={() => void retryUpload()} />
                </>
              ) : null}
              {photoKey ? (
                <Text style={{ fontSize: 12, color: tokens.color.accentText, fontWeight: "600", marginTop: 4 }}>Photo added ✓</Text>
              ) : null}
            </Card>
            {/* The kit's KycForm sets this note as a surface card with an id-card mark, not loose grey
                type — it's the reassurance that carries the ID number, so it has to read as a block.
                The copy deliberately DIVERGES from the mock on one point (D-38, owner instruction
                2026-08-22): the mock names the verification partner; the app must not — the check
                reads as Lynia's own everywhere, with the third-party-processor disclosure carried by
                the privacy policy instead. Everything else stays the mock's wording. The test-build
                variant stays app-authored because the mock has no test build to draw. */}
            <Card style={{ backgroundColor: tokens.color.surface, borderColor: "transparent" }}>
              <View style={{ flexDirection: "row", gap: tokens.space.sm }}>
                <Icon name="id-card" size={18} color={tokens.color.accentText} style={{ marginTop: 1 }} />
                <Text style={{ flex: 1, fontSize: 13, color: tokens.color.muted, lineHeight: 20 }}>
                  {isTestBuild()
                    ? "Test build: ID verification is bypassed — submit and you'll be verified straight away so you can go online."
                    : "We verify your national ID with an ID photo and a quick selfie check. We store your ID number, bike reg and photo to keep deliveries safe; we don't share them with customers."}
                </Text>
              </View>
            </Card>
            <Button label="Submit for verification" onPress={submit} loading={busy} disabled={!canSubmit} />
          </>
        )}
      </ScrollView>
      {/* Presents the in-app ID-check sheet when submit's runKycVerification launches (src/kyc). */}
      <KycCheckHost />
    </Screen>
  );
}
