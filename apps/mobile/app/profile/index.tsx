import { formatPhoneDisplay } from "@lynia/shared";
import { tokens } from "@lynia/shared/tokens";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { ScrollView, Text } from "react-native";
import { getMe } from "../../src/api/auth";
import { useAuth } from "../../src/auth/auth-context";
import { notificationsRowSub, useNotificationsUnreadCount } from "../../src/query/use-notifications-unread";
import { AppBar, Button, Card, Screen, SkeletonList } from "../../src/ui";
import { AccountIdLine, AccountIdentityCard, AccountRowList, KycPill, bikeDocsSub, type AccountRow } from "../../src/ui/account/AccountRows";

/**
 * Account details. Same row grammar as the Account tabs (`docs/DESIGN-DEVIATIONS.md` D-15),
 * role-separated by D-22.
 *
 * **⚠ NO IN-APP ENTRY POINT since D-26** (owner instruction 2026-08-17: *"Remove the edit profile for
 * now.. Don't even put coming soon. Also when I click the profile under accounts it must not be
 * clickable to display another window for both rider and customer sides."*). Both Account tabs' identity
 * cards and Settings' identity card and "Edit profile" row all used to push here; all four routes are
 * gone, so today this screen is reachable only by an explicit `/profile` deep link. It is kept — not
 * deleted — because the instruction was scoped to the taps and said *"for now"*: everything it draws
 * that a user still needs (sign out, notifications, help, settings, and the rider's documents/money)
 * is on Settings or on that side's Account tab, so nothing is stranded behind it in the meantime.
 * `AccountIdLine` (D-23, the unmasked national ID) renders ONLY here, and therefore is not currently
 * rendered anywhere a user can reach — if that display matters, it needs a drawn home, not a tap back.
 *
 * **The side is the CALLER's, not the account's.** `?side=rider|customer` is set by whichever tab
 * owned the tap. Keying off `me.role` instead looks right until a dual-role user is holding the
 * phone: their account role is "rider" forever, so tapping their name on the CUSTOMER hub would
 * hand them the rider list — reintroducing on this screen exactly the bleed D-22 removed from the
 * tab above it. The role stays the fallback for arrivals with no side to read (deep links, a push
 * tap, a `/profile` typed by hand).
 *
 * **What this screen has that the tabs don't:** the account record itself — the full name, the full
 * phone in international form, and the national ID with its verification tag ({@link AccountIdLine},
 * drawn from `LJ.profile`; unmasked per D-23). That is what the identity card promises when it says
 * "your details", and it is why this screen is not just the tab again.
 *
 * Sign out stays here as a danger row (it is also on Settings) — the documented route to it from
 * both sides.
 */
export default function ProfileScreen(): React.ReactElement {
  const router = useRouter();
  const { session, signOut } = useAuth();
  const { side } = useLocalSearchParams<{ side?: string }>();
  const meQ = useQuery({ queryKey: ["me"], queryFn: getMe });
  const me = meQ.data;
  const rider = me?.rider;

  // Side first, role as the fallback. A customer-side view of a rider's account is a real, expected
  // state (they tapped their name on the customer hub), not a mismatch to correct.
  const asRider = side === "rider" || (side !== "customer" && (me?.role ?? session?.role) === "rider");

  // STREAMLINE-01: drives the Notifications row's "N new" prefix (docs/DESIGN-DEVIATIONS.md D-27).
  const unreadCount = useNotificationsUnreadCount();

  const name = me ? `${me.firstName} ${me.lastName}`.trim() || "Your account" : "Your account";
  const identityLine = [me?.phone ? formatPhoneDisplay(me.phone) : "", asRider ? "Rider" : "Customer"].filter(Boolean).join(" · ");

  // Each side's own destinations, then the shared tail. Mirrors that side's Account tab so the
  // screen behind the identity card never contradicts the one in front of it.
  const rows: AccountRow[] = asRider
    ? [
        { icon: "id-card", label: "Bike & documents", sub: bikeDocsSub(rider?.kycStatus, rider?.bikeReg), onPress: () => router.push("/rider/documents") },
        { icon: "history", label: "Job history", sub: "Parcels and food in one list", onPress: () => router.push("/history") },
        { icon: "wallet", label: "Money", sub: "Balance, cash held, commission", onPress: () => router.push("/rider/money") },
        { icon: "bell", label: "Notifications", sub: notificationsRowSub(unreadCount), onPress: () => router.push("/notifications") },
        { icon: "phone", label: "Help & support", sub: "Call the safety line", onPress: () => router.push("/help") },
        { icon: "shield", label: "Settings", sub: "Permissions, privacy and sign out", onPress: () => router.push("/settings") },
      ]
    : [
        { icon: "bell", label: "Notifications", sub: notificationsRowSub(unreadCount), onPress: () => router.push("/notifications") },
        { icon: "phone", label: "Help & support", sub: "Call the safety line", onPress: () => router.push("/help") },
        { icon: "shield", label: "Settings", sub: "Permissions, privacy and sign out", onPress: () => router.push("/settings") },
      ];
  rows.push({ icon: "x", label: "Sign out", sub: "End this session on this phone", danger: true, onPress: () => void signOut() });

  return (
    <Screen>
      {/* Kit AppBar (pushed-screen header) — title lives in the bar; no in-body Heading. */}
      <AppBar title="Account" onBack={() => router.back()} />

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
          // Absent on an account that never supplied an ID, and absent for a beat after a cold start:
          // it is the one field held out of the persisted cache (src/query/persist.ts), so it arrives
          // with the first live /auth/me rather than with the warm paint.
          detail={me?.idNumber ? <AccountIdLine idNumber={me.idNumber} kycStatus={rider?.kycStatus} /> : undefined}
          // The pill is rider state, so it shows on the rider side only — the same rule that took it
          // off the customer Account tab (D-22).
          trailing={asRider && rider ? <KycPill status={rider.kycStatus} /> : undefined}
        />
      )}

      <ScrollView showsVerticalScrollIndicator={false}>
        <AccountRowList rows={rows} />
      </ScrollView>
    </Screen>
  );
}
