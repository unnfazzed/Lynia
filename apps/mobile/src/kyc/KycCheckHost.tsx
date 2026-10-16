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
 * `<KycCheckHost />` once; the host registers itself; `presentKycCheck` drives the most recently
 * mounted one (the pushed screen wins over the board beneath it) and resolves with the rider's
 * outcome. Same three-way outcome contract as the native SDK had: completed / cancelled / failed,
 * feeding resolveKycGate's in_flight / unfinished / cant_start walls.
 *
 * Latency (2026-10-16, the first live checks after manual mode ended were slow to open): the tap that
 * starts a check now does three things at once, before the session even exists (`primeKycLaunch` in
 * verify.ts):
 *  - HOLD: the sheet opens straight away on "Opening your ID check…" while the server mints the session,
 *    instead of a button spinner, then a slide-up, then a page spinner in a row;
 *  - PREWARM: a hidden WebView loads the vendor's own origin, so the WebView engine is started and the
 *    vendor app's shared code (~300 KB, the same Next.js build serves its home and session pages) is in the
 *    app's web cache by the time the session URL loads. The origin, never a session link: nothing is
 *    started or billed. It also reads the System WebView's version, for the launch analytics;
 *  - the camera ask, as before.
 */
import { tokens } from "@lynia/shared/tokens";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Linking, Modal, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { API_URL } from "../config";
import type { KycSdkResult } from "../logic/gates";
import { useKeepScreenOn } from "../logic/use-keep-screen-on";
import { Icon, Tappable } from "../ui";
import { resolveKycWebNavigation } from "./navigation";
import { EVENTS, track } from "../telemetry/events";
import { addBreadcrumb } from "../telemetry/sentry";

/** The sheet's outcome — the non-null arm of the gate's SDK result union. */
export type KycCheckOutcome = Exclude<KycSdkResult, null>;

export interface KycCheckRequest {
  /** The https vendor-hosted verification URL (already validated by the caller). */
  url: string;
}

/** What a mounted host exposes to the imperative seam. */
interface Host {
  present: (req: KycCheckRequest) => Promise<KycCheckOutcome>;
  /** Show (true) or drop (false) the "Opening your ID check…" sheet that stands in until a session exists. */
  setHold: (on: boolean) => void;
  /** Start (or keep) the hidden prewarm WebView. */
  warm: () => void;
}

/** Mounted hosts, oldest first. Everything drives the LAST one — the topmost screen's host. */
const hosts: Host[] = [];

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
  return hosts.length > 0 && loadWebView() != null;
}

/**
 * The hold: "none", "held" (the stand-in sheet is up while the session is minted), or "cancelled" (the rider
 * closed the stand-in — the check that follows resolves `cancelled` without ever showing).
 */
let hold: "none" | "held" | "cancelled" = "none";

/**
 * Open the sheet now, on "Opening your ID check…", before the session exists. A no-op when the sheet can't
 * present (the browser lane has nothing to stand in for). Ended by `presentKycCheck` taking it over, or by
 * `endKycCheckHold` on every path that opens nothing — a caller's `finally` is the backstop.
 */
export function holdKycCheck(): void {
  if (!canPresentKycCheck()) return;
  hold = "held";
  hosts[hosts.length - 1]?.setHold(true);
}

/** Drop the stand-in sheet (nothing to open, an error, the browser lane). Never closes a check that is showing. */
export function endKycCheckHold(): void {
  hold = "none";
  for (const h of hosts) h.setHold(false);
}

/**
 * Present the ID-check sheet over the current screen. Resolves with the rider's outcome, or returns
 * null when no host is mounted (the caller falls back to the browser lane). Never throws.
 */
export function presentKycCheck(req: KycCheckRequest): Promise<KycCheckOutcome> | null {
  const host = hosts[hosts.length - 1];
  if (!host) return null;
  // The rider already closed the stand-in: they left, and the check must not open over them anyway.
  if (hold === "cancelled") {
    hold = "none";
    return Promise.resolve("cancelled");
  }
  hold = "none";
  try {
    return host.present(req);
  } catch {
    return null;
  }
}

