/**
 * LC-C07 (offline & 2G resilience audit, C-T1): `deliverM`'s durable "delivered" terminal marker
 * (`saveRiderJobTerminal`) used to be written only inside `onSuccess`/the 409-reconciled branch of
 * `onError` — i.e. only after a response arrived. An app kill strictly between `confirmDelivery`
 * firing and any response being processed left NO marker at all, even though the delivery had
 * genuinely landed server-side, so `reconcileRiderJobTerminal` (which only PROMOTES an existing
 * marker once the order drops out of the active feed) had nothing to recover the acknowledgement /
 * rate-the-sender screen from on relaunch.
 *
 * The fix writes a PROVISIONAL marker in `onMutate`, before the request fires, and only rolls it
 * back on a definitive non-409 rejection (401/403, or a 409 reconciled to "still not delivered").
 * This drives the real screen (mocking only the API/router/storage/socket edges, per the pattern in
 * `app/food/order/__tests__/order-screen.test.tsx` and `app/profile/__tests__/setup.test.tsx`),
 * fires the delivery-confirm mutation, and — WITHOUT ever letting the mocked `confirmDelivery`
 * promise resolve — unmounts and remounts the screen (simulating the app-kill) against a server
 * snapshot that already reports the order as `delivered`. Against the pre-fix code this fails: with
 * no marker ever written pre-response, a remount that sees no active order and no persisted
 * terminal just shows "No active job", not the acknowledgement screen.
 */
import renderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { OrderSnapshot } from "../../../src/api/orders";

const mockGetActiveOrder = jest.fn<Promise<OrderSnapshot | null>, unknown[]>();
const mockGetOrder = jest.fn<Promise<OrderSnapshot>, [string]>();
const mockConfirmDelivery = jest.fn();
const mockReplace = jest.fn();

let secureStore: Record<string, string> = {};
const mockSetItemAsync = jest.fn(async (key: string, value: string) => {
  secureStore[key] = value;
});
const mockGetItemAsync = jest.fn(async (key: string) => secureStore[key] ?? null);
const mockDeleteItemAsync = jest.fn(async (key: string) => {
  delete secureStore[key];
});

function baseOrder(overrides: Partial<OrderSnapshot> = {}): OrderSnapshot {
  return {
    id: "order-1",
    status: "en_route_dropoff",
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
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
}));
jest.mock("expo-secure-store", () => ({
  getItemAsync: (...args: [string]) => mockGetItemAsync(...args),
  setItemAsync: (...args: [string, string]) => mockSetItemAsync(...args),
  deleteItemAsync: (...args: [string]) => mockDeleteItemAsync(...args),
}));
jest.mock("../../../src/api/auth", () => ({
  getMe: async () => ({ profileId: "r1", role: "rider" }),
}));
jest.mock("../../../src/api/orders", () => ({
  getActiveOrder: (...args: unknown[]) => mockGetActiveOrder(...args),
  getOrder: (...args: [string]) => mockGetOrder(...args),
  confirmDelivery: (...args: unknown[]) => mockConfirmDelivery(...args),
  advanceStatus: jest.fn(),
  cancelOrder: jest.fn(),
  confirmItems: jest.fn(),
  markUndelivered: jest.fn(),
  rateSender: jest.fn(),
}));
// Real hooks touch Socket.IO + expo-location's background task machinery — irrelevant to this
// screen's delivery-confirm/terminal-marker flow, mirroring how order-screen.test.tsx stubs
// LiveTrackingCard to avoid mounting react-native-maps.
jest.mock("../../../src/realtime/use-rider-job-socket", () => ({
  useRiderJobSocket: () => ({ connected: true }),
}));
jest.mock("../../../src/realtime/use-rider-location", () => ({
  useRiderLocationStream: () => ({ permissionDenied: false }),
}));
jest.mock("../../../src/realtime/use-foreground-refetch", () => ({
  useForegroundRefetch: () => undefined,
}));
jest.mock("../../../src/ui/rider/JobDetailsCard", () => ({
  JobDetailsCard: () => {
    const React_ = require("react");
    const { Text } = require("react-native");
    return React_.createElement(Text, null, "JobDetailsCard");
  },
}));

