import { formatPhoneDisplay } from "@lynia/shared";
import { tokens } from "@lynia/shared/tokens";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Linking, Text, View } from "react-native";
import { getMe, type Me } from "../../src/api/auth";
import { useAuth } from "../../src/auth/auth-context";
import { TERMS_URL } from "../../src/config";
import { bikeDocsProgress, bikeVerified } from "../../src/logic/rider-documents";
import { RIDER_PERM_ROUTES } from "../../src/logic/rider-perm-flow";
import { providerName, TOPUP_PROVIDERS, type TopupProviderId, useRiderPrefs } from "../../src/logic/rider-prefs";
import { openPhoneSettings, requestNotif, usePermissions } from "../../src/permissions/state";
import { requestPushRegistration } from "../../src/push/push-kick";
import { riderModeAvailable } from "../../src/rider-mode";
import { BackHeader, Body, FirstRunScreen, FrSheet, FrSoftPill, IconDot, LargeTitle, ListCard, ListRow, PinnedFooter, SplitTitle, SystemSettingsSteps, Toggle } from "../../src/ui";
import { PC, PD, RP } from "../../src/ui/firstrun/copy";
import { CtaButton } from "../../src/ui/order/kit";
import { RIDER_COPY as R, RF } from "../../src/ui/rider/copy";
import { Chips, MSheet, Seg } from "../../src/ui/rider/kit";
import { SendField } from "../../src/ui/send/kit";
import { ST, toAdd } from "../../src/ui/settings/copy";

/** D1's "1 to add": the optional photo and plate still missing — the same count Bike & documents' E1 progress
 *  draws (`bikeDocsProgress`, its third item being the ID check itself). */
function bikeItemsToAdd(rider: Me["rider"] | null | undefined): number {
  if (!rider) return 0;
  const { done, total } = bikeDocsProgress(rider);
  return total - done - (rider.kycStatus === "verified" ? 0 : 1);
}

/** The customer's third step: `RP.nStep3` without its rider-only "· Job alerts on" (derived copy, D-82 §4). */
const NOTIF_STEP3_CUSTOMER = RP.nStep3.split(" · ")[0]!;

/** `.cap` — the 12/600 caption above a card (YOU, ALERTS). */
function Caption({ children, first }: { children: string; first?: boolean }): React.ReactElement {
  return (
    <Text accessibilityRole="header" style={{ marginTop: first ? 0 : 20, marginBottom: 8, marginHorizontal: 4, fontSize: 12, fontWeight: tokens.font.weight.semibold, letterSpacing: 0.72, color: tokens.color.muted }}>
      {children}
    </Text>
  );
}

/**
 * Settings — First Run v2's look (handoff `first-run-v2` D1 / PC11 / P15, ledger D-82) with every row it
 * had before (owner decision D-82 §2 #1): the round back button and the large title; the PC11 danger card
 * when order updates are off; YOU (Personal details first, Bike & documents "N to add", Language, plus the
 * kept Privacy, Terms and Payment rows); ALERTS, whose toggles MIRROR the phone's permissions — tapping an
 * off toggle asks (the rider flow P1/P9, or PC8 for order updates) or opens phone settings when it can't,
 * tapping an on toggle opens phone settings (the app can't switch a permission off); the rider's Location
 * row turns danger when off (P15) and Battery saver opens P16; the kept rider rows (Navigation app, Top-up
 * number); Sign out and Delete account last. Permissions are re-read on focus
 * and on return to the app — nothing is hardcoded "On".
 */
