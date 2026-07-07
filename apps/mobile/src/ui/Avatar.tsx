import { tokens } from "@lynia/shared";
import React, { useState } from "react";
import { Image, Text, View } from "react-native";
import { avatarTint, initials } from "../logic/avatar";

/**
 * A rider/sender avatar for the bid + counter cards. Shows the profile PHOTO when one exists (the KYC
 * flow captures one — `photoUrl` rides on the offer payload), else a deterministic INITIALS monogram in
 * a stable muted tint. The monogram-first fallback keeps this data-light: a card with no photo costs
 * zero network, and a failed image load degrades back to the monogram instead of a broken-image box.
 *
 * Decorative by default (`accessibilityElementsHidden`) — the rider's name sits right beside it, so the
 * avatar would only add noise to a screen reader.
 */
export function Avatar({
  photoUrl,
  firstName,
  lastName,
  seed,
  size = 42,
}: {
  photoUrl?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  /** Stable colour seed (profileId preferred) so one person keeps one tint. Falls back to the name. */
  seed?: string;
  size?: number;
}): React.ReactElement {
  const [failed, setFailed] = useState(false);
  const showPhoto = !!photoUrl && !failed;
  const radius = size / 2;

  if (showPhoto) {
    return (
      <Image
        source={{ uri: photoUrl! }}
        onError={() => setFailed(true)}
        accessibilityElementsHidden
        importantForAccessibility="no"
        style={{ width: size, height: size, borderRadius: radius, backgroundColor: tokens.color.surface }}
      />
    );
  }

  const tint = avatarTint(seed || `${firstName ?? ""} ${lastName ?? ""}`);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={{ width: size, height: size, borderRadius: radius, backgroundColor: tint, alignItems: "center", justifyContent: "center" }}
    >
      <Text style={{ fontSize: size * 0.4, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>
        {initials(firstName, lastName)}
      </Text>
    </View>
  );
}
