/**
 * Rider audit (2026-10) — the restaurant / shop / pharmacy job: the automatic status step retries (B2 port),
 * a queued sealed-bag photo still finishes the pickup (FJ-H1), the return leg survives (FJ-H3), a carried
 * balance is collected (FJ-H5), a refused camera says so (FJ-H6), the door photo's sent state (FJ-M1), the
 * code's Confirm after a failed send (FJ-M2), the locked pickup code (FJ-M3), X3/X4 (FJ-M4), X5 (FJ-M5) and
 * the venue's words (FJ-L1). Harness copied from food-job-door.test.tsx; the photo hook is stubbed so a
 * test can flip its upload / permission state.
 */
import renderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Linking } from "react-native";

const TEST_METRICS = { insets: { top: 0, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 360, height: 720 } };
import type { OrderSnapshot } from "../../../src/api/orders";
import type { MerchantOrderResponse } from "@lynia/shared";

const mockGetActiveOrder = jest.fn<Promise<OrderSnapshot | null>, []>();
const mockGetOrder = jest.fn();
const mockAdvance = jest.fn();
const mockGetFoodOrderAsRider = jest.fn<Promise<MerchantOrderResponse>, unknown[]>();
const mockConfirmFoodPickup = jest.fn();
const mockConfirmDelivery = jest.fn();
const mockRefused = jest.fn();
const mockNoShow = jest.fn();
const mockLogCall = jest.fn();
const mockStore = new Map<string, string>();
let mockSocketConnected = false;
const mockPhoto = {
  uri: null as string | null,
  preview: null,
  saving: false,
  uploaded: false,
  denied: false,
  take: jest.fn(),
  use: jest.fn(),
  retake: jest.fn(),
  cancelPreview: jest.fn(),
  flush: jest.fn(async () => false),
};

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));
jest.mock("expo-secure-store", () => ({
  getItemAsync: async (k: string) => mockStore.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => void mockStore.set(k, v),
  deleteItemAsync: async (k: string) => void mockStore.delete(k),
}));
jest.mock("../../../src/api/orders", () => ({
  getActiveOrder: () => mockGetActiveOrder(),
  getOrder: (...args: unknown[]) => mockGetOrder(...args),
  confirmDelivery: (...args: unknown[]) => mockConfirmDelivery(...args),
  advanceStatus: (...args: unknown[]) => mockAdvance(...args),
  rateSender: jest.fn(),
}));
jest.mock("../../../src/api/food-rider", () => ({
  getFoodOrderAsRider: (...args: unknown[]) => mockGetFoodOrderAsRider(...args),
  confirmFoodPickup: (...args: unknown[]) => mockConfirmFoodPickup(...args),
  confirmFoodCollected: jest.fn(),
  confirmFoodRiderCash: jest.fn(),
  confirmRxSawOriginal: jest.fn(),
  attachFoodPickupProof: jest.fn(async () => ({})),
  disputeFoodCash: jest.fn(),
  dropFoodDispatch: jest.fn(),
  logFoodDoorstepCall: (...args: unknown[]) => mockLogCall(...args),
  reportFoodCustomerRefused: (...args: unknown[]) => mockRefused(...args),
  reportFoodNoShow: (...args: unknown[]) => mockNoShow(...args),
}));
jest.mock("../../../src/auth/session", () => ({
  acknowledgeHandback: jest.fn(),
  loadAcknowledgedHandbacks: async () => [],
}));
jest.mock("../../../src/query/use-pickup-photo", () => ({ usePickupPhoto: () => mockPhoto }));
jest.mock("../../../src/realtime/use-foreground-refetch", () => ({ useForegroundRefetch: () => undefined }));
jest.mock("../../../src/realtime/use-rider-location", () => ({
  useRiderLocationStream: () => ({ permissionDenied: false, getLastFix: () => null }),
}));
jest.mock("../../../src/realtime/use-rider-job-socket", () => ({ useRiderJobSocket: () => ({ connected: mockSocketConnected }) }));
jest.mock("../../../src/ui/order/OrderMap", () => ({ OrderMap: () => null }));
jest.mock("../../../src/query/use-wallet", () => ({ useWalletConfig: () => ({ config: { ratePct: 10 }, isLoading: false }) }));
jest.mock("../../../src/ui/safety", () => ({ ReportSheet: () => null }));

import RiderFoodJob from "../food-job";
import { ApiError } from "../../../src/api/client";

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

let activeTree: renderer.ReactTestRenderer | null = null;
let client: QueryClient;
const app = () => (
  <SafeAreaProvider initialMetrics={TEST_METRICS}>
    <QueryClientProvider client={client}>
      <RiderFoodJob />
    </QueryClientProvider>
  </SafeAreaProvider>
);

