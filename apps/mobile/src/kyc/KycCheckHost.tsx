/**
 * The in-app ID-check sheet — Didit's hosted verification flow rendered INSIDE LyniaGo (owner
 * instruction 2026-08-20/22: the rider never does KYC on the Didit website outside the app).
 *
 * Why a WebView and not the native SDK: Route A (the Didit native SDK) requires React Native's New
 * Architecture, and every build carrying that pair died at cold start on a real handset
 * (MOB-BOOT-04, docs/COLD-START-CRASH-RCA-2026-08-21.md). This sheet keeps the whole point of
 * Route A — no browser hand-off, Didit keeps liveness/capture quality, the HMAC webhook stays the
 * verdict lane — on build #30's proven native surface plus exactly one mature, old-architecture
 * native module (react-native-webview). The verification pixels inside the sheet are Didit's, which
 * is the already-approved D-34 exemption (extended to this surface by D-37); the chrome around them
 * — header, loading, error, exit — is Lynia's, drawn from tokens.
 *
 * Cold-start safety, deliberately layered (the previous in-app attempt is why this file is
 * paranoid):
 *  - `react-native-webview` is required LAZILY inside a try, never statically — a module that
 *    explodes at import time must degrade to the browser lane, not take a screen (or the app) down.
 *    This file itself is imported only by the two rider screens that mount the host, both of which
 *    expo-router loads through a render-time thunk — nothing here is on the boot path.
 *  - `runKycVerification` (src/kyc/verify.ts) treats this whole sheet as optional: no host mounted,
 *    no WebView module, or a presentation race all fall back to the in-app browser tab.
 *
 * The host/presenter split: the launch seam (`runKycVerification`) is an imperative async call the
 * two KYC call sites already await, so the sheet must be presentable from plain code. Screens mount
 * `<KycCheckHost />` once; the host registers a presenter; `presentKycCheck` drives the most
 * recently mounted one (the pushed screen wins over the board beneath it) and resolves with the
 * rider's outcome. Same three-way outcome contract as the native SDK had: completed / cancelled /
 * failed, feeding resolveKycGate's in_flight / unfinished / cant_start walls.
 */
import { tokens } from "@lynia/shared/tokens";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Modal, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { KycSdkResult } from "../logic/gates";
import { Icon, SystemState, Tappable } from "../ui";
import { resolveKycWebNavigation } from "./navigation";

/** The sheet's outcome — the non-null arm of the gate's SDK result union. */
export type KycCheckOutcome = Exclude<KycSdkResult, null>;

export interface KycCheckRequest {
  /** The https vendor-hosted verification URL (already validated by the caller). */
  url: string;
}

type Presenter = (req: KycCheckRequest) => Promise<KycCheckOutcome>;

/** Mounted hosts, oldest first. Presenting uses the LAST one — the topmost screen's host. */
const presenters: Presenter[] = [];

/**
 * Minimal surface of the WebView component this sheet uses — kept local so the module carries no
 * static type dependency on react-native-webview either (types are erased, but the discipline keeps
 * the import greppable as require-only).
 */
type WebViewComponent = React.ComponentType<Record<string, unknown>>;

let cachedWebView: WebViewComponent | null | undefined;

/**
 * The WebView component, or null when the native module isn't in this binary (a stripped build, or
 * a future revert). Probed once and cached — the answer cannot change within a process.
 */
function loadWebView(): WebViewComponent | null {
  if (cachedWebView !== undefined) return cachedWebView;
  try {
    // Lazy require inside the try, never a static import: an import-time throw would otherwise
    // escape before any catch (the exact failure class RCA §3 #3 pinned on the old SDK seam).
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require("react-native-webview") as { WebView?: WebViewComponent; default?: WebViewComponent };
    cachedWebView = mod.WebView ?? mod.default ?? null;
  } catch {
    cachedWebView = null;
  }
  return cachedWebView;
}

/** Whether an in-app presentation is possible right now: a host is mounted AND the WebView loads. */
export function canPresentKycCheck(): boolean {
  return presenters.length > 0 && loadWebView() != null;
}

/**
 * Present the ID-check sheet over the current screen. Resolves with the rider's outcome, or returns
 * null when no host is mounted (the caller falls back to the browser lane). Never throws.
 */