export default function SettingsScreen(): React.ReactElement {
  const router = useRouter();
  const { signOut } = useAuth();
  const me = useQuery({ queryKey: ["me"], queryFn: getMe }).data;
  const isRider = !!me?.rider && riderModeAvailable();
  const { perms, refresh } = usePermissions({ rider: isRider });
  // Back from the rider flow (a route, not an app switch): read again.
  useFocusEffect(refresh);
  const { prefs, save } = useRiderPrefs();
  const [editTopup, setEditTopup] = useState(false);
  const [draftProvider, setDraftProvider] = useState<TopupProviderId>(prefs.topupProvider);
  const [draftPhone, setDraftPhone] = useState("");

  const phone = me?.phone ? formatPhoneDisplay(me.phone) : "";
  const topupPhone = prefs.topupPhone ?? phone;

  const notifOn = perms?.notif === "granted";
  const jobAlertsOn = notifOn && !perms?.channelMuted;
  const locOn = perms?.loc === "granted" || perms?.loc === "coarse";
  const notifOff = perms != null && !notifOn;
  const locOff = perms != null && !locOn;
  const missing = isRider ? bikeItemsToAdd(me?.rider) : 0;

  const go = useCallback((href: string) => router.push(href as never), [router]);
  // PC11 "Turn on" / the Order updates toggle (owner 2026-10-06, D-82 §4): the Android dialog directly while it
  // can still ask (a decline just leaves the card up); when it can't, the phone-settings steps sheet. On → settings.
  const [notifSteps, setNotifSteps] = useState(false);
  const orderUpdates = (): void => {
    if (notifOn) return openPhoneSettings();
    if (perms?.notif === "blocked") return setNotifSteps(true);
    void requestNotif().then((state) => {
      if (state === "granted") requestPushRegistration();
      refresh();
    });
  };
  const jobAlerts = (): void => (jobAlertsOn ? openPhoneSettings() : go(RIDER_PERM_ROUTES.notifications));
  const location = (): void => (locOn ? openPhoneSettings() : go(RIDER_PERM_ROUTES.location));

  const openTopupEdit = (): void => {
    setDraftProvider(prefs.topupProvider);
    setDraftPhone(topupPhone);
    setEditTopup(true);
  };

  return (
    <>
      <FirstRunScreen
        testID="settings"
        header={
          <>
            <BackHeader onBack={() => router.back()} />
            <LargeTitle>{ST.title}</LargeTitle>
          </>
        }
      >
        {notifOff ? (
          // PC11 — the danger card at the top while order updates are off.
          <View testID="settings-pc11" style={{ marginTop: 4, marginBottom: 20, borderRadius: 20, padding: 16, flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: tokens.color.dangerWash }}>
            <IconDot icon="bell" tone="bad" bg={tokens.color.bg} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, lineHeight: 19.6, fontWeight: tokens.font.weight.bold, color: tokens.color.dangerInk }}>{PC.setOffTitle}</Text>
              <Text style={{ marginTop: 2, fontSize: 14, lineHeight: 19.6, color: tokens.color.ink }}>{PC.setOffBody}</Text>
              <FrSoftPill tone="dangerWhite" label={PC.setOffCta} onPress={orderUpdates} style={{ marginTop: 12 }} testID="settings-pc11-turn-on" />
            </View>
          </View>
        ) : null}

        <Caption first>{ST.you}</Caption>
        <ListCard>
          <ListRow icon="user" iconTone="ok" title={PD.row} sub={PD.rowSub} chevron onPress={() => go("/settings/personal")} testID="settings-personal" />
          {isRider ? (
            <ListRow
              icon="bike"
              iconTone="vi"
              title={R.sBike}
              value={missing > 0 ? toAdd(missing) : bikeVerified(me?.rider) ? R.sBikeV : null}
              valueOk={missing === 0 && bikeVerified(me?.rider)}
              chevron
              onPress={() => go("/rider/documents")}
              testID="settings-bike"
            />
          ) : null}
          <ListRow icon="globe" title={ST.language} value={ST.english} chevron onPress={() => go("/settings/language")} />
          <ListRow icon="file-text" title={R.sPrivacy} chevron onPress={() => go("/settings/privacy")} />
          <ListRow icon="file-text" title={R.sTerms} chevron onPress={() => void Linking.openURL(TERMS_URL)} />
          <ListRow icon="banknote" title={R.sPay} value={R.sPayV} />
        </ListCard>

        <Caption>{ST.alerts}</Caption>
        <ListCard testID="settings-alerts">
          {isRider ? (
            <ListRow
              icon="volume-2"
              title={ST.jobAlerts}
              sub={ST.jobAlertsSub}
              right={<Toggle value={jobAlertsOn} onPress={perms ? jobAlerts : undefined} accessibilityLabel={ST.jobAlerts} testID="toggle-job-alerts" />}
            />
          ) : null}
          {isRider ? (
            <ListRow
              icon="map-pin"
              title={ST.location}
              sub={locOff ? ST.locationOff : ST.locationSub}
              danger={locOff}
              // P15: the whole danger row reopens P1 (or P6 when blocked), like its toggle.
              onPress={locOff ? location : undefined}
              right={<Toggle value={locOn} onPress={perms ? location : undefined} accessibilityLabel={ST.location} testID="toggle-location" />}
              testID="settings-location"
            />
          ) : null}
          <ListRow icon="bell" title={ST.orderUpdates} right={<Toggle value={notifOn} onPress={perms ? orderUpdates : undefined} accessibilityLabel={ST.orderUpdates} testID="toggle-order-updates" />} />
          {isRider ? <ListRow icon="battery" title={ST.battery} sub={ST.batterySub} chevron onPress={() => go(RIDER_PERM_ROUTES.battery)} testID="settings-battery" /> : null}
        </ListCard>

        {isRider ? (
          <>
            <Caption>{R.secRider}</Caption>
            <ListCard>
              <NavAppRow value={prefs.navApp} onChange={(navApp) => save({ navApp })} />
              <ListRow icon="smartphone" title={R.sTopNum} sub={RF.sTopNumV(providerName(prefs.topupProvider), topupPhone)} chevron onPress={openTopupEdit} />
            </ListCard>
          </>
        ) : null}

        <ListCard style={{ marginTop: 16 }}>
          <ListRow icon="log-out" title={ST.signOut} onPress={() => void signOut()} />
          <ListRow icon="trash" iconTone="bad" title={R.sDelete} sub={R.sDeleteS} titleColor={tokens.color.dangerInk} onPress={() => go("/settings/delete-account")} />
        </ListCard>
      </FirstRunScreen>

      {/* Order updates blocked for good: the PC5-shaped phone-settings steps in notification words (owner, D-82 §4). */}
      <FrSheet visible={notifSteps} onClose={() => setNotifSteps(false)} testID="settings-notif-steps">
        <SplitTitle a={RP.blockedA} b={RP.blockedB} tone="danger" style={{ marginTop: 0 }} />
        <Body>{isRider ? RP.blockedBody : PC.setOffBody}</Body>
        <SystemSettingsSteps steps={[RP.step1, RP.nStep2, isRider ? RP.nStep3 : NOTIF_STEP3_CUSTOMER]} />
        <PinnedFooter
          inline
          primary={{
            label: RP.openSettings,
            testID: "settings-notif-open",
            onPress: () => {
              setNotifSteps(false);
              openPhoneSettings();
            },
          }}
        />
      </FrSheet>

      <MSheet
        visible={editTopup}
        onClose={() => setEditTopup(false)}
        title={R.sTopNum}
        buttons={
          <CtaButton
            label={R.save}
            onPress={() => {
              save({ topupProvider: draftProvider, topupPhone: draftPhone.trim() && draftPhone.trim() !== phone ? draftPhone.trim() : null });
              setEditTopup(false);
            }}
          />
        }
      >
        <Chips list={TOPUP_PROVIDERS.map((p) => ({ id: p.id, label: p.name }))} value={draftProvider} onChange={setDraftProvider} />
        <SendField label={R.phoneL} value={draftPhone} onChangeText={setDraftPhone} keyboardType="phone-pad" autoComplete="tel" />
      </MSheet>
    </>
  );
}

/** The kept Navigation app row (not drawn by D1): its title row, then the Google Maps / Waze choice. */
function NavAppRow({ value, onChange, first }: { value: "gmaps" | "waze"; onChange: (v: "gmaps" | "waze") => void; first?: boolean }): React.ReactElement {
  return (
    <View>
      <ListRow first={first} icon="navigation" title={R.sNav} sub={R.sNavS} />
      <View style={{ paddingHorizontal: 14, paddingBottom: 12 }}>
        <Seg
          opts={[
            { id: "gmaps", label: R.gmaps },
            { id: "waze", label: R.waze },
          ]}
          value={value}
          onChange={onChange}
          accessibilityLabel={R.sNav}
        />
      </View>
    </View>
  );
}
