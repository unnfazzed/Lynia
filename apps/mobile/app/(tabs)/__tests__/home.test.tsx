/**
 * A4 (five-states + retirement sweep) — the launcher Home tab's own states: this screen reads
 * `["activeCustomerOrders"]` directly (not through `useHistoryFeed`'s warm-paint contract), so it
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

const mockGetActiveCustomerOrders = jest.fn();

// In-memory SecureStore (jest-expo has no built-in behavior for it) — the failed-check banner's
// evidence gate (useActiveOrderCheckGate) reads the persisted order hint through it.
let mockSecureStore: Record<string, string> = {};
jest.mock("expo-secure-store", () => ({
  getItemAsync: async (key: string) => mockSecureStore[key] ?? null,
  setItemAsync: async (key: string, value: string) => {
    mockSecureStore[key] = value;
  },
  deleteItemAsync: async (key: string) => {
    delete mockSecureStore[key];
  },
}));

// Controllable focus/blur, for LC-B05: real expo-router calls the cleanup on blur (not just unmount),
// which is what flips `homeFocused` back to false while the screen stays mounted beneath /order/[id].
let blurHome: (() => void) | null = null;
// A-O15: re-invoke the focus callback on demand, mirroring expo-router calling it again on a
// subsequent focus without a remount — needed to test that a quick re-focus doesn't force a redundant
// fetch when the cache is still fresh.
let refocusHome: (() => void) | null = null;

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React_ = require("react");
    React_.useEffect(() => {
      const cleanup = cb();
      blurHome = () => cleanup && cleanup();
      refocusHome = () => cb();
      return cleanup;
    }, []);
  },
}));
jest.mock("../../../src/api/orders", () => ({
  getActiveCustomerOrders: (...args: unknown[]) => mockGetActiveCustomerOrders(...args),
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
  refocusHome = null;
  mockSecureStore = {};
  jest.clearAllMocks();
});

describe("(tabs)/home.tsx — Home tab states", () => {
  it("loading: shows a skeleton, not a blank gap, while the first fetch is in flight", async () => {
    mockGetActiveCustomerOrders.mockReturnValue(new Promise(() => {})); // never resolves
    activeTree = renderHome();
    const loading = activeTree.root.findAll((n) => n.props.accessibilityLabel === "Loading");
    expect(loading.length).toBeGreaterThan(0);
  });

  it("default: an active parcel renders the mock-grammar LiveOrderCard, not the reorder rail", async () => {
    mockGetActiveCustomerOrders.mockResolvedValue([activeOrderFixture()]);
    activeTree = renderHome();
    await settle();
    // home.prompt.md grammar: who/where + status (no rider fix on this fixture, so no minutes).
    expect(has(activeTree, /Parcel to Office · Heading to pickup/)).toBe(true);
  });

  it("RC.home: a food order and a parcel running side-by-side each render their own card, newest first", async () => {
    mockGetActiveCustomerOrders.mockResolvedValue([
      activeOrderFixture({
        id: "order-food",
        orderType: "merchant",
        status: "picked_up",
        merchantName: "Sadza Republic",
        merchantPaymentMethod: "cash",
        agreedFare: "15.50",
      }),
      activeOrderFixture({ id: "order-1", status: "en_route_dropoff" }),
    ]);
    activeTree = renderHome();
    await settle();
    // Food card: restaurant headline + design payment/total meta.
    expect(has(activeTree, /Sadza Republic · /)).toBe(true);
    expect(has(activeTree, /Cash at the door · \$15\.50/)).toBe(true);
    // Parcel card alongside it — the two jobs never collapse into one card.
    expect(has(activeTree, /Parcel to Office · /)).toBe(true);
  });

  it("empty: no active order renders neither card nor a send-again rail (tiles only)", async () => {
    mockGetActiveCustomerOrders.mockResolvedValue([]);
    activeTree = renderHome();
    await settle();
    expect(has(activeTree, /Parcel to /)).toBe(false);
    // Owner decision 2026-08-12, per the design AppHome contract ("no order-again / send-again
    // rails"): the rail must never come back — reordering lives on the trip-history screen.
    expect(has(activeTree, /Send again/)).toBe(false);
    expect(has(activeTree, /Couldn.t check for an active order/)).toBe(false);
  });

  it("error + persisted order hint: the active-order check failing surfaces UX20-01's banner instead of silently showing the reorder rail", async () => {
    mockSecureStore["lynia.activeOrderHint"] = "order-1";
    mockGetActiveCustomerOrders.mockRejectedValue(new Error("network down"));
    activeTree = renderHome();
    await settle();
    expect(has(activeTree, /Couldn.t check for an active order/)).toBe(true);
  });

  // UX-2026-08-05: without local evidence an order may be in flight, a failed background check must
  // NOT camp a danger banner over the home — the query self-heals via its own poll/reconnect refetch.
  it("error with no order hint: stays quiet instead of camping the banner over the home", async () => {
    mockGetActiveCustomerOrders.mockRejectedValue(new Error("network down"));
    activeTree = renderHome();
    await settle();
    expect(has(activeTree, /Couldn.t check for an active order/)).toBe(false);
  });

  // A check that authoritatively answers "no active order" invalidates any stale hint — the next
  // flaky-link error must not resurrect the banner for an order that provably finished.
  it("success with null clears a stale persisted order hint", async () => {
    mockSecureStore["lynia.activeOrderHint"] = "order-done";
    mockGetActiveCustomerOrders.mockResolvedValue([]);
    activeTree = renderHome();
    await settle();
    expect(mockSecureStore["lynia.activeOrderHint"]).toBeUndefined();
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
    mockGetActiveCustomerOrders.mockResolvedValue([orderFixture()]);

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
    mockGetActiveCustomerOrders.mockResolvedValueOnce([orderFixture({ proposedFare: "13.00" })]);
    await act(async () => {
      await qc.invalidateQueries({ queryKey: ["activeCustomerOrders"] });
    });
    await settle();

    // The fresher position must survive — home's blurred write-back must NOT have replaced it.
    const cached = qc.getQueryData<{ rider: { currentLat: number; updatedAt: string } }>(orderKey("order-1"));
    expect(cached?.rider.currentLat).toBe(-17.9);
    expect(cached?.rider.updatedAt).toBe("2026-01-01T00:05:00.000Z");
  });
});

describe("(tabs)/home.tsx — A-O15: a quick re-focus must not force a redundant fetch while fresh", () => {
  it("does not refetch on refocus when the active-order cache is still within the staleness window", async () => {
    mockGetActiveCustomerOrders.mockResolvedValue([activeOrderFixture()]);

    activeTree = renderHome();
    await settle();
    expect(mockGetActiveCustomerOrders).toHaveBeenCalledTimes(1);

    // Customer flicks to another tab and immediately back — a real re-focus, well under the 30s
    // staleness window the initial fetch just established.
    act(() => refocusHome?.());
    await settle();

    expect(mockGetActiveCustomerOrders).toHaveBeenCalledTimes(1);
  });

  it("still refetches on refocus once the cached entry is old enough to count as stale", async () => {
    mockGetActiveCustomerOrders.mockResolvedValue([activeOrderFixture()]);

    activeTree = renderHome();
    await settle();
    expect(mockGetActiveCustomerOrders).toHaveBeenCalledTimes(1);

    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(Date.now() + 31_000);
    act(() => refocusHome?.());
    await settle();
    nowSpy.mockRestore();

    expect(mockGetActiveCustomerOrders).toHaveBeenCalledTimes(2);
  });
});
