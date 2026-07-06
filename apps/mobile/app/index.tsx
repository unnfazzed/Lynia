import { tokens } from "@lynia/shared";
import { Redirect } from "expo-router";
import React from "react";
import { Text, View } from "react-native";
import { useAuth } from "../src/auth/auth-context";
import { DoveMark } from "../src/ui/Brand";

export default function Index(): React.ReactElement {
  const { session, loading } = useAuth();
  if (loading) {
    // Pre-auth boot IS the splash (customer/rider 0·1): the brand-green dove moment, not a spinner
    // (skeletons need a screen shape we don't have yet, and the DS bans bare page-level spinners).
    // White dove + white wordmark on the accent green, matching the journey-map splash tile.
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: tokens.space.lg, backgroundColor: tokens.color.accent }}>
        <DoveMark size={104} on="green" />
        <Text style={{ fontSize: 32, fontWeight: "700", color: tokens.color.onAccent, letterSpacing: -0.5 }}>LyniaGo</Text>
      </View>
    );
  }
  return <Redirect href={session ? "/home" : "/phone"} />;
}
