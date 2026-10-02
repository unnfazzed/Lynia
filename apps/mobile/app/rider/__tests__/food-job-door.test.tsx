/**
 * Order flow v2 (ledger D-59): the door card that
 * mirrors the customer's (RD4a: hand over → collect the cash) and the delivery code that sends itself on
 * the sixth digit (RD4b). Harness copied from food-job-collected.test.tsx.
 */
import renderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";

const TEST_METRICS = { insets: { top: 0, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 360, height: 720 } };
import type { OrderSnapshot } from "../../../src/api/orders";
import type { MerchantOrderResponse } from "@lynia/shared";

const mockGetActiveOrder = jest.fn<Promise<OrderSnapshot | null>, []>();
const mockGetFoodOrderAsRider = jest.fn<Promise<MerchantOrderResponse>, unknown[]>();
const mockConfirmFoodCollected = jest.fn();
const mockGetLastFix = jest.fn<{ lat: number; lng: number } | null, []>();
const mockConfirmFoodPickup = jest.fn();
const mockConfirmFoodRiderCash = jest.fn();
const mockConfirmDelivery = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));
jest.mock("expo-secure-store", () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
  deleteItemAsync: async () => undefined,
}));
jest.mock("../../../src/api/orders", () => ({
  getActiveOrder: () => mockGetActiveOrder(),
  confirmDelivery: (...args: unknown[]) => mockConfirmDelivery(...args),
  advanceStatus: jest.fn(),
  rateSender: jest.fn(),
}));
jest.mock("../../../src/api/food-rider", () => ({
  getFoodOrderAsRider: (...args: unknown[]) => mockGetFoodOrderAsRider(...args),
  confirmFoodPickup: (...args: unknown[]) => mockConfirmFoodPickup(...args),
  confirmFoodCollected: (...args: unknown[]) => mockConfirmFoodCollected(...args),
  confirmFoodRiderCash: (...args: unknown[]) => mockConfirmFoodRiderCash(...args),
  disputeFoodCash: jest.fn(),
  dropFoodDispatch: jest.fn(),
  logFoodDoorstepCall: jest.fn(),
  reportFoodCustomerRefused: jest.fn(),
  reportFoodNoShow: jest.fn(),
}));
jest.mock("../../../src/auth/session", () => ({
  acknowledgeHandback: jest.fn(),
  loadAcknowledgedHandbacks: async () => [],
}));
jest.mock("../../../src/realtime/use-foreground-refetch", () => ({
  useForegroundRefetch: () => undefined,
}));
jest.mock("../../../src/realtime/use-rider-location", () => ({
  useRiderLocationStream: () => ({ permissionDenied: false, getLastFix: () => mockGetLastFix() }),
}));
// A-O9 wired a job socket into this screen; `connected: false` keeps the REST poll fallback
// active so these ticker-gating assertions see the same cadence as before the socket existed.
// The gating contract itself is covered by food-job-socket-gate.test.tsx.
jest.mock("../../../src/realtime/use-rider-job-socket", () => ({
  useRiderJobSocket: () => ({ connected: false }),
}));
// LiveMap (react-native-maps) can't mount in this test environment — same precedent as
// JobDetailsCard.test.tsx / ComposeMap.test.tsx.
jest.mock("../../../src/ui/order/OrderMap", () => ({ OrderMap: () => null }));
jest.mock("../../../src/query/use-wallet", () => ({ useWalletConfig: () => ({ config: { ratePct: 10 }, isLoading: false }) }));
jest.mock("../../../src/ui/safety", () => ({ ReportSheet: () => null }));

import RiderFoodJob from "../food-job";

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

let activeTree: renderer.ReactTestRenderer | null = null;

async function render(): Promise<renderer.ReactTestRenderer> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={TEST_METRICS}>
      <QueryClientProvider client={client}>
        <RiderFoodJob />
      </QueryClientProvider>
      </SafeAreaProvider>,
    );
  });
  await settle();
  await settle();
  activeTree = tree;
  return tree;
}

