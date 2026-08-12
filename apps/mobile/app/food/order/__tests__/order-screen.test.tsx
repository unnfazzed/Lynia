/**
 * D2 (checkout + kitchen-confirms) — the order screen's phase branching. Each `merchantPhase` maps to
 * a distinct screen per RESTAURANTS-DECISIONS.md (R5·1 waiting-for-accept, R5·1b confirming-by-phone,
 * R5·3 pay-the-restaurant manual rail, R5·6 paid-waiting, R5·b3 item-approval, cancelled/rejected).
 * Mocks the API layer only (mirrors settings/__tests__/delete-account.test.tsx's pattern) so the real
 * useFoodOrder/react-query polling logic is exercised, not stubbed out.
 */
import React from "react";
import renderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mockGetFoodOrder = jest.fn();
const mockRespondToItems = jest.fn(async (..._args: unknown[]) => undefined);
const mockCancelUnpaid = jest.fn(async (..._args: unknown[]) => undefined);
const mockSubmitReference = jest.fn(async (..._args: unknown[]) => undefined);
const mockGetOrder = jest.fn();
const mockCancelOrder = jest.fn(async (..._args: unknown[]) => ({ orderId: "order-1", status: "cancelled" as const, cancelledBy: "customer" as const, cooldownUntil: null }));
const mockReplace = jest.fn();
const mockUseOrderSocket = jest.fn((_orderId: string | null) => ({ connected: false }));

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ orderId: "order-1" }),
  useRouter: () => ({ push: jest.fn(), replace: mockReplace }),
}));
jest.mock("../../../../src/api/food-orders", () => ({
  getFoodOrder: (...args: unknown[]) => mockGetFoodOrder(...args),
  respondToFoodOrderItems: (...args: unknown[]) => mockRespondToItems(...args),
  cancelUnpaidFoodOrder: (...args: unknown[]) => mockCancelUnpaid(...args),
  submitFoodPaymentReference: (...args: unknown[]) => mockSubmitReference(...args),
}));
jest.mock("../../../../src/api/restaurants", () => ({
  getRestaurantMenu: async () => ({
    restaurant: { id: "m1", name: "Sadza Republic", coverPhotoUrl: null, logoUrl: null, cuisineTags: [], priceLevel: null, hours: null, location: null },
    categories: [],
  }),
  getRestaurants: async () => ({ restaurants: [] }),
}));
// D3: the post-dispatch tracker fetches the generic order snapshot (rider GPS/pickup/dropoff/events) —
// mocked here to a resolved value the live-tracker tests below override per case.
jest.mock("../../../../src/api/orders", () => ({
  getOrder: (...args: unknown[]) => mockGetOrder(...args),
  cancelOrder: (...args: unknown[]) => mockCancelOrder(...args),
}));
// A-O9: the tracker now joins the order's WS room the same way the parcel screen does — stub the hook
// itself (like use-order-socket.test.tsx already covers its internals) so these tests can assert on the
// GATING contract (which orderId it's called with, and that a connected socket suppresses the poll)
// without standing up a real socket.io-client connection.
jest.mock("../../../../src/realtime/use-order-socket", () => ({
  useOrderSocket: (...args: [string | null]) => mockUseOrderSocket(...args),
}));
// D3: the real LiveTrackingCard mounts react-native-maps, which the other order-screen tracking test
// (live-tracking-isolation.test.tsx) also avoids mounting for the same reason — stub it so these tests
// exercise this SCREEN's own branching (rider-secured banner, status pill, cancel flow), not the map.
jest.mock("../../../../src/ui/order/LiveTrackingCard", () => ({
  LiveTrackingCard: (props: { status: string }) => {
    const React_ = require("react");
    const { Text } = require("react-native");
    return React_.createElement(Text, null, `LiveTrackingCard:${props.status}`);
  },
}));
jest.mock("expo-secure-store", () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
  deleteItemAsync: async () => undefined,
}));

import FoodOrderScreen from "../[orderId]";

/** A `<Text>Foo {bar}</Text>` renders `children` as an ARRAY of parts (["Foo ", bar]), not one
 *  concatenated string — flatten to plain text the way a reader actually sees it before matching. */
function flattenChildren(children: unknown): string {
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(flattenChildren).join("");
  return "";
}

function has(tree: renderer.ReactTestRenderer, text: string | RegExp): boolean {
  return (
    tree.root.findAll((n) => {
      const flat = flattenChildren(n.props.children);
      if (!flat) return false;
      return typeof text === "string" ? flat.includes(text) : text.test(flat);
    }).length > 0
  );
}

