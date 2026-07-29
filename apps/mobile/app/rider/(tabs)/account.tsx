import { tokens } from "@lynia/shared";
import { useRouter } from "expo-router";
import React from "react";
import { View } from "react-native";
import { AppScreen, Button, Card, Heading, Sub } from "../../../src/ui";

/**
 * Account tab (plan §5 B1 shell). Carries the rider-specific entries the old board's inline header
 * row used to hold ("Trips", "Rider setup") now that the board root itself is BrandHeader + tab
 * bar, plus the shared profile/settings screen (`/profile` already branches on `isRider`). "Back to
 * customer" stays on the Jobs tab, where the online/active-job state it depends on already lives.
 */
export default function RiderAccountTabScreen(): React.ReactElement {
  const router = useRouter();
  return (
    <AppScreen>
      <View style={{ flex: 1, padding: tokens.space.screen }}>
        <Heading>Account</Heading>
        <Sub>Your rider setup, trips and profile.</Sub>
        <Card>
          <Button label="Rider setup & documents" onPress={() => router.push("/rider/become")} />
          <Button label="Trip history" variant="ghost" onPress={() => router.push("/history")} />
          <Button label="Profile & settings" variant="ghost" onPress={() => router.push("/profile")} />
        </Card>
      </View>
    </AppScreen>
  );
}
