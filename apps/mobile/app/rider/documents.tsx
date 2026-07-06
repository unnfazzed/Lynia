import { tokens } from "@lynia/shared";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { Text, View } from "react-native";
import { getMe } from "../../src/api/auth";
import { Button, Card, Heading, Icon, type IconName, Screen, SkeletonList, StatusPill, Sub } from "../../src/ui";

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
      {props.verified ? <StatusPill status="Verified" tone="online" dot /> : null}
    </View>
  );
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
      <Heading>Bike &amp; documents</Heading>
      <Sub>What we verified to let you ride.</Sub>

      {meQ.isLoading ? (
        <SkeletonList count={2} />
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
            <Text style={{ fontSize: 12.5, color: tokens.color.muted, lineHeight: 18 }}>
              Your documents are checked by Didit and stored securely. To change your bike or re-verify, contact support.
            </Text>
          </Card>
        </>
      )}
      <Button label="Back" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
