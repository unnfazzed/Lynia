import { tokens } from "@lynia/shared";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Text, View } from "react-native";
import { Button, Icon, type IconName, Screen } from "../src/ui";

/**
 * First-run permission priming (customer-journey 0·7 / 0·8). Two explainer steps shown BEFORE the OS
 * dialogs so the customer knows why we're asking — location (to set the pickup pin + match nearby
 * riders) then notifications (offer + arrival + delivery alerts). Each step primes, then advances;
 * "Not now" skips without blocking (both permissions are re-requestable in context later). Ends at
 * /home. Push token registration itself is handled by the root PushSync and is permission-checked, so
 * priming here just brings the OS prompt forward with an explanation.
 */
type Step = "location" | "notifications";

export default function PermissionsScreen(): React.ReactElement {
  const router = useRouter();
  const [step, setStep] = useState<Step>("location");
  const [busy, setBusy] = useState(false);

  const done = (): void => router.replace("/home");

  const primeLocation = async (): Promise<void> => {
    setBusy(true);
    try {
      await Location.requestForegroundPermissionsAsync();
    } catch {
      /* the OS dialog can't fail us into a dead-end — advance regardless */
    } finally {
      setBusy(false);
      setStep("notifications");
    }
  };

  const primeNotifications = async (): Promise<void> => {
    setBusy(true);
    try {
      const existing = await Notifications.getPermissionsAsync();
      if (!existing.granted && existing.canAskAgain) await Notifications.requestPermissionsAsync();
    } catch {
      /* best-effort */
    } finally {
      setBusy(false);
      done();
    }
  };

  if (step === "location") {
    return (
      <Prime
        icon="navigation"
        title="Turn on location"
        message="Lynia uses your location to set your pickup pin and match you with the closest riders. We only use it while you're arranging a delivery."
        primaryLabel="Allow location"
        onPrimary={primeLocation}
        onSkip={() => setStep("notifications")}
        busy={busy}
      />
    );
  }
  return (
    <Prime
      icon="phone"
      title="Stay in the loop"
      message="Get notified the moment a rider offers, when they're arriving, and when your parcel is delivered."
      primaryLabel="Turn on notifications"
      onPrimary={primeNotifications}
      onSkip={done}
      busy={busy}
    />
  );
}

function Prime(props: {
  icon: IconName;
  title: string;
  message: string;
  primaryLabel: string;
  onPrimary: () => void;
  onSkip: () => void;
  busy: boolean;
}): React.ReactElement {
  return (
    <Screen>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: tokens.space.lg }}>
        <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: tokens.color.accentWash, alignItems: "center", justifyContent: "center", marginBottom: tokens.space.xl }}>
          <Icon name={props.icon} size={40} color={tokens.color.accentText} />
        </View>
        <Text style={{ fontSize: tokens.font.size.h1, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, textAlign: "center", marginBottom: tokens.space.sm }}>
          {props.title}
        </Text>
        <Text style={{ fontSize: tokens.font.size.body, color: tokens.color.muted, textAlign: "center", lineHeight: 22 }}>{props.message}</Text>
      </View>
      <Button label={props.primaryLabel} onPress={props.onPrimary} loading={props.busy} />
      <Button label="Not now" variant="ghost" onPress={props.onSkip} />
    </Screen>
  );
}
