import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { loadPermissionsPrimed, savePermissionsPrimed } from "../src/auth/session";
import { requestPushRegistration } from "../src/push/push-kick";
import { Screen } from "../src/ui";
import { PermLocView } from "./permissions-location.view";
import { PermNotifView } from "./permissions-notifications.view";

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

/**
 * `initialStep` is the explainer the screen opens on — "location" in the app (priming always starts
 * at step 1). It exists so step 2 can be mounted directly: each step is its own gallery screen
 * (LJ.perm_loc / LJ.perm_notif) and the parity lane stages them through this seam
 * (tools/parity/mobile/fixtures/auth_perms_*.mjs). Expo-router passes no props, so the default ships.
 */
export type PermissionsScreenProps = { initialStep?: Step };

export default function PermissionsScreen({ initialStep = "location" }: PermissionsScreenProps = {}): React.ReactElement {
  const router = useRouter();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const dest = safeNext(next);
  const [step, setStep] = useState<Step>(initialStep);
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
    try {
      await Location.requestForegroundPermissionsAsync();
    } catch {
      /* the OS dialog can't fail us into a dead-end — advance regardless */
    } finally {
      setStep("notifications");
    }
  };

  const primeNotifications = async (): Promise<void> => {
    try {
      const existing = await Notifications.getPermissionsAsync();
      if (!existing.granted && existing.canAskAgain) await Notifications.requestPermissionsAsync();
      // Root push registration is check-don't-request, so nudge it to bind a token now that the user
      // has (possibly) just granted — otherwise it wouldn't register until the next foreground.
      requestPushRegistration();
    } catch {
      /* best-effort */
    } finally {
      done();
    }
  };

  if (!ready) return <Screen><View style={{ flex: 1 }} /></Screen>; // brief: reading the flag, about to render or forward

  // Role-frame the copy off the resolved destination: a rider primes location to see nearby jobs and
  // navigate, and notifications to catch new-job/you-were-picked pings — the customer framing ("your
  // pickup pin", "your parcel is delivered") is wrong for half the users routed through here.
  const isRider = dest === "/rider";

  // The presentational tree for each step is GENERATED from the mock's `SystemState` (screens.jsx
  // `PermLoc` / `PermNotif`) and locked to it by the structural-snapshot guardrail. SystemState is a
  // structural leaf, so its copy/icon/actions are the DATA SEAM: this container feeds the role-framed
  // wording (the mock's customer copy verbatim; a rider variant for the jobs framing) and wires the OS
  // permission requests onto onPrimary/onSecondary. `busy` folds into the SystemState primary via a
  // no-op while the OS dialog is up (the request itself is the blocking beat).
  if (step === "location") {
    return (
      <PermLocView
        icon="navigation"
        title="Turn on location"
        message={
          isRider
            ? "LyniaGo uses your location to show you nearby jobs and navigate you turn-by-turn to pickups and drop-offs. We only use it while you're online or on a job."
            : "LyniaGo uses your location to set your pickup pin and match you with the closest riders. We only use it while you're arranging a delivery."
        }
        primary="Allow location"
        // Mock (screens.jsx `PermLoc`) secondary is "Enter address manually" — the customer's manual
        // pickup path. A rider has no pickup address to type, so that framing is wrong for them; keep
        // the neutral skip there.
        secondary={isRider ? "Not now" : "Enter address manually"}
        onPrimary={() => void primeLocation()}
        onSecondary={() => setStep("notifications")}
      />
    );
  }
  return (
    <PermNotifView
      // The mock (screens.jsx `PermNotif`) draws the phone glyph, not an inbox.
      icon="phone"
      title="Stay in the loop"
      message={
        isRider
          ? "Get notified the moment a new job is posted near you, when a customer picks you, and for delivery updates."
          : "Get notified the moment a rider offers, when they're arriving, and when your parcel is delivered."
      }
      primary="Turn on notifications"
      secondary="Not now"
      onPrimary={() => void primeNotifications()}
      onSecondary={done}
    />
  );
}