export function presentKycCheck(req: KycCheckRequest): Promise<KycCheckOutcome> | null {
  const present = presenters[presenters.length - 1];
  if (!present) return null;
  try {
    return present(req);
  } catch {
    return null;
  }
}

/** TEST-ONLY: drop cached module state so jest cases can exercise both lanes. */
export function resetKycCheckHostForTests(): void {
  cachedWebView = undefined;
  presenters.length = 0;
}

interface ActiveCheck {
  /** Unique per presentation — keys the sheet so React can never hand a new check a stale one. */
  id: number;
  req: KycCheckRequest;
  resolve: (outcome: KycCheckOutcome) => void;
}

let presentationSeq = 0;

/**
 * Mount once per KYC-launching screen. Renders nothing until `presentKycCheck` is called, then a
 * full-screen modal sheet. Unmounting mid-check resolves `cancelled` — never leaves a caller
 * hanging on a promise no UI backs any more.
 */
export function KycCheckHost(): React.ReactElement | null {
  const [active, setActive] = useState<ActiveCheck | null>(null);
  const activeRef = useRef<ActiveCheck | null>(null);
  activeRef.current = active;

  useEffect(() => {
    const presenter: Presenter = (req) =>
      new Promise<KycCheckOutcome>((resolve) => {
        setActive((prev) => {
          // A second present while one is showing must not strand the first caller's promise —
          // resolve it as the rider having left (promise resolution is idempotent, so this can
          // never race the sheet's own outcome into a double-settle).
          prev?.resolve("cancelled");
          return { id: ++presentationSeq, req, resolve };
        });
      });
    presenters.push(presenter);
    return () => {
      const i = presenters.indexOf(presenter);
      if (i >= 0) presenters.splice(i, 1);
      activeRef.current?.resolve("cancelled");
    };
  }, []);

  // Raced away between canPresentKycCheck and render (never expected, since the module probe is
  // cached): report the launch failed from an effect — never a setState during render — rather than
  // rendering a sheet with nothing inside it.
  const WebView = active ? loadWebView() : null;
  useEffect(() => {
    if (active && !WebView) {
      active.resolve("failed");
      setActive(null);
    }
  }, [active, WebView]);

  if (!active || !WebView) return null;

  const finish = (outcome: KycCheckOutcome): void => {
    active.resolve(outcome);
    setActive(null);
  };
  // Keyed per presentation: replacing an active check renders at the same position, and without the
  // key React would reuse the sheet instance — carrying the previous check's phase (an old error
  // state, a spent attempt counter) into the new one instead of loading its URL fresh.
  return <KycCheckSheet key={active.id} url={active.req.url} WebView={WebView} onDone={finish} />;
}

/** How long a first load may sit on the spinner before the copy admits it's slow (upload pattern). */
const SLOW_OPEN_MS = 6000;

