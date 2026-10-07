/**
 * First Run v2 — the rider permission flow P1–P16 (app/permissions.tsx, handoff `first-run-v2` README §2B,
 * ledger D-82). Each screen, every branch out of the Android dialogs, "Not now" moving on, the re-read on
 * return from phone settings, P13's "Go online" running R3's callback, and the single-step visits.
 */
import renderer, { act } from "react-test-renderer";
import { AppState, Linking } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

const TEST_METRICS = { insets: { top: 0, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 360, height: 720 } };
type P = Record<string, unknown>;
let mockLocGet: P;
let mockLocReq: P;
let mockGps = true;
let mockNotifGet: P;
let mockNotifReq: P;
let mockParams: Record<string, string> = {};
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockEnableGps = jest.fn(async () => {
  mockGps = true;
});
const mockStore: Record<string, string> = {};

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack, replace: mockReplace, push: jest.fn(), canGoBack: () => true }),
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
  scheduleNotificationAsync: jest.fn(async () => "id"),
  AndroidImportance: { MAX: 5, HIGH: 4, DEFAULT: 3 },
}));
jest.mock("expo-secure-store", () => ({
  getItemAsync: async (k: string) => mockStore[k] ?? null,
  setItemAsync: async (k: string, v: string) => {
    mockStore[k] = v;
  },
}));
const mockKick = jest.fn();
jest.mock("../../src/push/push-kick", () => ({ requestPushRegistration: () => mockKick() }));

import { finishRiderPermFlow, startRiderPermFlow } from "../../src/logic/rider-perm-flow";
import { RIDER_PERM_FLOW_KEY } from "../../src/permissions/store";
import RiderPermissionsScreen from "../permissions";

const UNDET = { status: "undetermined", granted: false, canAskAgain: true };
const GRANTED = { status: "granted", granted: true, canAskAgain: true };
const DENIED = { status: "denied", granted: false, canAskAgain: true };
const BLOCKED = { status: "denied", granted: false, canAskAgain: false };

let tree: renderer.ReactTestRenderer | null = null;
let appStateCb: ((s: string) => void) | null = null;

beforeEach(() => {
  jest.clearAllMocks();
  for (const k of Object.keys(mockStore)) delete mockStore[k];
  mockLocGet = UNDET;
  mockLocReq = GRANTED;
  mockGps = true;
  mockNotifGet = UNDET;
  mockNotifReq = GRANTED;
  mockParams = { from: "flow" };
  jest.spyOn(Linking, "openSettings").mockImplementation(async () => undefined);
  jest.spyOn(AppState, "addEventListener").mockImplementation((_e, cb) => {
    appStateCb = cb as (s: string) => void;
    return { remove: () => undefined } as never;
  });
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
        <RiderPermissionsScreen />
      </SafeAreaProvider>,
    );
  });
  await settle();
}
const screen = (): string | undefined => tree!.root.findAll((n) => typeof n.props.testID === "string" && /^P\d+$/.test(n.props.testID))[0]?.props.testID;
const text = (): string => JSON.stringify(tree!.toJSON());
async function press(id: string): Promise<void> {
  const n = tree!.root.findAll((x) => x.props.testID === id && typeof x.props.onPress === "function")[0]!;
  await act(async () => n.props.onPress());
  await settle();
}