const BASE_ORDER: OrderSnapshot = {
  id: "order-1",
  status: "en_route_dropoff",
  orderType: "merchant",
  agreedFare: "15.50",
  proposedFare: "15.50",
  pickup: { point: { lat: -17.82, lng: 31.05 }, landmark: "Sadza Republic" },
  dropoff: { point: { lat: -17.83, lng: 31.06 }, landmark: "Home" },
  rider: null,
  events: [],
  counterpartyPhone: null,
  expiresAt: null,
};

const BASE_FOOD_ORDER: MerchantOrderResponse = {
  id: "order-1",
  merchantId: "m1",
  status: "en_route_dropoff",
  merchantPhase: null,
  items: [{ dishId: "d1", name: "Sadza & beef", priceUsd: 5, quantity: 1, note: null, available: true }],
  note: null,
  paymentMethod: "wallet",
  merchantPaymentPhone: null,
  merchantGoodsTotal: 15.5,
  deliveryFee: 2,
  total: 17.5,
  acceptDeadlineAt: null,
  itemApprovalDeadlineAt: null,
  prepMinutes: null,
  prepStartedAt: null,
  readyAt: null,
  rejectionReason: null,
  paymentCallLoggedAt: null,
  paymentRequestedAt: null,
  merchantPaymentReference: null,
  merchantPaymentConfirmedAt: new Date().toISOString(),
  riderId: "rider-1",
  dispatchAttempt: 1,
  dispatchOfferExpiresAt: null,
  noRiderHoldAt: null,
  pickupCodeAttempts: 0,
  cashHandshakeAmount: null,
  customerCashConfirmedAt: null,
  riderCashConfirmedAt: null,
  cashHandshakeDeadlineAt: null,
  cashHandshakeFrozenAt: null,
  noShowCallTimestamps: [],
  merchantCashRule: null,
  debtStatus: null,
  debtAmount: null,
  debtOpenedAt: null,
  debtSettledAt: null,
  refundReference: null,
  refundAmount: null,
  refundedAt: null,
};


const ARRIVED = "I'm at the kitchen";

function textOf(tree: renderer.ReactTestRenderer): string {
  return tree.root
    .findAll((n) => typeof n.props.children === "string" || Array.isArray(n.props.children) || typeof n.props.label === "string")
    .map((n) => {
      const c = n.props.children;
      if (typeof c === "string") return c;
      if (Array.isArray(c)) return c.filter((x) => typeof x === "string").join("");
      return n.props.label;
    })
    .join(" | ");
}

async function press(tree: renderer.ReactTestRenderer, label: string): Promise<void> {
  const node = tree.root.findAll((n) => n.props.children === label || n.props.label === label)[0];
  if (!node) throw new Error(`no node labelled ${label}`);
  let p: typeof node | null = node;
  while (p && typeof p.props.onPress !== "function") p = p.parent;
  if (!p) throw new Error(`no pressable for ${label}`);
  await act(async () => {
    p!.props.onPress();
  });
  await settle();
}

async function atRestaurant(autoAccepted: boolean): Promise<renderer.ReactTestRenderer> {
  mockGetActiveOrder.mockResolvedValue({ ...BASE_ORDER, status: "en_route_pickup" });
  mockGetFoodOrderAsRider.mockResolvedValue({ ...BASE_FOOD_ORDER, status: "en_route_pickup", autoAccepted });
  const tree = await render();
  await press(tree, ARRIVED);
  return tree;
}

beforeEach(() => {
  mockGetActiveOrder.mockReset();
  mockGetFoodOrderAsRider.mockReset();
  mockConfirmFoodCollected.mockReset();
  mockGetLastFix.mockReset();
  mockConfirmFoodPickup.mockReset();
  mockConfirmFoodRiderCash.mockReset();
  mockConfirmDelivery.mockReset();
});

afterEach(() => {
  act(() => {
    activeTree?.unmount();
  });
  activeTree = null;
});


