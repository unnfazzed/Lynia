import { tokens } from "@lynia/shared";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { saveRolePreference, type StartRole } from "../src/auth/session";
import { Button, Heading, Icon, type IconName, Screen, Sub } from "../src/ui";

/**
 * Post-OTP role fork (RIDER-JOURNEY-AUDIT R0-4): sign-in is identical to the customer up to here, so
 * this is where a freshly-verified account says how they want to start — one account, two roles,
 * switchable later. Picking "rider" routes into the existing rider/KYC entry; "customer" goes home.
 * The choice is persisted (saveRolePreference), so verify.tsx sends existing users straight home
 * instead of re-prompting every launch.
 */
export default function RoleScreen(): React.ReactElement {
  const router = useRouter();
  const [role, setRole] = useState<StartRole>("customer");

  const go = (choice: StartRole): void => {
    setRole(choice);
    void saveRolePreference(choice);
    // Rider → the rider home, which itself gates into /rider/become (KYC) when they haven't set up yet.
    router.replace(choice === "rider" ? "/rider" : "/home");
  };

  return (
    <Screen>
      <Heading>How do you want to start?</Heading>
      <Sub>It&apos;s one account — pick how you&apos;ll use Lynia now, and switch anytime.</Sub>

      <RoleOption
        icon="package"
        title="Send a parcel"
        desc="Post a delivery and let nearby riders bid."
        selected={role === "customer"}
        onPress={() => setRole("customer")}
      />
      <RoleOption
        icon="bike"
        title="Earn as a rider"
        desc="Deliver parcels near you and get paid in cash."
        selected={role === "rider"}
        onPress={() => setRole("rider")}
      />

      <Button label={role === "rider" ? "Continue as a rider" : "Continue"} onPress={() => go(role)} />
    </Screen>
  );
}

function RoleOption(props: {
  icon: IconName;
  title: string;
  desc: string;
  selected: boolean;
  onPress: () => void;
}): React.ReactElement {
  const { selected } = props;
  return (
    <Pressable
      onPress={props.onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${props.title}. ${props.desc}`}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: tokens.space.md,
        minHeight: tokens.touchTargetPrimary,
        padding: tokens.space.lg,
        borderRadius: tokens.radius.card,
        borderWidth: 1.5,
        // Selected chip state: mint wash + green text-border; the bright accent fill stays for the
        // icon tile only (non-text fill), never white text on bright accent.
        borderColor: selected ? tokens.color.accentText : tokens.color.line,
        backgroundColor: selected ? tokens.color.accentWash : tokens.color.bg,
        marginBottom: tokens.space.md,
      }}
    >
      <View
        style={{
          width: 46,
          height: 46,
          borderRadius: 23,
          backgroundColor: selected ? tokens.color.accent : tokens.color.surface,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name={props.icon} size={22} color={selected ? tokens.color.onAccent : tokens.color.accentText} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: tokens.font.size.bodyLg, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>{props.title}</Text>
        <Text style={{ fontSize: tokens.font.size.caption, color: tokens.color.muted, marginTop: 1 }}>{props.desc}</Text>
      </View>
      <Icon name={selected ? "check" : "chevron-right"} size={20} color={selected ? tokens.color.accentText : tokens.color.muted} />
    </Pressable>
  );
}
