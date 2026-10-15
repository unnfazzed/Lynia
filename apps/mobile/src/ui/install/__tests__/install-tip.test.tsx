import { readFileSync } from "fs";
import { resolve } from "path";
import React from "react";
import { Linking, Text } from "react-native";
import renderer, { act, type ReactTestRenderer } from "react-test-renderer";
import { INSTALL_TIP_KEYS } from "../../../logic/install-tip";
import { installTipCopy as C } from "../copy";
import { InstallPinRow } from "../InstallPinRow";
import { InstallTipSheet } from "../InstallTipSheet";
import { captureInstallParam } from "../install-param";
import { useInstallTip, type InstallTip } from "../useInstallTip";

let mockWeb = true;
jest.mock("../../../web-build", () => ({ isCustomerWebBuild: () => mockWeb }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }) }));

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

function mount(el: React.ReactElement): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(el);
  });
  return tree;
}
const texts = (t: ReactTestRenderer): string[] =>
  t.root.findAllByType(Text).map((n) => [n.props.children].flat().join(""));
const press = (t: ReactTestRenderer, label: string): void => {
  const [b] = t.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === "function");
  act(() => b!.props.onPress());
};

describe("copy", () => {
  it("is the handoff's copy.ts, verbatim", () => {
    const app = readFileSync(resolve(__dirname, "../copy.ts"), "utf8");
    const handoff = readFileSync(resolve(__dirname, "../../../../../../packages/design/handoff/download-qr-install-tip-2026-10/copy.ts"), "utf8");
    expect(app).toBe(handoff);
  });
});

describe("InstallTipSheet", () => {
  it("default (§2.1): chip, title, tracker, three steps with the ··· keycap, the cta", () => {
    const t = mount(<InstallTipSheet variant="default" onDismiss={() => {}} onAppStore={() => {}} />);
    const all = texts(t);
    for (const s of [C.sheet.chip, C.sheet.title, C.sheet.body, ...C.sheet.tracker, ...C.sheet.steps.map((step) => step.title), C.sheet.primary]) expect(all).toContain(s);
    expect(t.root.findAllByProps({ testID: "install-tip-tracker" })).not.toHaveLength(0);
    // Step 1's sub splits around the keycap; the whole sentence stays the accessible label.
    expect(t.root.findAll((n) => n.props.accessibilityLabel === C.sheet.steps[0].sub)).not.toHaveLength(0);
    expect(all).toContain("On iOS 26 it’s under");
  });

  it("small (§2.2): shorter copy, no tracker, steps 2 and 3 without a sub line", () => {
    const t = mount(<InstallTipSheet variant="small" onDismiss={() => {}} onAppStore={() => {}} />);
    const all = texts(t);
    for (const s of [C.sheetSmall.chip, C.sheetSmall.body, C.sheetSmall.primary]) expect(all).toContain(s);
    expect(t.root.findAllByProps({ testID: "install-tip-tracker" })).toHaveLength(0);
    expect(all).not.toContain(C.sheet.steps[1].sub);
  });

  it("launched (§2.5): Delivered badge, no steps, App Store + keep-web actions", () => {
    const onAppStore = jest.fn();
    const onDismiss = jest.fn();
    const t = mount(<InstallTipSheet variant="launched" onDismiss={onDismiss} onAppStore={onAppStore} />);
    const all = texts(t);
    for (const s of [C.launched.chip, C.launched.title, C.launched.body, C.launched.primary, C.launched.secondary]) expect(all).toContain(s);
    expect(t.root.findAllByProps({ testID: "install-tip-steps" })).toHaveLength(0);
    press(t, C.launched.primary);
    press(t, C.launched.secondary);
    expect(onAppStore).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("hidden when there is no variant", () => {
    const t = mount(<InstallTipSheet variant={null} onDismiss={() => {}} onAppStore={() => {}} />);
    expect(texts(t)).toHaveLength(0);
  });
});

describe("InstallPinRow", () => {
  it("How reopens, ✕ dismisses", () => {
    const onHow = jest.fn();
    const onDismiss = jest.fn();
    const t = mount(<InstallPinRow onHow={onHow} onDismiss={onDismiss} />);
    expect(texts(t)).toContain(C.pinRow.label);
    press(t, C.pinRow.action);
    press(t, C.pinRow.dismissLabel);
    expect(onHow).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe("useInstallTip in the web build", () => {
  const g = globalThis as unknown as Record<string, unknown>;
  const saved = { navigator: g.navigator, localStorage: g.localStorage, sessionStorage: g.sessionStorage, location: g.location, history: g.history };
  const store = (): { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void; data: Map<string, string> } => {
    const data = new Map<string, string>();
    return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
  };
  let local: ReturnType<typeof store>;
  let replaced: string | null;

  beforeEach(() => {
    mockWeb = true;
    local = store();
    replaced = null;
    Object.assign(g, {
      navigator: { userAgent: IPHONE, maxTouchPoints: 5 },
      localStorage: local,
      sessionStorage: store(),
      location: { href: "https://app.lyniago.com/?install=1&utm=x" },
      history: { state: { k: 1 }, replaceState: (_s: unknown, _t: string, url: string) => (replaced = url) },
    });
  });
  afterAll(() => Object.assign(g, saved));

  let tip!: InstallTip;
  function Probe(): null {
    tip = useInstallTip();
    return null;
  }

  it("captures ?install=1 at boot and strips it from the URL", () => {
    captureInstallParam();
    expect(replaced).toBe("/?utm=x");
  });

  it("sheet → dismissed → pin row → How reopens → ✕ on the pin removes it for good", () => {
    captureInstallParam();
    const t = mount(<Probe />);
    expect(tip.sheet).toBe("default");
    expect(tip.pin).toBe(false);
    act(() => tip.dismissSheet());
    expect(local.data.get(INSTALL_TIP_KEYS.tip)).toBe("1");
    expect(tip.sheet).toBeNull();
    expect(tip.pin).toBe(true);
    act(() => tip.reopen());
    expect(tip.sheet).toBe("default");
    act(() => tip.dismissSheet());
    expect(tip.sheet).toBeNull();
    expect(tip.pin).toBe(true);
    act(() => tip.dismissPin());
    expect(local.data.get(INSTALL_TIP_KEYS.pin)).toBe("1");
    expect(tip.pin).toBe(false);
    act(() => t.unmount());
  });

  it("without the download link: nothing, even on iPhone Safari", () => {
    mount(<Probe />);
    expect(tip.sheet).toBeNull();
    expect(tip.pin).toBe(false);
  });

  it("installed from the Home Screen: nothing", () => {
    captureInstallParam();
    Object.assign(g, { navigator: { userAgent: IPHONE, maxTouchPoints: 5, standalone: true } });
    mount(<Probe />);
    expect(tip.sheet).toBeNull();
  });

  it("the phone apps: nothing", () => {
    captureInstallParam();
    mockWeb = false;
    mount(<Probe />);
    expect(tip.sheet).toBeNull();
    expect(tip.pin).toBe(false);
  });

  it("openAppStore is inert without an App Store link", () => {
    const spy = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    mount(<Probe />);
    act(() => tip.openAppStore());
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
