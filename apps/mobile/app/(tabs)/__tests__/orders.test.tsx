/**
 * The Orders tab — Orders v2 (packages/design/handoff/orders-v2, ledger D-63). `useHistoryFeed` carries
 * its own documented contract (loading / empty / error / offline paint) and is mocked here, so these
 * cases pin the tab's own states: NOW cards, the day-grouped customer history, outcomes and amounts,
 * chips, search, and the empty / offline / error cards.
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
let mockFlags = { restaurantsEnabled: false, merchantDispatchAutoEnabled: false, merchantWalletEnabled: false };
let mockServiceFlags = { shopsEnabled: false, pharmacyEnabled: false };
let mockOnline = true;
jest.mock("../../../src/net/use-feature-flags", () => ({ useFeatureFlags: () => mockFlags }));
jest.mock("../../../src/net/use-service-flags", () => ({ useServiceFlags: () => mockServiceFlags }));
jest.mock("../../../src/net/use-reachable", () => ({ useReachable: () => mockOnline }));
jest.mock("../../../src/query/use-notifications-unread", () => ({ useNotificationsUnreadCount: () => 0 }));
jest.mock("../../../src/query/use-food-order", () => ({ useFoodOrdersPeek: () => ({}) }));

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

function flat(n: renderer.ReactTestInstance): string {
  const c = n.props.children;
  return Array.isArray(c) ? c.filter((x) => typeof x === "string" || typeof x === "number").join("") : typeof c === "string" ? c : "";
}

function has(tree: renderer.ReactTestRenderer, text: string | RegExp): boolean {
  return tree.root.findAll((n) => (typeof text === "string" ? flat(n).includes(text) : text.test(flat(n)))).length > 0;
}

/** Host nodes (one per drawn element — composite wrappers repeat their props). */
function hosts(tree: renderer.ReactTestRenderer, pred: (n: renderer.ReactTestInstance) => boolean): renderer.ReactTestInstance[] {
  return tree.root.findAll((n) => typeof n.type === "string" && pred(n));
}

/** The pressable whose accessibilityLabel starts with `label`. */
function press(tree: renderer.ReactTestRenderer, label: string): void {
  const [node] = tree.root.findAll((n) => typeof n.props.accessibilityLabel === "string" && n.props.accessibilityLabel.startsWith(label) && typeof n.props.onPress === "function");
  if (!node) throw new Error(`no control labelled "${label}"`);
  act(() => node.props.onPress());
}

const emptyHistory = { rows: [], isFetching: false, isError: false, hasLiveData: true, showingStale: false, savedAt: null, refetch: jest.fn() };
const history = (rows: unknown[], over: Record<string, unknown> = {}) => ({ ...emptyHistory, rows, ...over });

const histRow = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  orderType: "parcel",
  merchantName: null,
  role: "customer",
  pickup: { point: { lat: 0, lng: 0 }, landmark: "Avondale Shops, Avondale" },
  dropoff: { point: { lat: 0, lng: 0 }, landmark: "Borrowdale, Harare" },
  itemDesc: "Documents",
  note: null,
  proposedFare: "4.00",
  agreedFare: "4.50",
  status: "delivered",
  createdAt: "2026-09-28T10:00:00.000Z",
  rating: null,
  counterpartyName: "Tendai Moyo",
  ...over,
});

const parcel = {
  id: "order-1",
  status: "en_route_pickup",
  orderType: "parcel",
  agreedFare: null,
  proposedFare: "12.00",
  pickup: { point: { lat: 0, lng: 0 }, landmark: "Home" },
  dropoff: { point: { lat: 0, lng: 0 }, landmark: "Office" },
  rider: null,
  riderCard: { firstName: "Tendai", lastName: "Moyo", photoUrl: null, ratingAvg: 4.8, ratingCount: 10, tripsCount: 20, plate: null, verified: true },
  expiresAt: null,
};

