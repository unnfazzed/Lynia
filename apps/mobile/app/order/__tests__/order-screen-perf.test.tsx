/**
 * Customer review 2026-10-07 — the order screen's speed fixes, driven through the real route (`app/order/[id].tsx`)
 * with only the API / router / storage / socket edges mocked:
 *  - P42: a rider GPS push re-renders the map leaf, never the screen (`selectParcelGlance` + `LiveOrderMap`).
 *  - P24: Cancel writes the server's answer into the cache — the cancelled ending shows before any refetch.
 *  - P25: "Send again at $X" seeds the clone's snapshot, so the new screen paints at once.
 *  - P34: a running order the Orders tab / Home hold opens on that copy, not on the opening skeleton.
 *  - P13: `k=m` (an Orders tab merchant row) mounts the merchant screen at once and its two reads run in
 *    parallel — the food read doesn't wait for the generic snapshot.
 *
 * "Screen renders" are counted through `useReduceMotion`, which the screen (and its sheet) call on every
 * render while the map leaf never does.
 */
import renderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { MerchantOrderResponse } from "@lynia/shared";
import type { OrderSnapshot } from "../../../src/api/orders";

const mockGetOrder = jest.fn<Promise<OrderSnapshot>, [string]>();
const mockCancelOrder = jest.fn();
const mockResendOrder = jest.fn();
const mockGetFoodOrder = jest.fn();
const mockReplace = jest.fn();
const mockParams: { id: string; k?: string } = { id: "order-1" };
const mockMapProps: Array<Record<string, unknown>> = [];
const mockMerchantMapProps: Array<Record<string, unknown>> = [];
let mockScreenRenders = 0;

jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), back: jest.fn(), canGoBack: () => true }),
}));
jest.mock("expo-secure-store", () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
  deleteItemAsync: async () => undefined,
}));
jest.mock("../../../src/api/orders", () => ({
  getOrder: (...args: [string]) => mockGetOrder(...args),
  cancelOrder: (...args: unknown[]) => mockCancelOrder(...args),
  resendOrder: (...args: unknown[]) => mockResendOrder(...args),
  notifyWhenRiderOnline: jest.fn(),
  rateOrder: jest.fn(),
  rotateDeliveryCode: jest.fn(async () => ({ deliveryCode: "418290" })),
  raiseOrderPrice: jest.fn(),
}));
jest.mock("../../../src/api/food-orders", () => ({
  getFoodOrder: (...a: unknown[]) => mockGetFoodOrder(...a),
  respondToFoodOrderItems: jest.fn(),
  cancelUnpaidFoodOrder: jest.fn(),
  confirmFoodCustomerCash: jest.fn(),
  confirmFoodSubstitution: jest.fn(),
  rateFoodVenue: jest.fn(),
}));
jest.mock("../../../src/api/offers", () => ({ listOffers: async () => [], selectOffer: jest.fn() }));
jest.mock("../../../src/api/safety", () => ({ raiseIssue: jest.fn(async () => ({})), raiseSos: jest.fn(async () => ({})) }));
jest.mock("../../../src/realtime/use-order-socket", () => ({ useOrderSocket: () => ({ connected: false }) }));
jest.mock("../../../src/realtime/use-foreground-refetch", () => ({ useForegroundRefetch: () => undefined }));
jest.mock("../../../src/ui/useReduceMotion", () => ({
  useReduceMotion: () => {
    mockScreenRenders++;
    return false;
  },
}));
jest.mock("../../../src/ui/order/OrderMap", () => ({
  OrderMap: (p: Record<string, unknown>) => {
    mockMapProps.push(p);
    return null;
  },
}));
jest.mock("../../../src/ui/orderflow/MerchantMap", () => ({
  MerchantMap: (p: Record<string, unknown>) => {
    mockMerchantMapProps.push(p);
    return null;
  },
}));

import OrderRoute from "../[id]";

const never = <T,>(): Promise<T> => new Promise<T>(() => undefined);
// Both fixes in this test fall in the same minute, so nothing the screen draws from them changes.
const FIX_AT = new Date(Math.floor(Date.now() / 60_000) * 60_000).toISOString();

