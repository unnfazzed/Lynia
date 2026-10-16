/**
 * The in-app ID-check sheet (src/kyc/KycCheckHost.tsx) — host/presenter mechanics and the three-way
 * outcome contract the walls depend on:
 *
 *   completed → in_flight   (the completion redirect closed the sheet)
 *   cancelled → unfinished  (the rider chose to leave; nothing broke)
 *   failed    → cant_start  (the check surface itself wouldn't open)
 *
 * react-native-webview is moduleNameMapper'd to a render-nothing mock (jest.config.js), so these
 * tests drive the sheet exactly the way the platform would: by invoking the WebView props
 * (navigation, load, error) directly.
 */
import React from "react";
import { Alert, Linking } from "react-native";
import renderer, { act, type ReactTestRenderer } from "react-test-renderer";

import {
  canPresentKycCheck,
  endKycCheckHold,
  holdKycCheck,
  KYC_KEEP_AWAKE_TAG,
  KYC_PREWARM_TTL_MS,
  KYC_PREWARM_URL,
  KycCheckHost,
  kycWebViewMajor,
  presentKycCheck,
  prewarmKycCheck,
  resetKycCheckHostForTests,
} from "../KycCheckHost";

const mockActivate = jest.fn(async (_tag: string) => undefined);
const mockDeactivate = jest.fn(async (_tag: string) => undefined);
jest.mock("expo-keep-awake", () => ({
  activateKeepAwakeAsync: (tag: string) => mockActivate(tag),
  deactivateKeepAwake: (tag: string) => mockDeactivate(tag),
}));

const mockTrack = jest.fn();
jest.mock("../../telemetry/events", () => ({
  ...jest.requireActual("../../telemetry/events"),
  track: (...a: unknown[]) => mockTrack(...a),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { WebView: MockWebView, __refCalls: refCalls } = require("react-native-webview") as { WebView: React.ComponentType; __refCalls: string[] };

const URL = "https://verify.didit.me/sess_1";

/** The rendered mock WebView's props — the sheet is driven entirely through these. */
function webViewProps(tree: ReactTestRenderer): Record<string, (...args: never[]) => unknown> {
  return tree.root.findByType(MockWebView).props as Record<string, (...args: never[]) => unknown>;
}

let alertSpy: jest.SpyInstance;
/** Trees created by a test — unmounted in afterEach so the sheet's slow-open timer never leaks. */
const trees: ReactTestRenderer[] = [];

beforeEach(() => {
  resetKycCheckHostForTests();
  alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  refCalls.length = 0;
});
afterEach(() => {
  for (const t of trees.splice(0)) {
    act(() => t.unmount());
  }
  alertSpy.mockRestore();
});

describe("KycCheckHost registry", () => {
  it("cannot present with no host mounted", () => {
    expect(canPresentKycCheck()).toBe(false);
    expect(presentKycCheck({ url: URL })).toBeNull();
  });

  it("can present once a host mounts, and stops when it unmounts", () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(<KycCheckHost />);
    });
    expect(canPresentKycCheck()).toBe(true);
    act(() => tree.unmount());
    expect(canPresentKycCheck()).toBe(false);
  });

  it("resolves a dangling presentation as cancelled when the host unmounts mid-check", async () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(<KycCheckHost />);
    });
    let pending!: Promise<string>;
    act(() => {
      pending = presentKycCheck({ url: URL })!;
    });
    act(() => tree.unmount());
    await expect(pending).resolves.toBe("cancelled");
  });
});

