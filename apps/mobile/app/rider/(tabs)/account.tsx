import { tokens } from "@lynia/shared";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { View } from "react-native";
import { getMe } from "../../../src/api/auth";
import { AppScreen, SkeletonList } from "../../../src/ui";
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

  // The five settings rows, in the mock's order. The sub-line is what makes a row self-explanatory
  // before it's tapped; the "Bike & documents" sub reflects the real KYC status.
  const rows: RiderAccountRow[] = [
    ["id-card", "Bike & documents", rider?.kycStatus === "verified" ? "Verified · view your documents" : "Verify your ID and register your bike."],
    ["history", "Job history", "Parcels and food in one list"],
    ["wallet", "Money", "Balance, cash held, commission"],
    ["bell", "Notifications", "One inbox for both services"],
    ["phone", "Help & support", "Call the safety line"],
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
    <RiderAccountView
      name={name}
      identityLine={identityLine}
      online={!!rider?.isOnline}
      onIdentityPress={() => router.push("/profile")}
      rows={rows}
      onRowPress={(i) => router.push(routes[i]!)}
    />
  );
}
