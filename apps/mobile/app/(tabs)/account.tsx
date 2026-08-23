import { formatPhoneLocal } from "@lynia/shared";
import { tokens } from "@lynia/shared/tokens";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { Text, View } from "react-native";
import { getMe } from "../../src/api/auth";
import { useAuth } from "../../src/auth/auth-context";
import { notificationsRowSub, useNotificationsUnreadCount } from "../../src/query/use-notifications-unread";
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
 *
 * **The identity card is INERT** (owner instruction 2026-08-17: *"when I click the profile under
 * accounts it must not be clickable to display another window for both rider and customer sides"* —
 * `docs/DESIGN-DEVIATIONS.md` D-26). It used to open `/profile?side=customer`; `AccountIdentityCard`
 * no longer accepts a handler at all, so this tab and the rider one are inert by construction rather
 * than by each remembering not to pass one. Settings is the row that leads onward.
 *
 * The BODY GEOMETRY is mirrored from the generated rider view (owner instruction 2026-08-16, from a
 * photo of both tabs: "the customer options tab does not have same margins as the rider options cards
 * .. align the customer cards so they have the same dimensions and design as the rider cards" —
 * `docs/DESIGN-DEVIATIONS.md` D-24). D-15 harmonised what a row LOOKS like and D-22 settled WHICH rows
 * each side gets, but both left the two screens inset differently: the rider's generated view nests
 * the mock's `Pad` inside `Screen`'s own 16px edge padding, so its cards sit 32px in, while this
 * screen put its cards straight into `Screen` at 16px. Same rows, two different card widths. Both now
 * draw `Screen scroll` → `Pad` → cards, so the cards are one width on both tabs.
 */
export default function AccountTabScreen(): React.ReactElement {
  const router = useRouter();
  const { session } = useAuth();
  const meQ = useQuery({ queryKey: ["me"], queryFn: getMe });
  const me = meQ.data;
  const isRider = (me?.role ?? session?.role) === "rider";

  // STREAMLINE-01: drives the Notifications row's "N new" prefix (docs/DESIGN-DEVIATIONS.md D-27).
  const unreadCount = useNotificationsUnreadCount();

  const name = me ? `${me.firstName} ${me.lastName}`.trim() || "Your account" : "Your account";
  // The facts that identify THIS account on the customer side, one line, muted — the customer
  // analogue of the rider's "★ 4.9 · 312 jobs · verified".
  const identityLine = [me?.phone ? formatPhoneLocal(me.phone) : "", "Customer"].filter(Boolean).join(" · ");

  const rows: AccountRow[] = [
    { icon: "bell", label: "Notifications", sub: notificationsRowSub(unreadCount), onPress: () => router.push("/notifications") },
    { icon: "phone", label: "Help & support", sub: "Call the safety line", onPress: () => router.push("/help") },
    // `shield` rather than a settings/cog glyph: the design kit's 38-icon subset has none, and this
    // row's contents ARE permissions, privacy and sign-out — so the shield is honest, not a stand-in.
    { icon: "shield", label: "Settings", sub: "Permissions, privacy and sign out", onPress: () => router.push("/settings") },
    // CF-04-SIB (crash-fuzz 2026-08-23, MOB-BOOT-02 class — "a screen rendering a decision it has
    // not yet made"): while `me` is still loading, `isRider` falls back to the stale/absent
    // `session?.role`, which can read "customer" for an account that is actually a verified rider —
    // live-reproduced via the tools/parity mobile harness as a ~1.5-2s flash of "Become a rider" on
    // a rider's own account before it flips to "Switch to rider". The rider-side sibling
    // (`app/rider/(tabs)/account.tsx`) avoids this by early-returning a full-screen skeleton while
    // loading; this screen's other rows carry no role guess, so only this one row withholds itself
    // until the real role is known, rather than gating the whole list.
    ...(meQ.isLoading
      ? []
      : [
          {
            icon: "bike" as const,
            label: isRider ? "Switch to rider" : "Become a rider",
            sub: isRider ? "Jobs, money and your bike" : "Earn by delivering parcels and food",
            onPress: () => router.push(isRider ? "/rider" : "/rider/become"),
          },
        ]),
  ];

  return (
    // `scroll` — the whole body, not a ScrollView around the rows alone, so the tab still reaches its
    // last row on the mandatory 320×640 entry phone once a long name wraps. The rider view earns the
    // same scaffold from the codegen, so the two screens scroll identically (D-24).
    <Screen scroll>
      <AppBar title="Account" back={false} />

      {/* The mock's `Pad` — the SECOND 16px inset, copied from the generated rider view
          (`app/rider/(tabs)/account.view.tsx`, its `Pad`→View). This is what makes the two tabs' cards
          the same width; see D-24 and the header comment. */}
      <View style={{ padding: tokens.space.screen, minHeight: "100%", paddingTop: 0 }}>
        {meQ.isLoading ? (
          <SkeletonList count={1} />
        ) : meQ.isError ? (
          <Card>
            <Text style={{ fontSize: 14, color: tokens.color.ink }}>Couldn&apos;t load your details.</Text>
            <Button label="Retry" variant="ghost" onPress={() => void meQ.refetch()} />
          </Card>
        ) : (
          // Inert — no handler, and since D-26 the card takes none. Everything it used to open is
          // reached through the Settings row below.
          <AccountIdentityCard name={name} line={identityLine} />
        )}

        <AccountRowList rows={rows} />
      </View>
    </Screen>
  );
}