async function render(): Promise<renderer.ReactTestRenderer> {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(app());
  });
  await settle();
  await settle();
  activeTree = tree;
  return tree;
}
async function rerender(tree: renderer.ReactTestRenderer): Promise<void> {
  await act(async () => {
    tree.update(app());
  });
  for (let i = 0; i < 4; i++) await settle();
}

const BASE_ORDER: OrderSnapshot = {
  id: "order-1",
  status: "en_route_dropoff",
  orderType: "merchant",
  agreedFare: "17.50",
  proposedFare: "17.50",
  pickup: { point: { lat: -17.82, lng: 31.05 }, landmark: "Corner of 5th", contactPhone: "+263771111111" },
  dropoff: { point: { lat: -17.83, lng: 31.06 }, landmark: "Home" },
  rider: null,
  events: [],
  counterpartyPhone: "+263772222222",
  expiresAt: null,
  merchantName: "Sadza Republic",
  customerFirstName: "Rudo",
} as OrderSnapshot;

const BASE_FOOD_ORDER = {
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
} as MerchantOrderResponse;

const CASH = { paymentMethod: "cash", merchantCashRule: "collect_and_return", merchantPaymentConfirmedAt: null } as const;
const SHOP = { venue: { name: "Avondale Fresh", businessType: "shop", shopKind: "grocery", kycVerified: false } } as unknown as Partial<MerchantOrderResponse>;

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
  const node = tree.root.findAll((n) => n.props.children === label || n.props.label === label || n.props.accessibilityLabel === label)[0];
  if (!node) throw new Error(`no node labelled ${label}`);
  let p: typeof node | null = node;
  while (p && typeof p.props.onPress !== "function") p = p.parent;
  if (!p) throw new Error(`no pressable for ${label}`);
  await act(async () => {
    p!.props.onPress();
  });
  await settle();
}
const cta = (tree: renderer.ReactTestRenderer, label: string) => tree.root.findAll((n) => n.props.label === label && typeof n.props.onPress === "function")[0];
async function typeCode(tree: renderer.ReactTestRenderer, label: string, code: string): Promise<void> {
  const input = tree.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onChangeText === "function")[0];
  if (!input) throw new Error(`no input labelled ${label}`);
  await act(async () => {
    input.props.onChangeText(code);
  });
  await settle();
}
async function waitFor(tree: renderer.ReactTestRenderer, text: string): Promise<void> {
  for (let i = 0; i < 25 && !textOf(tree).includes(text); i++) await settle();
}
/** Taps the stage CTA until the next stage shows (a late stored-arrival read can undo the first tap). */
async function arrive(tree: renderer.ReactTestRenderer, label: string): Promise<void> {
  await waitFor(tree, label);
  for (let i = 0; i < 5; i++) await settle();
  await press(tree, label);
  for (let i = 0; i < 5 && textOf(tree).includes(label); i++) await press(tree, label);
}
async function mount(order: Partial<OrderSnapshot>, food: Partial<MerchantOrderResponse>): Promise<renderer.ReactTestRenderer> {
  mockGetActiveOrder.mockResolvedValue({ ...BASE_ORDER, ...order } as OrderSnapshot);
  mockGetFoodOrderAsRider.mockResolvedValue({ ...BASE_FOOD_ORDER, ...food } as MerchantOrderResponse);
  return render();
}

beforeEach(() => {
  for (const m of [mockGetActiveOrder, mockGetOrder, mockAdvance, mockGetFoodOrderAsRider, mockConfirmFoodPickup, mockConfirmDelivery, mockRefused, mockNoShow, mockLogCall]) m.mockReset();
  mockStore.clear();
  mockSocketConnected = false;
  Object.assign(mockPhoto, { uri: null, uploaded: false, denied: false });
  mockPhoto.flush.mockReset();
  mockPhoto.flush.mockResolvedValue(false);
  mockPhoto.take.mockReset();
});

afterEach(() => {
  act(() => {
    activeTree?.unmount();
  });
  activeTree = null;
});

