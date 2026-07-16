import { type UndeliveredReason, tokens } from "@lynia/shared";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { uploadDeliveryProof } from "../../logic/delivery-proof";
import { UNDELIVERED_OPTIONS } from "../../logic/rider-job";
import { Button, Card, Icon, Sub } from "../index";

// R1: the post-pickup "can't complete delivery" reason picker — commits the terminal `undelivered`
// state and frees the rider for the next job (extracted verbatim from app/rider/job.tsx).
//
// Two-step: picking a reason row doesn't fire the mutation immediately — it opens a confirm step
// first. Post-pickup (parcel already in hand) this is a more consequential, less reversible action
// than the pre-pickup cancel (BailSheet), which already gets an explicit confirm; a bare one-tap row
// here had LESS friction than the recoverable flow, not more.
export function UndeliveredSheet({
  orderId,
  canAttachProof = false,
  pending,
  onSelect,
  onDismiss,
}: {
  // KB-POD-DISPUTE Phase A: needed to attach optional proof-of-drop evidence. Optional so any caller that
  // hasn't wired it yet simply doesn't show the capture control (the reason picker is unchanged).
  orderId?: string;
  // Only offer the proof-of-drop control when the order is actually AT the drop-off (en_route_dropoff) —
  // the undelivered sheet also opens at `picked_up`, but the API proof window is en_route_dropoff/
  // undelivered, so showing the button earlier would present a control that 409s. Proof-of-*drop* is
  // meaningless before the rider reaches the recipient anyway.
  canAttachProof?: boolean;
  pending: boolean;
  onSelect: (reason: UndeliveredReason) => void;
  onDismiss: () => void;
}): React.ReactElement {
  const [picked, setPicked] = useState<UndeliveredReason | null>(null);
  const pickedOption = UNDELIVERED_OPTIONS.find((o) => o.reason === picked);

  // KB-POD-DISPUTE Phase A: optional proof-of-drop capture. Every failure lands in a calm inline state —
  // never a blocking alert, and never any effect on the "end the job" CTA (the photo is strictly optional).
  const [proofBusy, setProofBusy] = useState(false);
  const [proofDone, setProofDone] = useState(false);
  const [proofError, setProofError] = useState<string | null>(null);

  const captureProof = async (): Promise<void> => {
    if (!orderId) return;
    setProofError(null);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setProofError("Camera permission is needed to add proof — you can still end the job without one.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.6 });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    setProofBusy(true);
    try {
      // Best-effort GPS — a denied/failed fix must never block the photo evidence.
      let coords: { lat: number; lng: number } | undefined;
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        coords = { lat: loc.coords.latitude, lng: loc.coords.longitude };
      } catch {
        coords = undefined;
      }
      await uploadDeliveryProof(
        orderId,
        {
          uri: asset.uri,
          width: asset.width,
          height: asset.height,
          contentType: asset.mimeType === "image/png" ? "image/png" : "image/jpeg",
        },
        coords,
      );
      setProofDone(true);
    } catch {
      setProofError("Couldn't add the proof photo — you can still end the job.");
    } finally {
      setProofBusy(false);
    }
  };

  if (pickedOption) {
    return (
      <Card style={{ borderColor: tokens.color.line }}>
        <Text style={{ fontWeight: "700", marginBottom: 2 }}>End this job?</Text>
        <Sub>
          You picked &ldquo;{pickedOption.label}&rdquo; — this ends the job and frees you for the next one. The
          parcel stays with you; the customer is told the hand-off couldn&apos;t be completed.
        </Sub>
        {orderId && canAttachProof ? (
          proofDone ? (
            <Sub>✓ Proof photo added — it&apos;ll help our team if this delivery is disputed.</Sub>
          ) : (
            <>
              <Button
                label={proofBusy ? "Adding proof…" : "Add proof photo (optional)"}
                variant="ghost"
                onPress={() => void captureProof()}
                loading={proofBusy}
                disabled={pending || proofBusy}
              />
              {proofError ? <Sub>{proofError}</Sub> : null}
            </>
          )
        ) : null}
        <Button label="Confirm — end the job" onPress={() => onSelect(pickedOption.reason)} loading={pending} />
        <Button label="Choose a different reason" variant="ghost" onPress={() => setPicked(null)} disabled={pending} />
      </Card>
    );
  }

  return (
    <Card style={{ borderColor: tokens.color.line }}>
      <Text style={{ fontWeight: "700", marginBottom: 2 }}>Can&apos;t complete this delivery?</Text>
      <Sub>Pick the reason — this ends the job, so only use it if the hand-off truly can&apos;t happen.</Sub>
      <View style={{ gap: tokens.space.sm, marginTop: tokens.space.sm }}>
        {UNDELIVERED_OPTIONS.map((o) => (
          <Pressable
            key={o.reason}
            onPress={() => setPicked(o.reason)}
            disabled={pending}
            accessibilityRole="button"
            accessibilityLabel={o.label}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: tokens.space.md,
              minHeight: tokens.touchTargetMin,
              paddingHorizontal: tokens.space.md,
              paddingVertical: tokens.space.sm,
              borderRadius: tokens.radius.input,
              borderWidth: 1,
              borderColor: tokens.color.line,
              backgroundColor: tokens.color.surface,
              opacity: pending ? 0.6 : 1,
            }}
          >
            <Icon name={o.icon} size={16} color={tokens.color.muted} />
            <Text style={{ flex: 1, fontSize: tokens.font.size.body, color: tokens.color.ink }}>{o.label}</Text>
          </Pressable>
        ))}
      </View>
      <Button label="Never mind" variant="ghost" onPress={onDismiss} disabled={pending} />
    </Card>
  );
}