let activeTree: renderer.ReactTestRenderer | null = null;
afterEach(() => {
  if (activeTree) act(() => activeTree!.unmount());
  activeTree = null;
  mockSecureStore = {};
  mockFlags = { restaurantsEnabled: false, merchantDispatchAutoEnabled: false, merchantWalletEnabled: false };
  mockServiceFlags = { shopsEnabled: false, pharmacyEnabled: false };
  mockOnline = true;
  jest.clearAllMocks();
});

async function open(feed: unknown, active: unknown = []): Promise<renderer.ReactTestRenderer> {
  mockGetActiveCustomerOrders.mockResolvedValue(active);
  mockUseHistoryFeed.mockReturnValue(feed);
  activeTree = renderOrders();
  await settle();
  return activeTree;
}

describe("(tabs)/orders.tsx — Orders v2", () => {
  describe("empty, error and offline cards", () => {
    it("O17: parcels only — 'No orders yet' with one 'Send a parcel', no food or shop promise", async () => {
      const tree = await open(emptyHistory);
      expect(has(tree, "No orders yet")).toBe(true);
      expect(has(tree, /^Parcels you send land here/)).toBe(true);
      expect(has(tree, "Find food or shops")).toBe(false);
      // No search field: there is nothing to search.
      expect(has(tree, "Search your orders")).toBe(false);
    });

    it("O16: with food on, the body names every service and offers 'Find food or shops'", async () => {
      mockFlags = { ...mockFlags, restaurantsEnabled: true };
      const tree = await open(emptyHistory);
      expect(has(tree, /^Parcels, food and shop orders all land here/)).toBe(true);
      press(tree, "Find food or shops");
      expect(mockPush).toHaveBeenCalledWith("/food");
    });

    // P1 (navigation review 2026-08-12): router.replace('/send') from a tab root swaps out the (tabs) group.
    it("'Send a parcel' routes via push, NOT replace (keeps the tab shell reachable)", async () => {
      const tree = await open(emptyHistory);
      press(tree, "Send a parcel");
      expect(mockPush).toHaveBeenCalledWith("/send");
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it("O21: a failed load with no saved copy offers 'Try again', which refetches", async () => {
      const refetch = jest.fn();
      const tree = await open({ ...emptyHistory, rows: null, isError: true, hasLiveData: false, refetch });
      expect(has(tree, /Couldn.t load your orders/)).toBe(true);
      press(tree, "Try again");
      expect(refetch).toHaveBeenCalled();
    });

    it("O20: offline with nothing saved says so, with no button", async () => {
      mockOnline = false;
      const tree = await open({ ...emptyHistory, rows: null, hasLiveData: false });
      expect(has(tree, /You.re offline/)).toBe(true);
      expect(has(tree, "Try again")).toBe(false);
    });

    it("O15: a genuine first load paints the skeleton under the real header", async () => {
      const tree = await open({ ...emptyHistory, rows: null, isFetching: true, hasLiveData: false });
      expect(has(tree, "Your orders")).toBe(true);
      expect(tree.root.findAll((n) => n.props.accessibilityLabel === "Loading your orders").length).toBeGreaterThan(0);
    });

    // Owner instruction 2026-08-12: a background poll the customer never triggered never raises an error card.
    it("a failed active-order check stays quiet, with or without a leftover order hint", async () => {
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

    // CF-04 (crash-fuzz 2026-08-23): a malformed 200 body is a truthy non-array.
    it("does not crash when the active-orders body isn't an array — degrades to no Now card", async () => {
      const tree = await open(emptyHistory, { orders: [] });
      expect(has(tree, "No orders yet")).toBe(true);
      expect(has(tree, "NOW")).toBe(false);
    });
  });

  describe("NOW", () => {
    it("a running parcel is a Now card that says who is doing what, and opens the order", async () => {
      const tree = await open(emptyHistory, [parcel]);
      expect(has(tree, "NOW")).toBe(true);
      expect(has(tree, "Tendai is heading to pickup")).toBe(true);
      expect(has(tree, "Home → Office")).toBe(true);
      press(tree, "Tendai is heading to pickup");
      expect(mockPush).toHaveBeenCalledWith("/order/order-1");
    });

    it("O18: a running order with nothing earlier shows the note, not the empty card", async () => {
      const tree = await open(emptyHistory, [parcel]);
      expect(has(tree, /^Past orders show here once this one/)).toBe(true);
      expect(has(tree, "No orders yet")).toBe(false);
    });

    it("O2: every running order pins (a food order and a parcel) under 'NOW · 2' with the helper", async () => {
      const tree = await open(emptyHistory, [{ ...parcel, id: "order-food", orderType: "merchant", merchantName: "Sadza Republic", status: "picked_up", agreedFare: "15.50" }, parcel]);
      expect(has(tree, "NOW · 2")).toBe(true);
      expect(has(tree, "Tap an order to open it")).toBe(true);
      expect(has(tree, /Sadza Republic/)).toBe(true);
      expect(has(tree, "Tendai is heading to pickup")).toBe(true);
    });

    it("a parcel still finding a rider reads 'Finding a rider' with the asking price", async () => {
      const tree = await open(emptyHistory, [{ ...parcel, status: "open_for_offers", riderCard: null, dropoff: { point: { lat: 0, lng: 0 }, landmark: "Belgravia, Harare" } }]);
      expect(has(tree, "Finding a rider")).toBe(true);
      expect(has(tree, "Parcel to Belgravia · asking $12.00")).toBe(true);
    });

    it("a running order is not repeated in the history", async () => {
      const tree = await open(history([histRow("order-1"), histRow("parcel-2")]), [parcel]);
      expect(hosts(tree, (n) => typeof n.props.accessibilityLabel === "string" && n.props.accessibilityLabel.startsWith("Parcel to Borrowdale")).length).toBe(1);
    });
  });

  describe("history rows", () => {
    it("a parcel row: 'Parcel to <area>', '<item> · from <pickup>', the outcome, the rider and what was paid", async () => {
      const tree = await open(history([histRow("parcel-1")]));
      expect(has(tree, "Parcel to Borrowdale")).toBe(true);
      expect(has(tree, "Documents · from Avondale Shops")).toBe(true);
      expect(has(tree, "Delivered")).toBe(true);
      expect(has(tree, "Tendai M.")).toBe(true);
      expect(has(tree, "$4.50")).toBe(true);
      press(tree, "Parcel to Borrowdale");
      expect(mockPush).toHaveBeenLastCalledWith("/order/parcel-1");
    });

    it("a food row is titled by its restaurant and opens the one order screen (D-59)", async () => {
      const tree = await open(history([histRow("food-1", { orderType: "merchant", merchantName: "Sadza Republic", itemDesc: "Sadza & beef stew" })]));
      expect(has(tree, "Sadza Republic")).toBe(true);
      expect(has(tree, "Sadza & beef stew")).toBe(true);
      press(tree, "Sadza Republic");
      expect(mockPush).toHaveBeenLastCalledWith("/order/food-1");
    });

    it("every unpaid outcome reads 'No charge' (owner 2026-10-02: Not delivered too)", async () => {
      const tree = await open(history([histRow("a", { status: "expired" }), histRow("b", { status: "undelivered" })]));
      expect(has(tree, "No rider found")).toBe(true);
      expect(has(tree, "Not delivered")).toBe(true);
      expect(hosts(tree, (n) => flat(n) === "No charge").length).toBe(2);
      expect(has(tree, "$4.50")).toBe(false);
    });

    it("a rated row shows filled stars only; an unrated one shows none", async () => {
      const tree = await open(history([histRow("a", { rating: { score: 4, comment: null } }), histRow("b")]));
      expect(hosts(tree, (n) => n.props.accessibilityLabel === "4 stars").length).toBe(1);
      expect(hosts(tree, (n) => typeof n.props.accessibilityLabel === "string" && n.props.accessibilityLabel.endsWith(" stars")).length).toBe(1);
    });

    it("drops jobs the user carried as a rider; a rider-only history is the empty card", async () => {
      let tree = await open(history([histRow("parcel-1"), histRow("rider-1", { role: "rider", dropoff: { point: { lat: 0, lng: 0 }, landmark: "Mbare" } })]));
      expect(has(tree, "Parcel to Borrowdale")).toBe(true);
      expect(has(tree, "Parcel to Mbare")).toBe(false);
      act(() => activeTree!.unmount());
      tree = await open(history([histRow("rider-1", { role: "rider" })]));
      expect(has(tree, "No orders yet")).toBe(true);
    });

    it("rows group under a day label, and a short history ends with 'That’s everything'", async () => {
      const today = new Date();
      today.setHours(9, 5, 0, 0);
      const tree = await open(history([histRow("a", { createdAt: today.toISOString() })]));
      expect(has(tree, "TODAY")).toBe(true);
      expect(has(tree, "09:05")).toBe(true);
      expect(has(tree, "That’s everything")).toBe(true);
    });

    it("offline with a saved list: the banner says when it was saved", async () => {
      mockOnline = false;
      const at = new Date();
      at.setHours(9, 24, 0, 0);
      const tree = await open(history([histRow("a")], { savedAt: at.toISOString(), showingStale: true }));
      expect(has(tree, "You’re offline. Showing your orders as of 09:24.")).toBe(true);
    });
  });

  describe("chips", () => {
    const mixed = () => history([histRow("p"), histRow("f", { orderType: "merchant", merchantName: "Sadza Republic" })]);

    it("no chips with only one service on", async () => {
      const tree = await open(mixed());
      expect(has(tree, "Parcels")).toBe(false);
    });

    it("a chip filters the history only; a chip with no matches offers 'Show all orders'", async () => {
      mockFlags = { ...mockFlags, restaurantsEnabled: true };
      mockServiceFlags = { shopsEnabled: false, pharmacyEnabled: true };
      const tree = await open(mixed(), [parcel]);
      press(tree, "Food");
      expect(has(tree, "Sadza Republic")).toBe(true);
      expect(has(tree, "Parcel to Borrowdale")).toBe(false);
      expect(has(tree, "Tendai is heading to pickup")).toBe(true);
      press(tree, "Pharmacy");
      expect(has(tree, "No pharmacy orders yet")).toBe(true);
      press(tree, "Show all orders");
      expect(has(tree, "Parcel to Borrowdale")).toBe(true);
    });
  });

  describe("search", () => {
    it("matches the area and the rider, marks the count, and says when nothing matches", async () => {
      const tree = await open(history([histRow("a"), histRow("b", { dropoff: { point: { lat: 0, lng: 0 }, landmark: "Belgravia" }, counterpartyName: null })]), [parcel]);
      press(tree, "Search your orders");
      const [input] = tree.root.findAll((n) => n.props.accessibilityLabel === "Search your orders" && typeof n.props.onChangeText === "function");
      expect(input).toBeDefined();
      // The running order stays visible as a strip while searching.
      expect(has(tree, "Tendai is heading to pickup")).toBe(true);
      act(() => input!.props.onChangeText("borrow"));
      expect(has(tree, "1 order match “borrow”")).toBe(true);
      act(() => input!.props.onChangeText("Tendai"));
      expect(has(tree, "1 order match “Tendai”")).toBe(true);
      act(() => input!.props.onChangeText("Msasa"));
      expect(has(tree, "No orders match “Msasa”")).toBe(true);
      press(tree, "Cancel");
      expect(has(tree, "Your orders")).toBe(true);
    });
  });
});
