import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { noteCustNotifAsked } from "../src/permissions/store";
import { requestNotif } from "../src/permissions/notifications";
import { requestPushRegistration } from "../src/push/push-kick";
import { Body, FirstRunScreen, FrBadge, HeroDisc, HeroPanel, PinnedFooter, SampleNotification, SplitTitle } from "../src/ui";
import { PC } from "../src/ui/firstrun/copy";

/** Only an in-app path may be handed over to (never a scheme or another host). */
function safeNext(raw: string | string[] | undefined): string | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return typeof v === "string" && /^\/[A-Za-z0-9/_\-[\]]*$/.test(v) && !v.startsWith("//") ? v : null;
}

/**
 * First Run v2 PC8–PC10 — customer order updates (handoff `first-run-v2` README §2A, ledger D-80).
 *
 *   PC8  the explainer, right after an order is placed: the "Order placed" pill, a mint hero with three
 *        stacked sample notifications, "Know when it's at the gate", "Turn on updates" (→ the Android
 *        POST_NOTIFICATIONS dialog, PC9) and "Not now" (→ the order; asked again after the next order).
 *   PC10 declined: a neutral bell-off hero, "Updates are off", "Back to my order".
 *
 * Reached two ways: from an order (`next=/order/<id>`, src/push/ask-in-context.ts — each visit counts
 * toward the 3-per-install cap) or from Settings' Order updates "Turn on" (PC11, `from=settings`): there
 * it draws no "Order placed" pill (nothing was just placed) and a decline goes back to Settings, because
 * PC10's copy is about an order (D-80 §4).
 */
export default function OrderUpdatesScreen(): React.ReactElement {
  const router = useRouter();
  const params = useLocalSearchParams<{ next?: string; from?: string }>();
  const fromSettings = params.from === "settings";
  const next = safeNext(params.next);
  const [declined, setDeclined] = useState(false);
  const [busy, setBusy] = useState(false);
  const counted = useRef(false);

  useEffect(() => {
    if (fromSettings || counted.current) return;
    counted.current = true;
    void noteCustNotifAsked();
  }, [fromSettings]);

  const leave = (): void => {
    if (next) router.replace(next as never);
    else if (router.canGoBack()) router.back();
    else router.replace("/home");
  };

  const turnOn = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    const state = await requestNotif();
    setBusy(false);
    if (state === "granted") {
      // Root push registration is check-don't-request: bind the token now rather than at the next foreground.
      requestPushRegistration();
      leave();
    } else if (fromSettings) leave();
    else setDeclined(true);
  };

  const pill = fromSettings ? null : <FrBadge icon="check" label={PC.placed} style={{ marginBottom: 16 }} />;

  if (declined) {
    return (
      <FirstRunScreen testID="pc10" footer={<PinnedFooter primary={{ label: PC.offCta, onPress: leave, testID: "pc10-back" }} />}>
        {pill}
        <HeroPanel tone="neutral" height={200}>
          <HeroDisc icon="bell-off" />
        </HeroPanel>
        <SplitTitle a={PC.offA} b={PC.offB} tone="neutral" />
        <Body>{PC.offBody}</Body>
      </FirstRunScreen>
    );
  }

  return (
    <FirstRunScreen
      testID="pc8"
      footer={
        <PinnedFooter
          primary={{ label: PC.notifCta, icon: "bell", onPress: () => void turnOn(), loading: busy, testID: "pc8-turn-on" }}
          link={{ label: PC.notifAlt, onPress: leave, testID: "pc8-not-now" }}
        />
      }
    >
      {pill}
      <HeroPanel height={250} decor={false}>
        <View style={{ alignItems: "center", gap: 10 }}>
          <SampleNotification icon="bike" title={PC.ex1T} body={PC.ex1B} behind />
          <SampleNotification icon="lock" title={PC.ex2T} body={PC.ex2B} />
          <SampleNotification icon="check" title={PC.ex3T} body={PC.ex3B} behind />
        </View>
      </HeroPanel>
      <SplitTitle a={PC.notifA} b={PC.notifB} />
      <Body>{PC.notifBody}</Body>
    </FirstRunScreen>
  );
}
