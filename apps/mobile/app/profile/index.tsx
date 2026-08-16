import { formatPhoneLocal, tokens } from "@lynia/shared";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { ScrollView, Text } from "react-native";
import { getMe } from "../../src/api/auth";
import { useAuth } from "../../src/auth/auth-context";
import { AppBar, Button, Card, Screen, SkeletonList } from "../../src/ui";
import { AccountIdentityCard, AccountRowList, KycPill, bikeDocsSub, type AccountRow } from "../../src/ui/account/AccountRows";

/**
 * Account details — the screen BOTH account tabs reach by tapping their identity card, so it is the
 * one place customer and rider already shared and the one that most needed harmonising. Same grammar
 * as the two tabs (`docs/DESIGN-DEVIATIONS.md` D-14): AppBar → identity card → one card of
 * `icon · label · sub · chevron` rows.
 *
 * Sign out stays ON this screen as a danger row (it is also on Settings). This screen is the rider's
 * documented route to it — see `app/rider/(tabs)/account.tsx`'s header note, "Profile/settings +
 * sign-out live behind a tap on the identity card" — so the row grammar absorbs the old ghost Button
 * rather than the action being moved away.
 */
export default function ProfileScreen(): React.ReactElement {
  const router = useRouter();
  const { session, signOut } = useAuth();
  const meQ = useQuery({ queryKey: ["me"], queryFn: getMe });
  const me = meQ.data;
  const role = me?.role ?? session?.role ?? "customer";
  const isRider = role === "rider";
  const rider = me?.rider;

  const name = me ? `${me.firstName} ${me.lastName}`.trim() || "Your account" : "Your account";
  const identityLine = [me?.phone ? formatPhoneLocal(me.phone) : "", isRider ? "Rider" : "Customer"].filter(Boolean).join(" · ");

  const rows: AccountRow[] = [
    { icon: "history", label: "Trip history", sub: "Every parcel you've sent or delivered", onPress: () => router.push("/history") },
    // push, not replace: keep this screen beneath so back returns here, matching every other
    // "Send a parcel" entry point.
    { icon: "package", label: "Send a parcel", sub: "Book a rider to collect it", onPress: () => router.push("/send") },
    { icon: "bell", label: "Notifications", sub: "One inbox for both services", onPress: () => router.push("/notifications") },
    ...(isRider
      ? ([{ icon: "id-card", label: "Bike & documents", sub: bikeDocsSub(rider?.kycStatus, rider?.bikeReg), onPress: () => router.push("/rider/documents") }] as AccountRow[])
      : []),
    // B3: Money is a rider TAB (Jobs · Money · Account), reachable from the tab bar — no shortcut here.
    {
      icon: "bike",
      label: isRider ? "Rider dashboard" : "Become a rider",
      sub: isRider ? "Jobs, money and your bike" : "Earn by delivering parcels and food",
      onPress: () => router.push(isRider ? "/rider" : "/rider/become"),
    },
    { icon: "shield", label: "Settings", sub: "Permissions, privacy and sign out", onPress: () => router.push("/settings") },
    { icon: "phone", label: "Help & support", sub: "Call the safety line", onPress: () => router.push("/help") },
    { icon: "x", label: "Sign out", sub: "End this session on this phone", danger: true, onPress: () => void signOut() },
  ];

  return (
    <Screen>
      {/* Kit AppBar (pushed-screen header) — title lives in the bar; no in-body Heading. The old
          "Your details and session" sub is gone: the rider tab's bar draws a bare title, and the
          identity card immediately below says the same thing with real data. */}
      <AppBar title="Account" onBack={() => router.back()} />

      {meQ.isLoading ? (
        <SkeletonList count={1} />
      ) : meQ.isError ? (
        <Card>
          <Text style={{ fontSize: 14, color: tokens.color.ink }}>Couldn&apos;t load your details.</Text>
          <Button label="Retry" variant="ghost" onPress={() => void meQ.refetch()} />
        </Card>
      ) : (
        <AccountIdentityCard name={name} line={identityLine} trailing={rider ? <KycPill status={rider.kycStatus} /> : undefined} />
      )}

      <ScrollView showsVerticalScrollIndicator={false}>
        <AccountRowList rows={rows} />
      </ScrollView>
    </Screen>
  );
}