function press(tree: renderer.ReactTestRenderer, label: string | RegExp): void {
  const match = (v: unknown): boolean => typeof v === "string" && (typeof label === "string" ? v === label : label.test(v));
  const node = tree.root.findAll((n) => match(n.props.children) || match(n.props.label))[0];
  if (!node) throw new Error(`no node labelled ${String(label)}`);
  let p: typeof node | null = node;
  while (p && typeof p.props.onPress !== "function") p = p.parent;
  if (!p) throw new Error(`no pressable ancestor for ${String(label)}`);
  act(() => p!.props.onPress());
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

// The screen runs a 1s countdown-redraw interval plus react-query's own poll — neither is a jest
// fake timer, so a tree left mounted across tests keeps firing into a later test's (or the fully
// torn-down) environment. Track every tree created and unmount it before the next test starts.
let activeTree: renderer.ReactTestRenderer | null = null;

async function render(): Promise<renderer.ReactTestRenderer> {
  // gcTime: 0 so an unmounted query's cache entry is garbage-collected SYNCHRONOUSLY rather than via
  // a real setTimeout ~5 minutes out (the default) — otherwise that pending timer is an open handle
  // that outlives the test file, since this screen's polling queries are exactly the kind gcTime
  // guards against lingering.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <QueryClientProvider client={client}>
        <FoodOrderScreen />
      </QueryClientProvider>,
    );
  });
  await settle();
  // The restaurant-name lookup is a SECOND, dependent query (disabled until the order query resolves
  // and reveals a merchantId) — one settle() flushes the order fetch; a second flushes the now-enabled
  // menu fetch it triggers.
  await settle();
  activeTree = tree;
  return tree;
}

const BASE_ORDER = {
  id: "order-1",
  merchantId: "m1",
  status: "requested",
  merchantPhase: "awaiting_accept" as string | null,
  items: [] as { dishId: string | null; name: string; priceUsd: number; quantity: number; note: string | null; available: boolean | null }[],
  note: null,
  paymentMethod: "cash" as string | null,
  merchantPaymentPhone: null as string | null,
  merchantGoodsTotal: 15.5,
  deliveryFee: 0,
  total: 15.5,
  acceptDeadlineAt: new Date(Date.now() + 90_000).toISOString(),
  itemApprovalDeadlineAt: null as string | null,
  prepMinutes: null,
  prepStartedAt: null,
  readyAt: null,
  rejectionReason: null as string | null,
  paymentCallLoggedAt: null as string | null,
  paymentRequestedAt: null as string | null,
  merchantPaymentReference: null as string | null,
  merchantPaymentConfirmedAt: null as string | null,
  riderId: null,
  dispatchAttempt: 0,
  dispatchOfferExpiresAt: null,
  noRiderHoldAt: null,
  cashHandshakeAmount: null,
  customerCashConfirmedAt: null,
  riderCashConfirmedAt: null,
  cashHandshakeDeadlineAt: null,
  cashHandshakeFrozenAt: null,
  merchantCashRule: null,
  debtStatus: null,
  debtAmount: null,
  debtOpenedAt: null,
  debtSettledAt: null,
  refundReference: null,
  refundAmount: null,
  refundedAt: null,
};

const BASE_SNAPSHOT = {
  id: "order-1",
  status: "assigned",
  agreedFare: "15.50",
  proposedFare: "15.50",
  pickup: { point: { lat: -17.82, lng: 31.05 }, landmark: "Sadza Republic" },
  dropoff: { point: { lat: -17.83, lng: 31.06 }, landmark: "Home" },
  events: [{ status: "assigned", createdAt: new Date().toISOString() }],
  rider: null,
  counterpartyPhone: null,
};

beforeEach(() => {
  mockGetFoodOrder.mockReset();
  mockRespondToItems.mockClear().mockResolvedValue(undefined);
  mockCancelUnpaid.mockClear().mockResolvedValue(undefined);
  mockSubmitReference.mockClear().mockResolvedValue(undefined);
  mockGetOrder.mockReset().mockResolvedValue(BASE_SNAPSHOT);
  mockCancelOrder.mockClear().mockResolvedValue({ orderId: "order-1", status: "cancelled", cancelledBy: "customer", cooldownUntil: null });
  mockReplace.mockClear();
  mockUseOrderSocket.mockClear().mockReturnValue({ connected: false });
});

