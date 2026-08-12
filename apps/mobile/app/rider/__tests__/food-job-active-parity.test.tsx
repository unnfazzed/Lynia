/**
 * RJM.active_food realignment regression guard (mock→RN codegen, region `cash_strip`).
 *
 * The active FOOD-job screen was realigned to the RJM `active_food` mock by region-adopting ONLY the
 * CashStrip "yours vs owed" split (a display-only leaf; RJM.active_food#cash_strip →
 * active-food-cash-strip.view.tsx, guardrail-locked in adopted.mjs). The tracker Stepper (map-fused
 * into JobDetailsCard), the accent cash card (sibling-Card locator gap) and the delivery-code footer
 * (S() opts) all DEFER. Because this is a SENSITIVE screen, this test PINS that the realignment moved
 * pixels only — every stage action still calls its EXACT mutation with the SAME args, and the
 * pickup/drop gating order is unchanged:
 *   • advance            → advanceStatus(orderId, next.to)      (confirmed → en_route_pickup)
 *   • confirm pickup     → confirmFoodPickup(orderId, code)     (N-16 pickup-code gate)
 *   • drop               → dropFoodDispatch(orderId)            (D-33 pre-pickup drop)
 *   • confirm delivery   → confirmDelivery(orderId, code)       (doorstep delivery-code)
 *   • drop GATING        → droppable only pre-pickup (FOOD_DROPPABLE); post-pickup the control becomes
 *                          the cancel-blocked "Can I drop this job?" path, never "Drop this job".
 *
 * The child cards that own each action's input (PickupCodeCard / DeliveryOtp / BailSheet) and the
 * map-first FoodNavLeg leg are stubbed to expose their action callback as a pressable, so the test
 * drives the CONTAINER's wiring (the seam the realignment could have broken), not the cards' internals.
 *
 * Fake timers (mirrors food-offer.test): the screen polls (`refetchInterval`) and ticks a 1s clock, and
 * react-query batches its store notifications on a `setTimeout(0)`; without fake timers those fire
 * outside `act(...)` on an unmounted renderer at teardown. We flush queries by advancing 1ms.
 */
import React from "react";
import renderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { OrderSnapshot } from "../../../src/api/orders";
import type { MerchantOrderResponse } from "@lynia/shared";

jest.useFakeTimers();