/** The vendor's own origin — what the prewarm loads (never a session link: nothing starts, nothing bills). */
export const KYC_PREWARM_URL = "https://verify.didit.me/";

/** How long a prewarm stays mounted waiting for its check: past this the tap went nowhere (an error, a toast). */
export const KYC_PREWARM_TTL_MS = 60_000;

/** When the last prewarm was asked for (0 = never) — read by the sheet's load analytics. */
let prewarmAt = 0;

/** The System WebView's major version (the prewarm reads it), or null until read. Analytics only. */
let webViewMajor: number | null = null;

/** Start loading the vendor's origin in a hidden WebView (see the module header). No-op without a sheet. */
export function prewarmKycCheck(now: number = Date.now()): void {
  if (!canPresentKycCheck()) return;
  prewarmAt = now;
  hosts[hosts.length - 1]?.warm();
}

/** The System WebView's major version, once the prewarm has read it (null before, or when it couldn't). */
export function kycWebViewMajor(): number | null {
  return webViewMajor;
}

/** TEST-ONLY: drop cached module state so jest cases can exercise both lanes. */
export function resetKycCheckHostForTests(): void {
  cachedWebView = undefined;
  hosts.length = 0;
  hold = "none";
  prewarmAt = 0;
  webViewMajor = null;
}

interface ActiveCheck {
  /** Unique per presentation — keys the sheet so React can never hand a new check a stale one. */
  id: number;
  req: KycCheckRequest;
  resolve: (outcome: KycCheckOutcome) => void;
}

let presentationSeq = 0;

/** The keep-awake tag while the sheet is up: a slow upload must not stall behind an auto-locked screen. */
export const KYC_KEEP_AWAKE_TAG = "kyc-check";

/**
 * Mount once per KYC-launching screen. Renders nothing until a check is held, prewarmed or presented;
 * then a full-screen modal sheet (and/or the hidden prewarm). Unmounting mid-check resolves `cancelled` —
 * never leaves a caller hanging on a promise no UI backs any more.
 */
export function KycCheckHost(): React.ReactElement | null {
  const [active, setActive] = useState<ActiveCheck | null>(null);
  const [holding, setHolding] = useState(false);
  const [warmUntil, setWarmUntil] = useState(0);
  const activeRef = useRef<ActiveCheck | null>(null);
  activeRef.current = active;
  // The Android back handler of whatever the modal shows right now (the stand-in, or the check's WebView).
  const backRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    const host: Host = {
      present: (req) =>
        new Promise<KycCheckOutcome>((resolve) => {
          setHolding(false);
          // The real check reuses the warmed engine and cache; the hidden prewarm has done its job.
          setWarmUntil(0);
          setActive((prev) => {
            // A second present while one is showing must not strand the first caller's promise —
            // resolve it as the rider having left (promise resolution is idempotent, so this can
            // never race the sheet's own outcome into a double-settle).
            prev?.resolve("cancelled");
            return { id: ++presentationSeq, req, resolve };
          });
        }),
      setHold: (on) => setHolding(on),
      warm: () => setWarmUntil(Date.now() + KYC_PREWARM_TTL_MS),
    };
    hosts.push(host);
    return () => {
      const i = hosts.indexOf(host);
      if (i >= 0) hosts.splice(i, 1);
      activeRef.current?.resolve("cancelled");
    };
  }, []);

  // The prewarm unmounts itself once its window passes (a tap that went nowhere).
  useEffect(() => {
    if (!warmUntil) return;
    const t = setTimeout(() => setWarmUntil(0), Math.max(0, warmUntil - Date.now()));
    return () => clearTimeout(t);
  }, [warmUntil]);

  // Raced away between canPresentKycCheck and render (never expected, since the module probe is
  // cached): report the launch failed from an effect — never a setState during render — rather than
  // rendering a sheet with nothing inside it.
  const WebView = active || holding || warmUntil ? loadWebView() : null;
  useEffect(() => {
    if (active && !WebView) {
      active.resolve("failed");
      setActive(null);
    }
  }, [active, WebView]);

  const visible = (!!active && !!WebView) || holding;
  useKeepScreenOn(visible, KYC_KEEP_AWAKE_TAG);

  if (!WebView) return null;

  const finish = (outcome: KycCheckOutcome): void => {
    active?.resolve(outcome);
    setActive(null);
  };

  /** ✕ (or Android back) on the stand-in: the same confirm as the check, then the coming check is cancelled. */
  const leaveHold = (): void => {
    confirmLeave(() => {
      hold = "cancelled";
      setHolding(false);
    });
  };

  const warm = !!warmUntil && !active;

  return (
    <>
      {warm ? <KycPrewarm WebView={WebView} /> : null}
      {visible ? (
        // No slide-in: the sheet stands in for the tap itself, so it appears at once.
        <Modal visible animationType="none" onRequestClose={() => backRef.current()}>
          <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.bg }}>
            {active ? (
              // Keyed per presentation: replacing an active check renders at the same position, and without the
              // key React would reuse the sheet instance — carrying the previous check's state (a spent outcome,
              // its back history) into the new one instead of loading its URL fresh.
              <KycCheckSheet key={active.id} url={active.req.url} WebView={WebView} onDone={finish} backRef={backRef} />
            ) : (
              <HoldSheet onLeave={leaveHold} backRef={backRef} />
            )}
          </SafeAreaView>
        </Modal>
      ) : null}
    </>
  );
}

