import { tokens } from "@lynia/shared";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { getMe } from "../../../src/api/auth";
import { AppScreen, Card, Heading, Icon, type IconName, SkeletonList, StatusPill } from "../../../src/ui";

/**
 * Account tab (plan §5 B1 shell; `rider-one-app.jsx` `account` — RJM A1). The mock draws two cards:
 * an identity card (avatar · name · ★ rating · jobs · verified, an online pill) and one card of tile
 * rows (Bike & documents, Job history, Money, Notifications, Help & support) — icon, label, a sub-line
 * saying what's behind it, chevron. The sub-line is what makes a row self-explanatory before it's
 * tapped. Profile/settings + sign-out live behind a tap on the identity card (`/profile`, which already
 * branches on `isRider`) — the mock draws no separate "settings" row, so the identity card is the way
 * in, matching the customer Account tab's own "tap your details" affordance.
 */
function AccountRow({
  icon,
  label,
  sub,
  onPress,
  last,
}: {
  icon: IconName;
  label: string;
  sub: string;
  onPress: () => void;
  /** The last row drops the divider — the card edge already closes the list. */
  last?: boolean;
}): React.ReactElement {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${sub}`}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: tokens.space.md,
        minHeight: tokens.touchTargetMin,
        paddingVertical: tokens.space.md,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: tokens.color.line,
      }}
    >
      <Icon name={icon} size={18} color={tokens.color.muted} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 13.5, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink }}>{label}</Text>
        <Text style={{ fontSize: 12, color: tokens.color.muted }}>{sub}</Text>
      </View>
      <Icon name="chevron-right" size={16} color={tokens.color.muted} />
    </Pressable>
  );
}

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

  return (
    <AppScreen>
      <View style={{ flex: 1, padding: tokens.space.screen }}>
        <Heading>Account</Heading>

        {/* Identity card — avatar · name · rating/jobs/verified · online pill. Tapping it opens the
            shared profile/settings screen (`/profile`), which is where session + sign-out live. */}
        {meQ.isLoading ? (
          <SkeletonList count={1} />
        ) : (
          <Pressable
            onPress={() => router.push("/profile")}
            accessibilityRole="button"
            accessibilityLabel="Your profile and settings"
          >
            <Card>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 11 }}>
                <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: tokens.color.accentWash, alignItems: "center", justifyContent: "center" }}>
                  <Icon name="user" size={22} color={tokens.color.accentText} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ fontSize: 15.5, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>
                    {me ? `${me.firstName} ${me.lastName}`.trim() || "Your account" : "Your account"}
                  </Text>
                  <Text style={{ fontSize: 12.5, color: tokens.color.muted, marginTop: 2, fontVariant: ["tabular-nums"] }}>
                    {rider ? `${ratingLabel} · ${rider.tripsCount} jobs · ${kycTag}` : "Rider"}
                  </Text>
                </View>
                {rider?.isOnline ? <StatusPill status="Online" tone="online" dot /> : null}
              </View>
            </Card>
          </Pressable>
        )}

        <Card>
          <AccountRow
            icon="id-card"
            label="Bike & documents"
            sub={rider?.kycStatus === "verified" ? "Verified · view your documents" : "Verify your ID and register your bike."}
            onPress={() => router.push("/rider/documents")}
          />
          <AccountRow
            icon="history"
            label="Job history"
            sub="Parcels and food in one list"
            onPress={() => router.push("/history")}
          />
          <AccountRow
            icon="wallet"
            label="Money"
            sub="Balance, cash held, commission"
            onPress={() => router.push("/rider/money")}
          />
          <AccountRow
            icon="bell"
            label="Notifications"
            sub="One inbox for both services"
            onPress={() => router.push("/notifications")}
          />
          <AccountRow
            icon="phone"
            label="Help & support"
            sub="Call the safety line"
            onPress={() => router.push("/help")}
            last
          />
        </Card>
      </View>
    </AppScreen>
  );
}
