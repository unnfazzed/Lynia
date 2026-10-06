/**
 * First Run v2 U4a / U4b (README §2 C, ledger D-80 §2 #7): the soft update banner. Shown when the server's
 * `recommendedVersion` is above this build, ONCE per version (Update or ✕ settles it on this phone), and
 * never without a store link (its only action). Forest on Home, violet on the rider board.
 */
import renderer, { act } from "react-test-renderer";
import { Linking } from "react-native";

const mockStore = new Map<string, string>();
jest.mock("expo-secure-store", () => ({
  getItemAsync: async (k: string) => mockStore.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => {
    mockStore.set(k, v);
  },
}));
let mockStoreUrl: string | null = "https://play.google.com/store/apps/details?id=zw.co.lynia";
// A live getter (an object-spread literal would read it once, at mock creation).
jest.mock("../../../config", () => Object.defineProperty({ ...jest.requireActual("../../../config") }, "STORE_URL", { get: () => mockStoreUrl }));

import { SOFT_UPDATE_KEY, shouldShowSoftUpdate } from "../../../logic/soft-update";
import { setServerVersionGateForTest } from "../../../net/use-server-version-gate";
import { SoftUpdateBanner, useSoftUpdate } from "../SoftUpdateBanner";

describe("shouldShowSoftUpdate", () => {
  const base = { current: "0.50.0", recommended: "0.60.0", dismissed: null, hasStoreLink: true };
  it("shows for a build below the recommended version", () => {
    expect(shouldShowSoftUpdate(base)).toBe(true);
  });
  it("stays off when the server sends none, the build is current, or there is no store link", () => {
    expect(shouldShowSoftUpdate({ ...base, recommended: null })).toBe(false);
    expect(shouldShowSoftUpdate({ ...base, current: "0.60.0" })).toBe(false);
    expect(shouldShowSoftUpdate({ ...base, current: "0.61.0" })).toBe(false);
    expect(shouldShowSoftUpdate({ ...base, hasStoreLink: false })).toBe(false);
  });
  it("once per version: a settled version stays hidden, a newer one comes back", () => {
    expect(shouldShowSoftUpdate({ ...base, dismissed: "0.60.0" })).toBe(false);
    expect(shouldShowSoftUpdate({ ...base, recommended: "0.61.0", dismissed: "0.60.0" })).toBe(true);
  });
});

function Harness({ tone }: { tone: "forest" | "violet" }): React.ReactElement {
  const s = useSoftUpdate("0.50.0");
  return <SoftUpdateBanner tone={tone} state={s} />;
}

const trees: renderer.ReactTestRenderer[] = [];
afterEach(() => {
  while (trees.length) {
    const t = trees.pop()!;
    act(() => t.unmount());
  }
  setServerVersionGateForTest(null);
  mockStore.clear();
  mockStoreUrl = "https://play.google.com/store/apps/details?id=zw.co.lynia";
});

async function render(tone: "forest" | "violet" = "forest"): Promise<renderer.ReactTestRenderer> {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<Harness tone={tone} />);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  trees.push(tree);
  return tree;
}
const banner = (t: renderer.ReactTestRenderer) => t.root.findAll((n) => n.props.testID === "soft-update-banner" && n.props.style)[0];
const press = async (t: renderer.ReactTestRenderer, id: string): Promise<void> => {
  const b = t.root.findAll((n) => n.props.testID === id && typeof n.props.onPress === "function")[0]!;
  await act(async () => {
    b.props.onPress();
    await new Promise((r) => setTimeout(r, 0));
  });
};

describe("SoftUpdateBanner", () => {
  it("is absent until the server recommends a newer version", async () => {
    const t = await render();
    expect(banner(t)).toBeUndefined();
    await act(async () => setServerVersionGateForTest({ min: "0.0.0", recommended: "0.60.0", whatsNew: null }));
    expect(banner(t)).toBeDefined();
    const s = JSON.stringify(t.toJSON());
    for (const k of ["A new version is ready", "Faster live tracking.", "Update"]) expect(s).toContain(k);
  });

  it("U4a is forest with a brand-green pill; U4b is violet with a white pill", async () => {
    setServerVersionGateForTest({ min: "0.0.0", recommended: "0.60.0", whatsNew: null });
    const forest = await render("forest");
    expect(JSON.stringify(banner(forest)!.props.style)).toContain('"backgroundColor":"#063B22"');
    expect(JSON.stringify(banner(forest)!.props.style)).toContain('"borderRadius":20');
    const violet = await render("violet");
    expect(JSON.stringify(banner(violet)!.props.style)).toContain('"backgroundColor":"#4B2FBF"');
  });

  it("✕ settles this version on this phone: gone now, and gone on the next launch", async () => {
    setServerVersionGateForTest({ min: "0.0.0", recommended: "0.60.0", whatsNew: null });
    const t = await render();
    await press(t, "soft-update-dismiss");
    expect(banner(t)).toBeUndefined();
    expect(mockStore.get(SOFT_UPDATE_KEY)).toBe("0.60.0");
    const again = await render();
    expect(banner(again)).toBeUndefined();
  });

  it("Update opens the store and also settles the version", async () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    setServerVersionGateForTest({ min: "0.0.0", recommended: "0.60.0", whatsNew: null });
    const t = await render();
    await press(t, "soft-update-cta");
    expect(open).toHaveBeenCalledWith("https://play.google.com/store/apps/details?id=zw.co.lynia");
    expect(banner(t)).toBeUndefined();
  });

  it("never shows without a store link — it would have nothing to offer", async () => {
    mockStoreUrl = null;
    setServerVersionGateForTest({ min: "0.0.0", recommended: "0.60.0", whatsNew: null });
    const t = await render();
    expect(banner(t)).toBeUndefined();
  });
});
