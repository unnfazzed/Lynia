import { tokens } from "@lynia/shared";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { loadPermissionsPrimed, savePermissionsPrimed } from "../src/auth/session";
import { Button, Icon, type IconName, Screen } from "../src/ui";

/**
 * First-run permission priming (customer/rider 0·7 / 0·8). Two explainer steps shown BEFORE the OS
 * dialogs so the user knows why we're asking — location (set the pickup pin / show parcels + navigate)
 * then notifications (offer + arrival + delivery alerts). Each step primes, then advances; "Not now"
 * skips without blocking (both are re-requestable in context later). Shown ONCE per install (gated on
 * `permissionsPrimed`); if already primed we forward straight to `next` so the role fork can always
 * route through here safely. `next` is the post-priming destination (/home for a customer, /rider for
 * a rider). Push token registration itself is handled by the root PushSync and is permission-checked,
 * so priming here just brings the OS prompt forward with an explanation.
 */
type Step = "location" | "notifications";

function safeNext(raw: string | string[] | undefined): "/home" | "/rider" {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === "/rider" ? "/rider" : "/home";
}

export default function PermissionsScreen(): React.ReactElement {
  const router = useRouter();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const dest = safeNext(next);
  const [step, setStep] = useState<Step>("location");
  const [busy, setBusy] = useState(false);
  // null = still checking the primed flag; fold into the first render so we never flash a step we're
  // about to skip.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    void loadPermissionsPrimed().then((primed) => {
      if (!alive) return;
      if (primed) router.replace(dest);
      else setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [dest, router]);

  const done = (): void => {
    void savePermissionsPrimed();
    router.replace(dest);
  };

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

  if (!ready) return <Screen><View style={{ flex: 1 }} /></Screen>; // brief: reading the flag, about to render or forward

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
