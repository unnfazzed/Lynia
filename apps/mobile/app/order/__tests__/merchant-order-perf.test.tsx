/**
 * Customer review 2026-10-07 — the restaurant / shop / pharmacy order screen (`MerchantOrderScreen`) speed fixes,
 * through the real route with only the API / router / storage / socket edges mocked:
 *  - P30: the per-second countdowns tick in leaf components; the 1,700-line screen doesn't re-render each second.
 *  - P42: a GPS push moves the map leaf only, and `riderFix` keeps its identity so `MerchantMap`'s memo holds.
 *  - P22: Cancel and "I've paid" write what the server returned — the next stage shows before any refetch.
 *  - P23: Place's snapshot seed (venue + drop) is what the map draws on the first frame.
 *
 * "Screen renders" are counted through `useReduceMotion` (the screen and its sheet call it every render; the
 * map leaf and the countdown leaves never do).
 */
import renderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { MerchantOrderResponse } from "@lynia/shared";
import type { OrderSnapshot } from "../../../src/api/orders";

const mockGetOrder = jest.fn<Promise<OrderSnapshot>, [string]>();
const mockCancelOrder = jest.fn();
const mockResendOrder = jest.fn();
const mockGetFoodOrder = jest.fn();
const mockCancelUnpaid = jest.fn();
const mockConfirmCash = jest.fn();
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
  cancelUnpaidFoodOrder: (...a: unknown[]) => mockCancelUnpaid(...a),
  confirmFoodCustomerCash: (...a: unknown[]) => mockConfirmCash(...a),
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
import { seedFoodOrder } from "../../../src/query/use-food-order";

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
const lastMap = (): Record<string, unknown> => mockMerchantMapProps[mockMerchantMapProps.length - 1] ?? {};

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

const snap = (over: Partial<OrderSnapshot> = {}): OrderSnapshot =>
  parcel({ orderType: "merchant", merchantName: "Gava’s Kitchen", status: "requested", expiresAt: null, ridersNearby: null, ...over } as Partial<OrderSnapshot>);

function captureTicks(): { spy: jest.SpyInstance; tick: () => void } {
  const spy = jest.spyOn(global, "setInterval");
  return {
    spy,
    tick: () => {
      for (const c of spy.mock.calls) if (c[1] === 1000) (c[0] as () => void)();
    },
  };
}

describe("P30 — countdowns tick in their own leaves", () => {
  it("T3 waiting: the accept countdown moves each second; the screen doesn't re-render", async () => {
    const ticks = captureTicks();
    mockGetFoodOrder.mockResolvedValue(food({ merchantPhase: "awaiting_accept", acceptDeadlineAt: new Date(Date.now() + 150_000).toISOString(), prepStartedAt: null }));
    mockGetOrder.mockResolvedValue(snap());
    const t = await render();
    expect(has(t, "2:")).toBe(true);
    const screenBefore = mockScreenRenders;
    const mapBefore = mockMerchantMapProps.length;
    const real = Date.now();
    const now = jest.spyOn(Date, "now").mockReturnValue(real + 60_000);
    act(() => ticks.tick());
    expect(has(t, "1:")).toBe(true);
    expect(mockScreenRenders).toBe(screenBefore);
    expect(mockMerchantMapProps.length).toBe(mapBefore);
    now.mockRestore();
    ticks.spy.mockRestore();
  });

  it("the screen keeps only a slow clock (no 1 s interval of its own while cooking)", async () => {
    const ticks = captureTicks();
    mockGetFoodOrder.mockResolvedValue(food());
    mockGetOrder.mockResolvedValue(snap());
    await render();
    expect(ticks.spy.mock.calls.filter((c) => c[1] === 1000).length).toBe(0);
    ticks.spy.mockRestore();
  });
});

describe("P42 — a GPS push moves the merchant map only", () => {
  const rider = { profileId: "r1", currentLat: -17.815, currentLng: 31.06, updatedAt: FIX_AT };
  const onWay = (): void => {
    mockGetFoodOrder.mockResolvedValue(food({ status: "picked_up", merchantPhase: null, riderId: "0a1b2c3d-0000-4000-8000-000000000003" }));
    mockGetOrder.mockResolvedValue(snap({ status: "picked_up", rider } as Partial<OrderSnapshot>));
  };

  it("re-renders the map leaf with the new fix and leaves the screen still", async () => {
    onWay();
    await render();
    expect(lastMap().rider).toEqual({ lat: -17.815, lng: 31.06 });
    const screenBefore = mockScreenRenders;
    act(() => {
      client.setQueryData<OrderSnapshot>(["order", "order-1"], (o) => (o ? { ...o, rider: { ...o.rider!, currentLat: -17.81501, currentLng: 31.06001 } } : o));
    });
    await settle(2);
    expect(lastMap().rider).toEqual({ lat: -17.81501, lng: 31.06001 });
    expect(mockScreenRenders).toBe(screenBefore);
  });

  it("a screen render that isn't a fix hands the map the same rider object", async () => {
    onWay();
    await render();
    const first = lastMap().rider;
    const screenBefore = mockScreenRenders;
    act(() => {
      client.setQueryData<OrderSnapshot>(["order", "order-1"], (o) => (o ? { ...o, counterpartyPhone: "+263771234567" } : o));
    });
    await settle(2);
    expect(mockScreenRenders).toBeGreaterThan(screenBefore);
    expect(lastMap().rider).toBe(first);
  });
});

