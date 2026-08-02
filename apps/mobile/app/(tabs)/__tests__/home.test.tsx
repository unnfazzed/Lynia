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
import { orderKey } from "../../../src/query/client";

const TEST_METRICS = { insets: { top: 0, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 320, height: 640 } };

const mockGetActiveCustomerOrder = jest.fn();
const mockUseHistoryFeed = jest.fn();

// Controllable focus/blur, for LC-B05: real expo-router calls the cleanup on blur (not just unmount),
// which is what flips `homeFocused` back to false while the screen stays mounted beneath /order/[id].
let blurHome: (() => void) | null = null;

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React_ = require("react");
    React_.useEffect(() => {
      const cleanup = cb();
      blurHome = () => cleanup && cleanup();
      return cleanup;
    }, []);
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
  blurHome = null;
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

describe("(tabs)/home.tsx — LC-B05: blurred write-back must not clobber live tracking", () => {
  function orderFixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      ...activeOrderFixture(),
      rider: { profileId: "r1", currentLat: -17.8, currentLng: 31.05, updatedAt: "2026-01-01T00:00:00.000Z" },
      ...overrides,
    };
  }

  it("does not overwrite a fresher socket-applied rider position once home is blurred beneath /order/[id]", async () => {
    mockGetActiveCustomerOrder.mockResolvedValue(orderFixture());
    mockUseHistoryFeed.mockReturnValue({ rows: [], isFetching: false, isError: false, hasLiveData: true, showingStale: false, refetch: jest.fn() });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    act(() => {
      activeTree = renderer.create(
        <SafeAreaProvider initialMetrics={TEST_METRICS}>
          <QueryClientProvider client={qc}>
            <LauncherHomeScreen />
          </QueryClientProvider>
        </SafeAreaProvider>,
      );
    });
    await settle();

    // Sanity: while focused, the write-back effect seeds orderKey("order-1") as designed.
    expect(qc.getQueryData(orderKey("order-1"))).toBeTruthy();

    // Customer navigates to the live tracking screen — home blurs underneath it (stays mounted).
    act(() => blurHome?.());

    // use-order-socket.ts applies a fresher rider position via a functional cache update.
    act(() => {
      qc.setQueryData(orderKey("order-1"), (prev: Record<string, unknown> | undefined) => ({
        ...prev,
        rider: { profileId: "r1", currentLat: -17.9, currentLng: 31.1, updatedAt: "2026-01-01T00:05:00.000Z" },
      }));
    });

    // An unrelated event (e.g. AppState foreground) invalidates activeOrderQ while home is still
    // blurred; it resolves with a snapshot carrying the OLDER rider fix (a real HTTP response race).
    mockGetActiveCustomerOrder.mockResolvedValueOnce(orderFixture({ proposedFare: "13.00" }));
    await act(async () => {
      await qc.invalidateQueries({ queryKey: ["activeCustomerOrder"] });
    });
    await settle();

    // The fresher position must survive — home's blurred write-back must NOT have replaced it.
    const cached = qc.getQueryData<{ rider: { currentLat: number; updatedAt: string } }>(orderKey("order-1"));
    expect(cached?.rider.currentLat).toBe(-17.9);
    expect(cached?.rider.updatedAt).toBe("2026-01-01T00:05:00.000Z");
  });
});