describe("B2 (food) · the automatic status step", () => {
  it("tries again on reconnect after a failed step", async () => {
    mockAdvance.mockRejectedValueOnce(new ApiError(503, "Service unavailable")).mockResolvedValue({});
    const tree = await mount({ status: "confirmed" }, { status: "confirmed" });
    for (let i = 0; i < 10 && mockAdvance.mock.calls.length === 0; i++) await settle();
    expect(mockAdvance).toHaveBeenCalledTimes(1);
    expect(mockAdvance).toHaveBeenCalledWith("order-1", "en_route_pickup");
    mockSocketConnected = true;
    await rerender(tree);
    for (let i = 0; i < 10 && mockAdvance.mock.calls.length < 2; i++) await settle();
    expect(mockAdvance).toHaveBeenCalledTimes(2);
  });

  it("reads a 409 as done when the order already moved on (BH-16)", async () => {
    mockAdvance.mockRejectedValue(new ApiError(409, "Order changed, retry"));
    mockGetOrder.mockResolvedValue({ ...BASE_ORDER, status: "en_route_pickup" });
    const tree = await mount({ status: "confirmed" }, { status: "confirmed" });
    for (let i = 0; i < 10 && mockGetOrder.mock.calls.length === 0; i++) await settle();
    expect(mockGetOrder).toHaveBeenCalledWith("order-1");
    mockSocketConnected = true;
    await rerender(tree);
    expect(mockAdvance).toHaveBeenCalledTimes(1);
  });
});

describe("FJ-H1 / FJ-M3 · the sealed-bag photo and the pickup code", () => {
  it("sends the code once a queued photo goes up", async () => {
    Object.assign(mockPhoto, { uri: "file:///bag.jpg", uploaded: false });
    mockConfirmFoodPickup.mockRejectedValueOnce(new ApiError(409, "Take a photo", "pickup_photo_required")).mockResolvedValue({ orderId: "order-1", status: "picked_up" });
    const tree = await mount({ status: "en_route_pickup" }, { ...SHOP, status: "en_route_pickup", pickupProofRequired: true });
    await arrive(tree, "I'm at the shop");
    await typeCode(tree, "Ask the shop for the pickup code", "731604");
    await act(async () => {
      cta(tree, "I’ve collected the order")!.props.onPress();
    });
    for (let i = 0; i < 5; i++) await settle();
    // No connection for the photo: the code is still checked now (a right one waits on the photo).
    expect(mockConfirmFoodPickup).toHaveBeenCalledTimes(1);
    mockPhoto.uploaded = true;
    await rerender(tree);
    for (let i = 0; i < 10 && mockConfirmFoodPickup.mock.calls.length < 2; i++) await settle();
    expect(mockConfirmFoodPickup).toHaveBeenCalledTimes(2);
    expect(mockConfirmFoodPickup).toHaveBeenLastCalledWith("order-1", "731604");
  });

  it("a locked pickup code says so, with the way out", async () => {
    const tree = await mount({ status: "en_route_pickup" }, { ...SHOP, status: "en_route_pickup", pickupProofRequired: true, pickupCodeAttempts: 5 });
    await arrive(tree, "I'm at the shop");
    await waitFor(tree, "Code locked after 5 tries");
    const text = textOf(tree);
    expect(text).toContain("Code locked after 5 tries");
    expect(text).toContain("Ask the shop to show the code again.");
  });
});

describe("FJ-H6 · camera refused", () => {
  it("says the camera is off and opens the phone's settings", async () => {
    const open = jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);
    mockConfirmFoodPickup.mockRejectedValue(new ApiError(409, "Take a photo", "pickup_photo_required"));
    Object.assign(mockPhoto, { denied: true });
    const tree = await mount({ status: "en_route_pickup" }, { ...SHOP, status: "en_route_pickup", pickupProofRequired: true });
    await arrive(tree, "I'm at the shop");
    await typeCode(tree, "Ask the shop for the pickup code", "731604");
    await press(tree, "Photo of the sealed bag");
    expect(textOf(tree)).toContain("Allow camera and photo access in your phone's settings, then try again.");
    await press(tree, "Open phone settings");
    expect(open).toHaveBeenCalled();
    open.mockRestore();
  });
});

describe("FJ-H5 · a carried balance", () => {
  it("is collected at the door and is never the rider's", async () => {
    const tree = await mount({ status: "en_route_dropoff" }, { ...CASH, previousBalanceUsd: 16.5 });
    await waitFor(tree, "Collect $34.00 cash at the door");
    const text = textOf(tree);
    expect(text).toContain("Collect $34.00 cash at the door");
    expect(text).toContain("$2.00");
    expect(text).toContain("$32.00");
  });
});

