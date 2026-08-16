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
 * Account tab — the customer's hub. Structurally HARMONISED with the rider Account tab
 * (`app/rider/(tabs)/account.tsx`, generated from `rider-one-app.jsx :: account`): AppBar → identity
 * card (avatar · name · one identity line · verification pill) → ONE card of `icon · label · sub ·
 * chevron` rows. Owner decision 2026-08-16 — "the account under customer is visually different than
 * the rider account … let's harmonise the design to match the state of the rider account" — logged as
 * `docs/DESIGN-DEVIATIONS.md` D-15, which is what authorises this screen to leave the older static
 * `LJ.profile` mock (Heading + Sub + a stack of full-width Buttons) behind.
 *
 * What that decision changed, and why each is intentional rather than a dropped feature:
 *  - `Heading`/`Sub` → `AppBar title="Account" back={false}`, matching the rider tab exactly.
 *  - the two action Buttons ("Trip history", "Send a parcel") become the first two ROWS — the rider
 *    grammar has no primary buttons on this screen, everything is a self-describing row.
 *  - the standalone "Sign out" Button is gone: it lives on Settings (one row down) and on /profile,
 *    exactly as the rider reaches it. Nothing became unreachable.
 *  - the identity line is `phone · role`, the customer analogue of the rider's
 *    "★ 4.9 · 312 jobs · verified"; the bike/verification detail moved onto the "Bike & documents"
 *    row's sub-line, which is where the rider tab already carries it.
 */
export default function AccountTabScreen(): React.ReactElement {
  const router = useRouter();
  const { session } = useAuth();
  const meQ = useQuery({ queryKey: ["me"], queryFn: getMe });
  const me = meQ.data;
  const role = me?.role ?? session?.role ?? "customer";
  const isRider = role === "rider";
  const rider = me?.rider;

  const name = me ? `${me.firstName} ${me.lastName}`.trim() || "Your account" : "Your account";
  // Mirrors the rider identity line's shape — the facts that identify THIS account, one line, muted.
  const identityLine = [me?.phone ? formatPhoneLocal(me.phone) : "", isRider ? "Rider" : "Customer"].filter(Boolean).join(" · ");

  const rows: AccountRow[] = [
    { icon: "history", label: "Trip history", sub: "Every parcel you've sent or delivered", onPress: () => router.push("/history") },
    { icon: "package", label: "Send a parcel", sub: "Book a rider to collect it", onPress: () => router.push("/send") },
    { icon: "bell", label: "Notifications", sub: "One inbox for both services", onPress: () => router.push("/notifications") },
    ...(isRider
      ? ([{ icon: "id-card", label: "Bike & documents", sub: bikeDocsSub(rider?.kycStatus, rider?.bikeReg), onPress: () => router.push("/rider/documents") }] as AccountRow[])
      : []),
    {
      icon: "bike",
      label: isRider ? "Rider dashboard" : "Become a rider",
      sub: isRider ? "Jobs, money and your bike" : "Earn by delivering parcels and food",
      onPress: () => router.push(isRider ? "/rider" : "/rider/become"),
    },
    // `shield` rather than a settings/cog glyph: the design kit's 38-icon subset has none, and this
    // row's contents ARE permissions, privacy and sign-out — so the shield is honest, not a stand-in.
    { icon: "shield", label: "Settings", sub: "Permissions, privacy and sign out", onPress: () => router.push("/settings") },
    { icon: "phone", label: "Help & support", sub: "Call the safety line", onPress: () => router.push("/help") },
  ];

  return (
    <Screen>
      <AppBar title="Account" back={false} />

      {meQ.isLoading ? (
        <SkeletonList count={1} />
      ) : meQ.isError ? (
        <Card>
          <Text style={{ fontSize: 14, color: tokens.color.ink }}>Couldn&apos;t load your details.</Text>
          <Button label="Retry" variant="ghost" onPress={() => void meQ.refetch()} />
        </Card>
      ) : (
        <AccountIdentityCard
          name={name}
          line={identityLine}
          // Owner decision 2026-08-16: the rider's online/offline slot carries VERIFICATION state here,
          // and stays empty for a plain customer who has nothing to verify.
          trailing={rider ? <KycPill status={rider.kycStatus} /> : undefined}
          onPress={() => router.push("/profile")}
          accessibilityLabel="Your details and session"
        />
      )}

      {/* Scrolls because the customer hub carries more rows than the rider's five and must still fit
          the mandatory 320×640 entry phone. Not a visual element — nothing drawn changes. */}
      <ScrollView showsVerticalScrollIndicator={false}>
        <AccountRowList rows={rows} />
      </ScrollView>
    </Screen>
  );
}
