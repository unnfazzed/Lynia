import { formatPhoneLocal, tokens } from "@lynia/shared";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { ScrollView, Text } from "react-native";
import { getMe } from "../../src/api/auth";
import { useAuth } from "../../src/auth/auth-context";
import { AppBar, Button, Card, Screen, SkeletonList } from "../../src/ui";
import { AccountIdentityCard, AccountRowList, type AccountRow } from "../../src/ui/account/AccountRows";

/**
 * Account tab — the CUSTOMER's hub, and only the customer's. Structurally harmonised with the rider
 * Account tab (`docs/DESIGN-DEVIATIONS.md` D-15); role-separated from it by D-22.
 *
 * D-22 (owner instruction 2026-08-16, "let's have a clear separation of what shows up under account
 * for a rider and customer") is what governs the ROW SET here. The two tabs are now mirror images:
 * each lists that side's destinations, then the same three-row tail — Help & support · Settings ·
 * one bridge row to the other side. Nothing about the other role leaks in.
 *
 * What that removed from this screen, and why none of it is a lost feature:
 *  - "Trip history" → the Orders tab already absorbed `/history`'s content wholesale (see
 *    `app/(tabs)/orders.tsx`'s header: "absorbs app/history's content directly instead of bridging
 *    out to it"), so the row was a second door onto a screen one tab away.
 *  - "Send a parcel" → a TASK, not an account destination. Every other row on either Account tab is
 *    somewhere you go about your account; the composer is reached from Home and from the Orders
 *    empty state, which is where a booking action belongs.
 *  - "Bike & documents" → rider-only maintenance. It lives on the rider Account tab and on `/profile`
 *    for a rider; drawing it here put it in three places and put rider state on the customer's hub.
 *  - the KYC pill in the identity card's trailing slot → verification is a RIDER fact. D-15 originally
 *    filled that slot with it "when relevant"; D-22 supersedes that half of D-15, because "relevant"
 *    only ever meant "this person is also a rider", which is exactly the bleed being removed.
 *
 * The bridge row is the counterpart of the rider tab's "Switch to customer" (D-16): one row, two
 * states — "Switch to rider" for someone who already is one, "Become a rider" for someone who isn't.
 */
export default function AccountTabScreen(): React.ReactElement {
  const router = useRouter();
  const { session } = useAuth();
  const meQ = useQuery({ queryKey: ["me"], queryFn: getMe });
  const me = meQ.data;
  const isRider = (me?.role ?? session?.role) === "rider";

  const name = me ? `${me.firstName} ${me.lastName}`.trim() || "Your account" : "Your account";
  // The facts that identify THIS account on the customer side, one line, muted — the customer
  // analogue of the rider's "★ 4.9 · 312 jobs · verified".
  const identityLine = [me?.phone ? formatPhoneLocal(me.phone) : "", "Customer"].filter(Boolean).join(" · ");

  const rows: AccountRow[] = [
    { icon: "bell", label: "Notifications", sub: "One inbox for both services", onPress: () => router.push("/notifications") },
    { icon: "phone", label: "Help & support", sub: "Call the safety line", onPress: () => router.push("/help") },
    // `shield` rather than a settings/cog glyph: the design kit's 38-icon subset has none, and this
    // row's contents ARE permissions, privacy and sign-out — so the shield is honest, not a stand-in.
    { icon: "shield", label: "Settings", sub: "Permissions, privacy and sign out", onPress: () => router.push("/settings") },
    {
      icon: "bike",
      label: isRider ? "Switch to rider" : "Become a rider",
      sub: isRider ? "Jobs, money and your bike" : "Earn by delivering parcels and food",
      onPress: () => router.push(isRider ? "/rider" : "/rider/become"),
    },
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
          // `side=customer`: /profile is shared by both tabs and would otherwise key its rows off the
          // account's role, showing a dual-role user the RIDER list after they tapped their name on
          // the customer hub. The tab that owns the tap names the side (D-22).
          onPress={() => router.push("/profile?side=customer")}
          accessibilityLabel="Your details and session"
        />
      )}

      {/* Scrolls so the tab still fits the mandatory 320×640 entry phone once a long name wraps.
          Not a visual element — nothing drawn changes. */}
      <ScrollView showsVerticalScrollIndicator={false}>
        <AccountRowList rows={rows} />
      </ScrollView>
    </Screen>
  );
}
