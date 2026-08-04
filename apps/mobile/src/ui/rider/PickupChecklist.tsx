import { tokens } from "@lynia/shared";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { attachPickupPhoto } from "../../api/orders";
import { requestPickupPhotoUpload, uploadImage } from "../../api/uploads";
import { downscaleForUpload, type UploadImageSource } from "../../logic/image-downscale";
import { clearPickupPhotoDraft, loadPickupPhotoDraft, savePickupPhotoDraft } from "../../logic/pickup-photo-draft";
import { Button, Card, Icon, Sub } from "../index";

/* Pickup item verification — between "arrived at pickup" and "collected", the rider ticks the
   sender's items against what's physically in hand. The collect CTA counts them and confirms
   (extracted verbatim from app/rider/job.tsx).

   Also hosts the OPTIONAL proof-of-pickup photo (§5c "Mark collected (+ pickup photo)"): capture →
   downscale (image-downscale.ts) → signed PUT → attach to the order. Self-contained (own capture/
   upload state) so job.tsx only passes `orderId`; strictly optional — no photo state ever disables
   or delays "Confirm collected". */
export function PickupChecklist({
  items,
  checkedItems,
  collectedCount,
  pending,
  onToggle,
  onConfirm,
  orderId,
  onCantCollect,
}: {
  items: { description: string; quantity: number }[];
  checkedItems: ReadonlySet<number>;
  collectedCount: number;
  pending: boolean | "queued";
  onToggle: (index: number) => void;
  onConfirm: () => void;
  /** When present, the optional §5c pickup-photo affordance is shown (absent = old call sites/tests
   *  render the checklist exactly as before). */
  orderId?: string | null;
  // JOURNEY-BUGS: at zero items ticked, the confirm button was the only control here — a soft dead
  // end with no explanation and no path forward for the rider who genuinely can't find the parcel
  // (sender's a no-show, wrong address, package already gone). Reuses the existing pre-pickup bail
  // flow (job.tsx's "Cancel job") — nothing new to build, just a discoverable way there from HERE,
  // where the rider is actually stuck, instead of requiring them to notice an unrelated button below.
  onCantCollect?: () => void;
}): React.ReactElement {
  // Local uri of the successfully-attached photo (the preview); null until one lands.
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  // The ORIGINAL capture that failed to upload/attach, so "Try again" re-PUTs the same asset instead
  // of forcing a re-shoot — same pattern as become.tsx's KYC retry (the everyday failure on this
  // market's links is the upload, not the capture).
  const [failedPhoto, setFailedPhoto] = useState<UploadImageSource | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  // C-O7 (LC-C09): on mount, restore a photo capture that never finished uploading/attaching before
  // the app was killed — same asset, offered as a one-tap resume instead of forcing a fresh camera
  // shot. Only restores if the draft belongs to THIS order (a stale draft from a prior job is ignored
  // and gets overwritten by the next capture here, same as the sibling pickup-checklist-draft.ts).
  useEffect(() => {
    if (!orderId) return;
    let alive = true;
    void loadPickupPhotoDraft().then((d) => {
      if (alive && d && d.orderId === orderId) {
        setFailedPhoto({ uri: d.uri, width: d.width, height: d.height, contentType: d.contentType });
        setPhotoError("We didn't confirm your last photo uploaded — tap to finish adding it.");
      }
    });
    return () => {
      alive = false;
    };
  }, [orderId]);

  // Capture → downscale → signed PUT → attach. Every failure lands in the calm inline state below —
  // never a blocking alert, and never any effect on the collect CTA.
  const uploadPhoto = async (asset: UploadImageSource): Promise<void> => {
    if (!orderId) return;
    setPhotoBusy(true);
    setPhotoError(null);
    // C-O7 (LC-C09): persist the captured asset BEFORE the network chain fires (mirrors C-O5's
    // "write the marker before the request" pattern) — an app kill anywhere in downscale/PUT/attach
    // below then leaves this draft in place for the mount effect above to offer a resume, instead of
    // silently losing all memory that a capture was ever attempted.
    void savePickupPhotoDraft({ orderId, uri: asset.uri, width: asset.width, height: asset.height, contentType: asset.contentType });
    try {
      const prepared = await downscaleForUpload(asset);
      const { uploadUrl, key, headers } = await requestPickupPhotoUpload(prepared.contentType);
      await uploadImage(uploadUrl, prepared.uri, headers ?? { "Content-Type": prepared.contentType });
      await attachPickupPhoto(orderId, key);
      // B-O11: preview the already-downscaled upload asset, not the original 3000-4000px camera
      // capture — this preview stays mounted for the rest of the pickup flow on a 1-2GB device.
      setPhotoUri(prepared.uri);
      setFailedPhoto(null);
      void clearPickupPhotoDraft();
    } catch {
      setFailedPhoto(asset);
      setPhotoError("Couldn't add the photo — you can still collect and continue.");
      // Draft stays (saved above) — a genuinely failed attempt is exactly what "Try again" resumes.
    } finally {
      setPhotoBusy(false);
    }
  };

  const capturePhoto = async (): Promise<void> => {
    setPhotoError(null);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setPhotoError("Camera permission is needed to add a photo — you can still collect without one.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.6 });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    await uploadPhoto({
      uri: asset.uri,
      width: asset.width,
      height: asset.height,
      contentType: asset.mimeType === "image/png" ? "image/png" : "image/jpeg",
    });
  };

  return (
    <Card style={{ borderColor: tokens.color.accent }}>
      <Text style={{ fontSize: tokens.font.size.bodyLg, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, marginBottom: 2 }}>Confirm pickup</Text>
      <Sub>Tick each item against the sender&apos;s list before you ride off.</Sub>
      <View style={{ gap: tokens.space.sm }}>
        {items.map((it, i) => {
          const on = checkedItems.has(i);
          return (
            <Pressable
              key={i}
              onPress={() => onToggle(i)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${it.quantity} ${it.description}`}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: tokens.space.md,
                minHeight: tokens.touchTargetMin,
                paddingHorizontal: tokens.space.md,
                paddingVertical: tokens.space.sm,
                borderRadius: tokens.radius.input,
                backgroundColor: on ? tokens.color.accentWash : tokens.color.surface,
                borderWidth: 1,
                borderColor: on ? "transparent" : tokens.color.line,
              }}
            >
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 7,
                  // Bright accent as a non-text fill (the tick box); white check glyph on it.
                  backgroundColor: on ? tokens.color.accent : tokens.color.bg,
                  borderWidth: on ? 0 : 1.5,
                  borderColor: tokens.color.line,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {on ? <Icon name="check" size={15} color={tokens.color.onAccent} /> : null}
              </View>
              <Text style={{ flex: 1, fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink }}>{it.description}</Text>
              <Text style={{ fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.bold, color: tokens.color.muted, fontVariant: ["tabular-nums"] }}>{it.quantity}×</Text>
            </Pressable>
          );
        })}
      </View>
      {orderId ? (
        <View style={{ marginTop: tokens.space.sm }}>
          {photoUri ? (
            <>
              <Image
                source={{ uri: photoUri }}
                accessibilityLabel="Your photo of the parcel"
                style={{ width: "100%", height: 140, borderRadius: tokens.radius.input, marginBottom: tokens.space.sm, backgroundColor: tokens.color.surface }}
              />
              <Text style={{ fontSize: 12, color: tokens.color.accentText, fontWeight: "600", marginBottom: 4 }}>
                Photo added ✓ — the sender can see it
              </Text>
            </>
          ) : null}
          <Button
            label={photoBusy ? "Adding photo…" : photoUri ? "Retake parcel photo" : "Add a photo of the parcel (optional)"}
            variant="ghost"
            onPress={() => void capturePhoto()}
            loading={photoBusy}
          />
          {photoError ? (
            <Text style={{ fontSize: tokens.font.size.caption, color: tokens.color.muted, lineHeight: 18, marginBottom: 4 }}>{photoError}</Text>
          ) : null}
          {failedPhoto && !photoBusy ? (
            <Button label="Try the photo again" variant="ghost" onPress={() => void uploadPhoto(failedPhoto)} />
          ) : null}
        </View>
      ) : null}
      <View style={{ flexDirection: "row", gap: tokens.space.sm, padding: tokens.space.sm, borderRadius: tokens.radius.input, backgroundColor: tokens.color.surface, marginTop: tokens.space.sm }}>
        <Icon name="triangle-alert" size={15} color={tokens.color.muted} />
        <Text style={{ flex: 1, fontSize: tokens.font.size.caption, color: tokens.color.muted, lineHeight: 18 }}>
          Only confirm what you actually have. The recipient still verifies delivery with the 6-digit code.
        </Text>
      </View>
      <Button
        label={`Confirm ${collectedCount} item${collectedCount === 1 ? "" : "s"} collected`}
        onPress={onConfirm}
        loading={pending}
        disabled={checkedItems.size === 0}
      />
      {checkedItems.size === 0 && onCantCollect ? (
        <Pressable
          onPress={onCantCollect}
          accessibilityRole="button"
          style={{ minHeight: tokens.touchTargetMin, alignItems: "center", justifyContent: "center", marginTop: tokens.space.xs }}
        >
          <Text style={{ fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.semibold, color: tokens.color.muted, textDecorationLine: "underline" }}>
            Can&apos;t find the parcel? Cancel this job
          </Text>
        </Pressable>
      ) : null}
    </Card>
  );
}
