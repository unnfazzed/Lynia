/**
 * RJM.active_parcel realignment regression guard (mock→RN codegen, region `cash_strip`).
 *
 * The active PARCEL-job screen (app/rider/job.tsx) was realigned to the RJM `active_parcel` mock by
 * region-adopting ONLY the CashStrip "yours vs owed" split (a display-only leaf; RJM.active_parcel#
 * cash_strip → active-parcel-cash-strip.view.tsx, guardrail-locked in adopted.mjs). The tracker Stepper
 * (map-fused into JobDetailsCard) and the "I've arrived at the drop-off" footer (S() opts) both DEFER.
 *
 * This is the MOST entangled active screen, so this test PINS that the realignment moved pixels only —
 * every stage action still calls its EXACT mutation with the SAME args, and the ACTIVE/NEXT/
 * RIDER_CANCELLABLE gating order is unchanged:
 *   • advance          → advanceStatus(orderId, next.to)     (confirmed → en_route_pickup)
 *   • confirm items    → confirmItems(orderId, {indexes}) THEN advanceStatus(orderId, "picked_up")
 *   • deliver          → confirmDelivery(orderId, code.trim())  (doorstep delivery-code)
 *   • cancel (bail)    → cancelOrder(orderId, {})                (pre-pickup only, RIDER_CANCELLABLE)
 *   • undeliver        → markUndelivered(orderId, reason)        (post-pickup can't-complete)
 *   • GATING           → pre-pickup shows "Cancel job" (never "Can't complete delivery"); post-pickup
 *                        shows "Can't complete delivery" (never "Cancel job"); the pickup checklist
 *                        replaces the plain advance button at en_route_pickup with items.
 *
 * The child components that own each action's input (PickupChecklist / DeliveryOtp / BailSheet /
 * UndeliveredSheet) are stubbed to expose their action callback, so the test drives the CONTAINER's
 * wiring (the seam the realignment could have broken), not the cards' internals. JobDetailsCard (the
 * map-fused composite) and the safety controls can't mount here and are stubbed, mirroring job.test.tsx.
 */
import { UndeliveredReason } from "@lynia/shared";
import renderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { OrderSnapshot } from "../../../src/api/orders";

const mockGetActiveOrder = jest.fn<Promise<OrderSnapshot | null>, unknown[]>();
const mockGetOrder = jest.fn<Promise<OrderSnapshot>, [string]>();
const mockAdvanceStatus = jest.fn();
const mockConfirmDelivery = jest.fn();
const mockCancelOrder = jest.fn();
const mockConfirmItems = jest.fn();
const mockMarkUndelivered = jest.fn();

function baseOrder(overrides: Partial<OrderSnapshot> = {}): OrderSnapshot {
  return {
    id: "order-1",
    status: "confirmed",
    orderType: "parcel",
    agreedFare: "5.00",
    proposedFare: "5.00",
    pickup: { point: { lat: -17.82, lng: 31.05 }, landmark: "Pickup spot" },
    dropoff: { point: { lat: -17.83, lng: 31.06 }, landmark: "Drop-off spot" },
    items: [],
    itemsCollected: null,
    note: null,
    pickupPhotoUrl: null,
    rider: { profileId: "r1", currentLat: null, currentLng: null, updatedAt: null },
    events: [],
    counterpartyPhone: "+263771234567",
    expiresAt: null,
    ridersNearby: null,
    undeliveredReason: null,
    undeliveredAttempts: null,
    deliveryOtpAttempts: 0,
    codeRotatedAt: null,
    cancelReason: null,
    cancelledBy: null,
    rebroadcastedToId: null,
    ...overrides,
  } as OrderSnapshot;
}

jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
}));
jest.mock("expo-secure-store", () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
  deleteItemAsync: async () => undefined,
}));
jest.mock("../../../src/api/auth", () => ({
  getMe: async () => ({ profileId: "r1", role: "rider", rider: { cancelStrikes: 0 } }),
}));
jest.mock("../../../src/api/orders", () => ({
  getActiveOrder: (...args: unknown[]) => mockGetActiveOrder(...args),
  getOrder: (...args: [string]) => mockGetOrder(...args),
  advanceStatus: (orderId: string, to: string) => mockAdvanceStatus(orderId, to),
  confirmDelivery: (orderId: string, code: string) => mockConfirmDelivery(orderId, code),
  cancelOrder: (orderId: string, body: unknown) => mockCancelOrder(orderId, body),
  confirmItems: (orderId: string, body: unknown) => mockConfirmItems(orderId, body),
  markUndelivered: (orderId: string, reason: string) => mockMarkUndelivered(orderId, reason),
  rateSender: jest.fn(),
}));
jest.mock("../../../src/realtime/use-rider-job-socket", () => ({
  useRiderJobSocket: () => ({ connected: true }),
}));
jest.mock("../../../src/realtime/use-rider-location", () => ({
  useRiderLocationStream: () => ({ permissionDenied: false }),
}));
jest.mock("../../../src/realtime/use-foreground-refetch", () => ({
  useForegroundRefetch: () => undefined,
}));
// The map-fused tracker composite (the deferred tracker region) can't mount react-native-maps here.
jest.mock("../../../src/ui/rider/JobDetailsCard", () => ({ JobDetailsCard: () => null }));
jest.mock("../../../src/ui/safety", () => ({
  GetHelpControl: () => null,
  SosControl: () => null,
  ReportControl: () => null,
}));
// Each action card → a stub that FORWARDS its action callback as a prop on a host View, so the test
// drives the container's wiring (the mutation seam), not the card's own input handling.
jest.mock("../../../src/ui/rider/PickupChecklist", () => {
  const R = jest.requireActual("react");
  const RN = jest.requireActual("react-native");
  return { PickupChecklist: ({ onConfirm }: { onConfirm: () => void }) => R.createElement(RN.View, { testID: "__pickup_checklist", onConfirm }) };
});
jest.mock("../../../src/ui/rider/DeliveryOtp", () => {
  const R = jest.requireActual("react");
  const RN = jest.requireActual("react-native");
  return { DeliveryOtp: ({ onConfirm }: { onConfirm: () => void }) => R.createElement(RN.View, { testID: "__delivery_otp", onConfirm }) };
});
jest.mock("../../../src/ui/rider/BailSheet", () => {
  const R = jest.requireActual("react");
  const RN = jest.requireActual("react-native");
  return { BailSheet: ({ onConfirm }: { onConfirm: () => void }) => R.createElement(RN.View, { testID: "__bail_sheet", onConfirm }) };
});
jest.mock("../../../src/ui/rider/UndeliveredSheet", () => {
  const R = jest.requireActual("react");
  const RN = jest.requireActual("react-native");
  return { UndeliveredSheet: ({ onSelect }: { onSelect: (r: string) => void }) => R.createElement(RN.View, { testID: "__undelivered_sheet", onSelect }) };
});

import RiderJob from "../job";

const ORDER_ID = "order-1";

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

let activeTree: renderer.ReactTestRenderer | null = null;

async function render(status: OrderSnapshot["status"], overrides: Partial<OrderSnapshot> = {}): Promise<renderer.ReactTestRenderer> {
  mockGetActiveOrder.mockResolvedValue(baseOrder({ status, ...overrides }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <QueryClientProvider client={client}>
        <RiderJob />
      </QueryClientProvider>,
    );
  });
  await settle();
  await settle();
  activeTree = tree;
  return tree;
}

/** Press a real Button by its label (fires its wired onPress). */
function press(tree: renderer.ReactTestRenderer, label: string): void {
  const node = tree.root.findAll((n) => n.props.label === label && typeof n.props.onPress === "function")[0];
  if (!node) throw new Error(`no button labelled "${label}"`);
  act(() => node.props.onPress());
}
function has(tree: renderer.ReactTestRenderer, label: string): boolean {
  return tree.root.findAll((n) => n.props.label === label && typeof n.props.onPress === "function").length > 0;
}
/** Invoke a forwarded callback on a stubbed action card (found by testID). */
function invoke(tree: renderer.ReactTestRenderer, testID: string, prop: string, arg?: unknown): void {
  const node = tree.root.findAll((n) => n.props.testID === testID)[0];
  if (!node) throw new Error(`no stub with testID "${testID}"`);
  const fn = (node.props as Record<string, (a?: unknown) => void>)[prop];
  if (typeof fn !== "function") throw new Error(`stub "${testID}" has no callback prop "${prop}"`);
  act(() => fn(arg));
}
function present(tree: renderer.ReactTestRenderer, testID: string): boolean {
  return tree.root.findAll((n) => n.props.testID === testID).length > 0;
}

beforeEach(() => {
  mockGetActiveOrder.mockReset();
  mockGetOrder.mockReset();
  mockAdvanceStatus.mockReset();
  mockConfirmDelivery.mockReset();
  mockCancelOrder.mockReset();
  mockConfirmItems.mockReset();
  mockMarkUndelivered.mockReset();
  // Keep every mutationFn pending so onSuccess side-effects (haptic/nav/freeze/refresh) never fire — we
  // assert only that the container invoked the right mutation with the right args.
  const pending = (): Promise<never> => new Promise(() => {});
  mockAdvanceStatus.mockReturnValue(pending());
  mockConfirmDelivery.mockReturnValue(pending());
  mockCancelOrder.mockReturnValue(pending());
  mockConfirmItems.mockReturnValue(pending());
  mockMarkUndelivered.mockReturnValue(pending());
});