function typeCode(tree: renderer.ReactTestRenderer, label: string, code: string): Promise<void> {
  const input = tree.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onChangeText === "function")[0];
  if (!input) throw new Error(`no input labelled ${label}`);
  return act(async () => {
    input.props.onChangeText(code);
  }).then(settle);
}

function ctaDisabled(tree: renderer.ReactTestRenderer, label: string): boolean {
  const node = tree.root.findAll((n) => n.props.label === label)[0];
  if (!node) throw new Error(`no node labelled ${label}`);
  return node.props.disabled === true;
}

async function pressCta(tree: renderer.ReactTestRenderer, label: string): Promise<void> {
  const node = tree.root.findAll((n) => n.props.label === label && typeof n.props.onPress === "function")[0];
  if (!node) throw new Error(`no button labelled ${label}`);
  await act(async () => {
    node.props.onPress();
  });
  await settle();
}

const CASH = {
  paymentMethod: "cash",
  merchantCashRule: "collect_and_return",
  cashHandshakeAmount: 17.5,
  merchantPaymentConfirmedAt: null,
} as const;

async function atDoor(food: Partial<MerchantOrderResponse>): Promise<renderer.ReactTestRenderer> {
  mockGetActiveOrder.mockResolvedValue({ ...BASE_ORDER, customerFirstName: "Rudo" } as OrderSnapshot);
  mockGetFoodOrderAsRider.mockResolvedValue({ ...BASE_FOOD_ORDER, ...food });
  const tree = await render();
  // The screen can still be on its skeleton for a beat after a previous test's queries wind down.
  // and the stored arrival read must land before the tap, or it overwrites it.
  for (let i = 0; i < 20 && !textOf(tree).includes("I'm at the drop-off"); i++) await settle();
  for (let i = 0; i < 5; i++) await settle();
  await press(tree, "I'm at the drop-off");
  return tree;
}

describe("RD4a · the door card", () => {
  it("hands over first, then collects the cash with the split under ②", async () => {
    mockConfirmFoodRiderCash.mockResolvedValue({ orderId: "order-1", riderCashConfirmedAt: new Date().toISOString() });
    const tree = await atDoor(CASH);
    let text = textOf(tree);
    expect(text).toContain("At the drop-off");
    expect(text).toContain("Hand over the order");
    expect(text).toContain("Collect $17.50 cash");
    expect(text).toContain("Enter the delivery code");
    expect(text).toContain("Rudo says it after you both confirm the cash");
    expect(text).not.toContain("I received $17.50");
    await pressCta(tree, "Hand over the order");
    text = textOf(tree);
    expect(text).toMatch(/Handed over \d\d:\d\d/);
    expect(text).toContain("Collect $17.50 cash at the door");
    await pressCta(tree, "I received $17.50");
    expect(mockConfirmFoodRiderCash).toHaveBeenCalledWith("order-1");
  });

  it("ticks ① by itself once the customer has confirmed paying", async () => {
    const tree = await atDoor({ ...CASH, customerCashConfirmedAt: new Date().toISOString() });
    expect(textOf(tree)).toContain("I received $17.50");
  });
});

describe("RD4b · the delivery code", () => {
  it("sends itself on the sixth digit once both cash confirms are in", async () => {
    mockConfirmDelivery.mockResolvedValue({});
    const both = { ...CASH, customerCashConfirmedAt: new Date().toISOString(), riderCashConfirmedAt: new Date().toISOString() };
    const tree = await atDoor(both);
    const text = textOf(tree);
    expect(text).toContain("Enter the delivery code");
    expect(text).toContain("Rudo says it after you both confirm the cash · 5 tries");
    await typeCode(tree, "DELIVERY CODE", "41829");
    expect(mockConfirmDelivery).not.toHaveBeenCalled();
    await typeCode(tree, "DELIVERY CODE", "418290");
    for (let i = 0; i < 5 && mockConfirmDelivery.mock.calls.length === 0; i++) await settle();
    expect(mockConfirmDelivery).toHaveBeenCalledWith("order-1", "418290");
  });
});