function KycCheckSheet({
  url,
  WebView,
  onDone,
}: {
  url: string;
  WebView: WebViewComponent;
  onDone: (outcome: KycCheckOutcome) => void;
}): React.ReactElement {
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [slow, setSlow] = useState(false);
  // Reload key: "Try again" from the error state remounts the WebView for a clean retry.
  const [attempt, setAttempt] = useState(0);
  const doneRef = useRef(false);

  const done = (outcome: KycCheckOutcome): void => {
    // Exactly one outcome per presentation — a completion redirect and a close tap can race.
    if (doneRef.current) return;
    doneRef.current = true;
    onDone(outcome);
  };

  useEffect(() => {
    if (phase !== "loading") {
      setSlow(false);
      return;
    }
    const t = setTimeout(() => setSlow(true), SLOW_OPEN_MS);
    return () => clearTimeout(t);
  }, [phase, attempt]);

  /**
   * ✕ / Android back. From the error state there is nothing in progress, so it closes as `failed`
   * (the cant_start wall says the same thing this sheet just did). Otherwise confirm — closing a
   * camera flow by accident is easy, and the copy mirrors become.tsx's "pick it up again" line.
   */
  const requestClose = (): void => {
    if (phase === "error") {
      done("failed");
      return;
    }
    Alert.alert("Leave the ID check?", "You can pick it up again from your rider board.", [
      { text: "Keep going", style: "cancel" },
      { text: "Leave", style: "destructive", onPress: () => done("cancelled") },
    ]);
  };

  /** True → let the WebView load it; false → blocked (completion detected, sheet closes). */
  const onNavigate = (navUrl: string): boolean => {
    if (resolveKycWebNavigation(url, navUrl) === "completed") {
      done("completed");
      return false;
    }
    return true;
  };

  return (
    <Modal visible animationType="slide" onRequestClose={requestClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.bg }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            height: 56,
            paddingHorizontal: tokens.space.xs,
            borderBottomWidth: 1,
            borderBottomColor: tokens.color.line,
          }}
        >
          <Tappable
            tone="icon"
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={requestClose}
            style={{
              width: tokens.touchTargetMin,
              height: tokens.touchTargetMin,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="x" size={tokens.icon.size} color={tokens.color.ink} />
          </Tappable>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ fontSize: tokens.font.size.bodyLg, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink }}>
              ID check
            </Text>
            {/* The partner naming is a real disclosure the consent card already made — kept over the
                flow so the vendor-drawn pixels below are never mistaken for an unbranded surprise. */}
            <Text style={{ fontSize: tokens.font.size.caption, color: tokens.color.muted }}>
              with our verification partner Didit
            </Text>
          </View>
          {/* Spacer balancing the close button so the title optically centres. */}
          <View style={{ width: tokens.touchTargetMin }} />
        </View>

        {phase === "error" ? (
          // Same copy as the board's cant_start wall (RJ kyc_cant_start) — one voice for one fault.
          <SystemState
            icon="triangle-alert"
            title="We couldn't open the ID check"
            message="This is usually the camera or the connection. Check both and try again."
            primary="Try again"
            onPrimary={() => {
              setPhase("loading");
              setAttempt((a) => a + 1);
            }}
            secondary="Close"
            onSecondary={() => done("failed")}
          />
        ) : (
          <View style={{ flex: 1 }}>
            <WebView
              key={attempt}
              source={{ uri: url }}
              // Didit's flow is camera-driven: inline playback + no user-gesture gate for the video
              // preview, and grant its getUserMedia asks (the app-level camera permission was
              // preflighted by runKycVerification before this sheet opened).
              allowsInlineMediaPlayback
              mediaPlaybackRequiresUserAction={false}
              mediaCapturePermissionGrantType="grant"
              javaScriptEnabled
              domStorageEnabled
              // Everything reaches onShouldStartLoadWithRequest: the default https-only whitelist
              // hands non-matching URLs (the deep-link callback!) to the OS instead of to us.
              originWhitelist={["*"]}
              onShouldStartLoadWithRequest={(req: { url: string; isTopFrame?: boolean }) =>
                // iOS reports iframe loads too; only the top frame can be the completion redirect.
                req.isTopFrame === false ? true : onNavigate(req.url)
              }
              // Backup detection: Android server-side redirect chains don't always consult
              // onShouldStartLoadWithRequest, but the committed navigation state names the URL.
              onNavigationStateChange={(nav: { url?: string }) => {
                if (nav.url) onNavigate(nav.url);
              }}
              onLoadEnd={() => setPhase((p) => (p === "loading" ? "ready" : p))}
              onError={() => setPhase("error")}
              onHttpError={(e: { nativeEvent: { url?: string } }) => {
                // Main-document failure only: a 4xx/5xx subresource inside a working flow is the
                // vendor's business, not a reason to blank the rider's screen.
                if (e.nativeEvent.url === url) setPhase("error");
              }}
              style={{ flex: 1, backgroundColor: tokens.color.bg }}
            />
            {phase === "loading" && (
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  top: 0,
                  right: 0,
                  bottom: 0,
                  left: 0,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: tokens.color.bg,
                }}
              >
                <ActivityIndicator size="large" color={tokens.color.cta} />
                <Text style={{ marginTop: tokens.space.md, fontSize: tokens.font.size.body, color: tokens.color.muted }}>
                  {slow ? "Still opening — hang on." : "Opening your ID check…"}
                </Text>
              </View>
            )}
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}
