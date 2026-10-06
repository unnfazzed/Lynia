/**
 * First Run v2 PC8–PC10 — customer order updates after an order (app/order-updates.tsx, handoff `first-run-v2`
 * README §2A, ledger D-80), and PC11's re-entry from Settings.
 */
import renderer, { act } from "react-test-renderer";
import { SafeAreaProvider } from "react-native-safe-area-context";

const TEST_METRICS = { insets: { top: 0, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 360, height: 720 } };
let mockParams: Record<string, string> = {};
let mockReq: Record<string, unknown> = { status: "granted", granted: true };
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockStore: Record<string, string> = {};
const mockKick = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, back: mockBack, canGoBack: () => true }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock("expo-notifications", () => ({ requestPermissionsAsync: async () => mockReq, getPermissionsAsync: async () => mockReq }));
jest.mock("expo-secure-store", () => ({
  getItemAsync: async (k: string) => mockStore[k] ?? null,
  setItemAsync: async (k: string, v: string) => {
    mockStore[k] = v;
  },
}));
jest.mock("../../src/push/push-kick", () => ({ requestPushRegistration: () => mockKick() }));

import { CUST_NOTIF_ASKS_KEY } from "../../src/permissions/store";
import OrderUpdatesScreen from "../order-updates";

let tree: renderer.ReactTestRenderer | null = null;
beforeEach(() => {
  jest.clearAllMocks();
  for (const k of Object.keys(mockStore)) delete mockStore[k];
  mockParams = { next: "/order/o-1" };
  mockReq = { status: "granted", granted: true };
});
afterEach(() => {
  if (tree) act(() => tree!.unmount());
  tree = null;
});
async function mount(): Promise<void> {
  await act(async () => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={TEST_METRICS}>
        <OrderUpdatesScreen />
      </SafeAreaProvider>,
    );
  });
  for (let i = 0; i < 4; i++) await act(async () => undefined);
}
const text = (): string => JSON.stringify(tree!.toJSON());
async function press(id: string): Promise<void> {
  const n = tree!.root.findAll((x) => x.props.testID === id && typeof x.props.onPress === "function")[0]!;
  await act(async () => n.props.onPress());
  for (let i = 0; i < 4; i++) await act(async () => undefined);
}

it("PC8: the Order placed pill, three sample notifications, the explainer — and the visit counts toward the cap", async () => {
  await mount();
  const s = text();
  for (const k of ["Order placed", "Tafara picked it up", "Arriving now", "Delivered", "Know when it’s", "at the gate", "Turn on updates", "Not now"]) expect(s).toContain(k);
  expect(mockStore[CUST_NOTIF_ASKS_KEY]).toBe("1");
});

it("Turn on → the OS dialog; allowed → registers push and continues to the order", async () => {
  await mount();
  await press("pc8-turn-on");
  expect(mockKick).toHaveBeenCalled();
  expect(mockReplace).toHaveBeenCalledWith("/order/o-1");
});

it("Not now → straight to the order, no dialog", async () => {
  await mount();
  await press("pc8-not-now");
  expect(mockReplace).toHaveBeenCalledWith("/order/o-1");
  expect(mockKick).not.toHaveBeenCalled();
});

it("PC10: declined → Updates are off → Back to my order", async () => {
  mockReq = { status: "denied", granted: false, canAskAgain: true };
  await mount();
  await press("pc8-turn-on");
  expect(text()).toContain("are off");
  expect(text()).toContain("Keep this screen open for your code.");
  await press("pc10-back");
  expect(mockReplace).toHaveBeenCalledWith("/order/o-1");
});

it("PC11 re-entry from Settings: no Order placed pill, not counted, a decline goes back", async () => {
  mockParams = { from: "settings" };
  mockReq = { status: "denied", granted: false, canAskAgain: true };
  await mount();
  expect(text()).not.toContain("Order placed");
  expect(mockStore[CUST_NOTIF_ASKS_KEY]).toBeUndefined();
  await press("pc8-turn-on");
  expect(mockBack).toHaveBeenCalled();
});

it("an outside `next` is never followed", async () => {
  mockParams = { next: "https://evil.example" };
  await mount();
  await press("pc8-not-now");
  expect(mockReplace).not.toHaveBeenCalled();
  expect(mockBack).toHaveBeenCalled();
});
