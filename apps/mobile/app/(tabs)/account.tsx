import { formatPhoneDisplay } from "@lynia/shared";
import { tokens } from "@lynia/shared/tokens";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { ScrollView, Text, View } from "react-native";
import { getMe } from "../../src/api/auth";
import { openSupportWhatsApp } from "../../src/config";
import { becomeStateFor } from "../../src/logic/become-state";
import { useHomeLocation } from "../../src/logic/home-location";
import { useNotificationsUnreadCount } from "../../src/query/use-notifications-unread";
import { riderModeAvailable } from "../../src/rider-mode";
import { AppScreen, SkeletonList, useTabRoot } from "../../src/ui";
import { Notice } from "../../src/ui/send/kit";
import { RIDER_COPY as R, RF } from "../../src/ui/rider/copy";
import { BecomeCard, IdentityCard, MintTop, RCard, RoleToggle, RRow } from "../../src/ui/rider/kit";
import { useTabTop } from "../../src/query/use-tab-top";

/**
 * Customer Account (Rider v2 C6–C11, ledger D-54) — the rider Account's sibling: mint top card with the
 * deliver-to street, the identity card (not tappable — owner 2026-10-02, D-60), then either the **Customer | Rider** toggle (Customer
 * selected) for someone who rides, or the Become-a-rider card for someone who doesn't yet — then
 * Trip history · Notifications · Help & support (straight to WhatsApp, D-60) · Settings. iPhone builds are customer-only (D-41), so
 * neither the toggle nor the card is drawn there.
 */
export default function AccountTabScreen(): React.ReactElement {
  const router = useRouter();
  const { scrollRef, bottomPad } = useTabRoot<ScrollView>("account");
  const top = useTabTop();
  const location = useHomeLocation();
  const meQ = useQuery({ queryKey: ["me"], queryFn: getMe });
  const me = meQ.data;
  const unreadCount = useNotificationsUnreadCount();

  const name = me ? `${me.firstName} ${me.lastName}`.trim() || R.tabAccount : R.tabAccount;
  // Withheld until `me` resolves: guessing the role from a stale session flashed "Become a rider" on a
  // rider's own account (MOB-BOOT-02-SIB-3).
  const become = me && meQ.isSuccess && riderModeAvailable() ? becomeStateFor(me) : null;
  const left = Math.max(0, 2 - (me?.rider?.kycAttempts ?? 0));

  return (
    <AppScreen banner={<MintTop {...top} customer loc={location.label} />}>
      {meQ.isLoading ? (
        <View style={{ padding: tokens.space.screen }}>
          <SkeletonList count={2} />
        </View>
      ) : (
        <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 16, paddingBottom: bottomPad, gap: 12 }} showsVerticalScrollIndicator={false}>
          <IdentityCard
            name={name}
            line={me?.phone ? formatPhoneDisplay(me.phone) : ""}
            photoUrl={me?.photoUrl}
          />
          {become === "toggle" ? (
            <>
              <RoleToggle side="customer" onChange={(s) => (s === "rider" ? router.replace("/rider") : undefined)} />
              {me?.rider?.kycStatus === "verified" && (me.rider.tripsCount ?? 0) === 0 ? (
                <Notice tone="wash" icon="circle-check" text={`${R.kycOkT}. ${R.kycOkB}`} />
              ) : (
                <Text style={{ fontSize: 12, lineHeight: 16, color: tokens.color.muted, textAlign: "center", marginTop: -4 }}>{R.switchHint}</Text>
              )}
            </>
          ) : become ? (
            <BecomeCard
              state={become}
              failBody={RF.kycFailB(left)}
              onAction={() => router.push(become === "none" ? "/rider/become" : "/rider")}
            />
          ) : null}
          <RCard>
            <RRow first icon="receipt" label={R.rTripHist} sub={R.rTripHistS} onPress={() => router.push("/history?side=customer")} />
            <RRow icon="bell" label={R.rNotif} value={RF.rNotifS(unreadCount)} tone={unreadCount > 0 ? "ok" : null} onPress={() => router.push("/notifications")} />
            <RRow icon="message-circle" label={R.rHelp} sub={R.hWa} onPress={openSupportWhatsApp} />
            <RRow icon="settings" label={R.rSettings} sub={R.rSettingsC} onPress={() => router.push("/settings?side=customer")} />
          </RCard>
        </ScrollView>
      )}
    </AppScreen>
  );
}