describe("the flow from R3 (?from=flow)", () => {
  it("happy path: P1 → Allow → P3 → P9 → Turn on → P13 → Go online runs R3's callback", async () => {
    await mount();
    expect(screen()).toBe("P1");
    expect(text()).toContain("Jobs start");
    expect(text()).toContain("Customers see you only on their job");
    await press("p-cta");
    expect(screen()).toBe("P3");
    expect(text()).toContain("LyniaGo — delivery in progress");
    await press("p-cta");
    expect(screen()).toBe("P9");
    expect(text()).not.toContain("Play a test ping");
    await press("p-cta");
    expect(mockKick).toHaveBeenCalled();
    expect(screen()).toBe("P13");
    expect(mockStore[RIDER_PERM_FLOW_KEY]).toBe("1");

    const goOnline = jest.fn();
    mockNotifGet = UNDET; // force the flow open
    mockLocGet = UNDET;
    delete mockStore[RIDER_PERM_FLOW_KEY];
    await startRiderPermFlow({ push: jest.fn() }, goOnline);
    await press("p-cta");
    expect(goOnline).toHaveBeenCalledTimes(1);
    expect(mockBack).toHaveBeenCalled();
  });

  it("every Not now moves on: P1 → P9 → P13", async () => {
    await mount();
    await press("p-link");
    expect(screen()).toBe("P9");
    await press("p-link");
    expect(screen()).toBe("P13");
  });

  it("approximate → P4; keeping it on the upgrade dialog moves on", async () => {
    mockLocReq = { ...GRANTED, android: { accuracy: "coarse" } };
    await mount();
    await press("p-cta");
    expect(screen()).toBe("P4");
    expect(text()).toContain("precise location");
    await press("p-cta");
    expect(screen()).toBe("P9");
  });

  it("deny once → P5 (Continue without jobs moves on); deny again → P6 with the settings steps", async () => {
    mockLocReq = DENIED;
    await mount();
    await press("p-cta");
    expect(screen()).toBe("P5");
    expect(text()).toContain("no jobs");
    mockLocReq = BLOCKED;
    await press("p-cta");
    expect(screen()).toBe("P6");
    expect(text()).toContain("Permissions → Location");
  });

  it("P6 re-reads on return from phone settings — no Retry button", async () => {
    mockLocGet = BLOCKED;
    await mount();
    expect(screen()).toBe("P6");
    await press("p-cta");
    expect(Linking.openSettings).toHaveBeenCalled();
    mockLocGet = GRANTED;
    await act(async () => appStateCb?.("active"));
    await settle();
    expect(screen()).toBe("P3");
  });

  it("P6 'I've turned it on' stays put while it's still off", async () => {
    mockLocGet = BLOCKED;
    await mount();
    await press("p-link");
    expect(screen()).toBe("P6");
  });

  it("GPS off → P7; Turn on location → P3", async () => {
    mockLocGet = GRANTED;
    mockGps = false;
    await mount();
    expect(screen()).toBe("P7");
    await press("p-cta");
    expect(mockEnableGps).toHaveBeenCalled();
    expect(screen()).toBe("P3");
  });

  it("notifications declined → P11; back from settings with them on → P13", async () => {
    mockLocGet = GRANTED;
    mockNotifReq = BLOCKED;
    await mount();
    expect(screen()).toBe("P9");
    await press("p-cta");
    expect(screen()).toBe("P11");
    expect(text()).toContain("Allow notifications · Job alerts on");
    mockNotifGet = GRANTED;
    await act(async () => appStateCb?.("active"));
    await settle();
    expect(screen()).toBe("P13");
  });

  it("already granted: location and notifications are skipped straight to P13", async () => {
    mockLocGet = GRANTED;
    mockNotifGet = GRANTED;
    await mount();
    expect(screen()).toBe("P13");
    expect(text()).toContain("ready to ride");
  });
});

describe("single steps (board P14, Settings P15/P16)", () => {
  it("?step=location from G8 opens P1 and leaves after P3", async () => {
    mockParams = { step: "location" };
    await mount();
    expect(screen()).toBe("P1");
    await press("p-cta");
    await press("p-cta");
    expect(mockBack).toHaveBeenCalled();
  });

  it("?step=notifications from J8 opens P9; Not now goes back", async () => {
    mockParams = { step: "notifications" };
    mockLocGet = GRANTED;
    await mount();
    expect(screen()).toBe("P9");
    await press("p-link");
    expect(mockBack).toHaveBeenCalled();
  });

  it("?step=battery opens P16; Not now goes back", async () => {
    mockParams = { step: "battery" };
    await mount();
    expect(screen()).toBe("P16");
    expect(text()).toContain("awake on a job");
    await press("p-link");
    expect(mockBack).toHaveBeenCalled();
  });

  it("a legacy ?next=/rider (the retired sign-in priming) forwards to the board", async () => {
    mockParams = { next: "/rider" };
    await mount();
    expect(mockReplace).toHaveBeenCalledWith("/rider");
  });
});

afterAll(() => {
  finishRiderPermFlow();
});
