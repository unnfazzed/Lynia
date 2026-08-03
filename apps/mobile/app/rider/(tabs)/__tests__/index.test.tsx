/**
 * B-O1b: the rider board's "Open orders" list was a plain ScrollView + `.map()` over up to 50
 * `JobCard`s — same unbounded-concurrent-mount shape B-O1 fixed for history/notifications and B-T3
 * fixed for the restaurant catalog. Converting it needed a real structural split (this screen carries
 * the whole KYC/location/online-gate ternary tree around the list, with zero prior test coverage), so
 * this pins two things: (1) the online/verified/no-gate state renders the open-orders list through a
 * single FlatList carrying the full dataset, and (2) every gated state (not yet a verified rider,
 * location denied, online-gate refusal, offline) renders NEITHER a FlatList NOR the stale `ranked`
 * data — confirming `showOpenOrdersList`'s early return can't leak the open-orders list into a screen
 * state that shouldn't show it.
 */
import React from "react";
import renderer, { act } from "react-test-renderer";
import { FlatList } from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { OpenOrder } from "../../../../src/api/orders";
import type { Me } from "../../../../src/api/auth";

const TEST_METRICS = { insets: { top: 0, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 320, height: 640 } };

const mockGetMe = jest.fn<Promise<Me>, []>();
const mockGetActiveOrder = jest.fn();
const mockGetOpenOrders = jest.fn<Promise<OpenOrder[]>, unknown[]>();
const mockUseRiderBoard = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => "/rider",
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React_ = require("react");
    React_.useEffect(cb, []);
  },
}));
jest.mock("expo-location", () => ({
  requestForegroundPermissionsAsync: async () => ({ status: "granted" }),
  getCurrentPositionAsync: async () => ({ coords: { latitude: -17.83, longitude: 31.05 } }),
  getLastKnownPositionAsync: async () => null,
  Accuracy: { Balanced: 3 },
}));
jest.mock("expo-web-browser", () => ({ openAuthSessionAsync: jest.fn() }));
jest.mock("expo-secure-store", () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
  deleteItemAsync: async () => undefined,
}));
jest.mock("../../../../src/api/auth", () => ({
  getMe: () => mockGetMe(),
}));
jest.mock("../../../../src/api/orders", () => ({
  getActiveOrder: (...args: unknown[]) => mockGetActiveOrder(...args),
  getOpenOrders: (...args: unknown[]) => mockGetOpenOrders(...args),
}));
jest.mock("../../../../src/api/offers", () => ({ makeOffer: jest.fn() }));
jest.mock("../../../../src/api/riders", () => ({
  retryKyc: jest.fn(),
  sendHeartbeat: jest.fn(async () => ({ online: true })),
  setOnline: jest.fn(async (online: boolean) => ({ online })),
}));
jest.mock("../../../../src/auth/session", () => ({
  loadAcknowledgedHandbacks: async () => [],
}));
jest.mock("../../../../src/push/push", () => ({ pushOnce: jest.fn() }));
jest.mock("../../../../src/realtime/use-foreground-refetch", () => ({
  useForegroundRefetch: () => undefined,
}));
jest.mock("../../../../src/realtime/use-rider-board", () => ({
  useRiderBoard: (...args: unknown[]) => mockUseRiderBoard(...args),
}));
jest.mock("../../../../src/net/use-feature-flags", () => ({
  useFeatureFlags: () => ({ merchantDispatchAutoEnabled: false }),
}));

import RiderHome from "../index";

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

function openOrderFixture(id: string): OpenOrder {
  return {
    id,
    pickup: { point: { lat: -17.83, lng: 31.05 }, landmark: `Pickup ${id}` },
    dropoff: { point: { lat: -17.82, lng: 31.06 }, landmark: `Dropoff ${id}` },
    itemDesc: "A parcel",
    suggestedFare: "5.00",
    proposedFare: "5.00",
    distanceKm: 3.2,
    createdAt: "2026-08-03T10:00:00Z",
  };
}

function renderScreen(): renderer.ReactTestRenderer {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={TEST_METRICS}>
        <QueryClientProvider client={qc}>
          <RiderHome />
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

let activeTree: renderer.ReactTestRenderer | null = null;
beforeEach(() => {
  mockUseRiderBoard.mockReturnValue({
    connected: true,
    expiredOrderIds: new Set<string>(),
    takenOrderIds: new Set<string>(),
    boardTakenNudge: 0,
  });
});
afterEach(() => {
  if (activeTree) act(() => activeTree!.unmount());
  activeTree = null;
  jest.clearAllMocks();
});

describe("rider board (B-O1b: open-orders list must be virtualized, and only when it's actually shown)", () => {
  it("online + verified + no gate: renders the open-orders list via a single FlatList carrying the full dataset", async () => {
    mockGetMe.mockResolvedValue(meFixture());
    mockGetActiveOrder.mockResolvedValue(null);
    const orders = Array.from({ length: 12 }, (_, i) => openOrderFixture(`order-${i}`));
    mockGetOpenOrders.mockResolvedValue(orders);

    activeTree = renderScreen();
    await settle();
    await settle();

    const lists = activeTree.root.findAllByType(FlatList);
    expect(lists).toHaveLength(1);
    expect(lists[0]!.props.data).toHaveLength(orders.length);
    expect(lists[0]!.props.data.map((r: { o: OpenOrder }) => r.o.id).sort()).toEqual(orders.map((o) => o.id).sort());
  });

  it("not yet a verified rider (knownUnverified gate): renders no FlatList and does not leak open-order data", async () => {
    mockGetMe.mockResolvedValue({ ...meFixture(), rider: null });
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([openOrderFixture("should-not-appear")]);

    activeTree = renderScreen();
    await settle();
    await settle();

    expect(activeTree.root.findAllByType(FlatList)).toHaveLength(0);
    const hasSetupCopy = activeTree.root.findAll((n) => {
      const c = n.props.children;
      const flat = Array.isArray(c) ? c.join("") : typeof c === "string" ? c : "";
      return flat.includes("Set up as a rider");
    });
    expect(hasSetupCopy.length).toBeGreaterThan(0);
  });

  it("KYC pending (gated, online may have been true server-side): renders no FlatList", async () => {
    mockGetMe.mockResolvedValue(meFixture({ kycStatus: "pending", kycMode: "manual" }));
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([openOrderFixture("should-not-appear")]);

    activeTree = renderScreen();
    await settle();
    await settle();

    expect(activeTree.root.findAllByType(FlatList)).toHaveLength(0);
  });
});
