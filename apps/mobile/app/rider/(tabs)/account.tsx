import { tokens } from "@lynia/shared";
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
 * Profile/settings + sign-out live behind a tap on the identity card (`/profile`, which already branches
 * on `isRider`) — the mock draws no separate "settings" row, so the identity card is the way in.
 *
 * ONE row beyond the mock's five: "Switch to customer" (owner instruction 2026-08-16, logged as D-16 in
 * docs/DESIGN-DEVIATIONS.md). It is the rider→customer bridge that used to be a "Back to customer"
 * button pinned to the Jobs board footer; the owner moved it here. It is fed through the same `rows`
 * prop as every other row, so the generated view's tree is untouched and the structure snapshot still
 * matches the mock — the deviation is one data entry, not a structural edit.
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
    ["shopping-bag", "Switch to customer", "Order food and send parcels"],
  ];
  const routes = ["/rider/documents", "/history", "/rider/money", "/notifications", "/help"] as const;

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
        onIdentityPress={() => router.push("/profile")}
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
