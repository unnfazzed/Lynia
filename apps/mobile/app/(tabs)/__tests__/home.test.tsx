/**
 * A4 (five-states + retirement sweep) — the launcher Home tab's own states: this screen reads
 * `["activeCustomerOrder"]` directly (not through `useHistoryFeed`'s warm-paint contract), so it
 * needs its own loading skeleton and its own copy of UX20-01's "the check failing must be visible"
 * banner — the same gap send.tsx's compose screen already closed, just not yet applied to this call
 * site. Mocks the API/hook layer only (mirrors food/order/__tests__/order-screen.test.tsx's pattern)
 * so the real react-query loading/error states are exercised, not stubbed out.
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

import LauncherHomeScreen from "../home";

function activeOrderFixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "order-1",
    status: "en_route_pickup",
    agreedFare: null,
    proposedFare: "12.00",
    pickup: { point: { lat: 0, lng: 0 }, landmark: "Home" },
    dropoff: { point: { lat: 0, lng: 0 }, landmark: "Office" },
    ...overrides,
  };
}

function renderHome(): renderer.ReactTestRenderer {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={TEST_METRICS}>
        <QueryClientProvider client={qc}>
          <LauncherHomeScreen />
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

let activeTree: renderer.ReactTestRenderer | null = null;
afterEach(() => {
  if (activeTree) act(() => activeTree!.unmount());
  activeTree = null;
  jest.clearAllMocks();
});

describe("(tabs)/home.tsx — Home tab states", () => {
  it("loading: shows a skeleton, not a blank gap, while the first fetch is in flight", async () => {
    mockGetActiveCustomerOrder.mockReturnValue(new Promise(() => {})); // never resolves
    mockUseHistoryFeed.mockReturnValue({ rows: null, isFetching: true, isError: false, hasLiveData: false, showingStale: false, refetch: jest.fn() });
    activeTree = renderHome();
    const loading = activeTree.root.findAll((n) => n.props.accessibilityLabel === "Loading");
    expect(loading.length).toBeGreaterThan(0);
  });

  it("default: an active order renders the LiveOrderCard, not the reorder rail", async () => {
    mockGetActiveCustomerOrder.mockResolvedValue(activeOrderFixture());
    mockUseHistoryFeed.mockReturnValue({ rows: [], isFetching: false, isError: false, hasLiveData: true, showingStale: false, refetch: jest.fn() });
    activeTree = renderHome();
    await settle();
    expect(has(activeTree, /Delivery in progress/)).toBe(true);
  });

  it("empty: no active order and no trip history renders neither card nor rail (tiles only)", async () => {
    mockGetActiveCustomerOrder.mockResolvedValue(null);
    mockUseHistoryFeed.mockReturnValue({ rows: [], isFetching: false, isError: false, hasLiveData: true, showingStale: false, refetch: jest.fn() });
    activeTree = renderHome();
    await settle();
    expect(has(activeTree, /Delivery in progress/)).toBe(false);
    expect(has(activeTree, /Couldn.t check for an active order/)).toBe(false);
  });

  it("error: the active-order check failing surfaces UX20-01's banner instead of silently showing the reorder rail", async () => {
    mockGetActiveCustomerOrder.mockRejectedValue(new Error("network down"));
    mockUseHistoryFeed.mockReturnValue({ rows: [], isFetching: false, isError: false, hasLiveData: true, showingStale: false, refetch: jest.fn() });
    activeTree = renderHome();
    await settle();
    expect(has(activeTree, /Couldn.t check for an active order/)).toBe(true);
  });
});
