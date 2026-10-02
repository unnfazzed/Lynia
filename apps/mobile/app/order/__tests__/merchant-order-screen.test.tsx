/**
 * Order flow v2 (ledger D-59): `app/order/[id].tsx` renders a MERCHANT (restaurant) order with the
 * handoff's stages on the After Send shell. Mocks the API layer only, so the real food-order polling,
 * stage machine and cash/code rules run. Covers: the stage per phase, the venue header, the free cancel
 * only where the server takes one, the item approval, the door (pay → code only after both confirms),
 * Done with the rider rating, the endings, and no wallet / mobile-money / refund copy anywhere.
 */
import renderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { MerchantOrderResponse } from "@lynia/shared";
import type { OrderSnapshot } from "../../../src/api/orders";

const mockGetFoodOrder = jest.fn();
const mockRespondToItems = jest.fn(async (..._a: unknown[]) => ({}));
const mockCancelUnpaid = jest.fn(async (..._a: unknown[]) => ({}));
const mockConfirmCash = jest.fn(async (..._a: unknown[]) => ({ orderId: "order-1", customerCashConfirmedAt: new Date().toISOString() }));
const mockGetOrder = jest.fn();
const mockCancelOrder = jest.fn(async (..._a: unknown[]) => ({ orderId: "order-1", status: "cancelled", cancelledBy: "customer", cooldownUntil: null }));
const mockRotate = jest.fn(async (..._a: unknown[]) => ({ deliveryCode: "418290" }));
const mockRate = jest.fn(async (..._a: unknown[]) => ({}));
const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  useLocalSearchParams: () => ({ id: "order-1" }),
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
}));
jest.mock("expo-secure-store", () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
  deleteItemAsync: async () => undefined,
}));
jest.mock("../../../src/api/food-orders", () => ({
  getFoodOrder: (...a: unknown[]) => mockGetFoodOrder(...a),
  respondToFoodOrderItems: (...a: unknown[]) => mockRespondToItems(...a),
  cancelUnpaidFoodOrder: (...a: unknown[]) => mockCancelUnpaid(...a),
  confirmFoodCustomerCash: (...a: unknown[]) => mockConfirmCash(...a),
}));
jest.mock("../../../src/api/orders", () => ({
  getOrder: (...a: unknown[]) => mockGetOrder(...a),
  cancelOrder: (...a: unknown[]) => mockCancelOrder(...a),
  rotateDeliveryCode: (...a: unknown[]) => mockRotate(...a),
  rateOrder: (...a: unknown[]) => mockRate(...a),
  notifyWhenRiderOnline: jest.fn(),
  raiseOrderPrice: jest.fn(),
  resendOrder: jest.fn(),
}));
jest.mock("../../../src/api/offers", () => ({ listOffers: async () => [], selectOffer: jest.fn() }));
jest.mock("../../../src/api/safety", () => ({ raiseIssue: jest.fn(async () => ({})), raiseSos: jest.fn(async () => ({})) }));
jest.mock("../../../src/realtime/use-order-socket", () => ({ useOrderSocket: () => ({ connected: false }) }));
jest.mock("../../../src/realtime/use-foreground-refetch", () => ({ useForegroundRefetch: () => undefined }));
jest.mock("../../../src/ui/order/OrderMap", () => ({ OrderMap: () => null, BlankMap: () => null }));
jest.mock("../../../src/ui/orderflow/MerchantMap", () => ({ MerchantMap: () => null }));

import OrderRoute from "../[id]";

const NOW = Date.now();
const iso = (deltaMs: number): string => new Date(NOW + deltaMs).toISOString();

