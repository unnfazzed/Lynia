/**
 * Settings — First Run v2's look (handoff `first-run-v2` D1 / PC11 / P15, ledger D-82) keeping every row
 * (owner decision D-82 §2 #1).
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
const mockNotifRequest = jest.fn(async (): Promise<Perm> => GRANTED);
const mockKick = jest.fn();
jest.mock("../../../src/push/push-kick", () => ({ requestPushRegistration: () => mockKick() }));
jest.mock("expo-notifications", () => ({
  getPermissionsAsync: () => mockNotifPerms(),
  requestPermissionsAsync: () => mockNotifRequest(),
  scheduleNotificationAsync: (...a: unknown[]) => mockSchedule(...(a as [])),
  AndroidImportance: { MAX: 5, HIGH: 4, DEFAULT: 3 },
}));
jest.mock("expo-location", () => ({ getForegroundPermissionsAsync: () => mockLocPerms(), hasServicesEnabledAsync: async () => true }));
jest.mock("expo-secure-store", () => ({ getItemAsync: async () => null, setItemAsync: (...a: unknown[]) => mockSetItem(...(a as [])), deleteItemAsync: async () => undefined }));
const mockCalls: string[] = [];
const mockSignOut = jest.fn(async () => {
  mockCalls.push("signOut");
});
const mockSetOnline = jest.fn(async (online: boolean) => {
  mockCalls.push(`setOnline:${online}`);
  return { online };
});
jest.mock("../../../src/auth/auth-context", () => ({ useAuth: () => ({ session: { role: "customer" }, signOut: () => mockSignOut() }) }));
jest.mock("../../../src/api/riders", () => ({ setOnline: (online: boolean) => mockSetOnline(online) }));
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

describe("D1 · the new look, every row kept (D-82 §2 #1)", () => {
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
    // Owner 2026-10-06 (D-82 §4): the shipped name / phone row is gone — Personal details carries both.
    expect(s).not.toContain('"Chipo Marufu"');
    expect(s).not.toContain("77 245 1180");
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

  it("job alerts off reopens P9 (the rider flow's notification step)", async () => {
    mockNotifPerms.mockResolvedValue({ status: "undetermined", granted: false, canAskAgain: true });
    const t = await render(RIDER);
    await act(async () => toggle(t, "toggle-job-alerts").props.onPress());
    expect(mockPush).toHaveBeenCalledWith("/permissions?step=notifications");
  });

  it("Battery saver opens P16", async () => {
    const t = await render(RIDER);
    await act(async () => byTestId(t, "settings-battery").props.onPress());
    expect(mockPush).toHaveBeenCalledWith("/permissions?step=battery");
  });

  it("draws no Test ping / Test alarm buttons (owner 2026-10-06, D-83)", async () => {
    const s = out(await render(RIDER));
    expect(s).not.toContain('"Test ping"');
    expect(s).not.toContain('"Test alarm"');
  });
});

describe("PC11 · order updates off", () => {
  it("draws the danger card; Turn on opens the Android dialog directly (owner 2026-10-06) — granted clears it", async () => {
    mockNotifPerms.mockResolvedValue({ status: "denied", granted: false, canAskAgain: true });
    const t = await render(CUSTOMER);
    const s = out(t);
    expect(s).toContain('"Order updates are off"');
    expect(s).toContain('"You won’t hear when your rider arrives."');
    expect(toggle(t, "toggle-order-updates").props.accessibilityState.checked).toBe(false);
    mockNotifRequest.mockImplementation(async () => {
      mockNotifPerms.mockResolvedValue(GRANTED);
      return GRANTED;
    });
    await act(async () => byTestId(t, "settings-pc11-turn-on").props.onPress());
    for (let i = 0; i < 4; i++) await act(async () => undefined);
    expect(mockNotifRequest).toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockKick).toHaveBeenCalled();
    expect(t.root.findAll((n) => n.props.testID === "settings-pc11")).toHaveLength(0);
  });

  it("a decline stays on Settings with the card up", async () => {
    const denied = { status: "denied", granted: false, canAskAgain: true };
    mockNotifPerms.mockResolvedValue(denied);
    mockNotifRequest.mockResolvedValue(denied);
    const t = await render(CUSTOMER);
    await act(async () => byTestId(t, "settings-pc11-turn-on").props.onPress());
    for (let i = 0; i < 4; i++) await act(async () => undefined);
    expect(mockPush).not.toHaveBeenCalled();
    expect(t.root.findAll((n) => n.props.testID === "settings-pc11").length).toBeGreaterThan(0);
  });

  it("blocked for good: Turn on shows the phone-settings steps, whose button opens settings", async () => {
    mockNotifPerms.mockResolvedValue({ status: "denied", granted: false, canAskAgain: false });
    const t = await render(CUSTOMER);
    await act(async () => byTestId(t, "settings-pc11-turn-on").props.onPress());
    expect(mockNotifRequest).not.toHaveBeenCalled();
    const s = out(t);
    expect(s).toContain('"are blocked"');
    expect(s).toContain('"Allow notifications"');
    expect(s).not.toContain("Job alerts on");
    await act(async () => byTestId(t, "settings-notif-open").props.onPress());
    expect(mockOpenSettings).toHaveBeenCalled();
  });
});

it("the navigation-app choice is saved on the phone", async () => {
  const t = await render(RIDER);
  const waze = t.root.findAll((n) => n.props.accessibilityRole === "radio" && n.props.accessibilityLabel === "Waze")[0]!;
  await act(async () => waze.props.onPress());
  expect(mockSetItem).toHaveBeenCalledWith("lynia.riderPrefs.v1", expect.stringContaining('"navApp":"waze"'));
});

describe("Sign out (MA-H4)", () => {
  const signOutRow = (t: renderer.ReactTestRenderer) => t.root.findAll((n) => n.props.title === "Sign out" && typeof n.props.onPress === "function")[0]!;
  beforeEach(() => {
    mockCalls.length = 0;
  });

  it("a rider goes offline first, then signs out", async () => {
    const t = await render(RIDER);
    await act(async () => {
      signOutRow(t).props.onPress();
    });
    expect(mockCalls).toEqual(["setOnline:false", "signOut"]);
  });

  it("a failed go-offline never traps the sign-out", async () => {
    mockSetOnline.mockRejectedValueOnce(new Error("offline"));
    const t = await render(RIDER);
    await act(async () => {
      signOutRow(t).props.onPress();
    });
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it("a customer just signs out", async () => {
    const t = await render(CUSTOMER);
    await act(async () => {
      signOutRow(t).props.onPress();
    });
    expect(mockSetOnline).not.toHaveBeenCalled();
    expect(mockCalls).toEqual(["signOut"]);
  });
});
