import { Redirect } from "expo-router";
import { tokens } from "@lynia/shared/tokens";
import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { useAuth } from "../src/auth/auth-context";
import { type StartRole } from "../src/auth/session";
import { getBootReadiness, reportBootDestination, useBootReadiness } from "../src/boot/boot-readiness";
import { prewarmBootReads } from "../src/boot/prewarm";
import { bootRedirectTarget } from "../src/logic/boot-route";
import { enqueueBoot } from "../src/telemetry/rum";

export default function Index(): React.ReactElement {
  const { session, loading } = useAuth();
  // First-install onboarding (customer/rider 0·2) shows once, before auth. `null` = still reading the
  // flag; fold that into the splash below so we never flash the wrong screen on a cold start.
  const [onboardingSeen, setOnboardingSeen] = useState<boolean | null>(null);
  // The saved role fork (customer|rider), so a returning rider cold-boots into /rider instead of the
  // customer compose screen. `undefined` = still reading; hold the splash so we don't flash /home.
  const [rolePref, setRolePref] = useState<StartRole | null | undefined>(undefined);
  // LC-D-T3: the data payload of the notification whose tap launched this process (cold start), or
  // `null` if none — `undefined` while still reading. Folded into the SAME boot-navigation decision
  // below (instead of a second, independent effect elsewhere calling its own router.push) so a cold-
  // start deep link can never be silently clobbered by this screen's own default redirect resolving
  // second — see the comment on usePushRegistration's warm-tap listener for the race this replaced.
  const [coldStartData, setColdStartData] = useState<unknown>(undefined);
  useEffect(() => {
    // All three reads were STARTED at module evaluation (src/boot/prewarm.ts) and are usually settled
    // by the time this screen mounts. They used to begin here — i.e. after the font gate had released
    // the first render — which put three serial AndroidKeyStore decryptions and a native notification
    // read on the critical path *after* everything else had already finished.
    const boot = prewarmBootReads();
    void boot.onboardingSeen.then(setOnboardingSeen);
    void boot.rolePref.then(setRolePref);
    void boot.coldStartData.then(setColdStartData);
  }, []);

  // Every gate the boot decision waits on, in one expression. `false` = still on the splash.
  const bootResolved = !loading && onboardingSeen !== null && rolePref !== undefined && coldStartData !== undefined;

  // The end of the cold start as the user experiences it: the splash is being replaced by a real
  // screen. `boot_home - boot_paint` isolates the device-read segment (see rum.ts). In an effect, not
  // inline in the render below, so a double-invoked render can't enqueue telemetry as a side effect —
  // `enqueueBoot` is idempotent per process anyway, but a render that reports is a render that lies.
  //
  // Never a permanent blank screen (S-3): every boot read is time-bounded (src/boot/prewarm.ts), so this
  // decision normally always arrives. If the splash nonetheless gives up and hands off while it is still
  // pending, this route is what is on screen — a plain green View with no way forward. So once the boot
  // has ended under it, decide with what is known, each unknown read taking its safe default (the same
  // ones prewarm falls back to). Only a boot that ends WHILE this screen waits counts: on a remount after
  // the boot (the ErrorBoundary's "Reload") the reads are already settled and the normal decision wins.
  const { endedAt } = useBootReadiness();
  const [endedBeforeMount] = useState(() => getBootReadiness().endedAt != null);
  const gaveUp = endedAt != null && !endedBeforeMount;
  const target = bootResolved
    ? bootRedirectTarget({ session, onboardingSeen, rolePref: rolePref ?? null, coldStartData })
    : gaveUp
      ? bootRedirectTarget({ session: loading ? null : session, onboardingSeen: onboardingSeen ?? true, rolePref: rolePref ?? null, coldStartData: coldStartData ?? null })
      : null;
  useEffect(() => {
    if (!target) return;
    enqueueBoot("boot_home");
    // Step 1 of the splash ("Checking it's you") is this decision; the destination tells the splash
    // whether to wait for Home's steps or hand off now (src/boot/boot-readiness.ts, ledger D-64).
    reportBootDestination(target);
  }, [target]);

  if (!target) {
    // The splash (src/boot/splash/BootSplash.tsx) is what the user sees while the boot reads settle;
    // this route sits off-screen under it, so it only needs to be the same green.
    return <View style={{ flex: 1, backgroundColor: tokens.color.accent }} />;
  }
  // A brand-new user (no session, onboarding not yet seen) meets the carousel first; it saves the flag
  // and hands off to /phone once done or skipped.
  // A signed-in user with the rider role saved goes straight to their rider home — mirrors verify.tsx's
  // post-OTP routing so a warm relaunch doesn't dump a rider onto the customer compose screen (R3).
  // A cold-start push-tap deep link takes priority over both — see bootRedirectTarget (LC-D-T3).
  return <Redirect href={target} />;
}
