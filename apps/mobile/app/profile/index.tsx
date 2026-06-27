import { tokens } from "@lynia/shared";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { getMe } from "../../src/api/auth";
import { useAuth } from "../../src/auth/auth-context";
import { Button, Card, Heading, Screen, Sub } from "../../src/ui";

function KycBadge({ status }: { status: "pending" | "verified" | "failed" }): React.ReactElement {
  const color = status === "verified" ? tokens.color.accent : status === "failed" ? tokens.color.danger : tokens.color.muted;
  return (
    <View style={{ alignSelf: "flex-start", borderRadius: 6, paddingHorizontal: 9, paddingVertical: 3, backgroundColor: tokens.color.surface, marginTop: 4 }}>
      <Text style={{ fontSize: 11, fontWeight: "800", color }}>
        {status === "verified" ? "Verified rider" : status === "failed" ? "Verification failed" : "Verification pending"}
      </Text>
    </View>
  );
}

export default function ProfileScreen(): React.ReactElement {
  const router = useRouter();
  const { session, signOut } = useAuth();
  const meQ = useQuery({ queryKey: ["me"], queryFn: getMe });
  const me = meQ.data;
  const role = me?.role ?? session?.role ?? "customer";
  const isRider = role === "rider";

  return (
    <Screen>
      <Heading>Account</Heading>
      <Sub>Your details and session.</Sub>

      {meQ.isLoading ? (
        <ActivityIndicator />
      ) : (
        <Card>
          <Text style={{ fontSize: 18, fontWeight: "800", color: tokens.color.ink }}>
            {me ? `${me.firstName} ${me.lastName}`.trim() || "Your account" : "Your account"}
          </Text>
          {me?.phone ? <Text style={{ fontSize: 13, color: tokens.color.muted, marginTop: 2 }}>{me.phone}</Text> : null}
          <Text style={{ fontSize: 13, color: tokens.color.muted, marginTop: 2, textTransform: "capitalize" }}>{role}</Text>
          {me?.rider ? (
            <>
              <Text style={{ fontSize: 13, color: tokens.color.muted, marginTop: 6 }}>
                Bike {me.rider.bikeReg} · ★ {me.rider.ratingCount > 0 ? me.rider.ratingAvg.toFixed(1) : "new"} · {me.rider.tripsCount} trips
              </Text>
              <KycBadge status={me.rider.kycStatus} />
            </>
          ) : null}
          {/* Editing name, phone and language needs a write endpoint (next PR) — kept honest. */}
          <Text style={{ fontSize: 12, color: tokens.color.muted, marginTop: 8 }}>Editing your details is coming soon.</Text>
        </Card>
      )}

      <Card>
        <Button label="Trip history" onPress={() => router.push("/history")} />
        {isRider ? <Button label="Earnings" variant="ghost" onPress={() => router.push("/earnings")} /> : null}
        <Button label="Send a parcel" variant="ghost" onPress={() => router.replace("/home")} />
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
