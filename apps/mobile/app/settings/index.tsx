import { tokens } from "@lynia/shared";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { getMe } from "../../src/api/auth";
import { useAuth } from "../../src/auth/auth-context";
import { Button, Heading, Icon, type IconName, Screen } from "../../src/ui";

/**
 * Settings (customer + rider A·6 / A·4). A lean row list — profile, notifications, language, payment
 * (cash, by decision), and sign-out. Rows that need a write endpoint we don't have yet ("Edit
 * profile", "Language") are honest: they read as "coming soon" rather than dead taps. Payment is
 * fixed to Cash (§6) and notifications/language are display-only until their settings land.
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

      <Row icon={isRider ? "bike" : "user"} label={isRider ? "Bike & documents" : "Edit profile"} onPress={isRider ? () => router.push("/rider/documents") : undefined} />
      <Row icon="phone" label="Notifications" value="On" />
      <Row icon="map-pin" label="Language" value="English" />
      <Row icon="banknote" label="Payment" value="Cash" />
      <View style={{ height: tokens.space.md }} />
      <Row icon="x" label="Sign out" danger onPress={() => void signOut()} />

      <Text style={{ fontSize: 11, color: tokens.color.muted, textAlign: "center", marginTop: tokens.space.lg }}>LyniaGo v{version}</Text>
      <Button label="Back" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
