import { tokens } from "@lynia/shared";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { AppScreen, Card, Heading, Icon, type IconName, Sub } from "../../../src/ui";

/**
 * Account tab (plan §5 B1 shell). Carries the rider-specific entries the old board's inline header
 * row used to hold ("Trips", "Rider setup") now that the board root itself is BrandHeader + tab
 * bar, plus the shared profile/settings screen (`/profile` already branches on `isRider`). "Back to
 * customer" stays on the Jobs tab, where the online/active-job state it depends on already lives.
 *
 * `rider-one-app.jsx` `account` (RJM A1) draws this as one card of tile rows — icon, label, a
 * sub-line saying what's behind it, chevron — not a stack of ghost buttons; the sub-line is what
 * makes a row self-explanatory before it's tapped.
 */
function AccountRow({
  icon,
  label,
  sub,
  onPress,
  last,
}: {
  icon: IconName;
  label: string;
  sub: string;
  onPress: () => void;
  /** The last row drops the divider — the card edge already closes the list. */
  last?: boolean;
}): React.ReactElement {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${sub}`}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: tokens.space.md,
        minHeight: tokens.touchTargetMin,
        paddingVertical: tokens.space.md,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: tokens.color.line,
      }}
    >
      <Icon name={icon} size={18} color={tokens.color.muted} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 13.5, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink }}>{label}</Text>
        <Text style={{ fontSize: 12, color: tokens.color.muted }}>{sub}</Text>
      </View>
      <Icon name="chevron-right" size={16} color={tokens.color.muted} />
    </Pressable>
  );
}

export default function RiderAccountTabScreen(): React.ReactElement {
  const router = useRouter();
  return (
    <AppScreen>
      <View style={{ flex: 1, padding: tokens.space.screen }}>
        <Heading>Account</Heading>
        <Sub>Your rider setup, trips and profile.</Sub>
        <Card>
          <AccountRow
            icon="id-card"
            label="Rider setup & documents"
            sub="Verify your ID and register your bike."
            onPress={() => router.push("/rider/become")}
          />
          <AccountRow
            icon="history"
            label="Trip history"
            sub="Every parcel you've delivered."
            onPress={() => router.push("/history")}
          />
          <AccountRow
            icon="user"
            label="Profile & settings"
            sub="Your details and session."
            onPress={() => router.push("/profile")}
            last
          />
        </Card>
      </View>
    </AppScreen>
  );
}
