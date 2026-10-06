/**
 * Settings — First Run v2's look (handoff `first-run-v2` D1 / PC11 / P15, ledger D-80) keeping every row
 * (owner decision D-80 §2 #1).
 *
 * Pins: YOU (Personal details first, Bike & documents "N to add") → ALERTS → (rider) RIDER → Sign out and
 * Delete account last; the toggles MIRROR the phone's permissions and tapping one asks (rider flow / PC8)
 * or opens phone settings; PC11's danger card while order updates are off; P15's danger Location row; the
 * Battery saver row → P16; the kept rows (Privacy, Terms, Payment, Navigation app, Top-up number, Test
 * ping / alarm); no Edit profile / "coming soon" (D-26).
 */
import renderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";

const TEST_METRICS = { insets: { top: 0, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 360, height: 720 } };
type Perm = { status: string; granted: boolean; canAskAgain: boolean };
const GRANTED: Perm = { status: "granted", granted: true, canAskAgain: true };
const mockNotifPerms = jest.fn(async (): Promise<Perm> => GRANTED);
const mockLocPerms = jest.fn(async (): Promise<Perm> => GRANTED);
const mockGetMe = jest.fn();
const mockPush = jest.fn();
const mockSetItem = jest.fn(async () => undefined);
const mockOpenSettings = jest.fn(async () => undefined);
const mockSchedule = jest.fn(async () => "id");

jest.mock("expo-router", () => {
  const R = jest.requireActual("react");
  return {
    useRouter: () => ({ push: mockPush, back: jest.fn() }),
    useFocusEffect: (cb: () => void) => R.useEffect(() => cb(), []),
  };
});
jest.mock("expo-notifications", () => ({
  getPermissionsAsync: () => mockNotifPerms(),
  scheduleNotificationAsync: (...a: unknown[]) => mockSchedule(...(a as [])),
  AndroidImportance: { MAX: 5, HIGH: 4, DEFAULT: 3 },
}));
jest.mock("expo-location", () => ({ getForegroundPermissionsAsync: () => mockLocPerms(), hasServicesEnabledAsync: async () => true }));
jest.mock("expo-secure-store", () => ({ getItemAsync: async () => null, setItemAsync: (...a: unknown[]) => mockSetItem(...(a as [])), deleteItemAsync: async () => undefined }));
jest.mock("../../../src/auth/auth-context", () => ({ useAuth: () => ({ session: { role: "customer" }, signOut: jest.fn() }) }));
jest.mock("../../../src/api/auth", () => ({ getMe: () => mockGetMe() }));

import { Linking } from "react-native";
import SettingsScreen from "../index";

const CUSTOMER = { firstName: "Chipo", lastName: "Marufu", phone: "+263772451180", role: "customer", rider: null };
const RIDER = { ...CUSTOMER, role: "rider", rider: { bikeReg: "ABH 4721", kycStatus: "verified", hasPhoto: true } };

const trees: renderer.ReactTestRenderer[] = [];
afterEach(() => {
  while (trees.length) {
    const t = trees.pop()!;
    act(() => t.unmount());
  }
});

async function render(me: object): Promise<renderer.ReactTestRenderer> {
  mockGetMe.mockResolvedValue(me);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={TEST_METRICS}>
        <QueryClientProvider client={client}>
          <SettingsScreen />
        </QueryClientProvider>
      </SafeAreaProvider>,
    );
  });
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
  trees.push(tree);
  return tree;
}

const out = (t: renderer.ReactTestRenderer): string => JSON.stringify(t.toJSON());
const byTestId = (t: renderer.ReactTestRenderer, id: string) => t.root.findAll((n) => n.props.testID === id && typeof n.props.onPress === "function")[0]!;
const toggle = (t: renderer.ReactTestRenderer, id: string) => t.root.findAll((n) => n.props.testID === id && n.props.accessibilityRole === "switch")[0]!;

beforeEach(() => {
  jest.clearAllMocks();
  mockNotifPerms.mockResolvedValue(GRANTED);
  mockLocPerms.mockResolvedValue(GRANTED);
  jest.spyOn(Linking, "openSettings").mockImplementation(mockOpenSettings);
});

describe("D1 · the new look, every row kept (D-80 §2 #1)", () => {
  it("a rider sees YOU → ALERTS → RIDER, then Sign out and Delete account last", async () => {
    const s = out(await render(RIDER));
    const order = [
      "Settings",
      "YOU",
      "Personal details",
      "Bike & documents",
      "Language",
      "Privacy notice",
      "Terms & conditions",
      "Payment",
      "ALERTS",
      "Job alerts",
      "Location",
      "Order updates",
      "Battery saver",
      "Test ping",
      "RIDER",
      "Navigation app",
      "Top-up number",
      "Sign out",
      "Delete account",
    ].map((k) => s.indexOf(`"${k}"`));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(s).toContain('"Ping and food-offer alarm"');
    expect(s).toContain('"Needed for jobs"');
    expect(s).toContain('"Keep trips running"');
  });

  it("a customer sees Order updates under ALERTS and no rider rows", async () => {
    const s = out(await render(CUSTOMER));
    expect(s).toContain('"ALERTS"');
    expect(s).toContain('"Order updates"');
    for (const k of ["Job alerts", "Battery saver", "RIDER", "Bike & documents", "Navigation app"]) expect(s).not.toContain(`"${k}"`);
  });

  it("Personal details is the first row, in the handoff's words, and opens the screen", async () => {
    const t = await render(CUSTOMER);
    const s = out(t);
    expect(s.indexOf('"YOU"')).toBeLessThan(s.indexOf('"Personal details"'));
    expect(s).toContain('"Name, phone, ID"');
    await act(async () => byTestId(t, "settings-personal").props.onPress());
    expect(mockPush).toHaveBeenCalledWith("/settings/personal");
  });

  it("has no Edit profile row and no 'Coming soon' (D-26)", async () => {
    const s = out(await render(RIDER));
    expect(s).not.toContain("Edit profile");
    expect(s).not.toMatch(/coming soon/i);
  });
});

