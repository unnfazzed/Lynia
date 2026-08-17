/**
 * A4 (five-states + retirement sweep) — the Orders tab's own states. `useHistoryFeed` already
 * carries a documented five-state contract (loading/empty/error/offline paint), exercised here via
 * a mock so this test focuses on the gap A4 closes: the tab's OWN `["activeCustomerOrders"]` query
 * (for the pinned live-order card) had no error state — an error there silently fell through to the
 * earlier list with zero indication a live order might exist, the same UX20-01 dead-end send.tsx's
 * compose screen already fixed for its own copy of this exact query.
 */
import renderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";

const TEST_METRICS = { insets: { top: 0, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 320, height: 640 } };

const mockGetActiveCustomerOrders = jest.fn();
const mockUseHistoryFeed = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();

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

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React_ = require("react");
    React_.useEffect(cb, []);
  },
}));
jest.mock("../../../src/api/orders", () => ({
  getActiveCustomerOrders: (...args: unknown[]) => mockGetActiveCustomerOrders(...args),
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
  mockSecureStore = {};
  jest.clearAllMocks();
});

describe("(tabs)/orders.tsx — Orders tab states", () => {
  it("empty: no history and no active order shows the cross-service empty state", async () => {
    mockGetActiveCustomerOrders.mockResolvedValue([]);
    mockUseHistoryFeed.mockReturnValue(emptyHistory);
    activeTree = renderOrders();
    await settle();
    expect(has(activeTree, /Nothing here yet/)).toBe(true);
  });

  // P1 (navigation review 2026-08-12): from a tab root, router.replace('/send') swaps out the whole
  // (tabs) group — the tab bar vanishes and Android hardware-back exits the app from a screen that
  // draws no back. The empty-state CTA must push so the tab shell stays beneath.
  it("empty-state 'Send a parcel' routes via push, NOT replace (keeps the tab shell reachable)", async () => {
    mockGetActiveCustomerOrders.mockResolvedValue([]);
    mockUseHistoryFeed.mockReturnValue(emptyHistory);
    activeTree = renderOrders();
    await settle();
    const [btn] = activeTree.root.findAll((n) => n.props.label === "Send a parcel");
    if (!btn) throw new Error("empty-state 'Send a parcel' button not found");
    act(() => btn.props.onPress());
    expect(mockPush).toHaveBeenCalledWith("/send");
    expect(mockReplace).not.toHaveBeenCalledWith("/send");
  });

  it("error (history): a fetch error with no cache shows the retry state, per useHistoryFeed's own contract", async () => {
    mockGetActiveCustomerOrders.mockResolvedValue([]);
    mockUseHistoryFeed.mockReturnValue({ rows: null, isFetching: false, isError: true, hasLiveData: false, showingStale: false, refetch: jest.fn() });
    activeTree = renderOrders();
    await settle();
    expect(has(activeTree, /Couldn.t load your orders/)).toBe(true);
  });

  // Owner instruction 2026-08-12: a background poll the customer never triggered must NOT raise an
  // error card. This used to be evidence-gated (UX-2026-08-05) — now it never renders at all, so the
  // stale hint a pre-removal build may have left in SecureStore can't resurrect it either.
  it("error (active-order check): stays quiet, with or without a leftover order hint", async () => {
    mockGetActiveCustomerOrders.mockRejectedValue(new Error("network down"));
    mockUseHistoryFeed.mockReturnValue(emptyHistory);
    activeTree = renderOrders();
    await settle();
    expect(has(activeTree, /Couldn.t check for an active order/)).toBe(false);

    act(() => activeTree!.unmount());
    mockSecureStore["lynia.activeOrderHint"] = "order-1";
    activeTree = renderOrders();
    await settle();
    expect(has(activeTree, /Couldn.t check for an active order/)).toBe(false);
  });

  it("default: an active order pins the compact live-order card above the earlier list", async () => {
    mockGetActiveCustomerOrders.mockResolvedValue([{
      id: "order-1",
      status: "en_route_pickup",
      orderType: "parcel",
      agreedFare: null,
      proposedFare: "12.00",
      pickup: { point: { lat: 0, lng: 0 }, landmark: "Home" },
      dropoff: { point: { lat: 0, lng: 0 }, landmark: "Office" },
    }]);
    mockUseHistoryFeed.mockReturnValue(emptyHistory);
    activeTree = renderOrders();
    await settle();
    // Kit RC.orders compact card: route headline, accent-green status line, and the fare — no stepper.
    expect(has(activeTree, /Home/)).toBe(true);
    expect(has(activeTree, /Heading to pickup/)).toBe(true);
    expect(has(activeTree, /\$12\.00/)).toBe(true);
  });

  it("pins EVERY live order (a food job and a parcel side-by-side), the food one titled by its restaurant", async () => {
    const parcel = {
      id: "order-1",
      status: "en_route_pickup",
      orderType: "parcel",
      agreedFare: null,
      proposedFare: "12.00",
      pickup: { point: { lat: 0, lng: 0 }, landmark: "Home" },
      dropoff: { point: { lat: 0, lng: 0 }, landmark: "Office" },
    };
    mockGetActiveCustomerOrders.mockResolvedValue([
      { ...parcel, id: "order-food", orderType: "merchant", merchantName: "Sadza Republic", status: "picked_up", agreedFare: "15.50" },
      parcel,
    ]);
    mockUseHistoryFeed.mockReturnValue(emptyHistory);
    activeTree = renderOrders();
    await settle();
    // Kit RC.orders: a food job's headline is the RESTAURANT, not its kitchen/customer landmarks.
    expect(has(activeTree, /Sadza Republic/)).toBe(true);
    // The parcel keeps its own pinned card — two running jobs never collapse to one row.
    expect(has(activeTree, /Home → Office/)).toBe(true);
  });
});
