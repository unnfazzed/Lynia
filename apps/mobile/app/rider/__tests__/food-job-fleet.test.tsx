/**
 * Own bikers v1 · OB-R8/R9/R11 (ledger D-117): a food job carried by one of the business's own bikers. Pins that the
 * job says whose money it is — "Collect $17.50 cash at the door", then "Bring $17.50 back to Chicken Inn Avondale" —
 * with no "Yours" split (the biker keeps nothing), that it heads to the branch by name, that cancelling tells the
 * branch with no strike line, and that Done shows no earnings: the cash goes back, or there's nothing to return.
 */
import React from "react";
import { Text } from "react-native";
import renderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";

const TEST_METRICS = { insets: { top: 0, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 360, height: 720 } };
import type { OrderSnapshot } from "../../../src/api/orders";
import type { MerchantOrderResponse } from "@lynia/shared";

const mockGetActiveOrder = jest.fn<Promise<OrderSnapshot | null>, []>();
const mockGetFoodOrderAsRider = jest.fn<Promise<MerchantOrderResponse>, unknown[]>();
const mockReplace = jest.fn();
const mockDismissTo = jest.fn();
const mockDismissAll = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace, dismissTo: mockDismissTo, dismissAll: mockDismissAll }),
  useNavigation: () => ({ getState: () => undefined }),
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
  confirmFoodPickup: jest.fn(),
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
  useRiderLocationStream: () => ({ permissionDenied: false }),
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

import { FleetDoneCard, FleetEndedPage } from "../../../src/ui/rider/fleet";

const SHOP = "Chicken Inn Avondale";
const CASH: Partial<MerchantOrderResponse> = { paymentMethod: "cash", merchantCashRule: "collect_and_return", merchantPaymentConfirmedAt: null, fleetShop: SHOP };

function textOf(tree: renderer.ReactTestRenderer): string {
  return tree.root.findAllByType(Text).flatMap((t) => React.Children.toArray(t.props.children as React.ReactNode)).join(" | ");
}

beforeEach(() => {
  mockGetActiveOrder.mockReset();
  mockGetFoodOrderAsRider.mockReset();
});
afterEach(() => {
  act(() => {
    activeTree?.unmount();
  });
  activeTree = null;
});

describe("Own bikers OB-R8: the fleet food job", () => {
  it("on the way to the kitchen: heads to the branch by name, wears the tag, and says to collect it all at the door", async () => {
    mockGetActiveOrder.mockResolvedValue({ ...BASE_ORDER, status: "en_route_pickup", fleetShop: SHOP });
    mockGetFoodOrderAsRider.mockResolvedValue({ ...BASE_FOOD_ORDER, ...CASH, status: "en_route_pickup" } as MerchantOrderResponse);
    const tree = await render();
    const text = textOf(tree);
    expect(text).toContain(`Heading to ${SHOP}`);
    expect(text).toContain(`${SHOP} job`);
    expect(text).toContain("Collect $17.50 cash at the door");
    expect(text).not.toContain("Bring $17.50 back");
  });

  it("on the way to the customer: collect at the door, then bring all of it back — no 'Yours' split", async () => {
    mockGetActiveOrder.mockResolvedValue({ ...BASE_ORDER, fleetShop: SHOP });
    mockGetFoodOrderAsRider.mockResolvedValue({ ...BASE_FOOD_ORDER, ...CASH } as MerchantOrderResponse);
    const tree = await render();
    const text = textOf(tree);
    expect(text).toContain("Heading to drop-off");
    expect(text).toContain("Collect $17.50 cash at the door");
    expect(text).toContain(`Bring $17.50 back to ${SHOP}`);
    expect(text).not.toMatch(/Yours|fare|commission/i);
  });

  it("OB-R11: cancelling tells the branch, with Keep the job first and no strike line", async () => {
    mockGetActiveOrder.mockResolvedValue({ ...BASE_ORDER, status: "en_route_pickup", fleetShop: SHOP });
    mockGetFoodOrderAsRider.mockResolvedValue({ ...BASE_FOOD_ORDER, ...CASH, status: "en_route_pickup" } as MerchantOrderResponse);
    const tree = await render();
    const sheet = tree.root.findAll((n) => n.props.title === "Cancel this job?" && n.props.body != null);
    expect(sheet.length).toBeGreaterThan(0);
    expect(sheet[0]!.props.body).toBe(`This tells ${SHOP}.`);
    expect(tree.root.findAll((n) => n.props.title === "Drop this food job?")).toHaveLength(0);
  });

  it("a public biker's job is unchanged: the split, and the kitchen's drop sheet", async () => {
    mockGetActiveOrder.mockResolvedValue({ ...BASE_ORDER, status: "en_route_pickup" });
    mockGetFoodOrderAsRider.mockResolvedValue({ ...BASE_FOOD_ORDER, ...CASH, fleetShop: undefined, status: "en_route_pickup" } as MerchantOrderResponse);
    const tree = await render();
    expect(textOf(tree)).not.toContain(`Heading to ${SHOP}`);
    expect(tree.root.findAll((n) => n.props.title === "Drop this food job?").length).toBeGreaterThan(0);
  });
});

describe("Own bikers OB-R9 / OB-R13 parts", () => {
  it("Done: the cash goes back to the branch, or there's nothing to return; never earnings", () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<FleetDoneCard shop={SHOP} owed={14} meta="#B204 · 3.2 km · 13:02" />);
    });
    let text = textOf(tree);
    expect(text).toContain("Delivered. Nice work.");
    expect(text).toContain(`Return $14.00 to ${SHOP}`);
    expect(text).toContain("Hand the cash to the counter. They confirm it in their app and this job closes.");
    expect(text).toContain("#B204 · 3.2 km · 13:02");
    expect(text).not.toMatch(/earn|commission/i);
    act(() => tree.update(<FleetDoneCard shop={SHOP} owed={null} meta="#B204" />));
    text = textOf(tree);
    expect(text).toContain("Nothing to return");
    expect(text).toContain("This order was paid before delivery.");
  });

  it("You're a public biker now: why, what changes, and See jobs near me", () => {
    const onDone = jest.fn();
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<FleetEndedPage shop="Chicken Inn" floor="$2.00" onDone={onDone} />);
    });
    const text = textOf(tree);
    expect(text).toContain("You're a public biker now");
    expect(text).toContain("Chicken Inn has stopped using Own bikers. You can take jobs from anyone near you.");
    expect(text).toContain("Keep at least $2.00 commission balance to take jobs.");
    act(() => tree.root.findAll((n) => n.props.label === "See jobs near me" && typeof n.props.onPress === "function")[0]!.props.onPress());
    expect(onDone).toHaveBeenCalled();
  });
});
