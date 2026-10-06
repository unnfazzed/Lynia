import { tokens } from "@lynia/shared/tokens";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { afterLocationAnswer, entryScreen, finishRiderPermFlow, type RiderPermScreen, type RiderPermStep, stepsFor } from "../src/logic/rider-perm-flow";
import {
  ensureJobAlertChannel,
  mutedJobChannel,
  openBatterySettings,
  openChannelSettings,
  openPhoneSettings,
  playTestAlert,
  readLocation,
  readNotif,
  readPermissions,
  requestLocation,
  requestNotif,
  turnOnGps,
  useOnAppActive,
} from "../src/permissions/state";
import { markRiderPermFlowDone } from "../src/permissions/store";
import { requestPushRegistration } from "../src/push/push-kick";
import { TrustVerifiedArt } from "../src/ui/art/TrustVerifiedArt";
import { PC, RP } from "../src/ui/firstrun/copy";
import { RIDER_COPY as R } from "../src/ui/rider/copy";
import {
  Body,
  BulletList,
  FirstRunScreen,
  FrBadge,
  FrSoftPill,
  HeroDisc,
  HeroPanel,
  PinnedFooter,
  SampleNotification,
  SplitTitle,
  SystemSettingsSteps,
  useToast,
} from "../src/ui";

const STEPS: readonly RiderPermStep[] = ["location", "notifications", "battery"];
const parseStep = (v: unknown): RiderPermStep | null => (STEPS.includes(v as RiderPermStep) ? (v as RiderPermStep) : null);

/** The test ping P9 / P12 play: the job-alert channel, with the rider copy Settings' test buttons use. */
const testPing = (): void => void playTestAlert(R.sAlerts, R.testPing);

/**
 * First Run v2 — the rider permission flow P1–P16 (handoff `first-run-v2` README §2B, BRIEF 1/4–7, ledger
 * D-82). Violet tone, `RP` copy. Replaces the Rider v2-era priming (`RJ`/`LJ perm_loc`, `perm_notif`).
 *
 *   ?from=flow          R3 "Go online" (owner #5): location (P1 → P2 → P3 + P8 toast, or P4/P5/P6/P7) →
 *                       notifications (P9 → P10 → P13, or P11/P12) → P13 "Go online", which goes online.
 *                       Every "Not now" moves on; nothing skipped blocks the rider (J8/G8 on the board).
 *   ?step=location      P14 G8 / P15 Settings' Location row — the location step alone, then back.
 *   ?step=notifications P14 J8 / Settings' Job alerts row — the notification step alone, then back.
 *   ?step=battery       P16, from Settings only.
 *
 * The Android dialog opens only from a primary button (BRIEF 1). Every "Open phone settings" state re-reads
 * the permission when the rider comes back (BRIEF 7). We never ask for "Allow all the time" (BRIEF 6).
 * A legacy `?next=/rider` (the pre-D-82 sign-in priming) forwards straight to the board.
 */
