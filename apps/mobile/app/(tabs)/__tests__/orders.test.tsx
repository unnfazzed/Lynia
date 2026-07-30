/**
 * A4 (five-states + retirement sweep) — the Orders tab's own states. `useHistoryFeed` already
 * carries a documented five-state contract (loading/empty/error/offline paint), exercised here via
 * a mock so this test focuses on the gap A4 closes: the tab's OWN `["activeCustomerOrder"]` query
 * (for the pinned live-order card) had no error state — an error there silently fell through to the
 * earlier list with zero indication a live order might exist, the same UX20-01 dead-end send.tsx's
 * compose screen already fixed for its own copy of this exact query.
 */
import React from "react";
import renderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";

const TEST_METRICS = { insets: { top: 0, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 320, height: 640 } };

const mockGetActiveCustomerOrder = jest.fn();
const mockUseHistoryFeed = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React_ = require("react");
    React_.useEffect(cb, []);
  },
}));
jest.mock("../../../src/api/orders", () => ({
  getActiveCustomerOrder: (...args: unknown[]) => mockGetActiveCustomerOrder(...args),
}));
jest.mock("../../../src/query/use-history-feed", () => ({
  useHistoryFeed: () => mockUseHistoryFeed(),
  invalidateCustomerOrderHistory: jest.fn(),
}));
jest.mock("../../../src/net/use-feature-flags", () => ({
  useFeatureFlags: () => ({ restaurantsEnabled: false, merchantDispatchAutoEnabled: false, merchantWalletEnabled: false }),
}));

import OrdersTabScreen from "../orders";

function renderOrders(): renderer.ReactTestRenderer {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={TEST_METRICS}>
        <QueryClientProvider client={qc}>
          <OrdersTabScreen />
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

function has(tree: renderer.ReactTestRenderer, text: string | RegExp): boolean {
  return (
    tree.root.findAll((n) => {
      const c = n.props.children;
      const flat = Array.isArray(c) ? c.join("") : typeof c === "string" ? c : "";
      return typeof text === "string" ? flat.includes(text) : text.test(flat);
    }).length > 0
  );
}

const emptyHistory = { rows: [], isFetching: false, isError: false, hasLiveData: true, showingStale: false, refetch: jest.fn() };

let activeTree: renderer.ReactTestRenderer | null = null;
afterEach(() => {
  if (activeTree) act(() => activeTree!.unmount());
  activeTree = null;
  jest.clearAllMocks();
});

describe("(tabs)/orders.tsx — Orders tab states", () => {
  it("empty: no history and no active order shows the cross-service empty state", async () => {
    mockGetActiveCustomerOrder.mockResolvedValue(null);
    mockUseHistoryFeed.mockReturnValue(emptyHistory);
    activeTree = renderOrders();
    await settle();
    expect(has(activeTree, /Nothing here yet/)).toBe(true);
  });

  it("error (history): a fetch error with no cache shows the retry state, per useHistoryFeed's own contract", async () => {
    mockGetActiveCustomerOrder.mockResolvedValue(null);
    mockUseHistoryFeed.mockReturnValue({ rows: null, isFetching: false, isError: true, hasLiveData: false, showingStale: false, refetch: jest.fn() });
    activeTree = renderOrders();
    await settle();
    expect(has(activeTree, /Couldn.t load your orders/)).toBe(true);
  });

  it("error (active-order check): the pinned-order query failing surfaces UX20-01's banner rather than silently falling through to the list", async () => {
    mockGetActiveCustomerOrder.mockRejectedValue(new Error("network down"));
    mockUseHistoryFeed.mockReturnValue(emptyHistory);
    activeTree = renderOrders();
    await settle();
    expect(has(activeTree, /Couldn.t check for an active order/)).toBe(true);
  });

  it("default: an active order pins the LiveOrderCard above the earlier list", async () => {
    mockGetActiveCustomerOrder.mockResolvedValue({
      id: "order-1",
      status: "en_route_pickup",
      agreedFare: null,
      proposedFare: "12.00",
      pickup: { point: { lat: 0, lng: 0 }, landmark: "Home" },
      dropoff: { point: { lat: 0, lng: 0 }, landmark: "Office" },
    });
    mockUseHistoryFeed.mockReturnValue(emptyHistory);
    activeTree = renderOrders();
    await settle();
    expect(has(activeTree, /Delivery in progress/)).toBe(true);
  });
});
