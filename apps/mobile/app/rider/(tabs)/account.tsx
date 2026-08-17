import { tokens } from "@lynia/shared/tokens";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getMe } from "../../../src/api/auth";
import { getActiveOrder } from "../../../src/api/orders";
import { setOnline } from "../../../src/api/riders";
import { pendingOrQueued } from "../../../src/query/client";
import { AppScreen, Button, SkeletonList, Sub } from "../../../src/ui";
import { RiderAccountView, type RiderAccountRow } from "./account.view";

/**
 * Account tab (plan §5 B1 shell; `rider-one-app.jsx` `account` — RJM A1). ADOPTED via mock→RN codegen
 * (Foundation-F.a): the whole screen is the generated `RiderAccountView` (account.view.tsx), which
 * carries the mock's tree by construction — an identity Card (avatar · name · rating/jobs/verified ·
 * online pill) and one Card of settings rows (Bike & documents, Job history, Money, Notifications,
 * Help & support), each icon · label · self-explaining sub-line · chevron. This container is the DATA
 * SEAM only: it feeds the live `['me']` identity + the settings rows/routes, and early-returns a
 * loading skeleton (the static mock draws no loading variant, so that branch is glue, not gated).
 *
 * **The identity card is INERT** (owner instruction 2026-08-17: *"when I click the profile under
 * accounts it must not be clickable to display another window for both rider and customer sides"*,
 * ledgered as `docs/DESIGN-DEVIATIONS.md` D-26). It used to be a Pressable opening
 * `/profile?side=rider`; the mock draws a plain Card, so the wrap is gone from the codegen bind and
 * the regenerated view no longer takes an `onIdentityPress`. Sign-out and the rest of the account
 * chrome are reached through the **Settings** row below, which is where they now live for both roles.
 *
 * TWO rows beyond the mock's five, both sanctioned and both fed through the same `rows` prop as every
 * other row — so the generated view's tree is untouched and the structure snapshot still matches the
 * mock. The deviations are data entries, not structural edits:
 *  - "Switch to customer" (D-16) — the rider→customer bridge, moved here off the Jobs board footer.
 *  - "Settings" (D-22) — the role-separation pass. The mock draws no settings row and left the
 *    identity card as the only way in; that put permissions, privacy and account deletion two taps
 *    deep for a rider, behind a `/profile` whose rows were the customer's. The customer tab has
 *    carried a Settings row all along, so this also makes the two tabs mirror images.
 */