function foodOrder(over: Partial<MerchantOrderResponse> = {}): MerchantOrderResponse {
  return {
    id: "order-1",
    merchantId: "m1",
    status: "requested",
    merchantPhase: "preparing",
    items: [
      { dishId: "d1", name: "Sadza & beef stew", priceUsd: 4.5, quantity: 2, note: "Extra gravy", available: true },
      { dishId: "d2", name: "Roast chicken (half)", priceUsd: 6, quantity: 1, note: null, available: true },
    ],
    note: null,
    paymentMethod: "cash",
    merchantPaymentPhone: null,
    merchantGoodsTotal: 15,
    deliveryFee: 1.5,
    total: 16.5,
    acceptDeadlineAt: null,
    itemApprovalDeadlineAt: null,
    prepMinutes: 20,
    prepStartedAt: iso(-8 * 60_000),
    readyAt: null,
    rejectionReason: null,
    paymentCallLoggedAt: null,
    paymentRequestedAt: null,
    merchantPaymentReference: null,
    merchantPaymentConfirmedAt: null,
    riderId: null,
    dispatchAttempt: 0,
    dispatchOfferExpiresAt: null,
    noRiderHoldAt: null,
    pickupCodeAttempts: 0,
    noShowCallTimestamps: [],
    createdAt: iso(-20 * 60_000),
    ...over,
  };
}

function snapshot(over: Partial<OrderSnapshot> = {}): OrderSnapshot {
  return {
    id: "order-1",
    status: "requested",
    orderType: "merchant",
    merchantName: "Gava’s Kitchen",
    viewerRole: "customer",
    agreedFare: null,
    proposedFare: "1.50",
    pickup: { point: { lat: -17.8292, lng: 31.0522 }, landmark: "Gava’s Kitchen" },
    dropoff: { point: { lat: -17.8105, lng: 31.0705 }, landmark: "12 Lanark Rd" },
    rider: null,
    riderCard: null,
    rating: null,
    events: [{ status: "requested", createdAt: iso(-20 * 60_000) }],
    counterpartyPhone: null,
    expiresAt: null,
    ...over,
  };
}

const RIDER_CARD = { firstName: "Tendai", lastName: "Moyo", photoUrl: null, ratingAvg: 4.8, ratingCount: 40, tripsCount: 132, plate: "ABH 4721", verified: true };

function flatten(children: unknown): string {
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(flatten).join("");
  return "";
}
const allText = (t: renderer.ReactTestRenderer): string =>
  t.root
    .findAll((n) => (n.type as unknown) === "Text")
    .map((n) => flatten(n.props.children))
    .join("\n");
const has = (t: renderer.ReactTestRenderer, s: string | RegExp): boolean => (typeof s === "string" ? allText(t).includes(s) : s.test(allText(t)));
function press(t: renderer.ReactTestRenderer, label: string | RegExp): void {
  const m = (v: unknown): boolean => typeof v === "string" && (typeof label === "string" ? v === label : label.test(v));
  const node = t.root.findAll((n) => m(n.props.accessibilityLabel) && typeof n.props.onPress === "function")[0];
  if (!node) throw new Error(`no button ${String(label)}`);
  act(() => node.props.onPress());
}

let active: renderer.ReactTestRenderer | null = null;
async function render(food: MerchantOrderResponse, snap: OrderSnapshot): Promise<renderer.ReactTestRenderer> {
  mockGetFoodOrder.mockResolvedValue(food);
  mockGetOrder.mockResolvedValue(snap);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <QueryClientProvider client={client}>
        <OrderRoute />
      </QueryClientProvider>,
    );
  });
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
  active = tree;
  return tree;
}

beforeEach(() => {
  jest.clearAllMocks();
});
afterEach(() => {
  act(() => active?.unmount());
  active = null;
});

