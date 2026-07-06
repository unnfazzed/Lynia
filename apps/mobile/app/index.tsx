import { tokens } from "@lynia/shared";
import { Redirect } from "expo-router";
import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useAuth } from "../src/auth/auth-context";
import { loadOnboardingSeen, loadRolePreference, type StartRole } from "../src/auth/session";
import { DoveMark } from "../src/ui/Brand";

export default function Index(): React.ReactElement {
  const { session, loading } = useAuth();
  // First-install onboarding (customer/rider 0·2) shows once, before auth. `null` = still reading the
  // flag; fold that into the splash below so we never flash the wrong screen on a cold start.
  const [onboardingSeen, setOnboardingSeen] = useState<boolean | null>(null);
  // The saved role fork (customer|rider), so a returning rider cold-boots into /rider instead of the
  // customer compose screen. `undefined` = still reading; hold the splash so we don't flash /home.
  const [rolePref, setRolePref] = useState<StartRole | null | undefined>(undefined);
  useEffect(() => {
    void loadOnboardingSeen().then(setOnboardingSeen);
    void loadRolePreference().then(setRolePref);
  }, []);

  if (loading || onboardingSeen === null || rolePref === undefined) {
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
  // A brand-new user (no session, onboarding not yet seen) meets the carousel first; it saves the flag
  // and hands off to /phone once done or skipped.
  if (!session && !onboardingSeen) return <Redirect href="/onboarding" />;
  if (!session) return <Redirect href="/phone" />;
  // A signed-in user with the rider role saved goes straight to their rider home — mirrors verify.tsx's
  // post-OTP routing so a warm relaunch doesn't dump a rider onto the customer compose screen (R3).
  return <Redirect href={rolePref === "rider" ? "/rider" : "/home"} />;
}