function parcel(over: Partial<OrderSnapshot> = {}): OrderSnapshot {
  return {
    id: "order-1",
    status: "open_for_offers",
    orderType: "parcel",
    viewerRole: "customer",
    agreedFare: null,
    proposedFare: "5.00",
    pickup: { point: { lat: -17.82, lng: 31.05 }, landmark: "Pickup spot" },
    dropoff: { point: { lat: -17.83, lng: 31.06 }, landmark: "Drop-off spot" },
    items: [],
    rider: null,
    events: [],
    counterpartyPhone: null,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    ridersNearby: 3,
    ...over,
  } as OrderSnapshot;
}

function food(over: Partial<MerchantOrderResponse> = {}): MerchantOrderResponse {
  return {
    id: "order-1",
    merchantId: "m1",
    status: "requested",
    merchantPhase: "preparing",
    items: [{ dishId: "d1", name: "Sadza & beef stew", priceUsd: 4.5, quantity: 2, note: null, available: true }],
    note: null,
    paymentMethod: "cash",
    merchantPaymentPhone: null,
    merchantGoodsTotal: 9,
    deliveryFee: 1.5,
    total: 10.5,
    acceptDeadlineAt: null,
    itemApprovalDeadlineAt: null,
    prepMinutes: 20,
    prepStartedAt: new Date(Date.now() - 8 * 60_000).toISOString(),
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
    createdAt: new Date(Date.now() - 20 * 60_000).toISOString(),
    ...over,
  } as MerchantOrderResponse;
}

async function settle(n = 4): Promise<void> {
  for (let i = 0; i < n; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

let active: renderer.ReactTestRenderer | null = null;
let client: QueryClient;
async function render(seed?: (qc: QueryClient) => void): Promise<renderer.ReactTestRenderer> {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  seed?.(client);
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <QueryClientProvider client={client}>
        <OrderRoute />
      </QueryClientProvider>,
    );
  });
  await settle();
  active = tree;
  return tree;
}

function press(t: renderer.ReactTestRenderer, label: string): void {
  const buttons = t.root.findAll((n) => typeof n.props.accessibilityLabel === "string" && typeof n.props.onPress === "function");
  const node = buttons.find((n) => n.props.accessibilityLabel === label) ?? buttons.find((n) => (n.props.accessibilityLabel as string).startsWith(label));
  if (!node) throw new Error(`no button labelled "${label}"`);
  act(() => node.props.onPress());
}
function flatten(c: unknown): string {
  if (typeof c === "string") return c;
  if (typeof c === "number") return String(c);
  if (Array.isArray(c)) return c.map(flatten).join("");
  return "";
}
const has = (t: renderer.ReactTestRenderer, s: string): boolean =>
  t.root
    .findAll((n) => (n.type as unknown) === "Text")
    .map((n) => flatten(n.props.children))
    .join("\n")
    .includes(s);
const lastMap = (): Record<string, unknown> => mockMapProps[mockMapProps.length - 1] ?? {};

beforeEach(() => {
  jest.clearAllMocks();
  mockParams.id = "order-1";
  delete mockParams.k;
  mockMapProps.length = 0;
  mockMerchantMapProps.length = 0;
  mockScreenRenders = 0;
});
afterEach(() => {
  if (active) act(() => active!.unmount());
  active = null;
  client?.clear();
});

describe("P42 — a GPS push moves the map, not the screen", () => {
  it("re-renders only the map leaf with the new fix", async () => {
    const live = parcel({
      status: "picked_up",
      agreedFare: "5.00",
      rider: { profileId: "r1", currentLat: -17.825, currentLng: 31.055, updatedAt: FIX_AT },
      events: [{ status: "picked_up", createdAt: FIX_AT }],
    } as Partial<OrderSnapshot>);
    mockGetOrder.mockResolvedValue(live);
    await render();
    expect(lastMap().rider).toEqual({ lat: -17.825, lng: 31.055 });
    const screenBefore = mockScreenRenders;
    const mapBefore = mockMapProps.length;
    // A socket `position` push: ~1 m further, same minute.
    act(() => {
      client.setQueryData<OrderSnapshot>(["order", "order-1"], (o) => (o ? { ...o, rider: { ...o.rider!, currentLat: -17.82501, currentLng: 31.05501 } } : o));
    });
    await settle(2);
    expect(mockMapProps.length).toBe(mapBefore + 1);
    expect(lastMap().rider).toEqual({ lat: -17.82501, lng: 31.05501 });
    expect(mockScreenRenders).toBe(screenBefore);
  });

  it("the fix keeps its identity across screen renders, so the map's memo holds", async () => {
    mockGetOrder.mockResolvedValue(
      parcel({ status: "picked_up", agreedFare: "5.00", rider: { profileId: "r1", currentLat: -17.825, currentLng: 31.055, updatedAt: FIX_AT } } as Partial<OrderSnapshot>),
    );
    await render();
    const first = lastMap().rider;
    const screenBefore = mockScreenRenders;
    const mapBefore = mockMapProps.length;
    // A non-GPS change (the order's events) re-renders the screen; the map's rider prop is the same object.
    act(() => {
      client.setQueryData<OrderSnapshot>(["order", "order-1"], (o) => (o ? { ...o, events: [{ status: "picked_up", createdAt: FIX_AT }] } : o));
    });
    await settle(2);
    expect(mockScreenRenders).toBeGreaterThan(screenBefore);
    expect(mockMapProps.length).toBeGreaterThan(mapBefore);
    expect(lastMap().rider).toBe(first);
  });
});