export default function RiderPermissionsScreen(): React.ReactElement {
  const router = useRouter();
  const params = useLocalSearchParams<{ from?: string; step?: string; next?: string }>();
  const flow = params.from === "flow";
  const legacy = !flow && params.step == null && params.next != null;
  const steps = useRef(stepsFor(flow ? "flow" : "single", parseStep(params.step))).current;
  const toast = useToast();
  const [stepIdx, setStepIdx] = useState(0);
  const [screen, setScreen] = useState<RiderPermScreen | null>(null);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);
  const [mutedChannel, setMutedChannel] = useState<string | undefined>(undefined);
  const leftForBattery = useRef(false);

  const leave = useCallback((): void => {
    if (router.canGoBack()) router.back();
    else router.replace("/rider");
  }, [router]);

  /** Enter step `i` (skipping any with nothing to ask); past the last one, leave. */
  const enter = useCallback(
    async (i: number): Promise<void> => {
      await ensureJobAlertChannel();
      const perms = await readPermissions(true);
      for (let k = i; k < steps.length; k++) {
        const s = entryScreen(steps[k]!, perms);
        if (s) {
          if (s === "P12") setMutedChannel((await mutedJobChannel()) ?? undefined);
          setStepIdx(k);
          setScreen(s);
          return;
        }
      }
      leave();
    },
    [leave, steps],
  );

  useEffect(() => {
    if (legacy) router.replace("/rider");
    else void enter(0);
    // Entered once per visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const next = useCallback((): void => void enter(stepIdx + 1), [enter, stepIdx]);

  // P13 marks the flow done for this install (README §4 `riderPermFlowDone`).
  useEffect(() => {
    if (screen === "P13") void markRiderPermFlowDone();
  }, [screen]);

  const withBusy = (run: () => Promise<void>) => (): void => {
    if (busy) return;
    setBusy(true);
    void run().finally(() => setBusy(false));
  };

  /** P2's answer (and every re-read of location) → the next screen; precise + GPS = P3 with the P8 toast. */
  const onLocation = (loc: Parameters<typeof afterLocationAnswer>[0], gps: boolean, from: RiderPermScreen): void => {
    const to = afterLocationAnswer(loc, gps);
    if (to === "granted") {
      toast.show(RP.grantedToast, "success");
      setScreen("P3");
    } else if (to === "P4" && from === "P4") next(); // kept "Approximate" on the upgrade dialog — move on
    else if (to !== "P1") setScreen(to); // P1 = the dialog was dismissed: stay where the rider is
  };

  /** P10's answer (and every re-read of notifications). */
  const onNotif = async (granted: boolean): Promise<void> => {
    if (!granted) return setScreen("P11");
    requestPushRegistration();
    const muted = await mutedJobChannel();
    if (muted) {
      setMutedChannel(muted);
      setScreen("P12");
    } else next();
  };

  const askLocation = withBusy(async () => {
    const from = screen ?? "P1";
    const loc = await requestLocation();
    const { gps } = loc === "granted" || loc === "coarse" ? await readLocation() : { gps: true };
    onLocation(loc, gps, from);
  });

  const recheckLocation = async (explicit: boolean): Promise<void> => {
    const { loc, gps } = await readLocation();
    if (loc === "granted" || loc === "coarse") onLocation(loc, gps, "P6");
    else if (explicit) setShake((n) => n + 1);
  };

  const recheckNotif = async (explicit: boolean): Promise<void> => {
    if ((await readNotif()) === "granted") await onNotif(true);
    else if (explicit) setShake((n) => n + 1);
  };

  // Back from the phone's settings (P6, P11, P12, P16) or Google's location dialog (P7): re-read.
  useOnAppActive(() => {
    if (screen === "P6") void recheckLocation(false);
    else if (screen === "P7") void readLocation().then(({ loc, gps }) => gps && onLocation(loc, gps, "P7"));
    else if (screen === "P11") void recheckNotif(false);
    else if (screen === "P12") void mutedJobChannel().then((m) => !m && next());
    else if (screen === "P16" && leftForBattery.current) leave();
  });

  if (!screen) return <View testID="rider-perm-loading" style={{ flex: 1, backgroundColor: tokens.color.bg }} />;

  switch (screen) {
    case "P1":
      return (
        <FirstRunScreen testID="P1" footer={<PinnedFooter primary={{ label: RP.locCta, onPress: askLocation, loading: busy, testID: "p-cta" }} link={{ label: RP.notNow, onPress: next, testID: "p-link" }} />}>
          <HeroPanel tone="violet">
            <HeroDisc icon="map-pin" />
          </HeroPanel>
          <SplitTitle a={RP.locA} b={RP.locB} tone="violet" />
          <BulletList
            items={[
              { icon: "map-pin", text: RP.loc1 },
              { icon: "user", text: RP.loc2 },
              { icon: "power", text: RP.loc3 },
            ]}
          />
        </FirstRunScreen>
      );
    case "P3":
      return (
        <FirstRunScreen testID="P3" footer={<PinnedFooter primary={{ label: RP.tripCta, onPress: next, testID: "p-cta" }} />}>
          <HeroPanel tone="violet" decor={false}>
            <Text style={{ fontSize: 12, fontWeight: tokens.font.weight.semibold, color: tokens.color.riderAccent, letterSpacing: 0.72, textTransform: "uppercase" }}>{RP.tripTag}</Text>
            <SampleNotification icon="navigation" title={RP.fgsTitle} body={RP.fgsBody} width={288} alignTop />
          </HeroPanel>
          <SplitTitle a={RP.tripA} b={RP.tripB} tone="violet" />
          <Body>{RP.tripBody}</Body>
        </FirstRunScreen>
      );
    case "P4":
      return (
        <FirstRunScreen testID="P4" footer={<PinnedFooter primary={{ label: RP.approxCta, icon: "navigation", onPress: askLocation, loading: busy, testID: "p-cta" }} link={{ label: RP.notNow, onPress: next, testID: "p-link" }} />}>
          <HeroPanel tone="violet">
            <HeroDisc icon="map-pin" />
          </HeroPanel>
          <SplitTitle a={RP.approxA} b={RP.approxB} tone="violet" />
          <Body>{RP.approxBody}</Body>
        </FirstRunScreen>
      );
    case "P5":
      return (
        <FirstRunScreen testID="P5" footer={<PinnedFooter primary={{ label: RP.askAgain, onPress: askLocation, loading: busy, testID: "p-cta" }} link={{ label: RP.continue, onPress: next, testID: "p-link" }} />}>
          <HeroPanel tone="danger">
            <HeroDisc icon="map-pin" />
          </HeroPanel>
          <SplitTitle a={RP.deniedA} b={RP.deniedB} tone="danger" />
          <Body>{RP.deniedBody}</Body>
        </FirstRunScreen>
      );
    case "P6":
      return (
        <FirstRunScreen
          testID="P6"
          footer={<PinnedFooter primary={{ label: RP.openSettings, onPress: openPhoneSettings, testID: "p-cta" }} link={{ label: RP.turnedOn, onPress: () => void recheckLocation(true), testID: "p-link" }} />}
        >
          <HeroPanel tone="danger" height={180}>
            <HeroDisc icon="map-pin" />
          </HeroPanel>
          <SplitTitle a={RP.deniedA} b={RP.deniedB} tone="danger" />
          <Body>{RP.foreverBody}</Body>
          <SystemSettingsSteps steps={[RP.step1, RP.step2, RP.step3]} shakeKey={shake} />
        </FirstRunScreen>
      );
    case "P7":
      return (
        <FirstRunScreen
          testID="P7"
          footer={
            <PinnedFooter
              primary={{
                label: PC.gpsCta,
                onPress: withBusy(async () => {
                  if (!(await turnOnGps())) return;
                  const { loc, gps } = await readLocation();
                  onLocation(loc, gps, "P7");
                }),
                loading: busy,
                testID: "p-cta",
              }}
              link={{ label: RP.notNow, onPress: next, testID: "p-link" }}
            />
          }
        >
          <HeroPanel tone="neutral">
            <HeroDisc icon="map-pin" />
          </HeroPanel>
          <SplitTitle a={RP.gpsA} b={RP.gpsB} tone="neutral" />
          <Body>{RP.gpsBody}</Body>
        </FirstRunScreen>
      );
    case "P9":
      return (
        <FirstRunScreen
          testID="P9"
          footer={
            <PinnedFooter
              primary={{ label: RP.notifCta, icon: "bell", onPress: withBusy(async () => {
                  await onNotif((await requestNotif()) === "granted");
                }), loading: busy, testID: "p-cta" }}
              link={{ label: RP.notNow, onPress: next, testID: "p-link" }}
            />
          }
        >
          <HeroPanel tone="violet" decor={false}>
            <OfferCard />
          </HeroPanel>
          <SplitTitle a={RP.notifA} b={RP.notifB} tone="violet" />
          <Body>{RP.notifBody}</Body>
          <FrSoftPill tone="white" icon="volume-2" label={RP.testPing} onPress={testPing} style={{ marginTop: 16 }} testID="p-test-ping" />
        </FirstRunScreen>
      );
    case "P11":
      return (
        <FirstRunScreen
          testID="P11"
          footer={<PinnedFooter primary={{ label: RP.openSettings, onPress: openPhoneSettings, testID: "p-cta" }} link={{ label: RP.turnedOn, onPress: () => void recheckNotif(true), testID: "p-link" }} />}
        >
          <HeroPanel tone="danger" height={180}>
            <HeroDisc icon="bell-off" />
          </HeroPanel>
          <SplitTitle a={RP.blockedA} b={RP.blockedB} tone="danger" />
          <Body>{RP.blockedBody}</Body>
          <SystemSettingsSteps steps={[RP.step1, RP.nStep2, RP.nStep3]} shakeKey={shake} />
        </FirstRunScreen>
      );
    case "P12":
      return (
        <FirstRunScreen
          testID="P12"
          footer={<PinnedFooter primary={{ label: RP.openSettings, onPress: () => openChannelSettings(mutedChannel), testID: "p-cta" }} link={{ label: RP.testPing, icon: "volume-2", onPress: testPing, testID: "p-link" }} />}
        >
          <HeroPanel tone="danger" height={180}>
            <HeroDisc icon="volume-x" />
          </HeroPanel>
          <SplitTitle a={RP.mutedA} b={RP.mutedB} tone="danger" />
          <Body>{RP.mutedBody}</Body>
          <SystemSettingsSteps steps={[RP.step1, RP.mStep2, RP.mStep3]} />
        </FirstRunScreen>
      );
    case "P13":
      return (
        <FirstRunScreen
          testID="P13"
          footer={
            <PinnedFooter
              primary={{
                label: RP.goOnline,
                icon: "power",
                testID: "p-cta",
                onPress: () => {
                  // The board below runs "online"; a flow reopened after a cold restart has no board waiting.
                  if (finishRiderPermFlow() && router.canGoBack()) router.back();
                  else router.replace("/rider");
                },
              }}
            />
          }
        >
          <HeroPanel>
            <TrustVerifiedArt width={168} />
          </HeroPanel>
          <SplitTitle a={RP.doneA} b={RP.doneB} />
          <Body>{RP.doneBody}</Body>
        </FirstRunScreen>
      );
    case "P16":
      return (
        <FirstRunScreen
          testID="P16"
          footer={
            <PinnedFooter
              primary={{
                label: RP.batCta,
                testID: "p-cta",
                onPress: () => {
                  leftForBattery.current = true;
                  openBatterySettings();
                },
              }}
              link={{ label: RP.notNow, onPress: leave, testID: "p-link" }}
            />
          }
        >
          <HeroPanel tone="violet">
            <HeroDisc icon="battery" />
          </HeroPanel>
          <SplitTitle a={RP.batA} b={RP.batB} tone="violet" />
          <Body>{RP.batBody}</Body>
        </FirstRunScreen>
      );
  }
}

/** P9's drawn job offer: the "New job" tag, a 60s countdown, the fare 22/700, the route, a violet progress bar. */
function OfferCard(): React.ReactElement {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: 276, backgroundColor: tokens.color.bg, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: "rgba(20,24,27,0.06)" }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <FrBadge tone="gold" label={RP.offerTag} height={26} />
        <Text style={{ fontSize: 13, fontWeight: tokens.font.weight.semibold, color: tokens.color.muted, fontVariant: ["tabular-nums"] }}>0:58</Text>
      </View>
      <Text style={{ marginTop: 10, fontSize: 22, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>{RP.offerFare}</Text>
      <Text style={{ marginTop: 2, fontSize: 13, color: tokens.color.muted }}>{RP.offerRoute}</Text>
      <View style={{ marginTop: 12, height: 4, borderRadius: 2, backgroundColor: tokens.color.riderWash }}>
        <View style={{ width: "92%", height: 4, borderRadius: 2, backgroundColor: tokens.color.riderAccent }} />
      </View>
    </View>
  );
}
