import { tokens } from "@lynia/shared";
import React from "react";
import { Text, View } from "react-native";
import { Avatar } from "./Avatar";

/**
 * The rider mini-profile — avatar + name + "★ rating · N trips (· ETA)" — shown wherever a rider is
 * presented to the customer: the bid card, the counter-offer card header, and the live tracking card.
 * Centralised so the rating format ("new" until rated, trips, optional ETA) and the layout can't drift
 * between the pick screen and the tracker.
 */
export function RiderMini({
  profileId,
  firstName,
  lastName,
  photoUrl,
  ratingAvg,
  ratingCount,
  tripsCount,
  etaMinutes,
}: {
  profileId: string;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  ratingAvg: string;
  ratingCount: number;
  tripsCount: number;
  /** Optional trailing "· ETA N min" — shown on a bid (a rider's offer), omitted on the assigned tracker. */
  etaMinutes?: number;
}): React.ReactElement {
  const rating = ratingCount > 0 ? Number(ratingAvg).toFixed(1) : "new";
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: tokens.space.sm }}>
      <Avatar photoUrl={photoUrl} firstName={firstName} lastName={lastName} seed={profileId} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: tokens.font.size.bodyLg, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>
          {firstName} {lastName}
        </Text>
        <Text style={{ fontSize: tokens.font.size.body, color: tokens.color.muted, fontVariant: ["tabular-nums"] }}>
          ★ {rating} · {tripsCount} trips{etaMinutes != null ? ` · ETA ${etaMinutes} min` : ""}
        </Text>
      </View>
    </View>
  );
}