const mockGetActiveOrder = jest.fn<Promise<OrderSnapshot | null>, []>();
const mockGetFoodOrderAsRider = jest.fn<Promise<MerchantOrderResponse>, unknown[]>();
const mockAdvanceStatus = jest.fn<Promise<unknown>, [string, string]>();
const mockConfirmDelivery = jest.fn<Promise<unknown>, [string, string]>();
const mockConfirmFoodPickup = jest.fn<Promise<unknown>, [string, string]>();
const mockDropFoodDispatch = jest.fn<Promise<unknown>, [string]>();

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
  confirmDelivery: (orderId: string, code: string) => mockConfirmDelivery(orderId, code),
  advanceStatus: (orderId: string, to: string) => mockAdvanceStatus(orderId, to),
  rateSender: jest.fn(),
}));
jest.mock("../../../src/api/food-rider", () => ({
  getFoodOrderAsRider: (...args: unknown[]) => mockGetFoodOrderAsRider(...args),
  confirmFoodPickup: (orderId: string, code: string) => mockConfirmFoodPickup(orderId, code),
  confirmFoodRiderCash: jest.fn(),
  disputeFoodCash: jest.fn(),
  dropFoodDispatch: (orderId: string) => mockDropFoodDispatch(orderId),
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
jest.mock("../../../src/realtime/use-rider-job-socket", () => ({
  useRiderJobSocket: () => ({ connected: false }),
}));
// LiveMap (react-native-maps) can't mount in this environment — same precedent as the sibling test.
jest.mock("../../../src/ui/rider/JobDetailsCard", () => ({ JobDetailsCard: () => null }));
jest.mock("../../../src/ui/safety", () => ({
  GetHelpControl: () => null,
  SosControl: () => null,
  ReportControl: () => null,
}));
// The map-first leg → a pressable that flips `arrivedAt` so the working screen (pickup/delivery card)
// is reached, exactly as tapping "I've arrived" does in-app.
jest.mock("../../../src/ui/rider/FoodNavLeg", () => {
  const R = jest.requireActual("react");
  const RN = jest.requireActual("react-native");
  return { FoodNavLeg: ({ arrivedLabel, onArrived }: { arrivedLabel: string; onArrived: () => void }) => R.createElement(RN.View, { label: arrivedLabel, onPress: onArrived }) };
});
// Each action card → a pressable exposing ONLY its confirm callback, so the test drives the
// container's onConfirm wiring (the mutation seam), not the card's own input handling.
jest.mock("../../../src/ui/food/PickupCodeCard", () => {
  const R = jest.requireActual("react");
  const RN = jest.requireActual("react-native");
  return { PickupCodeCard: ({ onConfirm }: { onConfirm: () => void }) => R.createElement(RN.View, { label: "__pickup_confirm", onPress: onConfirm }) };
});
jest.mock("../../../src/ui/rider/DeliveryOtp", () => {
  const R = jest.requireActual("react");
  const RN = jest.requireActual("react-native");
  return { DeliveryOtp: ({ onConfirm }: { onConfirm: () => void }) => R.createElement(RN.View, { label: "__delivery_confirm", onPress: onConfirm }) };
});
jest.mock("../../../src/ui/rider/BailSheet", () => {
  const R = jest.requireActual("react");
  const RN = jest.requireActual("react-native");
  return { BailSheet: ({ onConfirm }: { onConfirm: () => void }) => R.createElement(RN.View, { label: "__bail_confirm", onPress: onConfirm }) };
});

import RiderFoodJob from "../food-job";

const ORDER_ID = "order-1";

function baseOrder(status: string): OrderSnapshot {
  return {
    id: ORDER_ID,
    status,
    orderType: "merchant",
    agreedFare: "15.50",
    proposedFare: "15.50",
    pickup: { point: { lat: -17.82, lng: 31.05 }, landmark: "Sadza Republic" },
    dropoff: { point: { lat: -17.83, lng: 31.06 }, landmark: "Home" },
    rider: null,
    events: [],
    counterpartyPhone: null,
    expiresAt: null,
  } as OrderSnapshot;
}

function baseFoodOrder(status: string): MerchantOrderResponse {
  return {
    id: ORDER_ID,
    merchantId: "m1",
    status,
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
  } as MerchantOrderResponse;
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    jest.advanceTimersByTime(1);
    await Promise.resolve();
  });
}

let activeTree: renderer.ReactTestRenderer | null = null;

async function render(status: string): Promise<renderer.ReactTestRenderer> {
  mockGetActiveOrder.mockResolvedValue(baseOrder(status));
  mockGetFoodOrderAsRider.mockResolvedValue(baseFoodOrder(status));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <QueryClientProvider client={client}>
        <RiderFoodJob />
      </QueryClientProvider>,
    );
  });
  // jobQ (activeJob) resolves → enables the dependent foodQ → it resolves; flush a few cycles to settle
  // both onto state before asserting the render.
  await flush();
  await flush();
  await flush();
  activeTree = tree;
  return tree;
}

async function press(tree: renderer.ReactTestRenderer, label: string): Promise<void> {
  // A stubbed RN element mounts as {component, host} both carrying the forwarded {label,onPress}, so a
  // match yields ≥1 instances that share ONE onPress reference; the real app Button yields exactly 1.
  // Press the first — invoking a single onPress fires the wired mutation once either way.
  const btn = tree.root.findAll((n) => n.props.label === label && typeof n.props.onPress === "function");
  expect(btn.length).toBeGreaterThanOrEqual(1);
  await act(async () => {
    (btn[0]!.props as { onPress: () => void }).onPress();
    await Promise.resolve();
    jest.advanceTimersByTime(1);
    await Promise.resolve();
  });
}

