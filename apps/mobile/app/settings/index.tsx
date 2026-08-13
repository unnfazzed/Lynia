import { formatNameShort, formatPhoneDisplay, tokens } from "@lynia/shared";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import React from "react";
import { AppState, Linking, Pressable, Text, View } from "react-native";
import { getMe } from "../../src/api/auth";
import { useAuth } from "../../src/auth/auth-context";
import { AppBar, Icon, type IconName, Screen } from "../../src/ui";

/**
 * Settings (customer + rider A·6 / A·4). A lean row list — profile, notifications, language, payment
 * (cash, by decision), and sign-out. Rows that need a write endpoint we don't have yet ("Edit
 * profile", "Language") are honest: they read as "coming soon" rather than dead taps. Payment is
 * fixed to Cash (§6). Notifications reflects the REAL OS permission and taps through to OS settings;
 * language stays display-only until per-language copy lands.
 *
 * "Delete account" and "Privacy notice" are Google Play listing REQUIREMENTS, not niceties: Play
 * policy obliges any app offering account creation to offer in-app account deletion, and the privacy
 * notice must be reachable from the app as well as from the store listing. See
 * docs/PLAY-STORE-SUBMISSION.md §4.
 */
function Row(props: { icon: IconName; label: string; value?: string; danger?: boolean; onPress?: () => void }): React.ReactElement {
  return (
    <Pressable
      onPress={props.onPress}
      disabled={!props.onPress}
      accessibilityRole="button"
      accessibilityLabel={props.label}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: tokens.space.md,
        minHeight: tokens.touchTargetMin,
        paddingVertical: tokens.space.md,
        borderBottomWidth: 1,
        borderBottomColor: tokens.color.line,
        opacity: pressed && props.onPress ? 0.6 : 1,
      })}
    >
      <Icon name={props.icon} size={19} color={props.danger ? tokens.color.danger : tokens.color.accentText} />
      <Text style={{ flex: 1, fontSize: 14, fontWeight: "600", color: props.danger ? tokens.color.danger : tokens.color.ink }}>{props.label}</Text>
      {props.value ? <Text style={{ fontSize: 13, color: tokens.color.muted }}>{props.value}</Text> : null}
      {!props.danger && props.onPress ? <Icon name="chevron-right" size={17} color={tokens.color.muted} /> : null}
    </Pressable>
  );
}

/**
 * A permission row (mock screens-shipped.jsx `SettingsPerms`, SH11): icon · label · the REAL value
 * read off the phone · chevron, with the consequence of a denied permission spelled out underneath.
 * The value is never hardcoded — a settings screen that claims "On" while the OS says otherwise is
 * the exact lie this section exists to remove.
 */