import RiderJob from "../job";

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
      <QueryClientProvider client={client}>
        <RiderJob />
      </QueryClientProvider>,
    );
  });
  await settle();
  activeTree = tree;
  return tree;
}

function press(tree: renderer.ReactTestRenderer, label: string): void {
  const node = tree.root.findAll((n) => n.props.label === label && typeof n.props.onPress === "function")[0];
  if (!node) throw new Error(`no button labelled "${label}"`);
  act(() => node.props.onPress());
}

function setDeliveryCode(tree: renderer.ReactTestRenderer, code: string): void {
  const node = tree.root.findAll((n) => n.props.accessibilityLabel === "Delivery code" && typeof n.props.onChangeText === "function")[0];
  if (!node) throw new Error("no delivery-code field found");
  act(() => node.props.onChangeText(code));
}

beforeEach(() => {
  secureStore = {};
  mockGetActiveOrder.mockReset();
  mockGetOrder.mockReset();
  mockConfirmDelivery.mockReset();
  mockReplace.mockClear();
  mockSetItemAsync.mockClear();
  mockGetItemAsync.mockClear();
  mockDeleteItemAsync.mockClear();
});

afterEach(() => {
  if (activeTree) {
    act(() => activeTree!.unmount());
    activeTree = null;
  }
});

describe("rider delivery-confirm terminal marker survives an app kill mid-request (LC-C07)", () => {
  it("writes the durable marker BEFORE confirmDelivery resolves, so a kill in that gap still recovers the acknowledgement screen on relaunch", async () => {
    mockGetActiveOrder.mockResolvedValue(baseOrder());
    // The delivery-confirm request never settles this session — mirrors an app kill strictly between
    // sending confirmDelivery and processing any response.
    mockConfirmDelivery.mockReturnValue(new Promise(() => undefined));

    const tree = await render();
    setDeliveryCode(tree, "123456");
    press(tree, "Confirm delivery");
    await settle();

    // The provisional marker must already be durable — written from onMutate, not the (never-arriving)
    // response — before this session ever sees delivered.
    expect(secureStore["lynia.riderJobTerminal"]).toBe(JSON.stringify({ orderId: "order-1", kind: "delivered" }));

    // The app is killed here (confirmDelivery's promise is simply abandoned) — a fresh mount is the
    // relaunch. The server DID commit the delivery (as it genuinely would have, for this scenario);
    // the active-job feed now correctly excludes it.
    act(() => tree.unmount());
    activeTree = null;
    mockGetActiveOrder.mockResolvedValue(null);

    const fresh = await render();
    await settle();

    expect(
      fresh.root.findAll(
        (n) => typeof n.props.children === "string" && n.props.children.includes("Delivered. Waiting for the customer to rate"),
      ).length,
    ).toBeGreaterThan(0);
    // The dead-end "No active job" screen must NOT be what greets the rider after the kill.
    expect(fresh.root.findAll((n) => n.props.children === "No active job").length).toBe(0);
  });

  it("rolls back the provisional marker on a definitive wrong-code rejection (401), so a genuinely-failed attempt never falsely promotes", async () => {
    mockGetActiveOrder.mockResolvedValue(baseOrder());
    const ApiErrorModule = require("../../../src/api/client");
    mockConfirmDelivery.mockRejectedValue(new ApiErrorModule.ApiError(401, "Wrong code"));

    const tree = await render();
    setDeliveryCode(tree, "000000");
    press(tree, "Confirm delivery");
    await settle();

    // onMutate wrote the provisional marker, but the definitive 401 rejection must have cleared it.
    expect(secureStore["lynia.riderJobTerminal"]).toBeUndefined();
  });
});
