import { tokens } from "@lynia/shared/tokens";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { Text, View } from "react-native";
import { getMe } from "../../src/api/auth";
import { AppBar, Button, Card, EmptyState, Heading, Icon, type IconName, Screen, SkeletonList, StatusPill, Sub } from "../../src/ui";

/**
 * Bike & documents (rider-journey A·2). The verified ID, bike registration and rider photo, each with
 * a status pill. Read-only — the mockup routes changes to support (no self-edit endpoint), so this
 * only displays what KYC captured. Data comes from getMe().rider; the KYC status drives every pill.
 */
function Row(props: { icon: IconName; label: string; value?: string; verified: boolean }): React.ReactElement {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: tokens.space.md, paddingVertical: tokens.space.md, borderBottomWidth: 1, borderBottomColor: tokens.color.line }}>
      <Icon name={props.icon} size={19} color={tokens.color.accentText} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 14, fontWeight: "600", color: tokens.color.ink }}>{props.label}</Text>
        {props.value ? <Text style={{ fontSize: 12, color: tokens.color.muted, fontVariant: ["tabular-nums"] }}>{props.value}</Text> : null}
      </View>
      {props.verified ? <StatusPill status="Verified" tone="online" dot /> : <StatusPill status="Not verified" tone="neutral" />}
    </View>
  );
}

// The footer used to always say "verified and stored securely," even for a rider whose KYC is
// pending or failed — false comfort right where documents.tsx's own Row already shows the real
// state via its pill. Match the footer's claim to rider.kycStatus.
function footerCopy(kycStatus: string | undefined): string {
  if (kycStatus === "verified") return "Your documents are verified and stored securely. To change your bike or re-verify, contact support.";
  if (kycStatus === "pending") return "Your documents are still being checked — this can take a little while. We'll let you know as soon as they're verified.";
  return "Your documents haven't been verified yet. Go to your rider verification status to see what to do next.";
}

export default function DocumentsScreen(): React.ReactElement {
  const router = useRouter();
  const meQ = useQuery({ queryKey: ["me"], queryFn: getMe });
  const rider = meQ.data?.rider ?? null;
  const verified = rider?.kycStatus === "verified";
  // Mask the ID number — never show it in full even to its owner (the KYC record holds the real value).
  const maskedId = "••••••";

  return (
    <Screen>
      {/* Back-only AppBar chrome; the kit's bike_docs mock draws the title + sub as an in-body
          Heading/Sub (not in the bar) — same pattern as the aligned job.tsx / become.tsx pushed screens. */}
      <AppBar onBack={() => router.back()} />
      <Heading>Bike &amp; documents</Heading>
      <Sub>What we verified to let you ride.</Sub>


      {meQ.isLoading ? (
        <SkeletonList count={2} />
      ) : meQ.isError ? (
        // `rider` is derived from meQ.data, which is also undefined on a fetch error — so without this
        // branch a transient network blip falsely tells a verified rider they "haven't set up as a
        // rider yet" with no way to recover. Distinguish the error with an explicit retry (mirrors the
        // rider board's own isError handling in rider/index.tsx).
        <EmptyState icon="wifi-off" title="Couldn't load your documents" message="Check your connection and try again.">
          <Button label="Retry" onPress={() => void meQ.refetch()} loading={meQ.isFetching} />
        </EmptyState>
      ) : !rider ? (
        <Card>
          <Text style={{ fontSize: 14, color: tokens.color.muted }}>You haven&apos;t set up as a rider yet.</Text>
        </Card>
      ) : (
        <>
          <Card>
            <Row icon="id-card" label="National ID" value={maskedId} verified={verified} />
            <Row icon="bike" label="Bike registration" value={rider.bikeReg} verified={verified} />
            <Row icon="user" label="Rider photo" value="Added" verified={verified} />
          </Card>
          <Card style={{ backgroundColor: tokens.color.surface, borderColor: "transparent" }}>
            <Text style={{ fontSize: 12.5, color: tokens.color.muted, lineHeight: 18 }}>{footerCopy(rider.kycStatus)}</Text>
          </Card>
          {!verified ? <Button label="View verification status" variant="ghost" onPress={() => router.replace("/rider")} /> : null}
        </>
      )}
    </Screen>
  );
}
