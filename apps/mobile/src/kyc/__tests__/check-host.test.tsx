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
import { Alert } from "react-native";
import renderer, { act, type ReactTestRenderer } from "react-test-renderer";

import { SystemState } from "../../ui";
import { canPresentKycCheck, KycCheckHost, presentKycCheck, resetKycCheckHostForTests } from "../KycCheckHost";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { WebView: MockWebView } = require("react-native-webview") as { WebView: React.ComponentType };

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
    expect(rendered).toContain("with our verification partner Didit");
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
      webViewProps(tree).onNavigationStateChange!({ url: "https://lyniago.lyniafinance.com/kyc/return" } as never);
    });
    await expect(pending).resolves.toBe("completed");
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
      expect.stringContaining("rider board"),
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

  it("a load error shows the cant_start-voiced error state; Close resolves failed", async () => {
    const { tree, pending } = openSheet();
    act(() => {
      webViewProps(tree).onError!({} as never);
    });
    expect(JSON.stringify(tree.toJSON())).toContain("We couldn't open the ID check");
    const state = tree.root.findByType(SystemState);
    expect(state.props.secondary).toBe("Close");
    act(() => (state.props as { onSecondary: () => void }).onSecondary());
    await expect(pending).resolves.toBe("failed");
  });

  it("'Try again' from the error state remounts the WebView for a clean retry", () => {
    const { tree } = openSheet();
    act(() => {
      webViewProps(tree).onError!({} as never);
    });
    expect(tree.root.findAllByType(MockWebView)).toHaveLength(0);
    const state = tree.root.findByType(SystemState);
    expect(state.props.primary).toBe("Try again");
    act(() => (state.props as { onPrimary: () => void }).onPrimary());
    expect(tree.root.findAllByType(MockWebView)).toHaveLength(1);
  });

  it("a subresource http error does not blank a working flow (main-document only)", () => {
    const { tree } = openSheet();
    act(() => {
      webViewProps(tree).onHttpError!({ nativeEvent: { url: "https://cdn.didit.me/missing.png" } } as never);
    });
    expect(tree.root.findAllByType(MockWebView)).toHaveLength(1);
    act(() => {
      webViewProps(tree).onHttpError!({ nativeEvent: { url: URL } } as never);
    });
    expect(JSON.stringify(tree.toJSON())).toContain("We couldn't open the ID check");
  });
});