export default function RiderAccountTabScreen(): React.ReactElement {
  const router = useRouter();
  const meQ = useQuery({ queryKey: ["me"], queryFn: getMe });
  const me = meQ.data;
  const rider = me?.rider;

  // Mock A1 identity line: "★ 4.9 · 312 jobs · verified". Rating shows "new" until the first rating
  // lands (no fabricated average), jobs is the real trip count, and the verified tag is the real KYC
  // status — never a hardcoded "verified".
  const ratingLabel = rider ? (rider.ratingCount > 0 ? `★ ${rider.ratingAvg.toFixed(1)}` : "★ new") : "";
  const kycTag =
    rider?.kycStatus === "verified"
      ? "verified"
      : rider?.kycStatus === "expired"
        ? "ID expired"
        : rider?.kycStatus === "failed"
          ? "unverified"
          : "verifying";

  const name = me ? `${me.firstName} ${me.lastName}`.trim() || "Your account" : "Your account";
  const identityLine = rider ? `${ratingLabel} · ${rider.tripsCount} jobs · ${kycTag}` : "Rider";

  // The switch-to-customer confirmation (carried over from the board footer this row replaced): leaving
  // the rider side while online or mid-job is never a single unconfirmed tap. Unconfirmed it would
  // unmount the board socket + heartbeat with no warning — a rider could go browse as a customer and
  // lose track of an accepted job, or go effectively deaf to new broadcasts while still marked online
  // server-side. Same two states, same copy, same outcome as the footer card; only the entry point moved.
  const [confirmSwitch, setConfirmSwitch] = useState(false);
  const online = !!rider?.isOnline;
  // Read-only: the ["activeJob"] cache the Jobs board already keeps warm. It only picks which of the two
  // confirmation sentences is true, so it never needs its own poll.
  const activeQ = useQuery({ queryKey: ["activeJob"], queryFn: getActiveOrder });
  const activeJob = activeQ.data ?? null;
  const offlineM = useMutation({ mutationFn: () => setOnline(false) });

  const leaveForCustomer = (): void => {
    // No-active-job path: the copy promises this takes you offline, so make it true — fire the offline
    // toggle best-effort (don't block leaving on it; the screen unmounts on navigate and the request
    // still lands server-side). The active-job path deliberately stays online (its copy says the job
    // isn't cancelled), so only toggle when there's no active job.
    if (!activeJob) offlineM.mutate();
    router.replace("/home");
  };

  // The five settings rows in the mock's order, then the sanctioned sixth. The sub-line is what makes a
  // row self-explanatory before it's tapped; the "Bike & documents" sub reflects the real KYC status.
  const rows: RiderAccountRow[] = [
    ["id-card", "Bike & documents", rider?.kycStatus === "verified" ? "Verified · view your documents" : "Verify your ID and register your bike."],
    ["history", "Job history", "Parcels and food in one list"],
    ["wallet", "Money", "Balance, cash held, commission"],
    ["bell", "Notifications", "One inbox for both services"],
    ["phone", "Help & support", "Call the safety line"],
    // D-22's addition, and since D-26 the ONLY way off this tab into permissions, privacy, language,
    // payment, sign-out and account deletion — the identity card above no longer opens anything. Same
    // label, sub and icon as the customer tab's, so the two tails read identically.
    ["shield", "Settings", "Permissions, privacy and sign out"],
    ["shopping-bag", "Switch to customer", "Order food and send parcels"],
  ];
  // Index-aligned with `rows`; the switch row is deliberately the one entry with NO route (see
  // onRowPress), so it stays the array's short tail rather than needing a sentinel.
  const routes = ["/rider/documents", "/history", "/rider/money", "/notifications", "/help", "/settings"] as const;

  if (meQ.isLoading) {
    return (
      <AppScreen>
        <View style={{ flex: 1, padding: tokens.space.screen }}>
          <SkeletonList count={1} />
        </View>
      </AppScreen>
    );
  }

  return (
    <>
      <RiderAccountView
        name={name}
        identityLine={identityLine}
        online={online}
        rows={rows}
        onRowPress={(i) => {
          const route = routes[i];
          // The switch row is the one entry with no route — it either confirms (online / mid-job) or
          // leaves straight away, exactly as the old footer button did.
          if (!route) {
            if (online || activeJob) setConfirmSwitch(true);
            else leaveForCustomer();
            return;
          }
          router.push(route);
        }}
      />
      {/* Same bottom-sheet confirm idiom as the safety sheets (src/ui/safety.tsx). */}
      <Modal visible={confirmSwitch} transparent animationType="slide" onRequestClose={() => setConfirmSwitch(false)}>
        <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" }}>
          <Pressable
            style={{ flex: 1 }}
            onPress={() => setConfirmSwitch(false)}
            accessibilityRole="button"
            accessibilityLabel="Close"
          />
          <SafeAreaView
            edges={["bottom"]}
            style={{
              backgroundColor: tokens.color.bg,
              borderTopLeftRadius: tokens.radius.card,
              borderTopRightRadius: tokens.radius.card,
              padding: tokens.space.lg,
            }}
          >
            <Text
              style={{
                fontSize: tokens.font.size.title,
                fontWeight: tokens.font.weight.bold,
                color: tokens.color.ink,
                marginBottom: 6,
              }}
            >
              {activeJob ? "You have a job in progress" : "You're online for deliveries"}
            </Text>
            <Sub>
              {activeJob
                ? "Switching to the customer view won't cancel your job, but you'll stop seeing job updates here until you come back."
                : "Switching to the customer view takes you offline, so you'll stop receiving nearby deliveries."}
            </Sub>
            <Button label="Go to customer view" onPress={leaveForCustomer} loading={pendingOrQueued(offlineM)} />
            <Button label="Stay online as a rider" variant="ghost" onPress={() => setConfirmSwitch(false)} />
          </SafeAreaView>
        </View>
      </Modal>
    </>
  );
}
