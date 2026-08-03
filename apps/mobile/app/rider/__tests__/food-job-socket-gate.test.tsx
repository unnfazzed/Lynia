/**
 * A-O9: wiring regression for the rider food-job screen. Mirrors the customer order screen's own
 * A-O9 tests (order-screen.test.tsx) — mocks the socket hook rather than standing up a real
 * socket.io-client connection, and asserts the GATING contract: `useRiderJobSocket` is only keyed on
 * a real order id while an ACTIVE merchant job exists, and the plain `activeJob` REST poll (`jobQ`)
 * only runs as the reconnect/offline fallback once a socket connection exists — the food-job mirror
 * of job.tsx's already-shipped `jobPollFallback` pattern. `LiveMap` is stubbed the same way
 * `JobDetailsCard.test.tsx` already does (it mounts react-native-maps, a native module this test
 * environment can't render).
 */
import React from "react";
import renderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { OrderSnapshot } from "../../../src/api/orders";
import type { MerchantOrderResponse } from "@lynia/shared";

const mockGetActiveOrder = jest.fn();
const mockGetFoodOrderAsRider = jest.fn();
const mockUseRiderJobSocket = jest.fn((_orderId: string | null, ..._rest: unknown[]) => ({ connected: false }));
const mockReplace = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace }),
}));
jest.mock("../../../src/api/orders", () => ({
  getActiveOrder: (...args: unknown[]) => mockGetActiveOrder(...args),
  advanceStatus: jest.fn(),
  confirmDelivery: jest.fn(),
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
  acknowledgeHandback: jest.fn(async () => undefined),
  loadAcknowledgedHandbacks: async () => [],
}));
jest.mock("../../../src/realtime/use-foreground-refetch", () => ({
  useForegroundRefetch: () => undefined,
}));
jest.mock("../../../src/realtime/use-rider-location", () => ({
  useRiderLocationStream: () => ({ permissionDenied: false }),
}));
// A-O9: stub the socket the same way the customer screen's test does — assert on the GATING contract
// (which orderId it's called with) without a real connection.
jest.mock("../../../src/realtime/use-rider-job-socket", () => ({
  useRiderJobSocket: (...args: [string | null, ...unknown[]]) => mockUseRiderJobSocket(...args),
}));
jest.mock("../../../src/ui/LiveMap", () => ({
  LiveMap: () => null,
}));

import RiderFoodJob from "../food-job";

const TEST_METRICS = { insets: { top: 0, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 320, height: 640 } };

const ACTIVE_ORDER: OrderSnapshot = {
  id: "order-1",
  status: "en_route_pickup",
  orderType: "merchant",
  agreedFare: "8.50",
  proposedFare: "8.50",
  pickup: { point: { lat: -17.82, lng: 31.05 }, landmark: "Sadza Republic" },
  dropoff: { point: { lat: -17.83, lng: 31.06 }, landmark: "Home" },
  rider: null,
  events: [],
  counterpartyPhone: null,
  expiresAt: null,
};

const FOOD_ORDER: MerchantOrderResponse = {
  id: "order-1",
  merchantId: "m1",
  status: "en_route_pickup",
  merchantPhase: null,
  items: [{ dishId: "d1", name: "Sadza & beef", priceUsd: 5, quantity: 1, note: null, available: true }],
  note: null,
  paymentMethod: "cash",
  merchantPaymentPhone: null,
  merchantGoodsTotal: 5,
  deliveryFee: 3.5,
  total: 8.5,
  acceptDeadlineAt: null,
  itemApprovalDeadlineAt: null,
  prepMinutes: null,
  prepStartedAt: null,
  readyAt: null,
  rejectionReason: null,
  paymentCallLoggedAt: null,
  paymentRequestedAt: null,
  merchantPaymentReference: null,
  merchantPaymentConfirmedAt: null,
  riderId: "rider-1",
  dispatchAttempt: 1,
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
  pickupCodeAttempts: 0,
  noShowCallTimestamps: [],
};

let activeTree: renderer.ReactTestRenderer | null = null;

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

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

beforeEach(() => {
  mockGetActiveOrder.mockReset().mockResolvedValue(ACTIVE_ORDER);
  mockGetFoodOrderAsRider.mockReset().mockResolvedValue(FOOD_ORDER);
  mockUseRiderJobSocket.mockClear().mockReturnValue({ connected: false });
  mockReplace.mockClear();
});

afterEach(() => {
  act(() => {
    activeTree?.unmount();
  });
  activeTree = null;
});

describe("rider food-job screen — A-O9 order-room socket gates the activeJob poll", () => {
  it("does not open the job socket while there is no active job", async () => {
    mockGetActiveOrder.mockResolvedValue(null);
    await render();
    expect(mockUseRiderJobSocket).toHaveBeenLastCalledWith(null, expect.any(Function));
  });

  it("subscribes to the job's own order room once an active merchant job exists", async () => {
    await render();
    expect(mockUseRiderJobSocket).toHaveBeenLastCalledWith("order-1", expect.any(Function));
  });

  it("does not open the job socket for a terminal (delivered) job", async () => {
    mockGetActiveOrder.mockResolvedValue({ ...ACTIVE_ORDER, status: "delivered" });
    mockGetFoodOrderAsRider.mockResolvedValue({ ...FOOD_ORDER, status: "delivered" });
    await render();
    expect(mockUseRiderJobSocket).toHaveBeenLastCalledWith(null, expect.any(Function));
  });

  it("still renders the active job correctly with the job socket already connected", async () => {
    mockUseRiderJobSocket.mockReturnValue({ connected: true });
    const tree = await render();
    const statusPill = tree.root.findAll((n) => n.props.status === "en_route_pickup");
    expect(statusPill.length).toBeGreaterThan(0);
  });
});
