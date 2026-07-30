import { tokens } from "@lynia/shared";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { Text, View } from "react-native";
import { getMe } from "../../src/api/auth";
import { useAuth } from "../../src/auth/auth-context";
import { Button, Card, Heading, Screen, SkeletonList, Sub } from "../../src/ui";

// Custom pill (not StatusPill) only because the failed state needs danger, which the shared tones
// deliberately exclude — but it follows the DS pill spec: full radius, 12px/600, wash backgrounds.
function KycBadge({ status }: { status: "pending" | "verified" | "failed" | "expired" }): React.ReactElement {
  // Expired reads like failed (danger) — the rider isn't currently ridable and must act — but with its
  // own "ID expired" label so it's not mistaken for a first-time verification failure.
  const bad = status === "failed" || status === "expired";
  const color = status === "verified" ? tokens.color.accentText : bad ? tokens.color.danger : tokens.color.muted;
  const bg = status === "verified" ? tokens.color.accentWash : tokens.color.surface;
  const label =
    status === "verified"
      ? "Verified rider"
      : status === "expired"
        ? "ID expired"
        : status === "failed"
          ? "Verification failed"
          : "Verification pending";
  return (
    <View style={{ alignSelf: "flex-start", borderRadius: tokens.radius.pill, borderWidth: 1, borderColor: tokens.color.line, paddingHorizontal: tokens.space.md, paddingVertical: 4, backgroundColor: bg, marginTop: 4 }}>
      <Text style={{ fontSize: 12, fontWeight: "600", color }}>{label}</Text>
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
        <SkeletonList count={2} />
      ) : meQ.isError ? (
        <Card>
          <Text style={{ fontSize: 14, color: tokens.color.ink }}>Couldn't load your details.</Text>
          <Button label="Retry" variant="ghost" onPress={() => void meQ.refetch()} />
        </Card>
      ) : (
        <Card>
          <Text style={{ fontSize: 18, fontWeight: "700", color: tokens.color.ink }}>
            {me ? `${me.firstName} ${me.lastName}`.trim() || "Your account" : "Your account"}
          </Text>
          {me?.phone ? <Text style={{ fontSize: 14, color: tokens.color.muted, marginTop: 2, fontVariant: ["tabular-nums"] }}>{me.phone}</Text> : null}
          <Text style={{ fontSize: 14, color: tokens.color.muted, marginTop: 2 }}>{role === "rider" ? "Rider" : "Customer"}</Text>
          {me?.rider ? (
            <>
              <Text style={{ fontSize: 14, color: tokens.color.muted, marginTop: 6, fontVariant: ["tabular-nums"] }}>
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
        <Button label="Notifications" variant="ghost" onPress={() => router.push("/notifications")} />
        {/* B3: retired — Money is now a rider tab (Jobs · Money · Account), reachable directly from
            the tab bar without this shortcut (mirrors the tab bar itself not duplicating Account). */}
        {isRider ? <Button label="Bike & documents" variant="ghost" onPress={() => router.push("/rider/documents")} /> : null}
        <Button label="Send a parcel" variant="ghost" onPress={() => router.replace("/send")} />
        <Button
          label={isRider ? "Rider dashboard" : "Become a rider"}
          variant="ghost"
          onPress={() => router.push(isRider ? "/rider" : "/rider/become")}
        />
      </Card>

      <Card>
        <Button label="Settings" variant="ghost" onPress={() => router.push("/settings")} />
        <Button label="Help & support" variant="ghost" onPress={() => router.push("/help")} />
      </Card>

      <Button label="Sign out" variant="ghost" onPress={() => void signOut()} />
      <Button label="Back" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
