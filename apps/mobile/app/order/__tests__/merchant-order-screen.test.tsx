/**
 * Order flow v2 (ledger D-59): `app/order/[id].tsx` renders a MERCHANT (restaurant) order with the
 * handoff's stages on the After Send shell. Mocks the API layer only, so the real food-order polling,
 * stage machine and cash/code rules run. Covers: the stage per phase, the venue header, the free cancel
 * only where the server takes one, the item approval, the door (pay → code only after both confirms),
 * Done with the rider rating, the endings, and no wallet / mobile-money / refund copy anywhere.
 */
import renderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { MerchantOrderResponse, SubstitutionRoundView } from "@lynia/shared";
import type { OrderSnapshot } from "../../../src/api/orders";

const mockGetFoodOrder = jest.fn();
const mockRespondToItems = jest.fn(async (..._a: unknown[]) => ({}));
const mockCancelUnpaid = jest.fn(async (..._a: unknown[]) => ({}));
const mockConfirmSub = jest.fn(async (..._a: unknown[]) => ({}));
const mockRateVenue = jest.fn(async (..._a: unknown[]) => ({ score: 5, tags: [], at: new Date().toISOString() }));
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
  confirmFoodSubstitution: (...a: unknown[]) => mockConfirmSub(...a),
  rateFoodVenue: (...a: unknown[]) => mockRateVenue(...a),
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

