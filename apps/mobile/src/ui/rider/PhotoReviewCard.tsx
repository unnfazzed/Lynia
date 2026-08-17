import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { Image, Text, View } from "react-native";
import { Button, Card, Icon, Sub } from "../index";

/**
 * `photo_capture` (the guidance half) + `photo_preview` (kit
 * `explorations/journey/rider-screens-safety.jsx` — `PhotoCapture` / `PhotoPreview`): the review beat
 * between capturing an ID photo and committing it.
 *
 * WHAT ISN'T HERE, AND WHY. The kit's `photo_capture` is a full-bleed in-app camera: dark screen,
 * dashed ID-card frame, custom shutter. That needs `expo-camera`, which this app does not depend on —
 * so the live frame is deliberately NOT built (adding a native module for a framing overlay is not a
 * change to make quietly). The two things that frame was actually FOR both survive without it:
 *   - its instructions ("names and numbers readable · no glare · all four corners in") become
 *     {@link PhotoCaptureGuide}, shown before the OS camera opens, which is where a rider can still
 *     act on them; and
 *   - the review step below, which is the part that catches a bad photo either way — and which the OS
 *     picker's own "Retake/Use Photo" does NOT replace, because that prompt asks "is this the photo you
 *     meant?", not "can a verifier read the ID number in it?".
 *
 * The review is genuinely load-bearing: before this, the picker's result went straight to upload, so a
 * glared or blurred ID was only caught days later by a failed KYC check.
 */
export function PhotoReviewCard({
  uri,
  onUse,
  onRetake,
  busy,
  hasExistingPhoto,
}: {
  /** The just-captured/picked asset. Full-resolution — it is on screen only for this step. */
  uri: string;
  onUse: () => void;
  onRetake: () => void;
  busy?: boolean;
  /** Whether a good photo is already saved — changes what "Retake" costs the rider. */
  hasExistingPhoto?: boolean;
}): React.ReactElement {
  return (
    <Card>
      <Text style={{ fontSize: tokens.font.size.title, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, marginBottom: tokens.space.sm }}>
        Check your photo
      </Text>
      <Image
        source={{ uri }}
        accessibilityLabel="The ID photo you just took"
        resizeMode="cover"
        style={{
          width: "100%",
          height: 200,
          borderRadius: tokens.radius.input,
          borderWidth: 1,
          borderColor: tokens.color.line,
          backgroundColor: tokens.color.surface,
          marginBottom: tokens.space.md,
        }}
      />
      <Text style={{ fontSize: tokens.font.size.bodyLg, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, marginBottom: 2 }}>
        Can you read everything?
      </Text>
      <Sub>Check the names, ID number and photo are sharp — glare or blur is the top reason checks fail.</Sub>
      <Button label="Use this photo" onPress={onUse} loading={busy} />
      <Button label="Retake" variant="ghost" onPress={onRetake} disabled={!!busy} />
      {hasExistingPhoto ? (
        <Text style={{ fontSize: 11.5, color: tokens.color.muted, textAlign: "center", marginTop: 4, lineHeight: 17 }}>
          Retaking keeps your current photo until the new one is saved.
        </Text>
      ) : null}
    </Card>
  );
}

/**
 * The surviving, actionable half of the kit's `photo_capture` overlay: what makes an ID photo pass,
 * said BEFORE the OS camera opens (there's no in-app frame to say it inside — see above).
 */
export function PhotoCaptureGuide(): React.ReactElement {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: tokens.space.sm,
        padding: tokens.space.md,
        borderRadius: tokens.radius.input,
        backgroundColor: tokens.color.surface,
        marginBottom: tokens.space.sm,
      }}
    >
      <Icon name="id-card" size={16} color={tokens.color.accentText} style={{ marginTop: 1 }} />
      <Text style={{ flex: 1, fontSize: 12.5, color: tokens.color.muted, lineHeight: 18 }}>
        Photo page of your ID, all four corners in frame. Names and numbers readable, no glare — you&apos;ll get to check it
        before it&apos;s sent.
      </Text>
    </View>
  );
}