describe("P22 — commit actions write the server's answer", () => {
  it("free Cancel: the customer's own cancelled ending at once — never 'LyniaGo cancelled this order'", async () => {
    mockGetFoodOrder.mockResolvedValue(food({ autoAccepted: true, kitchenConfirmedAt: null }));
    mockGetOrder.mockResolvedValue(snap());
    const t = await render();
    mockGetFoodOrder.mockImplementation(() => never());
    mockGetOrder.mockImplementation(() => never());
    mockCancelUnpaid.mockResolvedValue(food({ status: "cancelled", merchantPhase: null, autoAccepted: true }));
    press(t, "Cancel order · free");
    press(t, "Cancel order");
    await settle(2);
    expect(has(t, "You cancelled this order")).toBe(true);
    expect(has(t, "LyniaGo cancelled this order")).toBe(false);
  });

  it("I've paid: the button doesn't come back while the reads catch up", async () => {
    mockGetFoodOrder.mockResolvedValue(food({ status: "en_route_dropoff", merchantPhase: null, riderId: "0a1b2c3d-0000-4000-8000-000000000003" }));
    mockGetOrder.mockResolvedValue(snap({ status: "en_route_dropoff" }));
    const t = await render();
    expect(has(t, "I’ve paid")).toBe(true);
    mockGetFoodOrder.mockImplementation(() => never());
    mockGetOrder.mockImplementation(() => never());
    mockConfirmCash.mockResolvedValue({ orderId: "order-1", customerCashConfirmedAt: new Date().toISOString() });
    press(t, "I’ve paid");
    await settle(2);
    expect(mockConfirmCash).toHaveBeenCalledWith("order-1");
    expect(client.getQueryData<MerchantOrderResponse>(["food-order", "order-1"])?.customerCashConfirmedAt).toBeTruthy();
    expect(has(t, "I’ve paid")).toBe(false);
  });
});

describe("P19 — the two reads stop cancelling each other", () => {
  it("the mount-time echo refetches join a read in flight (cancelRefetch: false)", async () => {
    const spy = jest.spyOn(QueryClient.prototype, "invalidateQueries");
    mockGetFoodOrder.mockResolvedValue(food());
    mockGetOrder.mockResolvedValue(snap());
    await render();
    const echoes = spy.mock.calls.filter(([f]) => {
      const k = (f as { queryKey?: unknown[] } | undefined)?.queryKey;
      return Array.isArray(k) && (k[0] === "order" || k[0] === "food-order");
    });
    expect(echoes.length).toBeGreaterThan(0);
    for (const [, opts] of echoes) expect(opts).toEqual({ cancelRefetch: false });
    spy.mockRestore();
  });
});

describe("P23 — Place seeds the snapshot the map reads", () => {
  it("the venue and drop pins are on the first frame, before the snapshot read answers", async () => {
    mockGetFoodOrder.mockImplementation(() => never());
    mockGetOrder.mockImplementation(() => never());
    await render((qc) =>
      seedFoodOrder(qc, food(), { venue: { lat: -17.8292, lng: 31.0522 }, venueName: "Gava’s Kitchen", drop: { lat: -17.8105, lng: 31.0705, label: "12 Lanark Rd" }, total: 10.5 }),
    );
    expect(lastMap().venue).toEqual({ lat: -17.8292, lng: 31.0522 });
    expect(lastMap().dropoff).toEqual({ lat: -17.8105, lng: 31.0705 });
    const seeded = client.getQueryData<OrderSnapshot>(["order", "order-1"]);
    expect(seeded).toMatchObject({ orderType: "merchant", viewerRole: "customer", status: "requested" });
  });

  it("never overwrites a snapshot already in the cache", async () => {
    const qc = new QueryClient();
    qc.setQueryData(["order", "order-1"], snap({ merchantName: "Real" }));
    seedFoodOrder(qc, food(), { venue: { lat: 1, lng: 1 }, venueName: "Seed", drop: { lat: 2, lng: 2, label: "x" }, total: 1 });
    expect(qc.getQueryData<OrderSnapshot>(["order", "order-1"])?.merchantName).toBe("Real");
    qc.clear();
  });
});
