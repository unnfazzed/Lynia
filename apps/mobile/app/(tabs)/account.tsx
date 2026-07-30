import { tokens } from "@lynia/shared";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { Text, View } from "react-native";
import { getMe } from "../../src/api/auth";
import { useAuth } from "../../src/auth/auth-context";
import { AppScreen, Button, Card, Heading, SkeletonList, Sub } from "../../src/ui";

// Custom pill (not StatusPill) only because the failed state needs danger, which the shared tones
// deliberately exclude — but it follows the DS pill spec: full radius, 12px/600, wash backgrounds.
// Mirrors `app/profile/index.tsx`'s own `KycBadge` (kept as an independent copy, not a shared
// import — see this file's header note on why the two screens don't share their query/render code).
function KycBadge({ status }: { status: "pending" | "verified" | "failed" | "expired" }): React.ReactElement {
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

/**
 * Account tab (plan §5 A3) — absorbs `app/profile/`'s content directly instead of bridging out to
 * it: the details card plus the notifications/settings/help entry points, right on the tab. Trip
 * history is dropped from this button list since the Orders tab now IS that screen. The standalone
 * `/profile` route is left running unchanged — `app/rider/(tabs)/account.tsx` (Lane B, out of this
 * lane's scope) still bridges to it for a rider's own account edit — so this screen owns its own
 * copy of the query/render rather than reaching into that route's internals.
 */
export default function AccountTabScreen(): React.ReactElement {
  const router = useRouter();
  const { session, signOut } = useAuth();
  const meQ = useQuery({ queryKey: ["me"], queryFn: getMe });
  const me = meQ.data;
  const role = me?.role ?? session?.role ?? "customer";
  const isRider = role === "rider";

  return (
    <AppScreen>
      <View style={{ flex: 1, padding: tokens.space.screen }}>
        <Heading>Account</Heading>
        <Sub>Your details and session.</Sub>

        {meQ.isLoading ? (
          <SkeletonList count={2} />
        ) : meQ.isError ? (
          <Card>
            <Text style={{ fontSize: 14, color: tokens.color.ink }}>Couldn&apos;t load your details.</Text>
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
            <Text style={{ fontSize: 12, color: tokens.color.muted, marginTop: 8 }}>Editing your details is coming soon.</Text>
          </Card>
        )}

        <Card>
          <Button label="Notifications" onPress={() => router.push("/notifications")} />
          {isRider ? <Button label="Bike & documents" variant="ghost" onPress={() => router.push("/rider/documents")} /> : null}
          <Button label="Send a parcel" variant="ghost" onPress={() => router.push("/send")} />
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
      </View>
    </AppScreen>
  );
}
