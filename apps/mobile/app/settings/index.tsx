import { formatPhoneDisplay } from "@lynia/shared";
import { useQuery } from "@tanstack/react-query";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { AppState, Linking, ScrollView, View } from "react-native";
import { getMe } from "../../src/api/auth";
import { useAuth } from "../../src/auth/auth-context";
import { TERMS_URL } from "../../src/config";
import { bikeVerified } from "../../src/logic/rider-documents";
import { providerName, TOPUP_PROVIDERS, type TopupProviderId, useRiderPrefs } from "../../src/logic/rider-prefs";
import { riderModeAvailable } from "../../src/rider-mode";
import { AppScreen, haptic } from "../../src/ui";
import { CtaButton, SmBtn } from "../../src/ui/order/kit";
import { SendField } from "../../src/ui/send/kit";
import { RIDER_COPY as R, RF } from "../../src/ui/rider/copy";
import { Chips, DangerBox, MSheet, PushHeader, RCard, RRow, SectionLabel, Seg } from "../../src/ui/rider/kit";

type Perm = "on" | "off" | null;

/** The phone's real notification + location permission, re-read whenever the app comes back. */
function usePermissions(): { notifs: Perm; location: Perm } {
  const [notifs, setNotifs] = useState<Perm>(null);
  const [location, setLocation] = useState<Perm>(null);
  React.useEffect(() => {
    let cancelled = false;
    const read = (): void => {
      void Notifications.getPermissionsAsync()
        .then((p) => !cancelled && setNotifs(p.granted ? "on" : "off"))
        .catch(() => undefined);
      void Location.getForegroundPermissionsAsync()
        .then((p) => !cancelled && setLocation(p.granted ? "on" : "off"))
        .catch(() => undefined);
    };
    read();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") read();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);
  return { notifs, location };
}

/** A local notification on the app's default channel, so the rider hears exactly what a job sounds like. */
function testAlert(kind: "ping" | "alarm"): void {
  haptic(kind === "alarm" ? "warning" : "notify");
  void Notifications.scheduleNotificationAsync({
    content: { title: kind === "alarm" ? R.tFoodOffer : R.sAlerts, body: kind === "alarm" ? R.testAlarm : R.testPing, sound: true },
    trigger: null,
  }).catch(() => undefined);
}

/**
 * Settings (Rider v2 S1–S4, ledger D-54): one screen in sections — YOUR ACCOUNT → CUSTOMER → RIDER
 * (riders only) → a last card with Sign out and Delete account, so Delete is always last on screen.
 * Permission values come from the phone and are re-read on resume; nothing is hardcoded "On".
 * No Edit profile row and no "coming soon" items (D-26).
 */
export default function SettingsScreen(): React.ReactElement {
  const router = useRouter();
  const { signOut } = useAuth();
  const me = useQuery({ queryKey: ["me"], queryFn: getMe }).data;
  const { notifs, location } = usePermissions();
  const { prefs, save } = useRiderPrefs();
  const [editTopup, setEditTopup] = useState(false);
  const [draftProvider, setDraftProvider] = useState<TopupProviderId>(prefs.topupProvider);
  const [draftPhone, setDraftPhone] = useState("");

  const isRider = !!me?.rider && riderModeAvailable();
  const name = me ? `${me.firstName} ${me.lastName}`.trim() : "";
  const phone = me?.phone ? formatPhoneDisplay(me.phone) : "";
  const topupPhone = prefs.topupPhone ?? phone;
  const openOs = (): void => void Linking.openSettings();
  const notifsOff = notifs === "off";
  const locOff = location === "off";

  const openTopupEdit = (): void => {
    setDraftProvider(prefs.topupProvider);
    setDraftPhone(topupPhone);
    setEditTopup(true);
  };

  return (
    <AppScreen banner={<PushHeader title={R.tSettings} onBack={() => router.back()} />}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 12 }} showsVerticalScrollIndicator={false}>
        <SectionLabel>{R.secAccount}</SectionLabel>
        <RCard>
          <RRow first icon="user" label={name || R.tabAccount} sub={phone || null} chev={false} />
          {/* D-78 (owner 2026-10-06): C5's "You can add it in Account". Words are the handoff's (mint2.js). */}
          <RRow icon="id-card" label={R.sPersonal} sub={R.sPersonalS} onPress={() => router.push("/settings/personal")} />
          <RRow icon="globe" label={R.sLang} value={R.sLangV} onPress={() => router.push("/settings/language")} />
          <RRow icon="file-text" label={R.sPrivacy} onPress={() => router.push("/settings/privacy")} />
          <RRow icon="file-text" label={R.sTerms} onPress={() => void Linking.openURL(TERMS_URL)} />
        </RCard>

        <SectionLabel>{R.secCustomer}</SectionLabel>
        <RCard>
          <RRow first icon="banknote" label={R.sPay} value={R.sPayV} chev={false} />
          <RRow
            icon="bell"
            label={R.sNotifC}
            value={notifs == null ? null : notifsOff ? R.sOff : R.sOn}
            sub={notifsOff ? R.sNotifCOff : null}
            tone={notifsOff ? "warn" : null}
            onPress={openOs}
          />
        </RCard>

        {isRider ? (
          <>
            <SectionLabel>{R.secRider}</SectionLabel>
            <RCard>
              <RRow first icon="volume-2" label={R.sAlerts} value={notifs == null ? null : notifsOff ? R.sOff : R.sOn} tone={notifsOff ? "warn" : "ok"} sub={R.sAlertsS} chev={false}>
                {notifsOff ? <DangerBox text={R.sAlertsOff} /> : null}
                <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                  {notifsOff ? (
                    <SmBtn kind="fill" flex={1} label={R.sOpenSettings} icon="settings" onPress={openOs} />
                  ) : (
                    <>
                      <SmBtn flex={1} label={R.testPing} icon="bell" onPress={() => testAlert("ping")} />
                      <SmBtn flex={1} label={R.testAlarm} icon="volume-2" onPress={() => testAlert("alarm")} />
                    </>
                  )}
                </View>
              </RRow>
              <RRow
                icon="map-pin"
                label={R.sLoc}
                value={location == null ? null : locOff ? R.sOff : R.sLocV}
                tone={locOff ? "warn" : null}
                sub={locOff ? null : R.sLocS}
                onPress={openOs}
              >
                {locOff ? <DangerBox text={R.sLocOff} /> : null}
              </RRow>
              <RRow icon="navigation" label={R.sNav} sub={R.sNavS} chev={false}>
                <View style={{ marginTop: 8 }}>
                  <Seg
                    opts={[
                      { id: "gmaps", label: R.gmaps },
                      { id: "waze", label: R.waze },
                    ]}
                    value={prefs.navApp}
                    onChange={(navApp) => save({ navApp })}
                    accessibilityLabel={R.sNav}
                  />
                </View>
              </RRow>
              <RRow icon="smartphone" label={R.sTopNum} sub={RF.sTopNumV(providerName(prefs.topupProvider), topupPhone)} onPress={openTopupEdit} />
              <RRow
                icon="id-card"
                label={R.sBike}
                sub={me?.rider?.bikeReg ? RF.sBikeS(me.rider.bikeReg, null) : null}
                value={bikeVerified(me?.rider) ? R.sBikeV : null}
                tone={bikeVerified(me?.rider) ? "ok" : null}
                onPress={() => router.push("/rider/documents")}
              />
            </RCard>
          </>
        ) : null}

        <RCard style={{ marginTop: 8 }}>
          <RRow first icon="log-out" label={R.sSignOut} chev={false} onPress={() => void signOut()} />
          <RRow icon="trash" label={R.sDelete} sub={R.sDeleteS} danger chev={false} onPress={() => router.push("/settings/delete-account")} />
        </RCard>
      </ScrollView>

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
    </AppScreen>
  );
}