afterEach(() => {
  if (activeTree) {
    act(() => activeTree!.unmount());
    activeTree = null;
  }
});

describe("rider active parcel job — RJM.active_parcel realignment preserves the stage machine", () => {
  it("advance still calls advanceStatus(orderId, next.to) — confirmed → en_route_pickup", async () => {
    const tree = await render("confirmed");
    press(tree, "Head to pickup"); // NEXT.confirmed.label
    await settle(); // react-query runs the mutationFn after the async onMutate
    expect(mockAdvanceStatus).toHaveBeenCalledTimes(1);
    expect(mockAdvanceStatus).toHaveBeenCalledWith(ORDER_ID, "en_route_pickup");
    expect(mockConfirmDelivery).not.toHaveBeenCalled();
    expect(mockConfirmItems).not.toHaveBeenCalled();
  });

  it("confirm items still calls confirmItems(orderId, {confirmedIndexes}) THEN advanceStatus(orderId, 'picked_up')", async () => {
    const tree = await render("en_route_pickup", {
      items: [{ id: "i1", name: "Envelope", quantity: 1 }] as unknown as OrderSnapshot["items"],
    });
    await settle(); // let the checklist-seed effect tick all items
    invoke(tree, "__pickup_checklist", "onConfirm");
    await settle();
    expect(mockConfirmItems).toHaveBeenCalledTimes(1);
    expect(mockConfirmItems).toHaveBeenCalledWith(ORDER_ID, { confirmedIndexes: [0] });
    // The gated advance to picked_up follows the confirm, same args as always.
    expect(mockAdvanceStatus).toHaveBeenCalledTimes(1);
    expect(mockAdvanceStatus).toHaveBeenCalledWith(ORDER_ID, "picked_up");
  });

  it("deliver still calls confirmDelivery(orderId, code.trim()) at en_route_dropoff", async () => {
    const tree = await render("en_route_dropoff");
    invoke(tree, "__delivery_otp", "onConfirm");
    await settle();
    expect(mockConfirmDelivery).toHaveBeenCalledTimes(1);
    expect(mockConfirmDelivery).toHaveBeenCalledWith(ORDER_ID, "");
    expect(mockAdvanceStatus).not.toHaveBeenCalled();
  });

  it("cancel (bail) still calls cancelOrder(orderId, {}) — pre-pickup only", async () => {
    const tree = await render("confirmed");
    press(tree, "Cancel job"); // opens the BailSheet
    invoke(tree, "__bail_sheet", "onConfirm");
    await settle();
    expect(mockCancelOrder).toHaveBeenCalledTimes(1);
    expect(mockCancelOrder).toHaveBeenCalledWith(ORDER_ID, {}); // empty reason → {}
  });

  it("undeliver still calls markUndelivered(orderId, reason) — post-pickup can't-complete", async () => {
    const tree = await render("en_route_dropoff");
    press(tree, "Can't complete delivery"); // opens the UndeliveredSheet
    invoke(tree, "__undelivered_sheet", "onSelect", UndeliveredReason.BREAKDOWN);
    await settle();
    expect(mockMarkUndelivered).toHaveBeenCalledTimes(1);
    expect(mockMarkUndelivered).toHaveBeenCalledWith(ORDER_ID, UndeliveredReason.BREAKDOWN);
  });

  it("gating: pre-pickup (confirmed) offers 'Cancel job', never 'Can't complete delivery'", async () => {
    const tree = await render("confirmed");
    expect(has(tree, "Cancel job")).toBe(true);
    expect(has(tree, "Can't complete delivery")).toBe(false);
  });

  it("gating: post-pickup (en_route_dropoff) offers 'Can't complete delivery', never 'Cancel job'", async () => {
    const tree = await render("en_route_dropoff");
    expect(has(tree, "Can't complete delivery")).toBe(true);
    expect(has(tree, "Cancel job")).toBe(false);
  });

  it("gating: at en_route_pickup with items the pickup checklist replaces the plain advance button", async () => {
    const tree = await render("en_route_pickup", {
      items: [{ id: "i1", name: "Envelope", quantity: 1 }] as unknown as OrderSnapshot["items"],
    });
    expect(present(tree, "__pickup_checklist")).toBe(true);
    expect(has(tree, "Mark parcel collected")).toBe(false); // NEXT.en_route_pickup.label is suppressed by the checklist
  });
});
