/**
 * Customer permissions right after sign-up (app/setup-permissions.tsx, ledger D-109): PC1's design and copy full
 * screen ("Deliver to your door"), then PC8's without the "Order placed" pill ("Know when it's at the gate"),
 * each with "Not now"; already-allowed steps skipped; every answer moves on to Home.
 */
import renderer, { act } from "react-test-renderer";
import { SafeAreaProvider } from "react-native-safe-area-context";

const TEST_METRICS = { insets: { top: 0, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 360, height: 720 } };
type P = Record<string, unknown>;
let mockLocGet: P;
let mockLocReq: P;
let mockGps = true;
let mockNotifGet: P;
let mockNotifReq: P;
let mockWeb = false;
let mockParams: Record<string, string> = {};
const mockReplace = jest.fn();
const mockEnableGps = jest.fn(async () => {
  mockGps = true;
});
const mockStore: Record<string, string> = {};
const mockKick = jest.fn();
const mockRefresh = jest.fn();
const mockTrack = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, back: jest.fn(), canGoBack: () => false }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock("expo-location", () => ({
  getForegroundPermissionsAsync: async () => mockLocGet,
  requestForegroundPermissionsAsync: async () => {
    mockLocGet = mockLocReq;
    return mockLocReq;
  },
  hasServicesEnabledAsync: async () => mockGps,
  enableNetworkProviderAsync: () => mockEnableGps(),
}));
jest.mock("expo-notifications", () => ({
  getPermissionsAsync: async () => mockNotifGet,
  requestPermissionsAsync: async () => {
    mockNotifGet = mockNotifReq;
    return mockNotifReq;
  },
}));
jest.mock("expo-secure-store", () => ({
  getItemAsync: async (k: string) => mockStore[k] ?? null,
  setItemAsync: async (k: string, v: string) => {
    mockStore[k] = v;
  },
}));
jest.mock("../../src/web-build", () => ({ isCustomerWebBuild: () => mockWeb }));
jest.mock("../../src/push/push-kick", () => ({ requestPushRegistration: () => mockKick() }));
jest.mock("../../src/logic/home-location", () => ({ refreshHomeLocation: () => mockRefresh() }));
jest.mock("../../src/telemetry/events", () => ({
  ...jest.requireActual("../../src/telemetry/events"),
  track: (...a: unknown[]) => mockTrack(...a),
}));

import { CUST_NOTIF_ASKS_SLOT, SIGNUP_PERMS_KEY } from "../../src/permissions/store";
import SetupPermissionsScreen from "../setup-permissions";

const UNDET = { status: "undetermined", granted: false, canAskAgain: true };
const GRANTED = { status: "granted", granted: true, canAskAgain: true };
const DENIED = { status: "denied", granted: false, canAskAgain: true };

let tree: renderer.ReactTestRenderer | null = null;
beforeEach(() => {
  jest.clearAllMocks();
  for (const k of Object.keys(mockStore)) delete mockStore[k];
  mockLocGet = UNDET;
  mockLocReq = GRANTED;
  mockGps = true;
  mockNotifGet = UNDET;
  mockNotifReq = GRANTED;
  mockWeb = false;
  mockParams = { next: "/home" };
});
afterEach(() => {
  if (tree) act(() => tree!.unmount());
  tree = null;
});

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) await act(async () => undefined);
}
async function mount(): Promise<void> {
  await act(async () => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={TEST_METRICS}>
        <SetupPermissionsScreen />
      </SafeAreaProvider>,
    );
  });
  await settle();
}
const text = (): string => JSON.stringify(tree!.toJSON());
const step = (): string | undefined => tree!.root.findAll((n) => typeof n.props.testID === "string" && n.props.testID.startsWith("signup-") && !n.props.onPress)[0]?.props.testID;
async function press(id: string): Promise<void> {
  const n = tree!.root.findAll((x) => x.props.testID === id && typeof x.props.onPress === "function")[0]!;
  await act(async () => n.props.onPress());
  await settle();
}

it("location: PC1's copy full screen, then Allow → updates: PC8's copy without the pill → Turn on → Home", async () => {
  await mount();
  expect(step()).toBe("signup-location");
  for (const k of ["Deliver to", "your door", "Your location sets the pin. Used only while you order.", "Use my location", "Not now"]) expect(text()).toContain(k);
  expect(mockStore[SIGNUP_PERMS_KEY]).toBe("1");
  await press("signup-cta");
  expect(mockRefresh).toHaveBeenCalled();
  expect(step()).toBe("signup-notifications");
  const s = text();
  for (const k of ["Tafara picked it up", "Your delivery code is 482 193", "Delivered", "Know when it’s", "at the gate", "Pickup, arriving, your code, delivered. Nothing else.", "Turn on updates", "Not now"]) expect(s).toContain(k);
  expect(s).not.toContain("Order placed");
  expect(mockStore[CUST_NOTIF_ASKS_SLOT]).toBe("1");
  await press("signup-cta");
  expect(mockKick).toHaveBeenCalled();
  expect(mockReplace).toHaveBeenCalledWith("/home");
  expect(mockTrack).toHaveBeenCalledWith("customer_signup_perm_answer", { screen: "location", answer: "granted" });
});

it("every Not now moves on, with no OS dialog", async () => {
  await mount();
  await press("signup-not-now");
  expect(step()).toBe("signup-notifications");
  expect(mockLocGet).toBe(UNDET);
  await press("signup-not-now");
  expect(mockNotifGet).toBe(UNDET);
  expect(mockKick).not.toHaveBeenCalled();
  expect(mockReplace).toHaveBeenCalledWith("/home");
});

it("declining either dialog still moves on (Home and PC8 ask again later)", async () => {
  mockLocReq = DENIED;
  mockNotifReq = DENIED;
  await mount();
  await press("signup-cta");
  expect(step()).toBe("signup-notifications");
  expect(mockRefresh).not.toHaveBeenCalled();
  await press("signup-cta");
  expect(mockKick).not.toHaveBeenCalled();
  expect(mockReplace).toHaveBeenCalledWith("/home");
});

it("allowed with the phone's location off: Google's switch dialog, then on", async () => {
  mockGps = false;
  await mount();
  await press("signup-cta");
  expect(mockEnableGps).toHaveBeenCalled();
  expect(step()).toBe("signup-notifications");
});

it("location already allowed: opens on updates", async () => {
  mockLocGet = GRANTED;
  await mount();
  expect(step()).toBe("signup-notifications");
});

it("web build: location only, then Home", async () => {
  mockWeb = true;
  await mount();
  expect(step()).toBe("signup-location");
  await press("signup-cta");
  expect(mockReplace).toHaveBeenCalledWith("/home");
  expect(mockStore[CUST_NOTIF_ASKS_SLOT]).toBeUndefined();
});

it("nothing left to ask: straight to Home", async () => {
  mockLocGet = GRANTED;
  mockNotifGet = GRANTED;
  await mount();
  expect(mockReplace).toHaveBeenCalledWith("/home");
});
