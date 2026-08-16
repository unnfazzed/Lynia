import { formatNameShort, formatPhoneDisplay, tokens } from "@lynia/shared";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import React from "react";
import { AppState, Linking, Pressable, ScrollView, Text, View } from "react-native";
import { getMe } from "../../src/api/auth";
import { useAuth } from "../../src/auth/auth-context";
import { AppBar, Icon, type IconName, Screen } from "../../src/ui";
import { AccountIdentityCard, AccountRowList } from "../../src/ui/account/AccountRows";

/**
 * Settings (customer + rider A·6 / A·4). A lean row list — profile, notifications, language, payment
 * (cash, by decision), and sign-out. Rows that need a write endpoint we don't have yet ("Edit
 * profile", "Language") are honest: they read as "coming soon" rather than dead taps. Payment is
 * fixed to Cash (§6). Notifications reflects the REAL OS permission and taps through to OS settings;
 * language stays display-only until per-language copy lands.
 *
 * ROLE-INDEPENDENT by design (D-22): every row here is device, app or legal, so both roles get the
 * same screen. Both Account tabs now reach it directly, which is what let the rider-only "Bike &
 * documents" swap come off the first row — rider paperwork belongs on the rider side.
 *
 * "Delete account" and "Privacy notice" are Google Play listing REQUIREMENTS, not niceties: Play
 * policy obliges any app offering account creation to offer in-app account deletion, and the privacy
 * notice must be reachable from the app as well as from the store listing. See
 * docs/PLAY-STORE-SUBMISSION.md §4.
 *
 * The screen's own bespoke `Row` (icon 19 accentText · label 14 · right-aligned value) is GONE —
 * replaced by the shared account row grammar (`src/ui/account/AccountRows.tsx`) that the rider
 * Account tab draws, per `docs/DESIGN-DEVIATIONS.md` D-15. Each row's old right-hand VALUE became its
 * sub-line, which is where the rider grammar puts a row's supporting fact. The permissions section
 * below keeps its own `PermissionRow`: that one is aligned to its OWN drawn mock (SH11
 * `SettingsPerms` — LJ.settings_perms / settings_perms_ok), so harmonising it would be drift, not
 * alignment.
 */

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
  const { signOut } = useAuth();
  const meQ = useQuery({ queryKey: ["me"], queryFn: getMe });
  const me = meQ.data;
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

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Mock identity-row forms (SH11 `Settings` draws "Chipo M." + "+263 77 245 1180"): the short
            name and the spaced-E.164 phone — mock copy verbatim, not the stored full forms. Now drawn
            by the SHARED account identity card, so this screen's header block matches both Account
            tabs instead of its own 52px variant. */}
        <AccountIdentityCard
          name={me ? formatNameShort(`${me.firstName} ${me.lastName}`.trim()) || "Your account" : "Your account"}
          line={me?.phone ? formatPhoneDisplay(me.phone) : undefined}
        />

        {/* The mock's own first row, for EVERY role. It used to be swapped for "Bike & documents"
            when the caller was a rider, which put that row in three places at once (rider Account
            tab, /profile, here) and made a shared screen role-dependent for no gain — Settings is
            device, app and legal, not rider paperwork. Dropping the swap also moves this screen
            CLOSER to LJ.settings, which draws "Edit profile" unconditionally (D-22).
            "Coming soon" verbatim — the string the expected-conformance JSON already sanctions for
            this row (tools/parity/expected/LJ.settings_perms*.json `extra`). */}
        <AccountRowList rows={[{ icon: "user", label: "Edit profile", sub: "Coming soon" }]} />

        {/* PERMISSIONS — the SH11 section (LJ.settings_perms / LJ.settings_perms_ok). Both rows read the
            phone's real state and tap through to OS settings, the only place either can be changed.
            Left in its OWN drawn grammar deliberately: it aligns to a mock of its own (see the header
            note), so D-15's harmonisation stops at its edge. */}
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

        <AccountRowList
          rows={[
            // "English" / "Cash" are the mock's own drawn values, moved from a right-hand value into
            // the row's sub-line slot. Mock copy verbatim — the harmonisation changes the GRAMMAR the
            // row is drawn in, never the strings (CLAUDE.md, "Mock copy verbatim — no exceptions").
            { icon: "map-pin", label: "Language", sub: "English" },
            { icon: "banknote", label: "Payment", sub: "Cash" },
            // Privacy is a DRAWN in-app screen (LJ.privacy) — it explains what we collect, what others
            // see and how long we keep it, and carries the route into deletion. The hosted notice stays
            // the store-listing artefact; the app no longer bounces the user out to it. No sub-line:
            // the mock draws none, and this row is already sanctioned as an `extra` by label alone.
            { icon: "shield", label: "Privacy notice", onPress: () => router.push("/settings/privacy") },
          ]}
          style={{ marginTop: 0 }}
        />

        <AccountRowList
          rows={[
            // Both label-only: the mock draws no sub-line on either, and both are sanctioned as
            // `extra` by label alone in the expected JSONs.
            { icon: "x", label: "Sign out", danger: true, onPress: () => void signOut() },
            // Deletion is its own two-screen flow (LJ.delete_account → LJ.delete_final): irreversible,
            // so the explainer + the live "is a delivery running?" check + the acknowledgement tick
            // live on their own screens rather than in an inline card here.
            { icon: "trash", label: "Delete account", danger: true, onPress: () => router.push("/settings/delete-account") },
          ]}
        />

        <Text style={{ fontSize: 11, color: tokens.color.muted, textAlign: "center", marginTop: tokens.space.lg }}>LyniaGo v{version}</Text>
      </ScrollView>
    </Screen>
  );
}