function has(tree: renderer.ReactTestRenderer, label: string): boolean {
  return tree.root.findAll((n) => n.props.label === label && typeof n.props.onPress === "function").length > 0;
}

beforeEach(() => {
  mockGetActiveOrder.mockReset();
  mockGetFoodOrderAsRider.mockReset();
  mockAdvanceStatus.mockReset();
  mockConfirmDelivery.mockReset();
  mockConfirmFoodPickup.mockReset();
  mockDropFoodDispatch.mockReset();
  // Keep mutationFns pending so onSuccess (haptic/nav/invalidate/freeze) never fires — we assert only
  // that the container invoked the right mutation with the right args.
  mockAdvanceStatus.mockReturnValue(new Promise(() => {}));
  mockConfirmDelivery.mockReturnValue(new Promise(() => {}));
  mockConfirmFoodPickup.mockReturnValue(new Promise(() => {}));
  mockDropFoodDispatch.mockReturnValue(new Promise(() => {}));
});

afterEach(() => {
  act(() => {
    activeTree?.unmount();
  });
  activeTree = null;
});

describe("rider active food job — RJM.active_food realignment preserves the stage machine", () => {
  it("advance still calls advanceStatus(orderId, next.to) — confirmed → en_route_pickup", async () => {
    const tree = await render("confirmed");
    await press(tree, "Navigate to the restaurant");
    expect(mockAdvanceStatus).toHaveBeenCalledTimes(1);
    expect(mockAdvanceStatus).toHaveBeenCalledWith(ORDER_ID, "en_route_pickup");
    expect(mockConfirmFoodPickup).not.toHaveBeenCalled();
    expect(mockConfirmDelivery).not.toHaveBeenCalled();
  });

  it("confirm pickup still calls confirmFoodPickup(orderId, code) at en_route_pickup", async () => {
    const tree = await render("en_route_pickup");
    // The leg opens map-first; arrive to reach the working (pickup-code) screen.
    await press(tree, "I've arrived at the restaurant");
    await press(tree, "__pickup_confirm");
    expect(mockConfirmFoodPickup).toHaveBeenCalledTimes(1);
    expect(mockConfirmFoodPickup).toHaveBeenCalledWith(ORDER_ID, "");
    expect(mockAdvanceStatus).not.toHaveBeenCalled();
  });

  it("confirm delivery still calls confirmDelivery(orderId, code) at en_route_dropoff", async () => {
    const tree = await render("en_route_dropoff");
    await press(tree, "I'm at the door");
    await press(tree, "__delivery_confirm");
    expect(mockConfirmDelivery).toHaveBeenCalledTimes(1);
    expect(mockConfirmDelivery).toHaveBeenCalledWith(ORDER_ID, "");
    expect(mockAdvanceStatus).not.toHaveBeenCalled();
  });

  it("drop still calls dropFoodDispatch(orderId) while droppable (pre-pickup)", async () => {
    const tree = await render("en_route_pickup");
    await press(tree, "I've arrived at the restaurant");
    // D-33: the food is not yet collected, so the drop control is the direct "Drop this job".
    await press(tree, "Drop this job");
    await press(tree, "__bail_confirm");
    expect(mockDropFoodDispatch).toHaveBeenCalledTimes(1);
    expect(mockDropFoodDispatch).toHaveBeenCalledWith(ORDER_ID);
  });

  it("drop gating: pre-pickup (en_route_pickup) offers the direct 'Drop this job'", async () => {
    const tree = await render("en_route_pickup");
    await press(tree, "I've arrived at the restaurant");
    expect(has(tree, "Drop this job")).toBe(true);
    expect(has(tree, "Can I drop this job?")).toBe(false);
  });

  it("drop gating: post-pickup (en_route_dropoff) becomes the cancel-blocked path, never a bare drop", async () => {
    const tree = await render("en_route_dropoff");
    await press(tree, "I'm at the door");
    expect(has(tree, "Drop this job")).toBe(false);
    expect(has(tree, "Can I drop this job?")).toBe(true);
  });
});