describe("FJ-M1 / FJ-M2 / FJ-L1 · the delivery code", () => {
  it("shows Confirm after a failed send, and it sends again", async () => {
    mockConfirmDelivery.mockRejectedValueOnce(new ApiError(503, "Service unavailable")).mockResolvedValue({});
    const tree = await mount({ status: "en_route_dropoff" }, {});
    await arrive(tree, "I'm at the drop-off");
    // A wallet food order: RD4b's header, never the parcel's "Hand over the parcel…".
    expect(textOf(tree)).not.toContain("parcel");
    await typeCode(tree, "DELIVERY CODE", "418290");
    for (let i = 0; i < 10 && !cta(tree, "Confirm delivery"); i++) await settle();
    expect(mockConfirmDelivery).toHaveBeenCalledTimes(1);
    await act(async () => {
      cta(tree, "Confirm delivery")!.props.onPress();
    });
    for (let i = 0; i < 5 && mockConfirmDelivery.mock.calls.length < 2; i++) await settle();
    expect(mockConfirmDelivery).toHaveBeenCalledTimes(2);
  });

  it("once the door photo is in, says our team has it instead of offering it again", async () => {
    const tree = await mount({ status: "en_route_dropoff" }, { doorProof: { reason: "left_at_gate", handedTo: null, photoUrl: "https://x/y.jpg", at: new Date().toISOString() } } as unknown as Partial<MerchantOrderResponse>);
    await arrive(tree, "I'm at the drop-off");
    const text = textOf(tree);
    expect(text).toContain("Our team will call you within 5 minutes. Your job keeps running.");
    expect(text).not.toContain("Can’t use the code?");
  });

  it("offers 'Can't use the code?' over the door card too (RD4c over RD4a)", async () => {
    const tree = await mount({ status: "en_route_dropoff" }, { ...CASH, cashHandshakeAmount: 17.5 });
    await arrive(tree, "I'm at the drop-off");
    const text = textOf(tree);
    expect(text).toContain("Hand over the order");
    expect(text).toContain("Can’t use the code?");
  });
});

describe("FJ-M4 / FJ-M5 / FJ-H3 · can't reach, can't deliver, and the return leg", () => {
  it("X3: can't reach waits on the server's calls before Mark undelivered", async () => {
    const tree = await mount({ status: "en_route_dropoff" }, {});
    await waitFor(tree, "Problem with this job?");
    await press(tree, "Problem with this job?");
    await press(tree, "Can't reach the customer");
    await waitFor(tree, "Rudo isn't answering");
    expect(textOf(tree)).toContain("Rudo isn't answering");
    expect(cta(tree, "Mark undelivered")!.props.disabled).toBe(true);
    expect(textOf(tree)).toContain("Available after 8 minutes of trying.");
  });

  it("X4 → X5: refused, then the venue's name, Call, and no mobile money", async () => {
    mockRefused.mockResolvedValue({});
    const tree = await mount({ status: "en_route_dropoff" }, CASH);
    await waitFor(tree, "Problem with this job?");
    await press(tree, "Problem with this job?");
    await press(tree, "Can't deliver");
    expect(textOf(tree)).toContain("Why can't you deliver?");
    expect(cta(tree, "Send")!.props.disabled).toBe(true);
    await press(tree, "Recipient refused it");
    await act(async () => {
      cta(tree, "Send")!.props.onPress();
    });
    await waitFor(tree, "Marked undelivered");
    expect(mockRefused).toHaveBeenCalledWith("order-1");
    const text = textOf(tree);
    expect(text).toContain("Rudo has been told.");
    expect(text).toContain("Call Sadza Republic");
    expect(text).toContain("Take it back to Sadza Republic");
    expect(text).not.toContain("mobile money");
    expect(text).not.toContain("Corner of 5th");
    // The leg is kept on the phone until the venue confirms it back (FJ-H3).
    expect(mockStore.get("lynia.riderFoodReturn")).toContain("\"kind\":\"undelivered\"");
  });

  it("brings the return-the-cash leg back after an app kill", async () => {
    mockStore.set(
      "lynia.riderFoodReturn",
      JSON.stringify({
        orderId: "order-1",
        kind: "delivered",
        snapshot: { orderId: "order-1", pickupPoint: null, merchantCashRule: "collect_and_return", paymentMethod: "cash", merchantGoodsTotal: 15.5, deliveryFee: 2, merchantDeliveryShare: null, merchantName: "Sadza Republic", kitchenPhone: null, place: "kitchen" },
      }),
    );
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetFoodOrderAsRider.mockResolvedValue({ ...BASE_FOOD_ORDER, ...CASH, status: "delivered", debtStatus: "open" } as MerchantOrderResponse);
    const tree = await render();
    await waitFor(tree, "Return $15.50 to Sadza Republic");
    expect(textOf(tree)).toContain("Return $15.50 to Sadza Republic");
  });
});
