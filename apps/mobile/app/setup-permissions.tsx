import { tokens } from "@lynia/shared/tokens";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { refreshHomeLocation } from "../src/logic/home-location";
import { type CustomerSignupStep, readCustomerSignupSteps, signupNext } from "../src/logic/signup-permissions";
import { readLocation, requestLocation, switchOnLocation } from "../src/permissions/location";
import { requestNotif } from "../src/permissions/notifications";
import { markSignupPermsShown, noteCustNotifAsked } from "../src/permissions/store";
import { requestPushRegistration } from "../src/push/push-kick";
import { EVENTS, track } from "../src/telemetry/events";
import { Body, FirstRunScreen, HeroDisc, HeroPanel, PinnedFooter, SampleNotification, SplitTitle } from "../src/ui";
import { PC } from "../src/ui/firstrun/copy";

/** PC8's second sample, 6 digits shown 3+3 like every real code (D-59; the same exception as app/order-updates.tsx, D-82 §4). */
const EX2_BODY = PC.ex2B.replace("4821", "482 193");

/**
 * Customer permissions right after sign-up (ledger D-109, owner 2026-10-15) — the First Run v2 PC1 and PC8
 * designs drawn full screen, between C5 (or the code, for a returning account) and Home. Shown once per
 * install; each step is skipped when the phone already answered it (src/logic/signup-permissions.ts).
 *
 *   location       PC1's hero and copy · "Use my location" (→ the OS dialog; Google's switch dialog if the
 *                  phone's location is off) · "Not now"
 *   notifications  PC8 without its "Order placed" pill · "Turn on updates" (→ the OS dialog) · "Not now".
 *                  Counts toward PC8's 3-per-install cap.
 *
 * Every answer moves on: nothing here blocks the customer. What's still missing is asked in context as before
 * (Home's PC1–PC6 sheet, PC8 after an order).
 */
export default function SetupPermissionsScreen(): React.ReactElement {
  const router = useRouter();
  const params = useLocalSearchParams<{ next?: string }>();
  const next = signupNext(params.next, "/home");
  const [steps, setSteps] = useState<CustomerSignupStep[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const counted = useRef(false);

  const leave = (): void => router.replace(next);

  useEffect(() => {
    void markSignupPermsShown();
    void readCustomerSignupSteps().then((s) => {
      if (s.length === 0) leave();
      else setSteps(s);
    });
    // Read once per visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const step = steps?.[idx] ?? null;

  useEffect(() => {
    if (!step) return;
    track(EVENTS.signupPermScreen, { screen: step });
    if (step === "notifications" && !counted.current) {
      counted.current = true;
      void noteCustNotifAsked();
    }
  }, [step]);

  const advance = (answer: string): void => {
    track(EVENTS.signupPermAnswer, { screen: step, answer });
    if (steps && idx + 1 < steps.length) setIdx(idx + 1);
    else leave();
  };

  const run = (task: () => Promise<string>) => (): void => {
    if (busy) return;
    setBusy(true);
    void task()
      .then(advance)
      .finally(() => setBusy(false));
  };

  const askLocation = run(async () => {
    const loc = await requestLocation();
    if (loc !== "granted" && loc !== "coarse") return loc;
    // Allowed with the phone's location switched off: Google's one-tap dialog, then carry on either way.
    if (!(await readLocation()).gps) await switchOnLocation();
    // Home may already be mounted under this screen (a web reload): let it pick up the new answer.
    refreshHomeLocation();
    return loc;
  });

  const askNotif = run(async () => {
    const state = await requestNotif();
    // Root push registration is check-don't-request: bind the token now rather than at the next foreground.
    if (state === "granted") requestPushRegistration();
    return state;
  });

  if (!step) return <View testID="signup-perms-loading" style={{ flex: 1, backgroundColor: tokens.color.bg }} />;

  if (step === "location") {
    return (
      <FirstRunScreen
        testID="signup-location"
        footer={
          <PinnedFooter
            primary={{ label: PC.locCta, icon: "navigation", onPress: askLocation, loading: busy, testID: "signup-cta" }}
            link={{ label: PC.notifAlt, onPress: () => advance("not_now"), testID: "signup-not-now" }}
          />
        }
      >
        <HeroPanel>
          <HeroDisc icon="navigation" />
        </HeroPanel>
        <SplitTitle a={PC.locA} b={PC.locB} />
        <Body>{PC.locBody}</Body>
      </FirstRunScreen>
    );
  }

  return (
    <FirstRunScreen
      testID="signup-notifications"
      footer={
        <PinnedFooter
          primary={{ label: PC.notifCta, icon: "bell", onPress: askNotif, loading: busy, testID: "signup-cta" }}
          link={{ label: PC.notifAlt, onPress: () => advance("not_now"), testID: "signup-not-now" }}
        />
      }
    >
      <HeroPanel height={250} decor={false}>
        <View style={{ alignItems: "center", gap: 10 }}>
          <SampleNotification icon="bike" title={PC.ex1T} body={PC.ex1B} behind />
          <SampleNotification icon="lock" title={PC.ex2T} body={EX2_BODY} />
          <SampleNotification icon="check" title={PC.ex3T} body={PC.ex3B} behind />
        </View>
      </HeroPanel>
      <SplitTitle a={PC.notifA} b={PC.notifB} />
      <Body>{PC.notifBody}</Body>
    </FirstRunScreen>
  );
}
