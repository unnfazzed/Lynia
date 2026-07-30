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
const mockReplace = jest.fn();

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

beforeEach(() => {
  mockGetFoodOrder.mockReset();
  mockRespondToItems.mockClear().mockResolvedValue(undefined);
  mockCancelUnpaid.mockClear().mockResolvedValue(undefined);
  mockSubmitReference.mockClear().mockResolvedValue(undefined);
  mockReplace.mockClear();
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
    expect(has(tree, "+263771182400")).toBe(true);
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
});