afterEach(() => {
  act(() => {
    activeTree?.unmount();
  });
  activeTree = null;
});

describe("food order screen — phase branching", () => {
  it("shows the waiting-for-accept ring while awaiting_accept", async () => {
    mockGetFoodOrder.mockResolvedValue({ ...BASE_ORDER, merchantPhase: "awaiting_accept" });
    const tree = await render();
    expect(has(tree, /Waiting for Sadza Republic/)).toBe(true);
  });

  it("shows the item-approval interrupt with the revised total when the kitchen can't fulfil a line", async () => {
    mockGetFoodOrder.mockResolvedValue({
      ...BASE_ORDER,
      merchantPhase: "awaiting_item_approval",
      itemApprovalDeadlineAt: new Date(Date.now() + 30_000).toISOString(),
      items: [
        { dishId: "d1", name: "Sadza & beef", priceUsd: 5, quantity: 1, note: null, available: true },
        { dishId: "d2", name: "Muriwo une dovi", priceUsd: 2.5, quantity: 1, note: null, available: false },
      ],
    });
    const tree = await render();
    expect(has(tree, /Muriwo une dovi/)).toBe(true);
    press(tree, /Yes — send it without/);
    await settle();
    expect(mockRespondToItems).toHaveBeenCalledWith("order-1", true);
  });

  it("cancelling the whole order on item-approval sends approve:false and returns to browsing", async () => {
    mockGetFoodOrder.mockResolvedValue({
      ...BASE_ORDER,
      merchantPhase: "awaiting_item_approval",
      itemApprovalDeadlineAt: new Date(Date.now() + 30_000).toISOString(),
      items: [{ dishId: "d1", name: "Sadza & beef", priceUsd: 5, quantity: 1, note: null, available: false }],
    });
    const tree = await render();
    press(tree, "Cancel the whole order");
    await settle();
    expect(mockRespondToItems).toHaveBeenCalledWith("order-1", false);
    expect(mockReplace).toHaveBeenCalledWith("/food");
  });

  it("shows the 'they call to confirm' band while awaiting_payment before any request is logged", async () => {
    mockGetFoodOrder.mockResolvedValue({ ...BASE_ORDER, merchantPhase: "awaiting_payment", paymentMethod: "wallet" });
    const tree = await render();
    expect(has(tree, /is calling you/)).toBe(true);
  });

  it("shows the manual-rail pay screen once a payment request has been logged", async () => {
    mockGetFoodOrder.mockResolvedValue({
      ...BASE_ORDER,
      merchantPhase: "awaiting_payment",
      paymentMethod: "wallet",
      paymentCallLoggedAt: new Date().toISOString(),
      paymentRequestedAt: new Date().toISOString(),
      merchantPaymentPhone: "+263771182400",
    });
    const tree = await render();
    expect(has(tree, /merchant number/i)).toBe(true);
    // Displayed in the local trunk-0 form customers actually use for EcoCash — no +263 prefix.
    expect(has(tree, "0771182400")).toBe(true);
  });

  it("submits the customer's own reference via the manual pay screen", async () => {
    mockGetFoodOrder.mockResolvedValue({
      ...BASE_ORDER,
      merchantPhase: "awaiting_payment",
      paymentMethod: "wallet",
      paymentRequestedAt: new Date().toISOString(),
      merchantPaymentPhone: "+263771182400",
    });
    const tree = await render();
    const field = tree.root.findAll((n) => n.props.accessibilityLabel === "Your transaction reference")[0];
    act(() => field!.props.onChangeText("EC240727.1132.A81043"));
    press(tree, "Submit my reference");
    await settle();
    expect(mockSubmitReference).toHaveBeenCalledWith("order-1", "EC240727.1132.A81043");
  });

  it("shows the paid-waiting state once a reference is submitted but not yet merchant-confirmed", async () => {
    mockGetFoodOrder.mockResolvedValue({
      ...BASE_ORDER,
      merchantPhase: "awaiting_payment",
      paymentMethod: "wallet",
      paymentRequestedAt: new Date().toISOString(),
      merchantPaymentReference: "EC240727.1132.A81043",
    });
    const tree = await render();
    expect(has(tree, /waiting for the restaurant/)).toBe(true);
    expect(has(tree, "EC240727.1132.A81043")).toBe(true);
  });

  it("shows the still-unpaid free-cancel reminder once the N-22 window has elapsed", async () => {
    mockGetFoodOrder.mockResolvedValue({
      ...BASE_ORDER,
      merchantPhase: "awaiting_payment",
      paymentMethod: "wallet",
      paymentRequestedAt: new Date(Date.now() - 16 * 60 * 1000).toISOString(),
    });
    const tree = await render();
    expect(has(tree, /is still waiting/)).toBe(true);
    press(tree, "Cancel the order — free");
    await settle();
    expect(mockCancelUnpaid).toHaveBeenCalledWith("order-1");
  });

  it("shows the cancelled terminal with the merchant's own rejection copy", async () => {
    mockGetFoodOrder.mockResolvedValue({ ...BASE_ORDER, status: "cancelled", merchantPhase: null, rejectionReason: "out_of_ingredient" });
    const tree = await render();
    expect(has(tree, /out of an ingredient/)).toBe(true);
  });

  it("shows a confirmed screen once the kitchen has started cooking", async () => {
    mockGetFoodOrder.mockResolvedValue({ ...BASE_ORDER, merchantPhase: "preparing" });
    const tree = await render();
    expect(has(tree, /is cooking your order/)).toBe(true);
  });

  // ── D3 (track) ────────────────────────────────────────────────────────────────────────────────
  it("shows the dispatch-searching card once the kitchen has marked the order ready", async () => {
    mockGetFoodOrder.mockResolvedValue({ ...BASE_ORDER, merchantPhase: "ready_for_pickup", readyAt: new Date().toISOString() });
    const tree = await render();
    expect(has(tree, "Finding a rider nearby")).toBe(true);
  });

  it("shows the muted, non-terminal NO_RIDER hold once the dispatch cap is exhausted", async () => {
    mockGetFoodOrder.mockResolvedValue({ ...BASE_ORDER, merchantPhase: "ready_for_pickup", noRiderHoldAt: new Date().toISOString() });
    const tree = await render();
    expect(has(tree, "This is taking longer than usual")).toBe(true);
  });

  it("shows the D-13 apology (not the generic cancelled card) when NO_RIDER cancels the order", async () => {
    mockGetFoodOrder.mockResolvedValue({ ...BASE_ORDER, status: "cancelled", merchantPhase: null, rejectionReason: "no_rider" });
    const tree = await render();
    expect(has(tree, "We couldn't find a rider")).toBe(true);
    expect(has(tree, /nothing was charged/)).toBe(true);
  });

  it("shows the refunded card, not the generic cancelled card, once a merchant refund lands", async () => {
    mockGetFoodOrder.mockResolvedValue({
      ...BASE_ORDER,
      status: "cancelled",
      merchantPhase: null,
      rejectionReason: "other",
      refundReference: "EC-4471-RF9920",
      refundAmount: 15.5,
      refundedAt: new Date().toISOString(),
    });
    const tree = await render();
    expect(has(tree, "Refunded in full")).toBe(true);
    expect(has(tree, "EC-4471-RF9920")).toBe(true);
  });

  it("shows the rider-secured banner and re-labelled food tracker once a rider is assigned", async () => {
    mockGetFoodOrder.mockResolvedValue({ ...BASE_ORDER, merchantPhase: null, status: "assigned", riderId: "rider-1" });
    const tree = await render();
    await settle();
    expect(has(tree, /Rider secured/)).toBe(true);
    expect(has(tree, "LiveTrackingCard:assigned")).toBe(true);
  });

  it("post-dispatch cancel goes through the generic cancelOrder, with a confirm step", async () => {
    mockGetFoodOrder.mockResolvedValue({ ...BASE_ORDER, merchantPhase: null, status: "en_route_pickup", riderId: "rider-1" });
    const tree = await render();
    await settle();
    press(tree, "Cancel order");
    press(tree, "Yes, cancel this order");
    await settle();
    expect(mockCancelOrder).toHaveBeenCalledWith("order-1");
    expect(mockReplace).toHaveBeenCalledWith("/food");
  });

  it("shows a minimal delivered terminal — D4 owns the doorstep handshake + rating", async () => {
    mockGetFoodOrder.mockResolvedValue({ ...BASE_ORDER, merchantPhase: null, status: "delivered", riderId: "rider-1" });
    const tree = await render();
    expect(has(tree, "Delivered")).toBe(true);
  });

  // ── A-O9: the tracking poll is now socket-gated, mirroring the already-audited parcel/rider-board
  // pattern (A-O1) — no socket exists here before a rider is secured (nothing to track yet), and once
  // one is, the 10s REST poll only runs as the reconnect/offline fallback, not the steady-state path.
  describe("A-O9: order-room socket gates the live-tracker poll", () => {
    it("does not open the order socket before a rider is secured", async () => {
      mockGetFoodOrder.mockResolvedValue({ ...BASE_ORDER, merchantPhase: "preparing" });
      await render();
      expect(mockUseOrderSocket).toHaveBeenLastCalledWith(null);
    });

    it("subscribes to the order's own room, keyed on the order id, once a rider is secured", async () => {
      mockGetFoodOrder.mockResolvedValue({ ...BASE_ORDER, merchantPhase: null, status: "assigned", riderId: "rider-1" });
      await render();
      expect(mockUseOrderSocket).toHaveBeenLastCalledWith("order-1");
    });

    it("drops the subscription again once the order reaches a terminal state", async () => {
      mockGetFoodOrder.mockResolvedValue({ ...BASE_ORDER, merchantPhase: null, status: "delivered", riderId: "rider-1" });
      await render();
      // `trackingEnabled` only requires a riderId (mirrors trackQ's own `enabled` condition) — the
      // socket key follows it, not the terminal status; the query key's OWN refetchInterval gate is
      // what stops the poll on a terminal order, same as before this fix.
      expect(mockUseOrderSocket).toHaveBeenLastCalledWith("order-1");
    });

    it("still renders the live tracker correctly with the order socket already connected", async () => {
      mockUseOrderSocket.mockReturnValue({ connected: true });
      mockGetFoodOrder.mockResolvedValue({ ...BASE_ORDER, merchantPhase: null, status: "assigned", riderId: "rider-1" });
      const tree = await render();
      expect(has(tree, /Rider secured/)).toBe(true);
      expect(has(tree, "LiveTrackingCard:assigned")).toBe(true);
    });
  });
});

