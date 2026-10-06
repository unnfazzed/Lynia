/**
 * Settings — Rider v2 S1–S4 (`packages/design/handoff/rider-v2/`, ledger D-54).
 *
 * Pins: the sections in order (YOUR ACCOUNT → CUSTOMER → RIDER for riders only), Sign out and Delete
 * account last on screen, permissions read from the phone (never a hardcoded "On") with the rider-side
 * consequences when they're off, the navigation-app choice, and no Edit profile / "coming soon" (D-26).
 */
import renderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";

const TEST_METRICS = { insets: { top: 0, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 360, height: 720 } };
const mockNotifPerms = jest.fn(async () => ({ granted: true, canAskAgain: true }));
const mockLocPerms = jest.fn(async () => ({ granted: true, canAskAgain: true }));
const mockGetMe = jest.fn();
const mockPush = jest.fn();
const mockSetItem = jest.fn(async () => undefined);

jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }) }));
jest.mock("expo-notifications", () => ({ getPermissionsAsync: () => mockNotifPerms(), scheduleNotificationAsync: jest.fn(async () => "id") }));
jest.mock("expo-location", () => ({ getForegroundPermissionsAsync: () => mockLocPerms() }));
jest.mock("expo-secure-store", () => ({ getItemAsync: async () => null, setItemAsync: (...a: unknown[]) => mockSetItem(...(a as [])), deleteItemAsync: async () => undefined }));
jest.mock("../../../src/auth/auth-context", () => ({ useAuth: () => ({ session: { role: "customer" }, signOut: jest.fn() }) }));
jest.mock("../../../src/api/auth", () => ({ getMe: () => mockGetMe() }));

import SettingsScreen from "../index";

const CUSTOMER = { firstName: "Chipo", lastName: "Marufu", phone: "+263772451180", role: "customer", rider: null };
const RIDER = { ...CUSTOMER, role: "rider", rider: { bikeReg: "ABH 4721", kycStatus: "verified" } };

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
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
  });
  trees.push(tree);
  return tree;
}

const out = (t: renderer.ReactTestRenderer): string => JSON.stringify(t.toJSON());

beforeEach(() => {
  mockNotifPerms.mockResolvedValue({ granted: true, canAskAgain: true });
  mockLocPerms.mockResolvedValue({ granted: true, canAskAgain: true });
  jest.clearAllMocks();
});

describe("Settings sections", () => {
  it("a rider sees YOUR ACCOUNT → CUSTOMER → RIDER, then Sign out and Delete account last", async () => {
    const s = out(await render(RIDER));
    const order = ["YOUR ACCOUNT", "CUSTOMER", "RIDER", "Job alerts", "Navigation app", "Top-up number", "Bike & documents", "Sign out", "Delete account"].map((k) => s.indexOf(`"${k}"`));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("a customer-only user has no Rider section at all", async () => {
    const s = out(await render(CUSTOMER));
    expect(s).toContain('"CUSTOMER"');
    expect(s).not.toContain('"RIDER"');
    expect(s).not.toContain("Job alerts");
  });

  it("has no Edit profile row and no 'Coming soon' (D-26)", async () => {
    const s = out(await render(RIDER));
    expect(s).not.toContain("Edit profile");
    expect(s).not.toMatch(/coming soon/i);
  });
});

describe("Personal details and Bike & documents rows (D-79)", () => {
  it("both sides get a Personal details row in YOUR ACCOUNT, in the handoff's words, opening the screen", async () => {
    for (const me of [CUSTOMER, RIDER]) {
      mockPush.mockClear();
      const t = await render(me);
      const s = out(t);
      expect(s.indexOf('"YOUR ACCOUNT"')).toBeLessThan(s.indexOf('"Personal details"'));
      expect(s.indexOf('"Personal details"')).toBeLessThan(s.indexOf('"CUSTOMER"'));
      expect(s).toContain('"Name, phone, optional ID"');
      const row = t.root.findAll((n) => n.props.accessibilityLabel === "Personal details, Name, phone, optional ID" && typeof n.props.onPress === "function")[0]!;
      await act(async () => row.props.onPress());
      expect(mockPush).toHaveBeenCalledWith("/settings/personal");
    }
  });

  it("a verified rider with no plate is not shown 'Verified' on Bike & documents (review R-8)", async () => {
    const s = out(await render({ ...RIDER, rider: { bikeReg: null, kycStatus: "verified" } }));
    const at = s.indexOf('"Bike & documents"');
    expect(at).toBeGreaterThan(-1);
    expect(s.slice(at, s.indexOf('"Sign out"'))).not.toContain('"Verified"');
  });

  it("a verified rider with a plate still is", async () => {
    const s = out(await render(RIDER));
    const at = s.indexOf('"Bike & documents"');
    expect(s.slice(at, s.indexOf('"Sign out"'))).toContain('"Verified"');
  });
});

describe("permissions come from the phone", () => {
  it("granted: 'While using' and 'On', no warnings", async () => {
    const s = out(await render(RIDER));
    expect(s).toContain("While using");
    expect(s).toContain('"On"');
    expect(s).not.toContain("You won't get new jobs");
    expect(s).not.toContain("You can't receive jobs");
  });

  it("denied: the rider is told they won't get jobs, and the test buttons give way to Open phone settings", async () => {
    mockNotifPerms.mockResolvedValue({ granted: false, canAskAgain: false });
    mockLocPerms.mockResolvedValue({ granted: false, canAskAgain: false });
    const t = await render(RIDER);
    const s = out(t);
    expect(s).toContain("Notifications are off. You won't get new jobs.");
    expect(s).toContain("Location is off. You can't receive jobs.");
    expect(s).toContain("You won't hear when a rider offers or when your parcel arrives.");
    expect(s).toContain("Open phone settings");
    expect(s).not.toContain("Test ping");
  });
});

it("the navigation-app choice is saved on the phone", async () => {
  const t = await render(RIDER);
  const waze = t.root.findAll((n) => n.props.accessibilityRole === "radio" && n.props.accessibilityLabel === "Waze")[0]!;
  await act(async () => waze.props.onPress());
  expect(mockSetItem).toHaveBeenCalledWith("lynia.riderPrefs.v1", expect.stringContaining('"navApp":"waze"'));
});
