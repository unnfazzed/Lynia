import { tokens } from "@lynia/shared/tokens";
import React, { useEffect } from "react";
import { AppState, Linking } from "react-native";
import Svg, { Polygon } from "react-native-svg";
import { useBootSplashRelease } from "../src/boot/boot-splash-hold";
import { API_URL, STORE_URL, openSupportWhatsApp } from "../src/config";
import { fetchSignal } from "../src/net/fetch-signal";
import { PROBE_TIMEOUT_MS } from "../src/net/network-policy";
import { reportReachable, reportUnreachable } from "../src/net/reachability";
import { useReachability } from "../src/net/use-reachability";
import { useServerVersionGate } from "../src/net/use-server-version-gate";
import { DOVE_BODY_POLYGONS, DOVE_KEEL_POLYGON, DOVE_VIEWBOX } from "../src/ui/dove-paths";
import { Body, FirstRunScreen, FrBadge, HeroPanel, InfoBox, PinnedFooter, SplitTitle } from "../src/ui/firstrun";
import { UP } from "../src/ui/firstrun/copy";

/**
 * The hard version gate — First Run v2 U1–U5 (`packages/design/handoff/first-run-v2`, ledger D-81; it
 * supersedes `LJ/RJ force_update`). Mounted by the root layout in place of the whole Stack when the
 * installed build is below the build-time or the server minimum, so there is no route past it. It is
 * role-neutral (the role isn't known at the root).
 *
 * - U1: a WHITE screen with the green hero (280) and the white LyniaGo mark (88) — white text on brand
 *   green fails AA (BRIEF 8), so only the panel is green. The server's optional `whatsNew` line shows as
 *   the "New …" pill. CTA "Update now" (the store), link "Help on WhatsApp" (BRIEF 9: always a way out).
 * - U2: no store link configured → the body says how to find it and the CTA is WhatsApp; no pill.
 * - U3: offline → the CTA is disabled (`line`/`muted`) over a "Waiting for a connection" box, and comes
 *   back by itself on reconnect (the app-wide reachability store polls `/health` while it is down).
 * - U5: back from the store without updating → still here; returning re-checks the connection.
 */
export default function ForceUpdateScreen(): React.ReactElement {
  // This screen REPLACES the Stack, so the boot route never reports a destination and the splash
  // (ledger D-64) would play on over a navigator that is gone. Whatever renders in place of the
  // navigator ends the boot itself, through the ONE shared release (native hide + window-background
  // reset + boot-phase end — which unmounts the splash and brings this screen on-screen; idempotent).
  // No-op when the boot is already over (warm version trip).
  const release = useBootSplashRelease();
  useEffect(() => {
    release();
  }, [release]);

  // Nothing else on this screen talks to the API, so the reachability store would never learn the phone
  // is offline: check once on mount and again whenever the app comes back (U5, back from the store).
  useEffect(() => {
    void checkConnection();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void checkConnection();
    });
    return () => sub.remove();
  }, []);

  const online = useReachability();
  const whatsNew = useServerVersionGate()?.whatsNew ?? null;
  const storeUrl = STORE_URL;
  const offline = !!storeUrl && !online;

  const footer = storeUrl ? (
    <PinnedFooter
      primary={{ label: UP.cta, onPress: () => void Linking.openURL(storeUrl).catch(() => undefined), disabled: offline, testID: "force-update-cta" }}
      link={{ label: UP.help, icon: "message-circle", onPress: openSupportWhatsApp, testID: "force-update-help" }}
    />
  ) : (
    // U2: no listing to open — WhatsApp becomes the one action.
    <PinnedFooter primary={{ label: UP.noLinkCta, icon: "message-circle", onPress: openSupportWhatsApp, testID: "force-update-cta" }} />
  );

  return (
    <FirstRunScreen testID="force-update" footer={footer}>
      {/* No coral/white dot: the panel holds the mark, not a disc (`.hero:not(:has(>.disc))::after`). */}
      <HeroPanel tone="green" height={280} decor={false} testID="force-update-hero">
        <MonoMark size={88} />
      </HeroPanel>
      <SplitTitle a={UP.title} b={UP.titleB} tone="green" />
      <Body>{storeUrl ? UP.body : UP.noLinkBody}</Body>
      {offline ? (
        <InfoBox tone="n" icon="wifi-off" text={UP.offlineNote} testID="force-update-offline" />
      ) : storeUrl && whatsNew ? (
        <FrBadge tone="surface" lead={UP.whatsNew} label={whatsNew} style={{ marginTop: 16 }} />
      ) : null}
    </FirstRunScreen>
  );
}

/**
 * `assets/brand/lyniago-mark-mono.svg` tinted white (`filter: brightness(0) invert(1)`): the dove's three
 * facets in one colour, so its white creases vanish into the body.
 */
function MonoMark({ size }: { size: number }): React.ReactElement {
  return (
    <Svg width={size} height={size} viewBox={DOVE_VIEWBOX} accessibilityRole="image" accessibilityLabel="LyniaGo">
      {[...DOVE_BODY_POLYGONS, DOVE_KEEL_POLYGON].map((points) => (
        <Polygon key={points} points={points} fill={tokens.color.onAccent} />
      ))}
    </Svg>
  );
}

/** One `/health` round trip: any answer means reachable; a network failure starts the store's probe loop. */
async function checkConnection(): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    await fetch(`${API_URL}/health`, { signal: fetchSignal(controller) });
    reportReachable();
  } catch {
    reportUnreachable();
  } finally {
    clearTimeout(timer);
  }
}