// B-O8: the countdown ticker used to run unconditionally for the order's whole lifetime, re-rendering
// this screen once/sec even in phases with no countdown ring to redraw — pure JS-thread churn on
// Go-class hardware. It should now only start while a rendered branch actually reads `now`.
describe("food order screen — B-O8 countdown ticker gating", () => {
  it("does not start the 1s countdown interval once the order is delivered (no branch reads `now`)", async () => {
    const intervalSpy = jest.spyOn(global, "setInterval");
    mockGetFoodOrder.mockResolvedValue({ ...BASE_ORDER, merchantPhase: null, status: "delivered", riderId: "rider-1" });
    await render();
    expect(intervalSpy.mock.calls.some(([, delay]) => delay === 1000)).toBe(false);
    intervalSpy.mockRestore();
  });

  it("does not start the 1s countdown interval while ready_for_pickup (dispatch searching, no ring yet)", async () => {
    const intervalSpy = jest.spyOn(global, "setInterval");
    mockGetFoodOrder.mockResolvedValue({ ...BASE_ORDER, merchantPhase: "ready_for_pickup", readyAt: new Date().toISOString() });
    await render();
    expect(intervalSpy.mock.calls.some(([, delay]) => delay === 1000)).toBe(false);
    intervalSpy.mockRestore();
  });

  it("does not start the 1s countdown interval on the cancelled terminal", async () => {
    const intervalSpy = jest.spyOn(global, "setInterval");
    mockGetFoodOrder.mockResolvedValue({ ...BASE_ORDER, status: "cancelled", merchantPhase: null, rejectionReason: "out_of_ingredient" });
    await render();
    expect(intervalSpy.mock.calls.some(([, delay]) => delay === 1000)).toBe(false);
    intervalSpy.mockRestore();
  });

  it("still starts the 1s countdown interval while awaiting_accept (the accept-deadline ring reads `now`)", async () => {
    const intervalSpy = jest.spyOn(global, "setInterval");
    mockGetFoodOrder.mockResolvedValue({ ...BASE_ORDER, merchantPhase: "awaiting_accept" });
    await render();
    expect(intervalSpy.mock.calls.some(([, delay]) => delay === 1000)).toBe(true);
    intervalSpy.mockRestore();
  });

  it("still starts the 1s countdown interval once a rider is secured (the live tracker reads `now`)", async () => {
    const intervalSpy = jest.spyOn(global, "setInterval");
    mockGetFoodOrder.mockResolvedValue({ ...BASE_ORDER, merchantPhase: null, status: "assigned", riderId: "rider-1" });
    await render();
    expect(intervalSpy.mock.calls.some(([, delay]) => delay === 1000)).toBe(true);
    intervalSpy.mockRestore();
  });
});