function PermissionRow(props: {
  icon: IconName;
  label: string;
  value: string;
  warn?: boolean;
  consequence?: string;
  onPress: () => void;
}): React.ReactElement {
  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: tokens.color.line }}>
      <Pressable
        onPress={props.onPress}
        accessibilityRole="button"
        accessibilityLabel={props.label}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingVertical: 13,
          minHeight: tokens.touchTargetMin,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <Icon name={props.icon} size={19} color={tokens.color.accentText} />
        <Text style={{ flex: 1, fontSize: 14, fontWeight: "600", color: tokens.color.ink }}>{props.label}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          {props.warn ? <Icon name="triangle-alert" size={14} color={tokens.color.dangerInk} /> : null}
          <Text
            style={{
              fontSize: 13,
              fontWeight: props.warn ? "700" : "400",
              color: props.warn ? tokens.color.dangerInk : tokens.color.muted,
            }}
          >
            {props.value}
          </Text>
        </View>
        <Icon name="chevron-right" size={17} color={tokens.color.muted} />
      </Pressable>
      {props.consequence ? (
        <View style={{ flexDirection: "row", gap: 8, paddingBottom: 12, paddingLeft: 31 }}>
          <Text style={{ flex: 1, fontSize: 12, color: tokens.color.muted, lineHeight: 17 }}>
            {props.consequence}{" "}
            <Text style={{ fontWeight: "700", color: tokens.color.accentText }} onPress={props.onPress}>
              Open system settings
            </Text>
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export default function SettingsScreen(): React.ReactElement {
  const router = useRouter();
  const { session, signOut } = useAuth();
  const meQ = useQuery({ queryKey: ["me"], queryFn: getMe });
  const me = meQ.data;
  const isRider = (me?.role ?? session?.role) === "rider";
  const version = Constants.expoConfig?.version ?? "1.0.0";

  // Reflect the REAL OS notification permission instead of a hardcoded "On" (which lied to anyone who
  // denied it). Re-read on foreground so returning from OS settings updates the row. Tapping opens the
  // OS app settings — the only place the permission can actually be changed.
  const [notifsOn, setNotifsOn] = React.useState<boolean | null>(null);
  // Location is read the same way — the mock's permissions section draws BOTH rows from the phone
  // ("While using" / "Ask every time"), so neither may be a constant.
  const [locationValue, setLocationValue] = React.useState<string | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    const read = (): void => {
      void Notifications.getPermissionsAsync()
        .then((p) => {
          if (!cancelled) setNotifsOn(p.granted);
        })
        .catch(() => undefined);
      void Location.getForegroundPermissionsAsync()
        .then((p) => {
          if (cancelled) return;
          // The mock's two drawn values, plus the honest third the OS can also report (denied for good).
          setLocationValue(p.granted ? "While using" : p.canAskAgain ? "Ask every time" : "Off");
        })
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

  return (
    <Screen>
      {/* Kit AppBar (pushed-screen header) — title lives in the bar; no in-body Heading. */}
      <AppBar title="Settings" onBack={() => router.back()} />

      <View style={{ flexDirection: "row", alignItems: "center", gap: tokens.space.md, marginBottom: tokens.space.md, marginTop: tokens.space.sm }}>
        <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: tokens.color.accentWash, alignItems: "center", justifyContent: "center" }}>
          <Icon name="user" size={24} color={tokens.color.accentText} />
        </View>
        <View>
          {/* Mock identity-row forms (SH11 `Settings` draws "Chipo M." + "+263 77 245 1180"): the
              short name and the spaced-E.164 phone — mock copy verbatim, not the stored full forms. */}
          <Text style={{ fontSize: 16, fontWeight: "700", color: tokens.color.ink }}>
            {me ? formatNameShort(`${me.firstName} ${me.lastName}`.trim()) || "Your account" : "Your account"}
          </Text>
          {me?.phone ? <Text style={{ fontSize: 13, color: tokens.color.muted, fontVariant: ["tabular-nums"] }}>{formatPhoneDisplay(me.phone)}</Text> : null}
        </View>
      </View>

      <Row
        icon={isRider ? "bike" : "user"}
        label={isRider ? "Bike & documents" : "Edit profile"}
        value={isRider ? undefined : "Coming soon"}
        onPress={isRider ? () => router.push("/rider/documents") : undefined}
      />
      {/* PERMISSIONS — the SH11 section (LJ.settings_perms / LJ.settings_perms_ok). Both rows read the
          phone's real state and tap through to OS settings, the only place either can be changed. */}
      <Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 0.44, color: tokens.color.muted, marginTop: 10, marginBottom: 2 }}>
        PERMISSIONS — READ FROM YOUR PHONE
      </Text>
      <PermissionRow
        icon="navigation"
        label="Location"
        value={locationValue ?? "—"}
        onPress={() => void Linking.openSettings()}
      />
      <PermissionRow
        icon="bell"
        label="Notifications"
        value={notifsOn === null ? "—" : notifsOn ? "On" : "Off"}
        warn={notifsOn === false}
        consequence={notifsOn === false ? "You won't hear when a rider offers or when your parcel arrives." : undefined}
        onPress={() => void Linking.openSettings()}
      />
      <Text style={{ fontSize: 11.5, color: tokens.color.muted, lineHeight: 17, marginTop: 8, marginBottom: 12 }}>
        These show your phone&apos;s real settings — LyniaGo re-checks them every time you come back to
        the app. Changing one opens Android settings.
      </Text>
      <Row icon="map-pin" label="Language" value="English" />
      <Row icon="banknote" label="Payment" value="Cash" />
      {/* Privacy is a DRAWN in-app screen (LJ.privacy) — it explains what we collect, what others see
          and how long we keep it, and carries the route into deletion. The hosted notice stays the
          store-listing artefact; the app no longer bounces the user out to it. */}
      <Row icon="shield" label="Privacy notice" onPress={() => router.push("/settings/privacy")} />
      <View style={{ height: tokens.space.md }} />
      <Row icon="x" label="Sign out" danger onPress={() => void signOut()} />

      {/* Deletion is its own two-screen flow (LJ.delete_account → LJ.delete_final): irreversible, so
          the explainer + the live "is a delivery running?" check + the acknowledgement tick live on
          their own screens rather than in an inline card here. */}
      <Row icon="trash" label="Delete account" danger onPress={() => router.push("/settings/delete-account")} />

      <Text style={{ fontSize: 11, color: tokens.color.muted, textAlign: "center", marginTop: tokens.space.lg }}>LyniaGo v{version}</Text>
    </Screen>
  );
}
