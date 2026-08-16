/**
 * Rider Account tab — the customer bridge.
 *
 * Owner instruction (2026-08-16): "Back to customer" was removed from the Jobs board footer and moved
 * here, as a sixth settings row beneath the mock's five (the one sanctioned addition to RJM A1 — see
 * docs/DESIGN-DEVIATIONS.md). The confirmation that guarded it on the board came with it: leaving the
 * rider side while online or mid-job is never a single unconfirmed tap, because it unmounts the board
 * socket + heartbeat and (with no active job) takes the rider offline server-side.
 *
 * What this pins: the row exists and routes nowhere by itself; an idle rider leaves straight away and
 * is taken offline; an online rider is asked first; a mid-job rider is asked with the job-specific copy
 * and is NOT taken offline; and "Stay online as a rider" is a real escape that leaves everything alone.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import renderer, { act } from "react-test-renderer";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { Me } from "../../../../src/api/auth";

const TEST_METRICS = { insets: { top: 0, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 320, height: 640 } };

const mockGetMe = jest.fn<Promise<Me>, []>();
const mockGetActiveOrder = jest.fn();
const mockSetOnline = jest.fn(async (online: boolean, _loc?: unknown) => ({ online }));
const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));
jest.mock("expo-secure-store", () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
  deleteItemAsync: async () => undefined,
}));
jest.mock("../../../../src/api/auth", () => ({ getMe: () => mockGetMe() }));
jest.mock("../../../../src/api/orders", () => ({ getActiveOrder: (...a: unknown[]) => mockGetActiveOrder(...a) }));
jest.mock("../../../../src/api/riders", () => ({
  setOnline: (online: boolean, loc?: unknown) => mockSetOnline(online, loc),
}));

import RiderAccountTabScreen from "../account";

const SWITCH_ROW = "Switch to customer";

function meFixture(overrides: Partial<NonNullable<Me["rider"]>> = {}): Me {
  return {
    profileId: "p1",
    role: "rider",
    firstName: "Tapiwa",
    lastName: "R",
    phone: "+263700000000",
    email: null,
    photoUrl: null,
    ordersCount: 0,
    idNumber: "63-123456-A-42",
    rider: {
      bikeReg: "ABC123",
      kycStatus: "verified",
      ratingAvg: 4.8,
      ratingCount: 12,
      tripsCount: 20,
      isOnline: true,
      kycMode: "auto",
      ...overrides,
    },
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
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** Tap the row/button whose visible copy is `label` (row labels render as Text, buttons as `label`). */
function press(tree: renderer.ReactTestRenderer, label: string): void {
  const byLabelProp = tree.root.findAll((n) => n.props.label === label && typeof n.props.onPress === "function");
  if (byLabelProp.length > 0) {
    act(() => byLabelProp[0]!.props.onPress());
    return;
  }
  // A settings row: the Pressable is the nearest ancestor of the Text node carrying the copy.
  const text = tree.root.findAll((n) => n.props.children === label)[0];
  if (!text) throw new Error(`no element with copy "${label}"`);
  let node: typeof text | null = text;
  while (node && typeof node.props.onPress !== "function") node = node.parent as typeof text | null;
  if (!node) throw new Error(`no pressable ancestor for "${label}"`);
  act(() => node!.props.onPress());
}

function has(tree: renderer.ReactTestRenderer, copy: string): boolean {
  return (
    tree.root.findAll((n) => n.props.children === copy).length > 0 ||
    tree.root.findAll((n) => n.props.label === copy).length > 0
  );
}

let activeTree: renderer.ReactTestRenderer | null = null;
afterEach(() => {
  if (activeTree) act(() => activeTree!.unmount());
  activeTree = null;
  jest.clearAllMocks();
});

