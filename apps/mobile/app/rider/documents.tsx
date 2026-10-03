import { tokens } from "@lynia/shared/tokens";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { Linking, ScrollView, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getMe } from "../../src/api/auth";
import { supportWhatsAppUrl } from "../../src/config";
import { SkeletonList } from "../../src/ui";
import { CtaBar, CtaButton } from "../../src/ui/order/kit";
import { Notice } from "../../src/ui/send/kit";
import { RIDER_COPY as R } from "../../src/ui/rider/copy";
import { PushHeader, RCard, RRow } from "../../src/ui/rider/kit";

/**
 * Bike & documents (Rider v2 S5, ledger D-54), reached from Settings → RIDER. What KYC verified, one
 * row each: National ID · Rider photo · Bike (the plate), each "Verified" while the rider's check holds;
 * "Changed bikes? Re-verify with the new plate." and a ghost "Re-verify my bike". There is no self-edit
 * endpoint, so re-verifying goes to support on WhatsApp with the request written out.
 */
export default function DocumentsScreen(): React.ReactElement {
  const router = useRouter();
  const meQ = useQuery({ queryKey: ["me"], queryFn: getMe });
  const rider = meQ.data?.rider ?? null;
  const verified = rider?.kycStatus === "verified";
  const wa = supportWhatsAppUrl();
  const reverify = (): void => {
    if (!wa) return;
    const plate = rider?.bikeReg ? ` My current plate is ${rider.bikeReg}.` : "";
    void Linking.openURL(`${wa}?text=${encodeURIComponent(`Hi, I've changed bikes and need to re-verify.${plate}`)}`).catch(() => undefined);
  };
  const value = verified ? R.verified : null;
  const tone = verified ? ("ok" as const) : null;

  return (
    // PushHeader owns the top inset; the bottom edge keeps the CTA bar clear of the Android navigation bar.
    <SafeAreaView edges={["bottom"]} style={{ flex: 1, backgroundColor: tokens.color.bg }}>
      <PushHeader title={R.tBike} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ paddingTop: 14, paddingHorizontal: 16, paddingBottom: 24, gap: 12 }} showsVerticalScrollIndicator={false}>
        {meQ.isLoading ? (
          <SkeletonList count={2} />
        ) : meQ.isError ? (
          <Notice icon="wifi-off" text="Couldn't load your documents. Check your connection and try again." />
        ) : (
          <>
            <RCard>
              <RRow first icon="id-card" label={R.docId} value={value} tone={tone} />
              {/* D-62: the photo is optional since 2026-10-02, so a rider can have none yet. */}
              <RRow icon="user" label={R.docPhoto} value={rider?.hasPhoto === false ? R.docPhotoNone : value} tone={rider?.hasPhoto === false ? null : tone} />
              <RRow icon="bike" label={R.docBike} sub={rider?.bikeReg ?? null} value={value} tone={tone} />
            </RCard>
            <Text style={{ fontSize: 13, lineHeight: 19, color: tokens.color.muted }}>{R.bikeChange}</Text>
          </>
        )}
      </ScrollView>
      <CtaBar>
        <CtaButton ghost icon="camera" label={R.reverifyBike} disabled={!wa || !rider} onPress={reverify} />
      </CtaBar>
    </SafeAreaView>
  );
}
