/**
 * Rider Account tab — Rider v2 C1–C5 (`packages/design/handoff/rider-v2/`, ledger D-54).
 *
 * Pins: the four rows (Job history · Notifications · Help & support · Settings) and the rows that left
 * (Money, Bike & documents, Switch to customer); the Customer | Rider toggle and its two confirm sheets
 * — C4 takes the rider offline (that is how dispatch stops), C5 keeps them online for the job they're
 * carrying; the tappable identity card; and the standing card's real strike count.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import renderer, { act } from "react-test-renderer";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { Me } from "../../../../src/api/auth";

const TEST_METRICS = { insets: { top: 0, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 360, height: 720 } };

const mockGetMe = jest.fn<Promise<Me>, []>();
const mockGetActiveOrder = jest.fn();
const mockSetOnline = jest.fn(async (online: boolean) => ({ online }));
const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush, replace: mockReplace }) }));
jest.mock("expo-secure-store", () => ({ getItemAsync: async () => null, setItemAsync: async () => undefined, deleteItemAsync: async () => undefined }));
jest.mock("../../../../src/api/auth", () => ({ getMe: () => mockGetMe() }));
jest.mock("../../../../src/api/orders", () => ({ getActiveOrder: (...a: unknown[]) => mockGetActiveOrder(...a) }));
jest.mock("../../../../src/api/notifications", () => ({ getNotificationsUnreadCount: () => Promise.resolve({ count: 3 }) }));
jest.mock("../../../../src/api/riders", () => ({ setOnline: (online: boolean) => mockSetOnline(online) }));

import RiderAccountTabScreen from "../account";

function meFixture(overrides: Partial<NonNullable<Me["rider"]>> = {}): Me {
  return {
    profileId: "p1",
    role: "rider",
    firstName: "Tendai",
    lastName: "Moyo",
    phone: "+263772451180",
    email: null,
    photoUrl: null,
    ordersCount: 0,
    idNumber: null,
    rider: { bikeReg: "ABH4721", kycStatus: "verified", ratingAvg: 4.9, ratingCount: 40, tripsCount: 312, isOnline: true, kycMode: "auto", cancelStrikes: 1, ...overrides },
  };
}

function renderScreen(): renderer.ReactTestRenderer {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={TEST_METRICS}>
        <QueryClientProvider client={qc}>
          <RiderAccountTabScreen />
        </QueryClientProvider>
      </SafeAreaProvider>,
    );
  });
  return tree;
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
  });
}

function texts(tree: renderer.ReactTestRenderer): string[] {
  return tree.root.findAll((n) => typeof n.props.children === "string").map((n) => n.props.children as string);
}
function has(tree: renderer.ReactTestRenderer, copy: string): boolean {
  return texts(tree).includes(copy) || tree.root.findAll((n) => n.props.label === copy).length > 0;
}
function press(tree: renderer.ReactTestRenderer, label: string): void {
  const btn = tree.root.findAll((n) => (n.props.label === label || n.props.accessibilityLabel === label) && typeof n.props.onPress === "function");
  if (btn.length > 0) {
    act(() => btn[0]!.props.onPress());
    return;
  }
  const text = tree.root.findAll((n) => n.props.children === label)[0];
  if (!text) throw new Error(`no element with copy "${label}"`);
  let node: typeof text | null = text;
  while (node && typeof node.props.onPress !== "function") node = node.parent as typeof text | null;
  if (!node) throw new Error(`no pressable for "${label}"`);
  act(() => node!.props.onPress());
}

let tree: renderer.ReactTestRenderer | null = null;
afterEach(() => {
  if (tree) act(() => tree!.unmount());
  tree = null;
  jest.clearAllMocks();
});

describe("rider Account (Rider v2 C1)", () => {
  it("draws the four rows and none of the retired ones", async () => {
    mockGetMe.mockResolvedValue(meFixture());
    mockGetActiveOrder.mockResolvedValue(null);
    tree = renderScreen();
    await settle();
    for (const row of ["Job history", "Notifications", "Help & support", "Settings"]) expect(has(tree, row)).toBe(true);
    for (const gone of ["Money", "Bike & documents", "Switch to customer"]) expect(has(tree, gone)).toBe(false);
  });

  it("routes each row to its own side's screen", async () => {
    mockGetMe.mockResolvedValue(meFixture());
    mockGetActiveOrder.mockResolvedValue(null);
    tree = renderScreen();
    await settle();
    press(tree, "Job history");
    press(tree, "Settings");
    press(tree, "Help & support");
    expect(mockPush.mock.calls.map((c) => c[0])).toEqual(["/history?side=rider", "/settings?side=rider", "/rider/help"]);
  });

  it("opens the profile from the identity card (no longer inert)", async () => {
    mockGetMe.mockResolvedValue(meFixture());
    mockGetActiveOrder.mockResolvedValue(null);
    tree = renderScreen();
    await settle();
    press(tree, "Tendai Moyo, 4.9 · 312 jobs");
    expect(mockPush).toHaveBeenCalledWith("/profile?side=rider");
  });

  it("shows the real strike count on the standing card", async () => {
    mockGetMe.mockResolvedValue(meFixture({ cancelStrikes: 2 }));
    mockGetActiveOrder.mockResolvedValue(null);
    tree = renderScreen();
    await settle();
    expect(has(tree, "2 of 3")).toBe(true);
    expect(has(tree, "One strike from a pause")).toBe(true);
  });
});

describe("the Customer | Rider toggle (C4 / C5)", () => {
  it("C4: asks first, then takes the rider offline and goes to the customer Home", async () => {
    mockGetMe.mockResolvedValue(meFixture());
    mockGetActiveOrder.mockResolvedValue(null);
    tree = renderScreen();
    await settle();
    press(tree, "Customer");
    expect(has(tree, "Stop getting jobs?")).toBe(true);
    expect(mockReplace).not.toHaveBeenCalled();
    press(tree, "Go to customer view");
    await settle();
    expect(mockSetOnline).toHaveBeenCalledWith(false);
    expect(mockReplace).toHaveBeenCalledWith("/home");
  });

  it("C4: 'Stay online as a rider' leaves everything alone", async () => {
    mockGetMe.mockResolvedValue(meFixture());
    mockGetActiveOrder.mockResolvedValue(null);
    tree = renderScreen();
    await settle();
    press(tree, "Customer");
    press(tree, "Stay online as a rider");
    expect(mockSetOnline).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("C5: mid-job the job keeps running — the rider stays online, and can go back to it", async () => {
    mockGetMe.mockResolvedValue(meFixture());
    mockGetActiveOrder.mockResolvedValue({ id: "o1", status: "picked_up", orderType: "parcel", pickup: { landmark: "Eastgate Mall" }, dropoff: { landmark: "14 Glenara Ave" } });
    tree = renderScreen();
    await settle();
    press(tree, "Customer");
    expect(has(tree, "Your job keeps running")).toBe(true);
    press(tree, "Back to my job");
    expect(mockPush).toHaveBeenCalledWith("/rider/job");
    press(tree, "Customer");
    press(tree, "Go to customer view");
    await settle();
    expect(mockSetOnline).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith("/home");
  });
});
