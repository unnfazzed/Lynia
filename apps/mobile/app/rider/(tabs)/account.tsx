import { RIDER_STRIKE_LIMIT, SOS_POLICY } from "@lynia/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Linking, ScrollView, Text, View } from "react-native";
import { tokens } from "@lynia/shared/tokens";
import { getMe } from "../../../src/api/auth";
import { getActiveOrder } from "../../../src/api/orders";
import { openSupportWhatsApp } from "../../../src/config";
import { setOnline } from "../../../src/api/riders";
import { getRiderStanding } from "../../../src/api/rider-v2";
import { useNotificationsUnreadCount } from "../../../src/query/use-notifications-unread";
import { AppScreen, SkeletonList, useTabRoot } from "../../../src/ui";
import { CtaButton } from "../../../src/ui/order/kit";
import { RIDER_COPY as R, RF } from "../../../src/ui/rider/copy";
import { IdentityCard, MintTop, MSheet, RCard, RoleToggle, RRow, SafetyLineRow, Standing } from "../../../src/ui/rider/kit";
import { useTabTop } from "../../../src/query/use-tab-top";

/**
 * Rider Account (Rider v2 C1–C5, `packages/design/handoff/rider-v2/`, ledger D-54): the mint top card,
 * the identity card (not tappable — owner 2026-10-02, D-60), the **Customer | Rider** toggle (Rider
 * selected), the standing card and four rows — Job history · Notifications · Help & support (straight to
 * WhatsApp, D-60) · Settings — then the 24-hour safety line row that used to sit on the S6 Help screen. The Money, Bike & documents and
 * Switch-to-customer rows are gone: Money is a tab, Bike & documents lives in Settings, and the toggle
 * replaces the switch row.
 *
 * Tapping Customer always confirms first. With an active job (C5) the job keeps running and the rider
 * stays online for it; otherwise (C4) going to the customer view takes the rider offline, which is how
 * the server stops dispatching to them (the "active side" is the rider's online flag).
 */
export default function RiderAccountTabScreen(): React.ReactElement {
  const router = useRouter();
  const { scrollRef, bottomPad } = useTabRoot<ScrollView>("account");
  const top = useTabTop("rider");
  const meQ = useQuery({ queryKey: ["me"], queryFn: getMe });
  const me = meQ.data;
  const rider = me?.rider;
  const activeQ = useQuery({ queryKey: ["activeJob"], queryFn: getActiveOrder });
  const activeJob = activeQ.data && activeQ.data.status !== "cancelled" ? activeQ.data : null;
  const offlineM = useMutation({ mutationFn: () => setOnline(false) });
  const unreadCount = useNotificationsUnreadCount();
  const [confirm, setConfirm] = useState(false);

  const standing = getRiderStanding(rider ?? null);
  const name = me ? `${me.firstName} ${me.lastName}`.trim() || R.tabAccount : R.tabAccount;
  const rating = rider && rider.ratingCount > 0 ? rider.ratingAvg : null;

  const goCustomer = (): void => {
    // C5 keeps the rider online so the job they're carrying keeps its pings; C4 takes them offline,
    // which is what stops new jobs and food offers reaching them while they're on the customer side.
    if (!activeJob) offlineM.mutate();
    setConfirm(false);
    router.replace("/home");
  };
  const backToJob = (): void => {
    setConfirm(false);
    router.push(activeJob?.orderType === "merchant" ? "/rider/food-job" : "/rider/job");
  };

  return (
    <AppScreen banner={<MintTop {...top} />}>
      {meQ.isLoading ? (
        <View style={{ padding: tokens.space.screen }}>
          <SkeletonList count={2} />
        </View>
      ) : (
        <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 16, paddingBottom: bottomPad, gap: 12 }} showsVerticalScrollIndicator={false}>
          <IdentityCard
            name={name}
            line={RF.ratingLine(rating, rider?.tripsCount ?? 0)}
            star={rating != null}
            photoUrl={me?.photoUrl}
            verified={rider?.kycStatus === "verified"}
          />
          <RoleToggle side="rider" onChange={(s) => (s === "customer" ? setConfirm(true) : undefined)} />
          <Text style={{ fontSize: 12, lineHeight: 16, color: tokens.color.muted, textAlign: "center", marginTop: -4 }}>{R.switchHint}</Text>
          <Standing
            acceptance={standing.acceptancePct}
            rating={rating}
            used={standing.strikesUsed}
            max={RIDER_STRIKE_LIMIT}
            oldestClears={standing.oldestClearsAt}
          />
          <RCard>
            <RRow first icon="history" label={R.rJobHist} sub={R.rJobHistS} onPress={() => router.push("/history?side=rider")} />
            <RRow icon="bell" label={R.rNotif} value={RF.rNotifS(unreadCount)} tone={unreadCount > 0 ? "ok" : null} onPress={() => router.push("/notifications?side=rider")} />
            <RRow icon="message-circle" label={R.rHelp} sub={R.hWa} onPress={openSupportWhatsApp} />
            <RRow icon="settings" label={R.rSettings} sub={R.rSettingsS} onPress={() => router.push("/settings?side=rider")} />
          </RCard>
          <SafetyLineRow onPress={() => void Linking.openURL(`tel:${SOS_POLICY.safetyLine.replace(/\s/g, "")}`).catch(() => undefined)} />
        </ScrollView>
      )}
      <MSheet
        visible={confirm}
        onClose={() => setConfirm(false)}
        icon={activeJob ? "package" : "arrow-left-right"}
        iconTone={activeJob ? "ok" : "calm"}
        title={activeJob ? R.swJobT : R.swT}
        body={activeJob ? RF.swJobB(activeJob.pickup.landmark, activeJob.dropoff.landmark) : R.swB}
        buttons={
          activeJob ? (
            <>
              <CtaButton label={R.swGo} icon="arrow-left-right" onPress={goCustomer} />
              <CtaButton ghost label={R.swJobBack} onPress={backToJob} />
            </>
          ) : (
            <>
              <CtaButton label={R.swGo} onPress={goCustomer} />
              <CtaButton ghost label={R.swStay} onPress={() => setConfirm(false)} />
            </>
          )
        }
      />
    </AppScreen>
  );
}
