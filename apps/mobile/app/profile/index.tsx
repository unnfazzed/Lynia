import { tokens } from "@lynia/shared";
import { useRouter } from "expo-router";
import React from "react";
import { Text } from "react-native";
import { useAuth } from "../../src/auth/auth-context";
import { Button, Card, Heading, Screen, Sub } from "../../src/ui";

export default function ProfileScreen(): React.ReactElement {
  const router = useRouter();
  const { session, signOut } = useAuth();
  const role = session?.role ?? "customer";
  const isRider = role === "rider";

  return (
    <Screen>
      <Heading>Account</Heading>
      <Sub>Manage your role and session.</Sub>

      <Card>
        <Text style={{ fontSize: 13, color: tokens.color.muted }}>Signed in as</Text>
        <Text style={{ fontSize: 18, fontWeight: "800", color: tokens.color.ink, marginTop: 2, textTransform: "capitalize" }}>{role}</Text>
        {/* Editing name, phone and language needs the profile-read endpoint (next backend PR) — kept honest. */}
        <Text style={{ fontSize: 12, color: tokens.color.muted, marginTop: 6 }}>Editing your name, phone and language is coming soon.</Text>
      </Card>

      <Card>
        <Button label="Send a parcel" onPress={() => router.replace("/home")} />
        <Button
          label={isRider ? "Rider dashboard" : "Become a rider"}
          variant="ghost"
          onPress={() => router.push(isRider ? "/rider" : "/rider/become")}
        />
      </Card>

      <Button label="Sign out" variant="ghost" onPress={() => void signOut()} />
      <Button label="Back" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