function subLine(over: Partial<SubstitutionRoundView["lines"][number]> = {}): SubstitutionRoundView["lines"][number] {
  return {
    id: "b0000000-0000-4000-8000-000000000001",
    itemId: "c0000000-0000-4000-8000-000000000001",
    action: "swap",
    name: "Bread (Lobels 700g)",
    priceUsd: 1.1,
    quantity: 1,
    newQuantity: null,
    swapDishId: "d0000000-0000-4000-8000-000000000001",
    swapName: "Bakers Inn 700g",
    swapPriceUsd: 1.2,
    swapQuantity: 1,
    swapPhotoUrl: null,
    answer: null,
    ...over,
  };
}
function round(over: Partial<SubstitutionRoundView> = {}): SubstitutionRoundView {
  return {
    id: "a0000000-0000-4000-8000-000000000001",
    kind: "at_accept",
    status: "open",
    createdAt: iso(-19_000),
    deadlineAt: iso(161_000),
    resolvedAt: null,
    lines: [subLine()],
    wasTotal: 16.1,
    keptSubtotal: 13.5,
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
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
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

  // U11 (2026-10-07): the D-34 no-rider hold had no customer exit — T11a/T11b draw "Cancel order · free".
  it("U11 T11a: food ready, slow rider search — no cancel while dispatch is still searching", async () => {
    const t = await render(foodOrder({ merchantPhase: "ready_for_pickup", readyAt: iso(-60_000), noRiderHoldAt: null }), snapshot());
    expect(has(t, "Finding a rider is taking longer")).toBe(true);
    expect(has(t, "Cancel order · free")).toBe(false);
  });

  it("U11 T11a: in the no-rider hold, the drawn free cancel goes through the unpaid-cancel endpoint", async () => {
    const t = await render(foodOrder({ merchantPhase: "ready_for_pickup", readyAt: iso(-8 * 60_000), noRiderHoldAt: iso(-60_000), dispatchAttempt: 6 }), snapshot());
    expect(has(t, "Finding a rider is taking longer")).toBe(true);
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

  it("U2a: a v2 swap round — the countdown, the sub-line, Confirm disabled until the swap is answered, then the live total", async () => {
    const t = await render(foodOrder({ merchantPhase: "awaiting_item_approval", itemApprovalDeadlineAt: iso(161_000), total: 15, substitution: round() }), snapshot());
    expect(has(t, "Gava’s Kitchen needs your answer")).toBe(true);
    expect(has(t, "Answer in 3 min. If you don’t, swaps are declined, those items are taken off and the order carries on.")).toBe(true);
    expect(has(t, "Swap for Bakers Inn 700g")).toBe(true);
    expect(has(t, "+$0.10")).toBe(true);
    expect(has(t, "Answer the swap to confirm")).toBe(true);
    const confirm = (): renderer.ReactTestInstance => t.root.findAll((n) => typeof n.props.accessibilityLabel === "string" && n.props.accessibilityLabel.startsWith("Confirm changes") && typeof n.props.onPress === "function")[0]!;
    expect(confirm().props.disabled).toBe(true);
    press(t, "Accept swap");
    expect(has(t, "Answer the swap to confirm")).toBe(false);
    expect(confirm().props.accessibilityLabel).toBe("Confirm changes · New total $16.20");
    press(t, "Confirm changes · New total $16.20");
    await act(async () => undefined);
    expect(mockConfirmSub).toHaveBeenCalledWith("order-1", { roundId: "a0000000-0000-4000-8000-000000000001", answers: [{ lineId: "b0000000-0000-4000-8000-000000000001", accept: true }] });
    expect(mockRespondToItems).not.toHaveBeenCalled();
  });

  it("U2b: three lines — a removal is announced, each swap answered, New total $8.20; Cancel the whole order is free", async () => {
    const lines = [
      subLine({ id: "b0000000-0000-4000-8000-000000000001" }),
      subLine({ id: "b0000000-0000-4000-8000-000000000002", action: "remove", name: "Mazoe orange 2L", priceUsd: 3.2, swapName: null, swapPriceUsd: null, swapQuantity: null }),
      subLine({ id: "b0000000-0000-4000-8000-000000000003", name: "Cooking oil 2L", priceUsd: 4.8, swapName: "Olivine cooking oil 2L", swapPriceUsd: 5 }),
    ];
    const t = await render(foodOrder({ merchantPhase: "awaiting_item_approval", substitution: round({ lines, keptSubtotal: 5.5 }) }), snapshot());
    expect(has(t, "Will be removed")).toBe(true);
    expect(has(t, "−$3.20")).toBe(true);
    // One press handler per button (the composite and its host node share it).
    const buttons = (label: string): (() => void)[] => [...new Set(t.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === "function").map((n) => n.props.onPress as () => void))];
    const accepts = buttons("Accept swap");
    const removes = buttons("Remove it");
    expect(accepts.length).toBe(2);
    act(() => accepts[0]!());
    act(() => removes[1]!());
    expect(has(t, "$8.20")).toBe(true);
    press(t, "Confirm changes · New total $8.20");
    await act(async () => undefined);
    expect(mockConfirmSub).toHaveBeenCalledWith("order-1", {
      roundId: "a0000000-0000-4000-8000-000000000001",
      answers: [
        { lineId: "b0000000-0000-4000-8000-000000000001", accept: true },
        { lineId: "b0000000-0000-4000-8000-000000000003", accept: false },
      ],
    });
    press(t, "Cancel the whole order — free");
    await act(async () => undefined);
    expect(mockCancelUnpaid).toHaveBeenCalledWith("order-1");
  });

  it("U4a: a mid-prep change uses the same card", async () => {
    const t = await render(foodOrder({ substitution: round({ kind: "mid_prep" }) }), snapshot());
    expect(has(t, "Gava’s Kitchen wants to change your order")).toBe(true);
    expect(has(t, "It’s already cooking. Answer in 3 min — no answer keeps your order as it was, minus anything they can’t supply.")).toBe(true);
    expect(has(t, "Accept swap")).toBe(true);
  });

  it("U3: no answer in time — the order carries on, the change is said under the track", async () => {
    const t = await render(
      foodOrder({ total: 15.4, substitution: round({ status: "timed_out", resolvedAt: iso(-5_000), lines: [subLine({ answer: "remove" })] }) }),
      snapshot(),
    );
    expect(has(t, "Cooking your order")).toBe(true);
    expect(has(t, "Changes: Bread (Lobels 700g) taken off · −$1.10")).toBe(true);
    expect(has(t, "No answer in time. Bread (Lobels 700g) taken off — your order carries on. New total $15.40.")).toBe(true);
  });

  it("U4b: a reduce-only change is announced — nothing to answer", async () => {
    const t = await render(
      foodOrder({ total: 12.9, substitution: round({ status: "applied", deadlineAt: null, resolvedAt: iso(-5_000), lines: [subLine({ action: "remove", name: "Mazoe orange 2L", priceUsd: 3.2, swapName: null, swapPriceUsd: null, swapQuantity: null })] }) }),
      snapshot(),
    );
    expect(has(t, "Gava’s Kitchen took off Mazoe orange 2L — they ran out. New total $12.90. Nothing to answer.")).toBe(true);
    expect(has(t, "Accept swap")).toBe(false);
  });

  it("legacy: an item approval without a v2 round keeps the 60 s path", async () => {
    const items = [...foodOrder().items, { dishId: "d3", name: "Mazoe orange 2L", priceUsd: 3.2, quantity: 1, note: null, available: false }];
    const t = await render(foodOrder({ merchantPhase: "awaiting_item_approval", itemApprovalDeadlineAt: iso(50_000), items }), snapshot());
    expect(has(t, "Answer in 3 min. If you don’t, swaps are declined, those items are taken off and the order carries on.")).toBe(false);
    expect(has(t, "Will be removed")).toBe(true);
  });

  it("T8: collected — the sealed-bag photo row leads while fresh; View opens the viewer (T8b)", async () => {
    const t = await render(
      foodOrder({ status: "picked_up", merchantPhase: null, riderId: "r", pickupProof: { photoUrl: "https://example.invalid/bag.jpg", takenAt: iso(-60_000), bagSealed: true } }),
      snapshot({ status: "picked_up", riderCard: RIDER_CARD, rider: { profileId: "r", currentLat: -17.82, currentLng: 31.06, updatedAt: iso(-2_000) } }),
    );
    expect(has(t, "Collected · sealed bag photo")).toBe(true);
    expect(has(t, /^Tendai took this at \d\d:\d\d at Gava’s Kitchen$/m)).toBe(true);
    press(t, "View");
    expect(has(t, "Sealed bag photo")).toBe(true);
  });

  it("server track: the step comes from the read's track when present", async () => {
    const t = await render(foodOrder({ merchantPhase: "awaiting_accept", acceptDeadlineAt: iso(150_000), track: { step: "making", index: 1, rxChecked: false } }), snapshot());
    expect(t.root.findAll((n) => n.props.accessibilityLabel === "Step 2 of 4, Cooking").length).toBeGreaterThan(0);
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

  it("B4: support resolved a frozen handshake (both confirms, the freeze kept as a record) — the code is issued", async () => {
    const t = await render(
      foodOrder({ status: "en_route_dropoff", merchantPhase: null, riderId: "0a1b2c3d-0000-4000-8000-000000000003", customerCashConfirmedAt: iso(-300_000), cashHandshakeFrozenAt: iso(-120_000), riderCashConfirmedAt: iso(-30_000) }),
      snapshot({ status: "en_route_dropoff", riderCard: RIDER_CARD, rider: { profileId: "r", currentLat: -17.83, currentLng: 31.05, updatedAt: iso(-2_000) } }),
    );
    expect(mockRotate).toHaveBeenCalledWith("order-1");
    for (let i = 0; i < 2; i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
    expect(has(t, "Delivery code")).toBe(true);
    expect(has(t, "418")).toBe(true);
  });

  // ── round 3: per service, scheduled, Rx (README "Per service", BRIEF §12–13) ──
  const SHOP = { name: "Avondale Fresh", businessType: "shop" as const, shopKind: "grocery" };
  const PHARMACY = { name: "Avondale Pharmacy", businessType: "shop" as const, shopKind: "pharmacy" };

  it("T3 / T5a: a shop speaks Packing and items — waiting for the 3-minute accept, then packing", async () => {
    const t = await render(foodOrder({ venue: SHOP, merchantPhase: "awaiting_accept", acceptDeadlineAt: iso(150_000), prepStartedAt: null }), snapshot());
    expect(has(t, "Waiting for Avondale Fresh to accept")).toBe(true);
    expect(has(t, "Packing")).toBe(true);
    expect(has(t, "Cooking")).toBe(false);
    act(() => t.unmount());
    active = null;
    const p = await render(foodOrder({ venue: SHOP }), snapshot());
    expect(has(p, "Packing your order")).toBe(true);
    expect(has(p, /3 items · \$16\.50 cash/)).toBe(true);
  });

  it("T5b / P1s: a pharmacy notes the seal while packing and asks to check it at the door", async () => {
    const t = await render(foodOrder({ venue: PHARMACY }), snapshot());
    expect(has(t, "Packing your order")).toBe(true);
    expect(has(t, "The pharmacy seals the bag. Check the seal before you pay.")).toBe(true);
    act(() => t.unmount());
    active = null;
    const d = await render(
      foodOrder({ venue: PHARMACY, status: "en_route_dropoff", merchantPhase: null, riderId: "0a1b2c3d-0000-4000-8000-000000000003" }),
      snapshot({ status: "en_route_dropoff", riderCard: RIDER_CARD, rider: { profileId: "r", currentLat: -17.8105, currentLng: 31.0705, updatedAt: iso(-3000) } }),
    );
    expect(has(d, "Check the seal is unbroken before you pay")).toBe(true);
  });

  it("T13a: Scheduled — the slot, when the venue starts, a free cancel and Change time", async () => {
    const slot = new Date(NOW + 86_400_000);
    slot.setHours(12, 30, 0, 0);
    const rings = new Date(slot.getTime() - 25 * 60_000);
    const t = await render(foodOrder({ merchantPhase: "awaiting_accept", prepStartedAt: null, scheduledFor: slot.toISOString(), ringsAt: rings.toISOString(), scheduleStartedAt: null }), snapshot());
    expect(has(t, "Scheduled for tomorrow 12:30–13:00")).toBe(true);
    expect(has(t, "Gava’s Kitchen starts cooking at 12:05. Free to cancel until then.")).toBe(true);
    expect(has(t, "Cancel order · free")).toBe(true);
    expect(has(t, "Change time")).toBe(true);
  });

  it("T13b: a scheduled order the venue started — '{v} started cooking' and the slot as the arrival", async () => {
    const slot = new Date(NOW + 30 * 60_000);
    const t = await render(foodOrder({ scheduledFor: slot.toISOString(), scheduleStartedAt: iso(-60_000), ringsAt: iso(-60_000) }), snapshot());
    expect(has(t, "Gava’s Kitchen started cooking")).toBe(true);
  });

  it("T5c / D5a / D5b: the pharmacist's check, a decline that carries on (cancel the rest free), the cancelled ending", async () => {
    const rxLine = { itemId: "0a1b2c3d-0000-4000-8000-0000000004a0", dishId: "0a1b2c3d-0000-4000-8000-0000000005a0", name: "Amoxicillin 500mg (21 caps)", priceUsd: 4.2, quantity: 1, note: null, available: false, rxRequired: true };
    const t = await render(foodOrder({ venue: PHARMACY, prescription: { status: "pending", patientName: "Rudo", pageCount: 1 } }), snapshot());
    expect(has(t, "Pharmacist is checking your prescription")).toBe(true);
    act(() => t.unmount());
    active = null;
    const base = foodOrder({ venue: PHARMACY });
    const d = await render(
      foodOrder({ venue: PHARMACY, items: [rxLine, ...base.items], prescription: { status: "declined", patientName: "Rudo", pageCount: 1, declineReason: "expired", declineNote: "dated March 2026" } }),
      snapshot(),
    );
    expect(has(d, "Your prescription wasn’t approved")).toBe(true);
    expect(has(d, "Expired · dated March 2026")).toBe(true);
    expect(has(d, "Amoxicillin 500mg (21 caps) is taken off. The rest of your order is being packed — new total $16.50.")).toBe(true);
    press(d, "Cancel the rest — free");
    await act(async () => undefined);
    expect(mockCancelUnpaid).toHaveBeenCalledWith("order-1");
    act(() => d.unmount());
    active = null;
    const e = await render(
      foodOrder({ venue: PHARMACY, status: "cancelled", merchantPhase: null, prescription: { status: "declined", patientName: "Rudo", pageCount: 1, declineReason: "expired" } }),
      snapshot({ status: "cancelled", cancelledBy: "customer" }),
    );
    expect(has(e, "Order cancelled")).toBe(true);
    expect(has(e, "See other pharmacies")).toBe(true);
    expect(has(e, "Prescription checked")).toBe(false);
  });

  it("track: pharmacy step 1 reads 'Prescription checked' once the Rx was approved", async () => {
    const t = await render(foodOrder({ venue: PHARMACY, prescription: { status: "approved", patientName: "Rudo", pageCount: 1 } }), snapshot());
    expect(has(t, "Prescription checked")).toBe(true);
  });

  it("C9 (U35/U37): the delivered hero and receipt Total are the server's one amountDueUsd; with nothing carried the rows add up to it", async () => {
    const delivered = { status: "delivered", merchantPhase: null, riderId: "0a1b2c3d-0000-4000-8000-000000000003", deliveredAt: iso(-60_000), shortId: "A1B2", itemsSubtotal: 15, smallOrderFee: 0 } as const;
    // The handshake collected $18.50 (the agreed total plus a carried $2.00): the receipt says so, not a
    // total rebuilt on the phone.
    const t = await render(foodOrder({ ...delivered, total: 16.5, amountDueUsd: 18.5, previousBalanceUsd: 2 }), snapshot({ status: "delivered", riderCard: RIDER_CARD }));
    expect(has(t, "$18.50 paid in cash · Gava’s Kitchen")).toBe(true);
    expect(has(t, "$18.50")).toBe(true);
    act(() => t.unmount());
    active = null;
    await act(async () => undefined);

    // Nothing carried: Food $15.00 + Delivery fee $1.50 = Total $16.50.
    const u = await render(foodOrder({ ...delivered, amountDueUsd: 16.5 }), snapshot({ status: "delivered", riderCard: RIDER_CARD }));
    expect(has(u, "$15.00")).toBe(true);
    expect(has(u, "$1.50")).toBe(true);
    expect(has(u, "$16.50 paid in cash · Gava’s Kitchen")).toBe(true);
  });

  it("D1: delivered — hero, the two-row rating (venue + rider), the receipt, Order again; D1b toast + Undo", async () => {
    const t = await render(
      foodOrder({ status: "delivered", merchantPhase: null, riderId: "0a1b2c3d-0000-4000-8000-000000000003", deliveredAt: iso(-60_000), shortId: "A1B2", itemsSubtotal: 15, smallOrderFee: 0 }),
      snapshot({ status: "delivered", riderCard: RIDER_CARD }),
    );
    expect(has(t, /^Delivered \d\d:\d\d$/m)).toBe(true);
    expect(has(t, "$16.50 paid in cash · Gava’s Kitchen")).toBe(true);
    expect(has(t, "How was Tendai?")).toBe(true);
    expect(has(t, "How was Gava’s Kitchen?")).toBe(true);
    expect(has(t, "Receipt")).toBe(true);
    expect(has(t, "Order #A1B2")).toBe(true);
    expect(has(t, "Paid in cash to Tendai")).toBe(true);
    const fives = t.root.findAll((n) => n.props.accessibilityLabel === "5 stars, Great" && typeof n.props.onPress === "function");
    act(() => fives[0]!.props.onPress());
    expect(has(t, "Tasty")).toBe(true);
    press(t, "Tasty");
    const fours = t.root.findAll((n) => n.props.accessibilityLabel === "4 stars, Good" && typeof n.props.onPress === "function");
    act(() => fours[fours.length - 1]!.props.onPress());
    press(t, "Send rating");
    expect(has(t, "Thanks — you rated Gava’s Kitchen ★5 and Tendai ★4.")).toBe(true);
    expect(has(t, "You rated")).toBe(true);
    // Undo: nothing is sent.
    press(t, /^Undo/);
    expect(has(t, "How was Gava’s Kitchen?")).toBe(true);
    // Rate again and leave: the armed rating is sent on the way out.
    act(() => t.root.findAll((n) => n.props.accessibilityLabel === "5 stars, Great" && typeof n.props.onPress === "function")[0]!.props.onPress());
    press(t, "Send rating");
    press(t, "Order again");
    expect(mockPush).toHaveBeenCalledWith("/food/m1");
    act(() => t.unmount());
    active = null;
    await act(async () => undefined);
    expect(mockRateVenue).toHaveBeenCalledWith("order-1", { score: 5, tags: ["tasty"] });
    expect(mockRate).toHaveBeenCalledWith("order-1", { score: 4 });
  });

  it("D1 low stars: the venue row offers the problem tags", async () => {
    const t = await render(
      foodOrder({ status: "delivered", merchantPhase: null, riderId: "0a1b2c3d-0000-4000-8000-000000000003", deliveredAt: iso(-60_000) }),
      snapshot({ status: "delivered", riderCard: RIDER_CARD }),
    );
    act(() => t.root.findAll((n) => n.props.accessibilityLabel === "2 stars, Poor" && typeof n.props.onPress === "function")[0]!.props.onPress());
    expect(has(t, "Cold")).toBe(true);
    expect(has(t, "Tasty")).toBe(false);
  });

  it("D1b: both already rated on the server — two \"You rated\" rows, no rating card", async () => {
    const t = await render(
      foodOrder({ status: "completed", merchantPhase: null, riderId: "r", deliveredAt: iso(-60_000), venueRating: { score: 5, tags: [], at: iso(-1000) } }),
      snapshot({ status: "completed", riderCard: RIDER_CARD, rating: { score: 4 } as OrderSnapshot["rating"] }),
    );
    expect(allText(t).match(/You rated/g)?.length).toBe(2);
    expect(has(t, "How was Gava’s Kitchen?")).toBe(false);
  });

  it("P5: the door photo when the code couldn't be used — row, hero line, viewer", async () => {
    const t = await render(
      foodOrder({
        status: "delivered",
        merchantPhase: null,
        riderId: "r",
        deliveredAt: iso(-60_000),
        doorProof: { photoUrl: "https://example.invalid/door.jpg", takenAt: iso(-90_000), reason: "left_at_gate", handedTo: "Chipo" },
      }),
      snapshot({ status: "delivered", riderCard: RIDER_CARD }),
    );
    expect(has(t, "Delivery photo")).toBe(true);
    expect(has(t, /^Left with Chipo at the gate · \d\d:\d\d$/m)).toBe(true);
    expect(has(t, "Left with Chipo at the gate — you agreed with Tendai.")).toBe(true);
    press(t, "View");
    expect(t.root.findAll((n) => n.props.visible === true && n.props.animationType === "fade").length).toBeGreaterThan(0);
  });

  it("T15b: after collection the cancel costs the full total — through the generic cancel", async () => {
    const t = await render(
      foodOrder({ status: "en_route_dropoff", merchantPhase: null, riderId: "r" }),
      snapshot({ status: "en_route_dropoff", riderCard: RIDER_CARD, rider: { profileId: "r", currentLat: -17.83, currentLng: 31.05, updatedAt: iso(-2_000) } }),
    );
    press(t, "Cancel order");
    expect(has(t, "Tendai already has your order. Cancelling now costs the full $16.50 — the kitchen has made it and the rider has carried it.")).toBe(true);
    press(t, "Cancel and pay $16.50");
    await act(async () => undefined);
    expect(mockCancelOrder).toHaveBeenCalledWith("order-1", {});
    expect(mockCancelUnpaid).not.toHaveBeenCalled();
  });

  it("D3f: cancelled after pickup — the owed line from the server", async () => {
    const t = await render(
      foodOrder({ status: "cancelled", merchantPhase: null, riderId: "r", owedUsd: 16.5 }),
      snapshot({ status: "cancelled", cancelledBy: "customer", riderCard: RIDER_CARD, events: [{ status: "requested", createdAt: iso(-60_000) }, { status: "picked_up", createdAt: iso(-30_000) }] }),
    );
    expect(has(t, "You cancelled after pickup")).toBe(true);
    expect(has(t, "You owe $16.50 — pay it on your next order.")).toBe(true);
    expect(has(t, "$16.50 owed")).toBe(true);
    expect(has(t, "No charge")).toBe(false);
  });

  it("U5: everything out of stock — cancelled, nothing charged", async () => {
    const t = await render(foodOrder({ status: "cancelled", merchantPhase: null, rejectionReason: "all_out_of_stock" }), snapshot({ status: "cancelled", cancelledBy: null }));
    expect(has(t, "Gava’s Kitchen couldn’t supply anything in your order")).toBe(true);
    expect(has(t, "They’re out of every item. Your order is cancelled and nothing was charged.")).toBe(true);
    expect(has(t, "No charge")).toBe(true);
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
