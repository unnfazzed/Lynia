/**
 * First Run v2 U1–U5 (`packages/design/handoff/first-run-v2` README §2 C, ledger D-82): the hard update
 * gate. White screen, green 280 hero with the white mark, "Time to update", "Update now" + "Help on
 * WhatsApp"; the server's what's-new line as the "New" pill; U2 swaps the CTA for WhatsApp when no store
 * link is configured; U3 disables the CTA while offline and re-enables it on reconnect.
 */
import renderer, { act } from "react-test-renderer";
import { Linking } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

const TEST_METRICS = { insets: { top: 0, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 360, height: 720 } };
const mockOpenWhatsApp = jest.fn();
let mockStoreUrl: string | null = "https://play.google.com/store/apps/details?id=zw.co.lynia";
jest.mock("../../src/config", () => ({
  API_URL: "http://api.test",
  get STORE_URL() {
    return mockStoreUrl;
  },
  openSupportWhatsApp: () => mockOpenWhatsApp(),
}));
jest.mock("../../src/boot/boot-splash-hold", () => ({ useBootSplashRelease: () => () => undefined }));

import ForceUpdateScreen from "../force-update";
import { __resetReachability, reportReachable, reportUnreachable } from "../../src/net/reachability";
import { setServerVersionGateForTest } from "../../src/net/use-server-version-gate";

const trees: renderer.ReactTestRenderer[] = [];
afterEach(() => {
  while (trees.length) {
    const t = trees.pop()!;
    act(() => t.unmount());
  }
  setServerVersionGateForTest(null);
  __resetReachability();
});
beforeEach(() => {
  jest.clearAllMocks();
  mockStoreUrl = "https://play.google.com/store/apps/details?id=zw.co.lynia";
  global.fetch = jest.fn(async () => ({ ok: true, status: 200 })) as unknown as typeof fetch;
});

async function render(): Promise<renderer.ReactTestRenderer> {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={TEST_METRICS}>
        <ForceUpdateScreen />
      </SafeAreaProvider>,
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  trees.push(tree);
  return tree;
}
const out = (t: renderer.ReactTestRenderer): string => JSON.stringify(t.toJSON());
const byId = (t: renderer.ReactTestRenderer, id: string) => t.root.findAll((n) => n.props.testID === id && typeof n.props.onPress === "function")[0];

describe("U1 · required", () => {
  it("draws the white screen with the green 280 hero, the title in two parts, the body, Update now and Help on WhatsApp", async () => {
    const t = await render();
    const s = out(t);
    for (const k of ["Time to", "update", "This version no longer works. It takes a minute.", "Update now", "Help on WhatsApp"]) expect(s).toContain(k);
    const hero = t.root.findAll((n) => n.props.testID === "force-update-hero" && n.props.style)[0]!;
    expect(JSON.stringify(hero.props.style)).toContain('"height":280');
    // No what's-new line from the server → no pill.
    expect(s).not.toContain('"New"');
  });

  it("Update now opens the store; Help opens WhatsApp", async () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    const t = await render();
    await act(async () => byId(t, "force-update-cta")!.props.onPress());
    expect(open).toHaveBeenCalledWith("https://play.google.com/store/apps/details?id=zw.co.lynia");
    await act(async () => byId(t, "force-update-help")!.props.onPress());
    expect(mockOpenWhatsApp).toHaveBeenCalled();
  });

  it("shows the server's what's-new line as the 'New' pill", async () => {
    act(() => setServerVersionGateForTest({ min: "9.0.0", recommended: null, whatsNew: "Faster live tracking" }));
    const t = await render();
    const s = out(t);
    expect(s).toContain("New");
    expect(s).toContain("Faster live tracking");
  });
});

describe("U2 · no store link", () => {
  it("says how to find the app and makes WhatsApp the one action — no pill, no second link", async () => {
    mockStoreUrl = null;
    act(() => setServerVersionGateForTest({ min: "9.0.0", recommended: null, whatsNew: "Faster live tracking" }));
    const t = await render();
    const s = out(t);
    expect(s).toContain("Open Google Play and search “LyniaGo”.");
    expect(s).toContain("Message us on WhatsApp");
    expect(s).not.toContain("Update now");
    expect(s).not.toContain("Faster live tracking");
    await act(async () => byId(t, "force-update-cta")!.props.onPress());
    expect(mockOpenWhatsApp).toHaveBeenCalled();
  });
});

describe("U3 · offline", () => {
  it("disables the CTA over the 'Waiting for a connection' box, and re-enables it by itself on reconnect", async () => {
    global.fetch = jest.fn(async () => {
      throw new TypeError("Network request failed");
    }) as unknown as typeof fetch;
    const t = await render();
    expect(out(t)).toContain("Waiting for a connection");
    expect(byId(t, "force-update-cta")!.props.disabled).toBe(true);
    // The link stays live: help is always reachable (BRIEF 9).
    expect(byId(t, "force-update-help")!.props.disabled).toBeFalsy();
    await act(async () => reportReachable());
    expect(out(t)).not.toContain("Waiting for a connection");
    expect(byId(t, "force-update-cta")!.props.disabled).toBeFalsy();
  });

  it("an unreachable report from elsewhere also disables it (the app-wide reachability store)", async () => {
    const t = await render();
    expect(byId(t, "force-update-cta")!.props.disabled).toBeFalsy();
    await act(async () => reportUnreachable());
    expect(byId(t, "force-update-cta")!.props.disabled).toBe(true);
  });
});