describe("P24 — Cancel shows the cancelled ending from the server's answer", () => {
  it("writes { status, cancelledBy } before any refetch lands", async () => {
    mockGetOrder.mockResolvedValueOnce(parcel());
    await render();
    mockGetOrder.mockImplementation(() => never());
    mockCancelOrder.mockResolvedValue({ orderId: "order-1", status: "cancelled", cancelledBy: "customer", cooldownUntil: null });
    press(active!, "Cancel request");
    press(active!, "Yes, cancel");
    await settle(2);
    const cached = client.getQueryData<OrderSnapshot>(["order", "order-1"]);
    expect(cached?.status).toBe("cancelled");
    expect(cached?.cancelledBy).toBe("customer");
    expect(has(active!, "You cancelled this order")).toBe(true);
  });
});

describe("P25 — Send again seeds the clone", () => {
  it("the new order's snapshot is in the cache (stops, items, new price) before the screen is replaced", async () => {
    mockGetOrder.mockResolvedValue(parcel({ status: "expired" }));
    await render();
    mockResendOrder.mockResolvedValue({ id: "order-2", status: "open_for_offers", proposedFare: "5.50", expiresAt: new Date(Date.now() + 90_000).toISOString() });
    press(active!, "Send again at");
    await settle(2);
    expect(mockReplace).toHaveBeenCalledWith("/order/order-2");
    const clone = client.getQueryData<OrderSnapshot>(["order", "order-2"]);
    expect(clone).toMatchObject({ id: "order-2", status: "open_for_offers", proposedFare: "5.50", agreedFare: null, rider: null, events: [], cancelledBy: null });
    expect(clone?.pickup.landmark).toBe("Pickup spot");
    expect(clone?.dropoff.landmark).toBe("Drop-off spot");
  });
});

describe("P34 — a running order the phone already holds opens on it", () => {
  it("paints from ['activeCustomerOrders'] while the snapshot read is still in flight", async () => {
    mockGetOrder.mockImplementation(() => never());
    await render((qc) => qc.setQueryData(["activeCustomerOrders"], [parcel()]));
    expect(lastMap().pickup).toEqual({ lat: -17.82, lng: 31.05 });
    expect(lastMap().dropoff).toEqual({ lat: -17.83, lng: 31.06 });
  });

  it("without it, the opening state draws the same map with no stops (P12: one map per open)", async () => {
    mockGetOrder.mockImplementation(() => never());
    await render();
    expect(lastMap().pickup).toBeNull();
    expect(lastMap().dropoff).toBeNull();
  });
});

describe("P13 — a merchant row opens the merchant screen with both reads in parallel", () => {
  it("k=m fires the food read without waiting for the generic snapshot", async () => {
    mockParams.k = "m";
    mockGetOrder.mockImplementation(() => never());
    mockGetFoodOrder.mockResolvedValue(food());
    const t = await render();
    expect(mockGetFoodOrder).toHaveBeenCalledWith("order-1");
    expect(has(t, "Cooking your order")).toBe(true);
    expect(mockMapProps.length).toBe(0); // the parcel screen never mounted
  });

  it("without k, an uncached order still learns its type from the snapshot first", async () => {
    mockGetOrder.mockImplementation(() => never());
    mockGetFoodOrder.mockResolvedValue(food());
    await render();
    expect(mockGetFoodOrder).not.toHaveBeenCalled();
  });
});