describe("merchant order — one order screen (D-59)", () => {
  it("T4 cooking: venue in the header, stage title, ETA hero, the four-step track, the prep bar — no cancel the server would refuse", async () => {
    const t = await render(foodOrder(), snapshot());
    expect(has(t, "Gava’s Kitchen")).toBe(true);
    expect(has(t, "Cooking your order")).toBe(true);
    expect(has(t, "Estimated arrival")).toBe(true);
    for (const s of ["Confirmed", "Cooking", "On the way", "Delivered"]) expect(has(t, s)).toBe(true);
    expect(has(t, /about \d+ min left/)).toBe(true);
    expect(has(t, "Cancel order · free")).toBe(false);
  });

  it("T3 waiting: the accept countdown and a free cancel through the unpaid-cancel endpoint", async () => {
    const t = await render(foodOrder({ merchantPhase: "awaiting_accept", acceptDeadlineAt: iso(150_000), prepStartedAt: null }), snapshot());
    expect(has(t, "Waiting for Gava’s Kitchen to accept")).toBe(true);
    expect(has(t, / left$/m)).toBe(true);
    press(t, "Cancel order · free");
    expect(has(t, "Cancel this order?")).toBe(true);
    press(t, "Cancel order");
    await act(async () => undefined);
    expect(mockCancelUnpaid).toHaveBeenCalledWith("order-1");
    expect(mockCancelOrder).not.toHaveBeenCalled();
  });

  it("T2 confirming: auto-accepted, kitchen not confirmed — step 1 and a free cancel", async () => {
    const t = await render(foodOrder({ autoAccepted: true, kitchenConfirmedAt: null }), snapshot());
    expect(has(t, "Gava’s Kitchen is confirming")).toBe(true);
    expect(has(t, "Cancel order · free")).toBe(true);
  });

  it("U2: the kitchen took a line off — the removal card, the new total, and the existing approve / decline", async () => {
    const items = [...foodOrder().items, { dishId: "d3", name: "Mazoe orange 2L", priceUsd: 3.2, quantity: 1, note: null, available: false }];
    const t = await render(foodOrder({ merchantPhase: "awaiting_item_approval", itemApprovalDeadlineAt: iso(50_000), items }), snapshot());
    expect(has(t, "Gava’s Kitchen needs your answer")).toBe(true);
    expect(has(t, "Out of Mazoe orange 2L")).toBe(true);
    expect(has(t, "Will be removed")).toBe(true);
    expect(has(t, "$19.70")).toBe(true);
    press(t, "Confirm changes · New total $16.50");
    await act(async () => undefined);
    expect(mockRespondToItems).toHaveBeenCalledWith("order-1", true);
    press(t, "Cancel the whole order — free");
    await act(async () => undefined);
    expect(mockRespondToItems).toHaveBeenCalledWith("order-1", false);
  });

  it("T6: a rider heading to the venue — the rider card, no delivery code yet (cash: code only after both confirms)", async () => {
    const t = await render(
      foodOrder({ status: "en_route_pickup", merchantPhase: null, riderId: "0a1b2c3d-0000-4000-8000-000000000003" }),
      snapshot({ status: "en_route_pickup", riderCard: RIDER_CARD, rider: { profileId: "r", currentLat: -17.84, currentLng: 31.04, updatedAt: iso(-3_000) } }),
    );
    expect(has(t, "Rider on the way to Gava’s Kitchen")).toBe(true);
    expect(has(t, "Tendai M.")).toBe(true);
    expect(has(t, "Delivery code")).toBe(false);
    expect(mockRotate).not.toHaveBeenCalled();
  });

  it("T12a: no fix — no ETA, only the sentence", async () => {
    const t = await render(
      foodOrder({ status: "assigned", merchantPhase: null, riderId: "0a1b2c3d-0000-4000-8000-000000000003" }),
      snapshot({ status: "assigned", riderCard: RIDER_CARD, rider: { profileId: "r", currentLat: null, currentLng: null, updatedAt: null } }),
    );
    expect(has(t, "Tendai is heading to Gava’s Kitchen")).toBe(true);
    expect(has(t, "Arrival time shows once the rider’s phone sends a location")).toBe(true);
    expect(has(t, "Estimated arrival")).toBe(false);
  });

  it("P1: at the door — pay first; the code is not fetched before both cash confirms", async () => {
    const near = { profileId: "r", currentLat: -17.8106, currentLng: 31.0705, updatedAt: iso(-2_000) };
    const t = await render(
      foodOrder({ status: "en_route_dropoff", merchantPhase: null, riderId: "0a1b2c3d-0000-4000-8000-000000000003" }),
      snapshot({ status: "en_route_dropoff", riderCard: RIDER_CARD, rider: near, counterpartyPhone: "+263771234580" }),
    );
    expect(has(t, "Rider is at your door")).toBe(true);
    expect(has(t, "Take your order")).toBe(true);
    expect(has(t, "Tendai hands it over first")).toBe(true);
    expect(has(t, "Shows here once you and Tendai both confirm the cash")).toBe(true);
    expect(mockRotate).not.toHaveBeenCalled();
    press(t, "I’ve paid $16.50");
    await act(async () => undefined);
    expect(mockConfirmCash).toHaveBeenCalledWith("order-1");
  });

  it("P2: both confirmed — the code is issued and shown 3+3 on the forest panel", async () => {
    const t = await render(
      foodOrder({ status: "en_route_dropoff", merchantPhase: null, riderId: "0a1b2c3d-0000-4000-8000-000000000003", customerCashConfirmedAt: iso(-60_000), riderCashConfirmedAt: iso(-30_000) }),
      snapshot({ status: "en_route_dropoff", riderCard: RIDER_CARD, rider: { profileId: "r", currentLat: -17.83, currentLng: 31.05, updatedAt: iso(-2_000) } }),
    );
    expect(mockRotate).toHaveBeenCalledWith("order-1");
    for (let i = 0; i < 2; i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
    expect(has(t, "418")).toBe(true);
    expect(has(t, "290")).toBe(true);
    expect(has(t, "Delivery code")).toBe(true);
    expect(has(t, "Share code")).toBe(true);
  });

  it("D1: delivered — hero, the rider rating (no venue row until the backend has one), the receipt, Order again", async () => {
    const t = await render(
      foodOrder({ status: "delivered", merchantPhase: null, riderId: "0a1b2c3d-0000-4000-8000-000000000003", deliveredAt: iso(-60_000) }),
      snapshot({ status: "delivered", riderCard: RIDER_CARD }),
    );
    expect(has(t, /^Delivered \d\d:\d\d$/m)).toBe(true);
    expect(has(t, "$16.50 paid in cash · Gava’s Kitchen")).toBe(true);
    expect(has(t, "How was Tendai?")).toBe(true);
    expect(has(t, "How was Gava’s Kitchen?")).toBe(false);
    expect(has(t, "Receipt")).toBe(true);
    expect(has(t, "Paid in cash to Tendai")).toBe(true);
    press(t, "4 stars, Good");
    press(t, "Send rating");
    expect(has(t, "You rated")).toBe(true);
    press(t, "Order again");
    expect(mockPush).toHaveBeenCalledWith("/food/m1");
  });

  it("D3d: no rider found — the apology ending, nothing charged", async () => {
    const t = await render(foodOrder({ status: "cancelled", merchantPhase: null, rejectionReason: "no_rider" }), snapshot({ status: "cancelled", cancelledBy: null }));
    expect(has(t, "We couldn’t find a rider")).toBe(true);
    expect(has(t, "No charge")).toBe(true);
  });

  it("D3a: you cancelled", async () => {
    const t = await render(foodOrder({ status: "cancelled", merchantPhase: null }), snapshot({ status: "cancelled", cancelledBy: "customer" }));
    expect(has(t, "You cancelled this order")).toBe(true);
    expect(has(t, "Nothing was charged.")).toBe(true);
  });

  it("cash only: no wallet, mobile-money or refund copy, and no 4-digit code, in any stage", async () => {
    const stages: [MerchantOrderResponse, OrderSnapshot][] = [
      [foodOrder({ merchantPhase: "awaiting_payment", paymentMethod: "wallet" }), snapshot()],
      [foodOrder({ status: "cancelled", merchantPhase: null, paymentMethod: "wallet", refundedAt: iso(-1000), refundReference: "EC-4471-RF9920", refundAmount: 15 }), snapshot({ status: "cancelled" })],
      [foodOrder({ status: "delivered", merchantPhase: null, paymentMethod: "cash" }), snapshot({ status: "delivered", riderCard: RIDER_CARD })],
    ];
    for (const [f, s] of stages) {
      const t = await render(f, s);
      const text = allText(t);
      expect(text).not.toMatch(/wallet|mobile money|ecocash|innbucks|refund|EC-/i);
      act(() => t.unmount());
      active = null;
    }
  });
});