describe("Bike & documents · N to add", () => {
  it("counts the missing photo and plate", async () => {
    const s = out(await render({ ...RIDER, rider: { bikeReg: null, kycStatus: "verified", hasPhoto: false } }));
    expect(s).toContain('"2 to add"');
  });

  it("counts the same items as Bike & documents' progress (a plate on file, no photo → 1 to add)", async () => {
    const s = out(await render({ ...RIDER, rider: { bikeReg: "ABH 4721", kycStatus: "verified", hasPhoto: false } }));
    expect(s).toContain('"1 to add"');
  });

  it("with nothing to add, 'Verified' only for a verified rider with a plate (review R-8)", async () => {
    expect(out(await render(RIDER))).toContain('"Verified"');
  });
});

describe("ALERTS toggles mirror the phone", () => {
  it("all granted: every toggle on, no PC11 card, no danger Location row", async () => {
    const t = await render(RIDER);
    for (const id of ["toggle-job-alerts", "toggle-location", "toggle-order-updates"]) expect(toggle(t, id).props.accessibilityState.checked).toBe(true);
    expect(t.root.findAll((n) => n.props.testID === "settings-pc11")).toHaveLength(0);
    expect(out(t)).not.toContain("Off · You can’t receive jobs");
  });

  it("an on toggle opens the phone's settings — the app can't switch a permission off", async () => {
    const t = await render(RIDER);
    await act(async () => toggle(t, "toggle-location").props.onPress());
    expect(mockOpenSettings).toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("P15: location off turns the row danger, and the row and its toggle reopen the location step (P1 / P6)", async () => {
    mockLocPerms.mockResolvedValue({ status: "denied", granted: false, canAskAgain: false });
    const t = await render(RIDER);
    expect(out(t)).toContain('"Off · You can’t receive jobs"');
    expect(toggle(t, "toggle-location").props.accessibilityState.checked).toBe(false);
    await act(async () => byTestId(t, "settings-location").props.onPress());
    expect(mockPush).toHaveBeenCalledWith("/permissions?step=location");
  });

  it("job alerts off reopens P9 (the rider flow's notification step); the test buttons give way", async () => {
    mockNotifPerms.mockResolvedValue({ status: "undetermined", granted: false, canAskAgain: true });
    const t = await render(RIDER);
    expect(out(t)).not.toContain('"Test ping"');
    await act(async () => toggle(t, "toggle-job-alerts").props.onPress());
    expect(mockPush).toHaveBeenCalledWith("/permissions?step=notifications");
  });

  it("Battery saver opens P16", async () => {
    const t = await render(RIDER);
    await act(async () => byTestId(t, "settings-battery").props.onPress());
    expect(mockPush).toHaveBeenCalledWith("/permissions?step=battery");
  });

  it("Test ping plays a local job alert", async () => {
    const t = await render(RIDER);
    const ping = t.root.findAll((n) => n.props.accessibilityLabel === "Test ping" && typeof n.props.onPress === "function")[0]!;
    await act(async () => ping.props.onPress());
    expect(mockSchedule).toHaveBeenCalled();
  });
});

describe("PC11 · order updates off", () => {
  it("draws the danger card; Turn on reopens PC8 while the OS can still ask", async () => {
    mockNotifPerms.mockResolvedValue({ status: "denied", granted: false, canAskAgain: true });
    const t = await render(CUSTOMER);
    const s = out(t);
    expect(s).toContain('"Order updates are off"');
    expect(s).toContain('"You won’t hear when your rider arrives."');
    expect(toggle(t, "toggle-order-updates").props.accessibilityState.checked).toBe(false);
    await act(async () => byTestId(t, "settings-pc11-turn-on").props.onPress());
    expect(mockPush).toHaveBeenCalledWith("/order-updates?from=settings");
  });

  it("blocked for good: Turn on opens the phone's settings", async () => {
    mockNotifPerms.mockResolvedValue({ status: "denied", granted: false, canAskAgain: false });
    const t = await render(CUSTOMER);
    await act(async () => byTestId(t, "settings-pc11-turn-on").props.onPress());
    expect(mockOpenSettings).toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });
});

it("the navigation-app choice is saved on the phone", async () => {
  const t = await render(RIDER);
  const waze = t.root.findAll((n) => n.props.accessibilityRole === "radio" && n.props.accessibilityLabel === "Waze")[0]!;
  await act(async () => waze.props.onPress());
  expect(mockSetItem).toHaveBeenCalledWith("lynia.riderPrefs.v1", expect.stringContaining('"navApp":"waze"'));
});