describe("KycCheckSheet outcomes", () => {
  function openSheet(): { tree: ReactTestRenderer; pending: Promise<string> } {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(<KycCheckHost />);
    });
    trees.push(tree);
    let pending!: Promise<string>;
    act(() => {
      pending = presentKycCheck({ url: URL })!;
    });
    return { tree, pending };
  }

  it("renders the branded chrome over the vendor flow", () => {
    const { tree } = openSheet();
    const rendered = JSON.stringify(tree.toJSON());
    expect(rendered).toContain("ID check");
    // D-38: no vendor naming anywhere in rider-facing KYC — the sub explains the step instead.
    expect(rendered).toContain("Have your national ID ready");
    expect(rendered).not.toContain("Didit");
    expect(tree.root.findByType(MockWebView).props.source).toEqual({ uri: URL });
  });

  it("completes when the top frame redirects to the app scheme, and blocks the load", async () => {
    const { tree, pending } = openSheet();
    let allowed!: unknown;
    act(() => {
      allowed = webViewProps(tree).onShouldStartLoadWithRequest!({ url: "lynia://kyc-done", isTopFrame: true } as never);
    });
    expect(allowed).toBe(false);
    await expect(pending).resolves.toBe("completed");
    // The sheet is gone — a second presentation gets a fresh one rather than a stale resolver.
    expect(tree.root.findAllByType(MockWebView)).toHaveLength(0);
  });

  it("completes when a committed navigation lands off the vendor host (server-side redirect chain)", async () => {
    const { tree, pending } = openSheet();
    act(() => {
      webViewProps(tree).onNavigationStateChange!({ url: "https://api.lyniago.com/kyc/return" } as never);
    });
    await expect(pending).resolves.toBe("completed");
  });

  // Regression: a policy link on the vendor's first screen used to close the sheet as "completed", and
  // the board then said "We're checking your ID" to a rider who had submitted nothing.
  it("an off-vendor link opens outside the app and keeps the check open — it is not completion", () => {
    const openSpy = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    const { tree } = openSheet();
    let allowed!: unknown;
    act(() => {
      allowed = webViewProps(tree).onShouldStartLoadWithRequest!({ url: "https://www.lyniago.com/privacy", isTopFrame: true } as never);
    });
    expect(allowed).toBe(false);
    expect(openSpy).toHaveBeenCalledWith("https://www.lyniago.com/privacy");
    // The committed-state backup never opens it a second time.
    act(() => {
      webViewProps(tree).onNavigationStateChange!({ url: "https://www.lyniago.com/privacy" } as never);
    });
    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(tree.root.findAllByType(MockWebView)).toHaveLength(1);
    openSpy.mockRestore();
  });

  it("iframe loads never complete the check (isTopFrame false is allowed through)", () => {
    const { tree } = openSheet();
    let allowed!: unknown;
    act(() => {
      allowed = webViewProps(tree).onShouldStartLoadWithRequest!({
        url: "https://consent.example.com/embed",
        isTopFrame: false,
      } as never);
    });
    expect(allowed).toBe(true);
    expect(tree.root.findAllByType(MockWebView)).toHaveLength(1);
  });

  it("close ✕ confirms, and 'Leave' resolves cancelled", async () => {
    const { tree, pending } = openSheet();
    const close = tree.root.findAllByProps({ accessibilityLabel: "Close" })[0]!;
    act(() => {
      (close.props as { onPress: () => void }).onPress();
    });
    expect(alertSpy).toHaveBeenCalledWith(
      "Leave the ID check?",
      expect.stringContaining("biker board"),
      expect.any(Array),
    );
    const buttons = alertSpy.mock.calls[0]![2] as Array<{ text: string; onPress?: () => void }>;
    const leave = buttons.find((b) => b.text === "Leave")!;
    act(() => leave.onPress!());
    await expect(pending).resolves.toBe("cancelled");
  });

  it("'Keep going' keeps the sheet open", () => {
    const { tree } = openSheet();
    const close = tree.root.findAllByProps({ accessibilityLabel: "Close" })[0]!;
    act(() => {
      (close.props as { onPress: () => void }).onPress();
    });
    const buttons = alertSpy.mock.calls[0]![2] as Array<{ text: string; onPress?: () => void }>;
    expect(buttons.find((b) => b.text === "Keep going")).toBeDefined();
    expect(tree.root.findAllByType(MockWebView)).toHaveLength(1);
  });

  // The sheet used to draw its own kyc-2026-08 `kyc_cant_start` page first, and the board then showed F7
  // on Close — the same fault, told twice. F7 (D-82) is now the only error the rider sees.
  it("a load error resolves failed at once — no error page of its own (F7 is the one drawn screen)", async () => {
    const { tree, pending } = openSheet();
    act(() => {
      webViewProps(tree).onError!({ nativeEvent: { url: URL } } as never);
    });
    await expect(pending).resolves.toBe("failed");
    expect(JSON.stringify(tree.toJSON() ?? "")).not.toContain("We couldn't open the ID check");
    expect(JSON.stringify(tree.toJSON() ?? "")).not.toContain("usually the camera");
    expect(tree.root.findAllByType(MockWebView)).toHaveLength(0);
  });

  it("a lynia:// completion redirect that surfaces as a load error is done, not an error", async () => {
    const { tree, pending } = openSheet();
    act(() => {
      webViewProps(tree).onError!({ nativeEvent: { url: "lynia://kyc-done", description: "net::ERR_UNKNOWN_URL_SCHEME" } } as never);
    });
    await expect(pending).resolves.toBe("completed");
  });

  it("a fresh presentation after a failed one loads its own URL (F7's Try again reopens a clean sheet)", async () => {
    const { tree, pending } = openSheet();
    act(() => {
      webViewProps(tree).onError!({} as never);
    });
    await expect(pending).resolves.toBe("failed");
    let second!: Promise<string>;
    act(() => {
      second = presentKycCheck({ url: "https://verify.didit.me/sess_2" })!;
    });
    expect(tree.root.findByType(MockWebView).props.source).toEqual({ uri: "https://verify.didit.me/sess_2" });
    act(() => {
      webViewProps(tree).onShouldStartLoadWithRequest!({ url: "lynia://kyc-done", isTopFrame: true } as never);
    });
    await expect(second).resolves.toBe("completed");
  });

  it("Android back steps back inside the check while it has history, and only prompts on its first page", () => {
    const { tree } = openSheet();
    const modal = () => tree.root.findAll((n) => typeof n.props.onRequestClose === "function")[0]!;
    act(() => {
      webViewProps(tree).onNavigationStateChange!({ url: "https://verify.didit.me/sess_1/step-2", canGoBack: true } as never);
    });
    act(() => (modal().props as { onRequestClose: () => void }).onRequestClose());
    expect(refCalls).toEqual(["goBack"]);
    expect(alertSpy).not.toHaveBeenCalled();
    act(() => {
      webViewProps(tree).onNavigationStateChange!({ url: URL, canGoBack: false } as never);
    });
    act(() => (modal().props as { onRequestClose: () => void }).onRequestClose());
    expect(refCalls).toEqual(["goBack"]);
    expect(alertSpy).toHaveBeenCalledWith("Leave the ID check?", expect.any(String), expect.any(Array));
  });

  it("a server-side redirect to someone else's page is not rendered in the sheet: stopped, stepped back from, opened outside", () => {
    const openSpy = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    const { tree } = openSheet();
    act(() => {
      webViewProps(tree).onNavigationStateChange!({ url: "https://tracker.example.com/landing", canGoBack: true } as never);
    });
    expect(refCalls).toEqual(["stopLoading", "goBack"]);
    expect(openSpy).toHaveBeenCalledWith("https://tracker.example.com/landing");
    expect(tree.root.findAllByType(MockWebView)).toHaveLength(1);
    openSpy.mockRestore();
  });

  it("…and when the check itself redirected away (nothing to step back to), it resolves failed", async () => {
    const openSpy = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    const { tree, pending } = openSheet();
    act(() => {
      webViewProps(tree).onNavigationStateChange!({ url: "https://tracker.example.com/landing", canGoBack: false } as never);
    });
    await expect(pending).resolves.toBe("failed");
    openSpy.mockRestore();
  });

  it("a subresource http error does not close a working flow (main-document only)", async () => {
    const { tree, pending } = openSheet();
    act(() => {
      webViewProps(tree).onHttpError!({ nativeEvent: { url: "https://cdn.didit.me/missing.png" } } as never);
    });
    expect(tree.root.findAllByType(MockWebView)).toHaveLength(1);
    act(() => {
      webViewProps(tree).onHttpError!({ nativeEvent: { url: URL } } as never);
    });
    await expect(pending).resolves.toBe("failed");
  });

  it("funnel analytics: a main-document http error / a load error is reported (no URL sent)", async () => {
    mockTrack.mockClear();
    const first = openSheet();
    act(() => {
      webViewProps(first.tree).onHttpError!({ nativeEvent: { url: URL, statusCode: 503 } } as never);
    });
    await expect(first.pending).resolves.toBe("failed");
    expect(mockTrack).toHaveBeenCalledWith("kyc_web_error", { kind: "http_error", status: 503 });
    const second = openSheet();
    act(() => {
      webViewProps(second.tree).onError!({ nativeEvent: { url: URL } } as never);
    });
    await expect(second.pending).resolves.toBe("failed");
    expect(mockTrack).toHaveBeenCalledWith("kyc_web_error", { kind: "error" });
  });
});

