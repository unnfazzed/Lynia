import { tokens } from "@lynia/shared";
import { Redirect } from "expo-router";
import React from "react";
import { Text, View } from "react-native";
import { useAuth } from "../src/auth/auth-context";
import { BrandLockup } from "../src/ui";

export default function Index(): React.ReactElement {
  const { session, loading } = useAuth();
  if (loading) {
    // Pre-auth boot: a calm brand moment, not a spinner (skeletons need a screen shape we don't
    // have yet, and the DS's loading discipline bans bare page-level spinners).
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: tokens.space.md, backgroundColor: tokens.color.surface }}>
        <BrandLockup size={48} />
        <Text style={{ fontSize: 12, fontWeight: "600", color: tokens.color.muted }}>Loading…</Text>
      </View>
    );
  }
  return <Redirect href={session ? "/home" : "/phone"} />;
}
