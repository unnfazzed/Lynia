import { tokens } from "@lynia/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import React from "react";
import { AppState, Linking, Pressable, Text, View } from "react-native";
import { deleteAccount, getMe } from "../../src/api/auth";
import { useAuth } from "../../src/auth/auth-context";
import { PRIVACY_URL } from "../../src/config";
import { Button, Card, ErrorText, Heading, Icon, type IconName, Screen } from "../../src/ui";

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
  React.useEffect(() => {
    let cancelled = false;
    const read = (): void => void Notifications.getPermissionsAsync().then((p) => {
      if (!cancelled) setNotifsOn(p.granted);
    }).catch(() => undefined);
    read();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") read();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  // Two-step account deletion (Play policy + CDPA right to erasure). Step one reveals the confirm
  // card; the destructive call only ever fires from the card's explicit second tap — the same
  // "no destructive single tap" pattern the matched-order cancel uses (app/order/[id].tsx).
  const [deleteConfirm, setDeleteConfirm] = React.useState(false);
  const deleteM = useMutation({
    mutationFn: deleteAccount,
    // The account no longer exists, so the local session is now a stale token pointing at an
    // anonymised profile. Sign out to clear it (and every cached body keyed to it) rather than
    // leaving the app to discover the account is gone via a 401 on the next poll.
    onSuccess: () => void signOut(),
  });
  // The API's 409s ("finish your active delivery", "account under a standing restriction") are
  // already user-facing copy, so they surface verbatim — the user's next action differs per case and
  // a generic "couldn't delete" would hide which one they're in.
  const deleteError = deleteM.error instanceof Error ? deleteM.error.message : null;

  return (
    <Screen>
      <Heading>Settings</Heading>

      <View style={{ flexDirection: "row", alignItems: "center", gap: tokens.space.md, marginBottom: tokens.space.md, marginTop: tokens.space.sm }}>
        <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: tokens.color.accentWash, alignItems: "center", justifyContent: "center" }}>
          <Icon name="user" size={24} color={tokens.color.accentText} />
        </View>
        <View>
          <Text style={{ fontSize: 16, fontWeight: "700", color: tokens.color.ink }}>
            {me ? `${me.firstName} ${me.lastName}`.trim() || "Your account" : "Your account"}
          </Text>
          {me?.phone ? <Text style={{ fontSize: 13, color: tokens.color.muted, fontVariant: ["tabular-nums"] }}>{me.phone}</Text> : null}
        </View>
      </View>

      <Row
        icon={isRider ? "bike" : "user"}
        label={isRider ? "Bike & documents" : "Edit profile"}
        value={isRider ? undefined : "Coming soon"}
        onPress={isRider ? () => router.push("/rider/documents") : undefined}
      />
      <Row
        icon="phone"
        label="Notifications"
        value={notifsOn === null ? "—" : notifsOn ? "On" : "Off"}
        onPress={() => void Linking.openSettings()}
      />
      <Row icon="map-pin" label="Language" value="English" />
      <Row icon="banknote" label="Payment" value="Cash" />
      <Row icon="shield" label="Privacy notice" onPress={() => void Linking.openURL(PRIVACY_URL)} />
      <View style={{ height: tokens.space.md }} />
      <Row icon="x" label="Sign out" danger onPress={() => void signOut()} />

      {deleteConfirm ? (
        <Card style={{ borderColor: tokens.color.danger }}>
          <Text style={{ fontSize: tokens.font.size.bodyLg, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, marginBottom: tokens.space.xs }}>
            Delete your account?
          </Text>
          <Text style={{ fontSize: tokens.font.size.body, color: tokens.color.muted, lineHeight: 20, marginBottom: tokens.space.sm }}>
            This removes your name, phone number, ID and photos, your saved addresses, and the GPS
            trail on your deliveries. Your past deliveries stay on record as an anonymised financial
            entry. This can&apos;t be undone, and you&apos;ll be signed out of every device.
          </Text>
          <ErrorText message={deleteError} />
          <Button
            label="Yes, delete my account"
            onPress={() => deleteM.mutate()}
            loading={deleteM.isPending}
          />
          <Button label="Keep my account" variant="ghost" onPress={() => { setDeleteConfirm(false); deleteM.reset(); }} />
        </Card>
      ) : (
        <Row icon="trash" label="Delete account" danger onPress={() => setDeleteConfirm(true)} />
      )}

      <Text style={{ fontSize: 11, color: tokens.color.muted, textAlign: "center", marginTop: tokens.space.lg }}>LyniaGo v{version}</Text>
      <Button label="Back" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