// 2026-10-16: the first live checks after manual mode ended were slow to open. The tap now holds the sheet
// open and prewarms the vendor's page while the session is minted (verify.ts primeKycLaunch).
describe("faster opening", () => {
  function mountHost(): ReactTestRenderer {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(<KycCheckHost />);
    });
    trees.push(tree);
    return tree;
  }
  const webViews = (tree: ReactTestRenderer) => tree.root.findAllByType(MockWebView);
  const prewarm = (tree: ReactTestRenderer) => webViews(tree).find((w) => w.props.testID === "kyc-prewarm");

  it("the hold opens the sheet on 'Opening your ID check…' with no WebView yet; the check takes it over", async () => {
    const tree = mountHost();
    act(() => holdKycCheck());
    expect(JSON.stringify(tree.toJSON())).toContain("Opening your ID check");
    expect(webViews(tree)).toHaveLength(0);
    let pending!: Promise<string>;
    act(() => {
      pending = presentKycCheck({ url: URL })!;
    });
    expect(webViews(tree)).toHaveLength(1);
    expect(webViews(tree)[0]!.props.source).toEqual({ uri: URL });
    act(() => {
      webViews(tree)[0]!.props.onShouldStartLoadWithRequest({ url: "lynia://kyc-done" });
    });
    await expect(pending).resolves.toBe("completed");
  });

  it("ending the hold closes the stand-in (an error, nothing to open)", () => {
    const tree = mountHost();
    act(() => holdKycCheck());
    act(() => endKycCheckHold());
    expect(tree.toJSON()).toBeNull();
  });

  it("leaving the stand-in cancels the check that follows — it never opens over the rider", async () => {
    const tree = mountHost();
    act(() => holdKycCheck());
    (Alert.alert as unknown as jest.Mock).mockImplementationOnce((_t: string, _m: string, buttons: { text: string; onPress?: () => void }[]) => {
      buttons.find((b) => b.text === "Leave")?.onPress?.();
    });
    const close = tree.root.findAll((n) => n.props.accessibilityLabel === "Close" && typeof n.props.onPress === "function")[0]!;
    act(() => close.props.onPress());
    expect(tree.toJSON()).toBeNull();
    let pending!: Promise<string> | null;
    act(() => {
      pending = presentKycCheck({ url: URL });
    });
    await expect(pending).resolves.toBe("cancelled");
    expect(webViews(tree)).toHaveLength(0);
    // …and the next attempt presents normally.
    act(() => {
      pending = presentKycCheck({ url: URL });
    });
    expect(webViews(tree)).toHaveLength(1);
  });

  it("Leave closes a check that arrived while the leave prompt was up", async () => {
    const tree = mountHost();
    act(() => holdKycCheck());
    let leave: (() => void) | undefined;
    (Alert.alert as unknown as jest.Mock).mockImplementationOnce((_t: string, _m: string, buttons: { text: string; onPress?: () => void }[]) => {
      leave = buttons.find((b) => b.text === "Leave")?.onPress;
    });
    const close = tree.root.findAll((n) => n.props.accessibilityLabel === "Close" && typeof n.props.onPress === "function")[0]!;
    act(() => close.props.onPress());
    // The session comes back while the prompt is still up: the check takes the stand-in's place.
    let pending!: Promise<string> | null;
    act(() => {
      pending = presentKycCheck({ url: URL });
    });
    expect(webViews(tree)).toHaveLength(1);
    act(() => leave!());
    await expect(pending).resolves.toBe("cancelled");
    expect(tree.toJSON()).toBeNull();
    // Nothing is left marked cancelled: the next attempt presents normally.
    act(() => {
      pending = presentKycCheck({ url: URL });
    });
    expect(webViews(tree)).toHaveLength(1);
  });

  it("the hold is a no-op with no host (the browser lane has nothing to stand in for)", () => {
    expect(() => holdKycCheck()).not.toThrow();
    expect(() => prewarmKycCheck()).not.toThrow();
  });

  it("prewarms the vendor's origin in a hidden, untouchable WebView that refuses to leave the vendor", () => {
    const tree = mountHost();
    act(() => prewarmKycCheck());
    const w = prewarm(tree)!;
    expect(w.props.source).toEqual({ uri: KYC_PREWARM_URL });
    expect(w.props.onShouldStartLoadWithRequest({ url: "https://verify.didit.me/_next/static/x.js" })).toBe(true);
    expect(w.props.onShouldStartLoadWithRequest({ url: "https://evil.example/" })).toBe(false);
    expect(w.props.onShouldStartLoadWithRequest({ url: "lynia://done" })).toBe(false);
  });

  it("reads the System WebView's major version from the prewarm (the number only)", () => {
    const tree = mountHost();
    act(() => prewarmKycCheck());
    act(() => prewarm(tree)!.props.onMessage({ nativeEvent: { data: "wv:118" } }));
    expect(kycWebViewMajor()).toBe(118);
    act(() => prewarm(tree)!.props.onMessage({ nativeEvent: { data: "something else" } }));
    expect(kycWebViewMajor()).toBe(118);
  });

  it("the prewarm gives way to the real check, and unmounts itself when its tap went nowhere", () => {
    jest.useFakeTimers();
    try {
      const tree = mountHost();
      act(() => prewarmKycCheck());
      expect(prewarm(tree)).toBeDefined();
      act(() => {
        presentKycCheck({ url: URL });
      });
      expect(prewarm(tree)).toBeUndefined();
      expect(webViews(tree)).toHaveLength(1);

      const other = mountHost();
      act(() => prewarmKycCheck());
      expect(prewarm(other)).toBeDefined();
      act(() => {
        jest.advanceTimersByTime(KYC_PREWARM_TTL_MS + 1);
      });
      expect(prewarm(other)).toBeUndefined();
    } finally {
      jest.useRealTimers();
    }
  });

  it("shows the check at 90% loaded (not the load event), and reports how long it took, once", () => {
    mockTrack.mockClear();
    const tree = mountHost();
    act(() => prewarmKycCheck());
    act(() => {
      presentKycCheck({ url: URL });
    });
    expect(JSON.stringify(tree.toJSON())).toContain("Opening your ID check");
    act(() => webViews(tree)[0]!.props.onLoadProgress({ nativeEvent: { progress: 0.5 } }));
    expect(JSON.stringify(tree.toJSON())).toContain("Opening your ID check");
    act(() => webViews(tree)[0]!.props.onLoadProgress({ nativeEvent: { progress: 0.92 } }));
    expect(JSON.stringify(tree.toJSON())).not.toContain("Opening your ID check");
    act(() => webViews(tree)[0]!.props.onLoadEnd());
    const shown = mockTrack.mock.calls.filter((c) => c[0] === "kyc_sheet_shown");
    expect(shown).toHaveLength(1);
    expect(shown[0]![1]).toMatchObject({ prewarmed: true });
    expect(typeof (shown[0]![1] as { ms: unknown }).ms).toBe("number");
  });

  it("a check that failed to load is never reported shown (onLoadEnd fires after onError)", () => {
    mockTrack.mockClear();
    const tree = mountHost();
    act(() => {
      presentKycCheck({ url: URL });
    });
    const props = webViews(tree)[0]!.props;
    act(() => props.onError({ nativeEvent: { url: URL } }));
    act(() => props.onLoadEnd());
    expect(mockTrack.mock.calls.filter((c) => c[0] === "kyc_sheet_shown")).toHaveLength(0);
  });

  it("keeps the screen on while the sheet is up, and lets it go after", async () => {
    const tree = mountHost();
    mockActivate.mockClear();
    mockDeactivate.mockClear();
    let pending!: Promise<string>;
    act(() => {
      pending = presentKycCheck({ url: URL })!;
    });
    expect(mockActivate).toHaveBeenCalledWith(KYC_KEEP_AWAKE_TAG);
    act(() => {
      webViews(tree)[0]!.props.onShouldStartLoadWithRequest({ url: "lynia://kyc-done" });
    });
    await expect(pending).resolves.toBe("completed");
    expect(mockDeactivate).toHaveBeenCalledWith(KYC_KEEP_AWAKE_TAG);
  });
});