/** Close a camera flow only on purpose — the copy mirrors become.tsx's "pick it up again" line. */
function confirmLeave(onLeave: () => void): void {
  Alert.alert("Leave the ID check?", "You can pick it up again from your biker board.", [
    { text: "Keep going", style: "cancel" },
    { text: "Leave", style: "destructive", onPress: onLeave },
  ]);
}

/** The sheet's header: ✕, the title, the one-line hint. */
function SheetHeader({ onClose }: { onClose: () => void }): React.ReactElement {
  return (
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
        onPress={onClose}
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
  );
}

/** How long a first load may sit on the spinner before the copy admits it's slow (upload pattern). */
const SLOW_OPEN_MS = 6000;

/** The loading cover: the spinner, then — past {@link SLOW_OPEN_MS} — the line that admits it's slow. */
function OpeningCover({ overlay }: { overlay?: boolean }): React.ReactElement {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), SLOW_OPEN_MS);
    return () => clearTimeout(t);
  }, []);
  return (
    <View
      pointerEvents="none"
      style={{
        ...(overlay ? { position: "absolute" as const, top: 0, right: 0, bottom: 0, left: 0 } : { flex: 1 }),
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
  );
}

/** The stand-in while the session is minted: the sheet's own header and loading state, no WebView yet. */
function HoldSheet({ onLeave, backRef }: { onLeave: () => void; backRef: React.MutableRefObject<() => void> }): React.ReactElement {
  backRef.current = onLeave;
  return (
    <>
      <SheetHeader onClose={onLeave} />
      <OpeningCover />
    </>
  );
}

/**
 * Reads the System WebView's major version from the prewarm page's user agent, for the launch analytics
 * (an old System WebView makes every step slower). Posts only the number.
 */
const WEBVIEW_VERSION_PROBE =
  "(function(){try{var m=navigator.userAgent.match(/Chrome\\/(\\d+)/);window.ReactNativeWebView&&window.ReactNativeWebView.postMessage('wv:'+(m?m[1]:''));}catch(e){}})();true;";

/**
 * The hidden prewarm: the vendor's origin in a 1×1, invisible, untouchable WebView. Stays on the vendor's
 * own hosts — any other navigation (a redirect, a link) is refused rather than loaded in the background.
 */
function KycPrewarm({ WebView }: { WebView: WebViewComponent }): React.ReactElement {
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ position: "absolute", left: 0, top: 0, width: 1, height: 1, opacity: 0, overflow: "hidden" }}
    >
      <WebView
        testID="kyc-prewarm"
        source={{ uri: KYC_PREWARM_URL }}
        javaScriptEnabled
        domStorageEnabled
        originWhitelist={["*"]}
        onShouldStartLoadWithRequest={(req: { url: string }) => resolveKycWebNavigation(KYC_PREWARM_URL, req.url, API_URL) === "allow"}
        injectedJavaScript={WEBVIEW_VERSION_PROBE}
        onMessage={(e: { nativeEvent?: { data?: unknown } }) => {
          const m = typeof e?.nativeEvent?.data === "string" ? /^wv:(\d{2,3})$/.exec(e.nativeEvent.data) : null;
          if (m) webViewMajor = Number(m[1]);
        }}
        style={{ width: 1, height: 1 }}
      />
    </View>
  );
}

