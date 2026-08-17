import { formatNameShort, formatPhoneDisplay } from "@lynia/shared";
import { tokens } from "@lynia/shared/tokens";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import React from "react";
import { AppState, Linking, Text, View } from "react-native";
import { getMe } from "../../src/api/auth";
import { useAuth } from "../../src/auth/auth-context";
import { AppBar, Screen } from "../../src/ui";
import { AccountIdentityCard, AccountRowList, type AccountRow } from "../../src/ui/account/AccountRows";

/**
 * Settings (customer + rider A·6 / A·4) — the SAME card shape as the two Account tabs: identity card,
 * then ONE card holding every row, at the Account cluster's screen-edge inset.
 *
 * ROLE-INDEPENDENT by design (D-22): every row here is device, app or legal, so both roles get the
 * same screen. Both Account tabs reach it directly.
 *
 * "Delete account" and "Privacy notice" are Google Play listing REQUIREMENTS, not niceties: Play
 * policy obliges any app offering account creation to offer in-app account deletion, and the privacy
 * notice must be reachable from the app as well as from the store listing. See
 * docs/PLAY-STORE-SUBMISSION.md §4.
 *
 * **What changed here, and why (owner instruction 2026-08-16, from a handset photo of this screen
 * beside the Account tab — `docs/DESIGN-DEVIATIONS.md` D-25):** *"The settings page should have the
 * same card design and dimensions as the Account Tab. Remove the 'edit profile coming soon'
 * statement. These must be viewable. Permissions must fall under the same card and not be
 * separate."* Four consequences, all of them structural:
 *
 *  1. **One card, not four.** The screen used to draw an identity card, an Edit-profile card, a
 *     CARD-LESS permissions section sitting bare on the page, a Language/Payment/Privacy card and a
 *     danger card. Now: identity card + one `AccountRowList`, exactly the Account tab's shape.
 *  2. **The permission rows are rows in that card**, no longer their own section — so the screen's
 *     own bespoke `PermissionRow` is gone. Its right-aligned live value survived the move (owner's
 *     choice): a permission's value is what the row exists to state, so it stays where the mock
 *     draws it, and the shared row grammar grew a `value`/`warn`/`consequence` slot to hold it.
 *  3. **The section header and the "These show your phone's real settings…" paragraph are dropped**
 *     (owner's choice) — both existed to frame a separate section that no longer exists. The
 *     consequence line under a DENIED permission stays: that one is per-row, and it is the whole
 *     reason the rows read the OS instead of hardcoding "On".
 *  4. **Nothing here is a dead tap.** Every row opens something viewable — Language and Payment into
 *     their own detail screens, Privacy and Delete account into theirs. Editing is still locked, and
 *     per the owner the screen does not say so: it shows the details instead of apologising.
 *
 * **Superseded in part by D-26** (owner instruction 2026-08-17: *"Remove the edit profile for now..
 * Don't even put coming soon. Also when I click the profile under accounts it must not be clickable to
 * display another window for both rider and customer sides."*). D-25's fourth consequence routed both
 * the **Edit profile** row and the **identity card** into `/profile`; both routes are gone. The row is
 * removed entirely — no label, no "Coming soon", no disabled affordance — and the identity card is
 * inert on this screen exactly as it now is on both Account tabs. Nothing else about D-25 changes: one
 * card, permissions inside it, the dropped header and paragraph, the right-hand values, the inset.
 *
 * The 32px inset comes from the D-24 `Pad` body wrapper, mirroring both Account tabs — that is what
 * "same dimensions" means here, so this screen's cards are the same width as theirs.
 */
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

  const openOsSettings = (): void => void Linking.openSettings();

  const rows: AccountRow[] = [
    // NOTE: no "Edit profile" row. The mock draws one and this screen carried it until the owner's
    // 2026-08-17 instruction — *"Remove the edit profile for now.. Don't even put coming soon."* —
    // removed it outright (`docs/DESIGN-DEVIATIONS.md` D-26). Not a row with a disabled look, not a
    // "Coming soon" value, not a row that opens a read-only record: no row. Profile editing is
    // unbuilt, and the screen says nothing about it at all until it is.

    // The permission rows, inside the card. Both read the phone's real state and tap through to
    // OS settings, the only place either can be changed.
    { icon: "navigation", label: "Location", value: locationValue ?? "—", onPress: openOsSettings },
    {
      icon: "bell",
      label: "Notifications",
      value: notifsOn === null ? "—" : notifsOn ? "On" : "Off",
      warn: notifsOn === false,
      consequence: notifsOn === false ? "You won't hear when a rider offers or when your parcel arrives." : undefined,
      onPress: openOsSettings,
    },
    // "English" / "Cash" are the mock's own drawn values, in the mock's own right-hand slot. Both now
    // open a detail screen rather than sitting inert.
    { icon: "map-pin", label: "Language", value: "English", onPress: () => router.push("/settings/language") },
    { icon: "banknote", label: "Payment", value: "Cash", onPress: () => router.push("/settings/payment") },
    // Privacy is a DRAWN in-app screen (LJ.privacy) — it explains what we collect, what others see
    // and how long we keep it, and carries the route into deletion. The hosted notice stays the
    // store-listing artefact; the app no longer bounces the user out to it.
    { icon: "shield", label: "Privacy notice", onPress: () => router.push("/settings/privacy") },
    { icon: "x", label: "Sign out", danger: true, onPress: () => void signOut() },
    // Deletion is its own two-screen flow (LJ.delete_account → LJ.delete_final): irreversible, so the
    // explainer + the live "is a delivery running?" check + the acknowledgement tick live on their
    // own screens rather than in an inline card here.
    { icon: "trash", label: "Delete account", danger: true, onPress: () => router.push("/settings/delete-account") },
  ];

  return (
    // `scroll` — the whole body, so the card still reaches its last row on the mandatory 320×640 entry
    // phone. Same scaffold as both Account tabs (D-24).
    <Screen scroll>
      {/* Kit AppBar (pushed-screen header) — title lives in the bar; no in-body Heading. */}
      <AppBar title="Settings" onBack={() => router.back()} />

      {/* The Account cluster's `Pad` — the second 16px inset that sets the card width (D-24). */}
      <View style={{ padding: tokens.space.screen, minHeight: "100%", paddingTop: 0 }}>
        {/* Mock identity-row forms (SH11 `Settings` draws "Chipo M." + "+263 77 245 1180"): the short
            name and the spaced-E.164 phone — mock copy verbatim, not the stored full forms. Inert, like
            the one on both Account tabs (D-26) — the mock draws it as plain identity, not as a control. */}
        <AccountIdentityCard
          name={me ? formatNameShort(`${me.firstName} ${me.lastName}`.trim()) || "Your account" : "Your account"}
          line={me?.phone ? formatPhoneDisplay(me.phone) : undefined}
        />

        <AccountRowList rows={rows} />

        <Text style={{ fontSize: 11, color: tokens.color.muted, textAlign: "center", marginTop: tokens.space.lg }}>LyniaGo v{version}</Text>
      </View>
    </Screen>
  );
}
