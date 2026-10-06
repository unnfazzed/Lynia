import { formatPhoneDisplay } from "@lynia/shared";
import { tokens } from "@lynia/shared/tokens";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { ScrollView, Text, View } from "react-native";
import { getMe } from "../../src/api/auth";
import { openSupportWhatsApp } from "../../src/config";
import { saveRolePreference } from "../../src/auth/session";
import { becomeStateFor } from "../../src/logic/become-state";
import { riderDeclineLabel } from "../../src/logic/gates";
import { useHomeLocation } from "../../src/logic/home-location";
import { useNotificationsUnreadCount } from "../../src/query/use-notifications-unread";
import { riderModeAvailable } from "../../src/rider-mode";
import { AppScreen, SkeletonList, useTabRoot } from "../../src/ui";
import { Notice } from "../../src/ui/send/kit";
import { RIDER_COPY as R, RF } from "../../src/ui/rider/copy";
import { BecomeCard, IdentityCard, MintTop, RCard, RoleToggle, RRow } from "../../src/ui/rider/kit";
import { BecomeRiderCard } from "../../src/ui/firstrun";
import { useTabTop } from "../../src/query/use-tab-top";

/**
 * Customer Account (Rider v2 C6–C11, ledger D-54) — the rider Account's sibling: mint top card with the
 * deliver-to street, the identity card (not tappable — owner 2026-10-02, D-60), then either the **Customer | Rider** toggle (Customer
 * selected) for someone who rides, or the Become-a-rider card for someone who doesn't yet (First Run v2 G2's
 * violet card before any check, ledger D-82; the in-progress / review / failed / locked card during one) — then
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
  const declineLabel = riderDeclineLabel(me?.rider?.kycDeclineReason);
  // Held for a person or in manual (ops) review — hours, not the automated check's minute.
  const reviewByPerson = !!me?.rider && (me.rider.kycHeld === true || me.rider.kycMode === "manual");
  // R-5: the side the rider picks is the side the next cold start opens on.
  const toRiderSide = (): void => {
    void saveRolePreference("rider");
    router.replace("/rider");
  };

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
              <RoleToggle
                side="customer"
                onChange={(s) => {
                  if (s === "rider") toRiderSide();
                }}
              />
              {me?.rider?.kycStatus === "verified" && (me.rider.tripsCount ?? 0) === 0 ? (
                <Notice tone="wash" icon="circle-check" text={`${R.kycOkT}. ${R.kycOkB}`} />
              ) : (
                <Text style={{ fontSize: 12, lineHeight: 16, color: tokens.color.muted, textAlign: "center", marginTop: -4 }}>{R.switchHint}</Text>
              )}
            </>
          ) : become === "none" ? (
            // First Run v2 G2 (D-82): the violet card → R1.
            <BecomeRiderCard onStart={() => router.push("/rider/become")} />
          ) : become ? (
            <BecomeCard
              state={become}
              // review: the automated check (usually under a minute) vs a person (usually a few hours) — D-82 I.
              // failed: R-6, the real decline reason when it is known; the drawn "blurry photo" copy otherwise.
              body={become === "review" ? (reviewByPerson ? R.kycReviewB : R.kycCheckingB) : declineLabel ? RF.kycFailWhyB(declineLabel, left) : RF.kycFailB(left)}
              // R-10: a locked application's only way forward is support — never a "Try again" the server refuses.
              // G3 (D-82): otherwise the card is the way back to the rider side, which lands on the current F page
              // (or R2) — switched like the toggle, so the F page's ✕ comes straight back here.
              onAction={() => (become === "locked" ? openSupportWhatsApp() : toRiderSide())}
            />
          ) : null}
          <RCard>
            {/* Trip history (Rider v2 C13) is retired: Orders is the customer's only history (Orders v2, D-63). */}
            <RRow first icon="bell" label={R.rNotif} value={RF.rNotifS(unreadCount)} tone={unreadCount > 0 ? "ok" : null} onPress={() => router.push("/notifications")} />
            <RRow icon="message-circle" label={R.rHelp} sub={R.hWa} onPress={openSupportWhatsApp} />
            <RRow icon="settings" label={R.rSettings} sub={R.rSettingsC} onPress={() => router.push("/settings?side=customer")} />
          </RCard>
        </ScrollView>
      )}
    </AppScreen>
  );
}