describe("rider Account tab — the customer bridge moved here from the board (owner 2026-08-16)", () => {
  it("renders the switch row beneath the mock's five settings rows", async () => {
    mockGetMe.mockResolvedValue(meFixture());
    mockGetActiveOrder.mockResolvedValue(null);

    activeTree = renderScreen();
    await settle();

    expect(has(activeTree, SWITCH_ROW)).toBe(true);
    // The mock's own five are untouched — this is an addition, not a replacement.
    for (const row of ["Bike & documents", "Job history", "Money", "Notifications", "Help & support"]) {
      expect(has(activeTree, row)).toBe(true);
    }
  });

  it("offline with no job: leaves for the customer view immediately, no confirmation", async () => {
    mockGetMe.mockResolvedValue(meFixture({ isOnline: false }));
    mockGetActiveOrder.mockResolvedValue(null);

    activeTree = renderScreen();
    await settle();
    press(activeTree, SWITCH_ROW);
    await settle();

    expect(mockReplace).toHaveBeenCalledWith("/home");
    // Nothing to confirm — the rider isn't online and has no job to lose track of.
    expect(has(activeTree, "You're online for deliveries")).toBe(false);
  });

  it("online: asks first, and going through takes the rider offline (the copy promises it)", async () => {
    mockGetMe.mockResolvedValue(meFixture({ isOnline: true }));
    mockGetActiveOrder.mockResolvedValue(null);

    activeTree = renderScreen();
    await settle();
    press(activeTree, SWITCH_ROW);
    await settle();

    // The tap alone must not navigate — that was the whole point of the confirmation.
    expect(mockReplace).not.toHaveBeenCalled();
    expect(has(activeTree, "You're online for deliveries")).toBe(true);

    press(activeTree, "Go to customer view");
    await settle();

    expect(mockSetOnline).toHaveBeenCalledWith(false, undefined);
    expect(mockReplace).toHaveBeenCalledWith("/home");
  });

  it("mid-job: asks with the job-specific copy and does NOT take the rider offline", async () => {
    mockGetMe.mockResolvedValue(meFixture({ isOnline: true }));
    mockGetActiveOrder.mockResolvedValue({ id: "order-1", status: "en_route_pickup" });

    activeTree = renderScreen();
    await settle();
    press(activeTree, SWITCH_ROW);
    await settle();

    expect(has(activeTree, "You have a job in progress")).toBe(true);

    press(activeTree, "Go to customer view");
    await settle();

    // The copy says the job isn't cancelled, so the rider stays online — only the view changes.
    expect(mockSetOnline).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith("/home");
  });

  it("'Stay online as a rider' backs out without navigating or toggling", async () => {
    mockGetMe.mockResolvedValue(meFixture({ isOnline: true }));
    mockGetActiveOrder.mockResolvedValue(null);

    activeTree = renderScreen();
    await settle();
    press(activeTree, SWITCH_ROW);
    await settle();
    press(activeTree, "Stay online as a rider");
    await settle();

    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockSetOnline).not.toHaveBeenCalled();
    expect(has(activeTree, "You're online for deliveries")).toBe(false);
  });

  it("the five mock rows still route where they did — the new rows didn't shift the mapping", async () => {
    mockGetMe.mockResolvedValue(meFixture());
    mockGetActiveOrder.mockResolvedValue(null);

    activeTree = renderScreen();
    await settle();

    press(activeTree, "Job history");
    expect(mockPush).toHaveBeenCalledWith("/history");
    press(activeTree, "Help & support");
    expect(mockPush).toHaveBeenCalledWith("/help");
    // And the switch row must NOT be routed like the others — an off-by-one would send it to /settings.
    mockPush.mockClear();
    press(activeTree, SWITCH_ROW);
    expect(mockPush).not.toHaveBeenCalled();
  });
});

/**
 * D-22 — the rider's own way into Settings. Before this row, permissions, the privacy notice and
 * account deletion (the last two are Play LISTING REQUIREMENTS, not niceties) were reachable only by
 * tapping the identity card into a /profile that then listed the customer's destinations.
 */
describe("rider Account tab — Settings row (D-22)", () => {
  it("draws Settings with the same copy as the customer tab's row", async () => {
    mockGetMe.mockResolvedValue(meFixture());
    mockGetActiveOrder.mockResolvedValue(null);

    activeTree = renderScreen();
    await settle();

    expect(has(activeTree, "Settings")).toBe(true);
    expect(has(activeTree, "Permissions, privacy and sign out")).toBe(true);
  });

  it("routes to /settings — the row sits between Help & support and the switch row", async () => {
    mockGetMe.mockResolvedValue(meFixture());
    mockGetActiveOrder.mockResolvedValue(null);

    activeTree = renderScreen();
    await settle();

    press(activeTree, "Settings");
    expect(mockPush).toHaveBeenCalledWith("/settings");
  });

  // /profile is shared with the customer tab and reads its side from the query string; without it a
  // rider tapping their own identity card would fall back to role and get the right list by luck,
  // while a dual-role user on the customer hub would get the wrong one.
  it("names its side when opening /profile from the identity card", async () => {
    mockGetMe.mockResolvedValue(meFixture());
    mockGetActiveOrder.mockResolvedValue(null);

    activeTree = renderScreen();
    await settle();

    const card = activeTree.root.findAll(
      (n) => n.props.accessibilityLabel === "Your profile and settings" && typeof n.props.onPress === "function",
    )[0];
    expect(card).toBeDefined();
    act(() => card!.props.onPress());
    expect(mockPush).toHaveBeenCalledWith("/profile?side=rider");
  });
});
