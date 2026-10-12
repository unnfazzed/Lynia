/**
 * The in-app ID-check sheet — Didit's hosted verification flow rendered INSIDE LyniaGo (owner
 * instruction 2026-08-20/22: the rider never does KYC on the Didit website outside the app).
 *
 * Why a WebView and not the native SDK: Route A (the Didit native SDK) requires React Native's New
 * Architecture, and every build carrying that pair died at cold start on a real handset
 * (MOB-BOOT-04, docs/archive/COLD-START-CRASH-RCA-2026-08-21.md). This sheet keeps the whole point of
 * Route A — no browser hand-off, Didit keeps liveness/capture quality, the HMAC webhook stays the
 * verdict lane — on build #30's proven native surface plus exactly one mature, old-architecture
 * native module (react-native-webview). The verification pixels inside the sheet are Didit's, which
 * is the already-approved D-34 exemption (extended to this surface by D-37); the chrome around them
 * — header, loading, exit — is Lynia's, drawn from tokens. A check that won't load resolves `failed`
 * at once: First Run v2 F7 (D-82) is the one screen that says so.
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
import { ActivityIndicator, Alert, Linking, Modal, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { API_URL } from "../config";
import type { KycSdkResult } from "../logic/gates";
import { Icon, Tappable } from "../ui";
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
  // key React would reuse the sheet instance — carrying the previous check's state (a spent outcome,
  // its back history) into the new one instead of loading its URL fresh.
  return <KycCheckSheet key={active.id} url={active.req.url} WebView={WebView} onDone={finish} />;
}

/** How long a first load may sit on the spinner before the copy admits it's slow (upload pattern). */
const SLOW_OPEN_MS = 6000;

/** The imperative surface of the WebView the sheet drives (react-native-webview's ref methods). */
interface WebViewHandle {
  goBack?: () => void;
  stopLoading?: () => void;
}

/** The parts of react-native-webview's navigation state the sheet reads. */
interface WebNavState {
  url?: string;
  canGoBack?: boolean;
}

function KycCheckSheet({
  url,
  WebView,
  onDone,
}: {
  url: string;
  WebView: WebViewComponent;
  onDone: (outcome: KycCheckOutcome) => void;
}): React.ReactElement {
  const [loading, setLoading] = useState(true);
  const [slow, setSlow] = useState(false);
  const doneRef = useRef(false);
  const webRef = useRef<WebViewHandle | null>(null);
  // Whether the page has history to go back to (onNavigationStateChange) — Android back steps through it.
  const canGoBackRef = useRef(false);
  // The last link the request handler handed to the OS, so the committed-state backup never opens it twice.
  const openedRef = useRef<string | null>(null);

  const done = (outcome: KycCheckOutcome): void => {
    // Exactly one outcome per presentation — a completion redirect and a close tap can race.
    if (doneRef.current) return;
    doneRef.current = true;
    onDone(outcome);
  };

  useEffect(() => {
    if (!loading) {
      setSlow(false);
      return;
    }
    const t = setTimeout(() => setSlow(true), SLOW_OPEN_MS);
    return () => clearTimeout(t);
  }, [loading]);

  /**
   * ✕, and Android back from the check's first page. Confirm — closing a camera flow by accident is
   * easy, and the copy mirrors become.tsx's "pick it up again" line.
   */
  const requestClose = (): void => {
    Alert.alert("Leave the ID check?", "You can pick it up again from your rider board.", [
      { text: "Keep going", style: "cancel" },
      { text: "Leave", style: "destructive", onPress: () => done("cancelled") },
    ]);
  };

  /** Android back: a step back inside the check while it has one, and only then the leave prompt. */
  const onHardwareBack = (): void => {
    if (canGoBackRef.current && webRef.current?.goBack) {
      webRef.current.goBack();
      return;
    }
    requestClose();
  };

  /**
   * The sheet couldn't show the check. No error page of its own: First Run v2 F7 "Couldn't open the ID
   * check" (D-82) is the one drawn screen for this fault, and its "Try again" reopens a fresh sheet — the
   * kyc-2026-08 `kyc_cant_start` page this sheet used to draw first made the rider read the same fault
   * twice.
   */
  const failed = (): void => done("failed");

  /**
   * One decision for every navigation, however it reached us. Completion closes the sheet; an external
   * link (a policy page, mailto:, a support chat) opens outside the app and the check stays open — it
   * is NOT a finished check. True → let the WebView load it; false → blocked.
   */
  const onRequest = (navUrl: string): boolean => {
    const decision = resolveKycWebNavigation(url, navUrl, API_URL);
    if (decision === "completed") {
      done("completed");
      return false;
    }
    if (decision === "external") {
      openedRef.current = navUrl;
      void Linking.openURL(navUrl).catch(() => undefined);
      return false;
    }
    return true;
  };

  /**
   * Backup for loads that never asked: Android server-side redirect chains don't always consult
   * onShouldStartLoadWithRequest, but the committed navigation state names the URL. A completion lands
   * here too; a redirect to someone else's page is stopped and stepped back from rather than rendered in
   * the sheet as if it were the check (and opened outside the app, once). With nothing to step back to,
   * the check itself never showed — that is F7.
   */
  const onCommitted = (nav: WebNavState): void => {
    canGoBackRef.current = nav.canGoBack === true;
    if (!nav.url) return;
    const decision = resolveKycWebNavigation(url, nav.url, API_URL);
    if (decision === "completed") {
      done("completed");
      return;
    }
    if (decision !== "external" || nav.url === openedRef.current) return;
    openedRef.current = nav.url;
    void Linking.openURL(nav.url).catch(() => undefined);
    webRef.current?.stopLoading?.();
    if (nav.canGoBack && webRef.current?.goBack) webRef.current.goBack();
    else failed();
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onHardwareBack}>
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
            {/* Owner instruction (2026-08-22): no vendor naming anywhere in rider-facing KYC — the
                check reads as Lynia's own (D-38). The third-party-processor disclosure lives in the
                privacy policy the consent card links to, not in the chrome. */}
            <Text style={{ fontSize: tokens.font.size.caption, color: tokens.color.muted }}>
              Have your national ID ready
            </Text>
          </View>
          {/* Spacer balancing the close button so the title optically centres. */}
          <View style={{ width: tokens.touchTargetMin }} />
        </View>

        <View style={{ flex: 1 }}>
          <WebView
            ref={webRef}
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
              req.isTopFrame === false ? true : onRequest(req.url)
            }
            onNavigationStateChange={onCommitted}
            onLoadEnd={() => setLoading(false)}
            onError={(e: { nativeEvent?: { url?: string } }) => {
              // A completion redirect to `lynia://` that slipped past the request handler fails to load
              // (Android: ERR_UNKNOWN_URL_SCHEME) — that is the check finishing, not breaking.
              const errUrl = e?.nativeEvent?.url;
              if (errUrl && resolveKycWebNavigation(url, errUrl, API_URL) === "completed") done("completed");
              else failed();
            }}
            onHttpError={(e: { nativeEvent: { url?: string } }) => {
              // Main-document failure only: a 4xx/5xx subresource inside a working flow is the
              // vendor's business, not a reason to close the rider's check.
              if (e.nativeEvent.url === url) failed();
            }}
            style={{ flex: 1, backgroundColor: tokens.color.bg }}
          />
          {loading && (
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
      </SafeAreaView>
    </Modal>
  );
}
