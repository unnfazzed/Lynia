/**
 * Shop share links in the app (handoff shop-share-v1 README §2, ledger D-129): `/s/<CODE>` saves the shop and
 * starts sign-up when signed out, opens the right store when signed in, and shows SH-A4 / SH-A5 / SH-A7.
 */
import renderer, { act } from "react-test-renderer";
import { SafeAreaProvider } from "react-native-safe-area-context";

const TEST_METRICS = { insets: { top: 0, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 360, height: 720 } };
let mockParams: { code?: string } = {};
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockDismissAll = jest.fn();
let mockCanGoBack = true;
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn(), dismissAll: mockDismissAll, canGoBack: () => mockCanGoBack, canDismiss: () => true }),
  useLocalSearchParams: () => mockParams,
}));
let mockSession: object | null = null;
jest.mock("../../src/auth/auth-context", () => ({ useAuth: () => ({ session: mockSession, loading: false }) }));
let mockRolePref: string | null = null;
jest.mock("../../src/auth/device-state", () => ({ loadRolePreference: async () => mockRolePref }));
let mockActive: object | null = null;
jest.mock("../../src/api/orders", () => ({ getActiveOrder: async () => mockActive }));
const mockSwitch = jest.fn(async (_job: boolean | null) => true);
jest.mock("../../src/logic/switch-to-customer", () => ({ switchToCustomer: (j: boolean | null) => mockSwitch(j) }));
const mockSave = jest.fn(async (c: unknown) => c);
const mockClear = jest.fn(async () => undefined);
const mockArrival = jest.fn(async (_m: string, _c: string) => undefined);
jest.mock("../../src/share/pending-shop", () => ({
  savePendingShop: (c: unknown) => mockSave(c),
  clearPendingShop: () => mockClear(),
  saveShopArrival: (m: string, c: string) => mockArrival(m, c),
}));
let mockResolve: () => Promise<unknown> = async () => ({ merchantId: "m-1", service: "pharmacy", link: "https://lyniago.com/s/x-7KQ2MX" });
jest.mock("../../src/api/share", () => ({
  resolveShopLink: () => mockResolve(),
  getShopCard: async () => ({ name: "Belgravia Pharmacy", service: "pharmacy", shopKind: "pharmacy", logoThumbUrl: null, coverThumbUrl: null, link: "x" }),
}));

import { ApiError } from "../../src/api/client";
import { SH } from "../../src/ui/share/copy";
import ShopLinkScreen from "../s/[code]";

const flush = async (): Promise<void> => {
  for (let i = 0; i < 6; i++) await act(async () => undefined);
};
const texts = (t: renderer.ReactTestRenderer): string[] =>
  t.root.findAll((n) => typeof n.props?.children === "string").map((n) => n.props.children as string);

async function mount(): Promise<renderer.ReactTestRenderer> {
  let t!: renderer.ReactTestRenderer;
  act(() => {
    t = renderer.create(
      <SafeAreaProvider initialMetrics={TEST_METRICS}>
        <ShopLinkScreen />
      </SafeAreaProvider>,
    );
  });
  await flush();
  return t;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { code: "belgravia-pharmacy-7kq2mx" };
  mockSession = { role: "customer" };
  mockRolePref = null;
  mockActive = null;
  mockCanGoBack = true;
  mockResolve = async () => ({ merchantId: "m-1", service: "pharmacy", link: "https://lyniago.com/s/x-7KQ2MX" });
});

it("signed out: keeps the code and starts sign-up on C2, skipping C1", async () => {
  mockSession = null;
  await mount();
  expect(mockSave).toHaveBeenCalledWith("7KQ2MX");
  expect(mockReplace).toHaveBeenCalledWith("/phone");
});

it("signed in: opens the link's store and clears the pending code", async () => {
  await mount();
  expect(mockReplace).toHaveBeenCalledWith({ pathname: "/pharmacy/[id]", params: { id: "m-1" } });
  expect(mockClear).toHaveBeenCalled();
  // Order.shareCode: an order at this shop now counts as coming from the link.
  expect(mockArrival).toHaveBeenCalledWith("m-1", "7KQ2MX");
});

it("a cold start puts Home under the store, so Back goes Home", async () => {
  mockCanGoBack = false;
  await mount();
  expect(mockReplace).toHaveBeenCalledWith("/home");
  expect(mockPush).toHaveBeenCalledWith({ pathname: "/pharmacy/[id]", params: { id: "m-1" } });
});

it("SH-A4: a code that doesn't open a shop says so, and the code is dropped", async () => {
  mockResolve = async () => {
    throw new ApiError(404, "Shop not found");
  };
  const t = await mount();
  expect(texts(t)).toContain(SH.arrival.goneT);
  expect(mockClear).toHaveBeenCalled();
});

it("SH-A5: offline keeps the code and Try again retries it", async () => {
  mockResolve = async () => {
    throw new TypeError("Network request failed");
  };
  const t = await mount();
  expect(texts(t)).toContain(SH.arrival.netT);
  expect(mockClear).not.toHaveBeenCalled();
  mockResolve = async () => ({ merchantId: "m-2", service: "restaurants", link: "x" });
  const retry = t.root.find((n) => n.props?.accessibilityLabel === SH.arrival.netCta && typeof n.props?.onPress === "function");
  await act(async () => retry.props.onPress());
  await flush();
  expect(mockReplace).toHaveBeenCalledWith({ pathname: "/food/[id]", params: { id: "m-2" } });
});

it("SH-A7: a biker is asked first; Open as customer switches sides, then opens the store", async () => {
  mockRolePref = "rider";
  const t = await mount();
  expect(texts(t)).toContain(SH.biker.t);
  expect(texts(t)).toContain("Belgravia Pharmacy");
  const yes = t.root.find((n) => n.props?.accessibilityLabel === SH.biker.yes && typeof n.props?.onPress === "function");
  await act(async () => yes.props.onPress());
  await flush();
  expect(mockSwitch).toHaveBeenCalledWith(false);
  expect(mockReplace).toHaveBeenCalledWith({ pathname: "/pharmacy/[id]", params: { id: "m-1" } });
});

it("SH-A7b: a biker on a live job is told to finish first; OK goes back to the board", async () => {
  mockRolePref = "rider";
  mockActive = { status: "picked_up" };
  const t = await mount();
  expect(texts(t)).toContain(SH.biker.busyT);
  const ok = t.root.find((n) => n.props?.accessibilityLabel === SH.biker.busyOk && typeof n.props?.onPress === "function");
  act(() => ok.props.onPress());
  expect(mockReplace).toHaveBeenCalledWith("/rider");
  expect(mockSwitch).not.toHaveBeenCalled();
});

it("a link with no valid code is SH-A4 without asking the server", async () => {
  mockParams = { code: "nope" };
  const t = await mount();
  expect(texts(t)).toContain(SH.arrival.goneT);
});
