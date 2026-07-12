import { tokens } from "@lynia/shared";
import React from "react";
import { Image, Text } from "react-native";
import { Card } from "../index";

/**
 * §5c "parcel is with your rider — photo attached": the customer-side card showing the rider's
 * optional proof-of-pickup photo. `url` is the snapshot's `pickupPhotoUrl` (a short-lived signed
 * read URL minted server-side per fetch, so it's always fresh on a poll). Renders nothing when no
 * photo was attached — old orders, photo-less pickups and an older API cost zero pixels — which
 * lets the tracker mount it unconditionally with a single line. Extracted like ReceiptCard so the
 * (busy) tracker JSX stays readable.
 */
export function PickupPhoto({ url }: { url?: string | null }): React.ReactElement | null {
  if (!url) return null;
  return (
    <Card>
      <Text style={{ fontSize: tokens.font.size.bodyLg, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>
        Parcel photo from your rider
      </Text>
      <Text style={{ fontSize: tokens.font.size.caption, color: tokens.color.muted, lineHeight: 18, marginTop: 2 }}>
        Taken at pickup — your parcel is with the rider.
      </Text>
      <Image
        source={{ uri: url }}
        accessibilityLabel="Photo of your parcel, taken by the rider at pickup"
        resizeMode="cover"
        // Fixed card-image height (like become.tsx's preview); surface behind it while it loads
        // over slow data instead of a white hole.
        style={{ width: "100%", height: 160, borderRadius: tokens.radius.input, marginTop: tokens.space.sm, backgroundColor: tokens.color.surface }}
      />
    </Card>
  );
}
