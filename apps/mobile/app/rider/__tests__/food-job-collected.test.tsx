/**
 * Auto-accept (docs/plans/2026-09-30-restaurant-auto-accept.md): at a restaurant that skipped the
 * accept window, the rider confirms pickup with "Collected" instead of the kitchen's 6-digit code, and
 * the server only accepts it near the restaurant. Harness copied from food-job.test.tsx.
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
  confirmDelivery: jest.fn(),
  advanceStatus: jest.fn(),
  rateSender: jest.fn(),
}));
jest.mock("../../../src/api/food-rider", () => ({
  getFoodOrderAsRider: (...args: unknown[]) => mockGetFoodOrderAsRider(...args),
  confirmFoodPickup: (...args: unknown[]) => mockConfirmFoodPickup(...args),
  confirmFoodCollected: (...args: unknown[]) => mockConfirmFoodCollected(...args),
  confirmFoodRiderCash: jest.fn(),
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
});

afterEach(() => {
  act(() => {
    activeTree?.unmount();
  });
  activeTree = null;
});

describe("food job — auto-accept Collected pickup", () => {
  it("replaces the pickup-code entry with Collected at an auto-accept restaurant", async () => {
    const tree = await atRestaurant(true);
    const text = textOf(tree);
    expect(text).toContain("I've collected the food");
    expect(text).not.toContain("Ask the kitchen for the pickup code");
  });

  it("keeps the pickup code everywhere else", async () => {
    const tree = await atRestaurant(false);
    expect(textOf(tree)).toContain("Ask the kitchen for the pickup code");
  });

  // Order flow v2 RD2a (ledger D-59, BRIEF §16): the code the kitchen reads out is six digits.
  it("takes the six-digit pickup code in six boxes and sends all six", async () => {
    mockConfirmFoodPickup.mockResolvedValue({ orderId: "order-1", status: "picked_up" });
    const tree = await atRestaurant(false);
    const input = () => tree.root.findAll((n) => n.props.accessibilityLabel === "Ask the kitchen for the pickup code" && typeof n.props.onChangeText === "function")[0]!;
    expect(input().props.maxLength).toBe(6);
    const cta = () => tree.root.findAll((n) => n.props.label === "I've collected the food")[0]!;
    await act(async () => input().props.onChangeText("7316"));
    await settle();
    expect(cta().props.disabled).toBe(true);
    await act(async () => input().props.onChangeText("731604"));
    await settle();
    expect(cta().props.disabled).toBe(false);
    await press(tree, "I've collected the food");
    expect(mockConfirmFoodPickup).toHaveBeenCalledWith("order-1", "731604");
  });

  it("sends the rider's current position", async () => {
    mockGetLastFix.mockReturnValue({ lat: -17.8201, lng: 31.0502 });
    mockConfirmFoodCollected.mockResolvedValue({ orderId: "order-1", status: "picked_up" });
    const tree = await atRestaurant(true);
    await press(tree, "I've collected the food");
    expect(mockConfirmFoodCollected).toHaveBeenCalledWith("order-1", { lat: -17.8201, lng: 31.0502 });
  });

  it("says so when the rider isn't at the restaurant yet", async () => {
    const { ApiError } = jest.requireActual("../../../src/api/client");
    mockGetLastFix.mockReturnValue({ lat: -17.9, lng: 31.1 });
    mockConfirmFoodCollected.mockRejectedValue(new ApiError(409, "You're not at the restaurant yet. Move closer and try again.", "not_at_restaurant"));
    const tree = await atRestaurant(true);
    await press(tree, "I've collected the food");
    expect(textOf(tree)).toContain("You're not at the restaurant yet. Move closer and try again.");
  });
});