/** The page counts as shown at this much load progress — Didit's own app draws its loader from here. */
export const KYC_REVEAL_PROGRESS = 0.9;

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
  backRef,
}: {
  url: string;
  WebView: WebViewComponent;
  onDone: (outcome: KycCheckOutcome) => void;
  backRef: React.MutableRefObject<() => void>;
}): React.ReactElement {
  const [loading, setLoading] = useState(true);
  const doneRef = useRef(false);
  const webRef = useRef<WebViewHandle | null>(null);
  // Whether the page has history to go back to (onNavigationStateChange) — Android back steps through it.
  const canGoBackRef = useRef(false);
  // The last link the request handler handed to the OS, so the committed-state backup never opens it twice.
  const openedRef = useRef<string | null>(null);
  // Load analytics: when this check started loading, and whether its first reveal was already reported.
  const openedAt = useRef(Date.now());
  const shownRef = useRef(false);

  const done = (outcome: KycCheckOutcome): void => {
    // Exactly one outcome per presentation — a completion redirect and a close tap can race.
    if (doneRef.current) return;
    doneRef.current = true;
    onDone(outcome);
  };

  /** The check is on screen: drop the cover, and report how long it took (once). */
  const reveal = (): void => {
    setLoading(false);
    if (shownRef.current) return;
    shownRef.current = true;
    const prewarmed = prewarmAt > 0 && openedAt.current - prewarmAt < KYC_PREWARM_TTL_MS;
    track(EVENTS.kycSheetShown, { ms: Date.now() - openedAt.current, prewarmed, webview: webViewMajor });
  };

  /** ✕, and Android back from the check's first page. Confirm — closing a camera flow by accident is easy. */
  const requestClose = (): void => confirmLeave(() => done("cancelled"));

  /** Android back: a step back inside the check while it has one, and only then the leave prompt. */
  backRef.current = (): void => {
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
    <>
      <SheetHeader onClose={requestClose} />
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
          // The page is shown once it is nearly loaded, not at the load event: that waits for every last
          // image and font, while the vendor's app is already drawing its own first screen.
          onLoadProgress={(e: { nativeEvent?: { progress?: number } }) => {
            if ((e?.nativeEvent?.progress ?? 0) >= KYC_REVEAL_PROGRESS) reveal();
          }}
          onLoadEnd={reveal}
          onError={(e: { nativeEvent?: { url?: string } }) => {
            // A completion redirect to `lynia://` that slipped past the request handler fails to load
            // (Android: ERR_UNKNOWN_URL_SCHEME) — that is the check finishing, not breaking.
            const errUrl = e?.nativeEvent?.url;
            if (errUrl && resolveKycWebNavigation(url, errUrl, API_URL) === "completed") done("completed");
            else {
              // Funnel analytics: why the sheet failed (no URL — it can carry the session).
              track(EVENTS.kycWebError, { kind: "error" });
              addBreadcrumb("kyc.web_error", { kind: "error" });
              failed();
            }
          }}
          onHttpError={(e: { nativeEvent: { url?: string; statusCode?: number } }) => {
            // Main-document failure only: a 4xx/5xx subresource inside a working flow is the
            // vendor's business, not a reason to close the rider's check.
            if (e.nativeEvent.url === url) {
              const status = typeof e.nativeEvent.statusCode === "number" ? e.nativeEvent.statusCode : null;
              track(EVENTS.kycWebError, { kind: "http_error", status });
              addBreadcrumb("kyc.web_error", { kind: "http_error", status });
              failed();
            }
          }}
          style={{ flex: 1, backgroundColor: tokens.color.bg }}
        />
        {loading ? <OpeningCover overlay /> : null}
      </View>
    </>
  );
}
