/**
 * Rider audit 2026-10-07, the parcel job screen: regression tests for B2, B3, PJ-H2, PJ-H4, PJ-M2, PJ-M3,
 * PJ-M4, PJ-L1, PJ-L2 and PJ-L3. Same harness as job.test.tsx — the real screen, with only the API, router,
 * storage, socket and map edges mocked.
 */
import renderer, { act } from "react-test-renderer";
import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Linking } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { OrderSnapshot } from "../../../src/api/orders";

const TEST_METRICS = { insets: { top: 0, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 360, height: 720 } };

const mockGetActiveOrder = jest.fn<Promise<OrderSnapshot | null>, unknown[]>();
const mockGetOrder = jest.fn<Promise<OrderSnapshot>, [string]>();
const mockConfirmDelivery = jest.fn();
const mockReplace = jest.fn();
const mockAdvanceStatus = jest.fn();
const mockCancelOrder = jest.fn();
const mockRequestCamera = jest.fn();
const mockOrderCopies: Record<string, { at: string; order: OrderSnapshot }> = {};

let mockSecureStore: Record<string, string> = {};

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
  getItemAsync: async (key: string) => mockSecureStore[key] ?? null,
  setItemAsync: async (key: string, value: string) => {
    mockSecureStore[key] = value;
  },
  deleteItemAsync: async (key: string) => {
    delete mockSecureStore[key];
  },
}));
jest.mock("expo-image-picker", () => ({
  requestCameraPermissionsAsync: (...a: unknown[]) => mockRequestCamera(...a),
  getCameraPermissionsAsync: async () => ({ granted: false }),
  launchCameraAsync: jest.fn(async () => ({ canceled: true, assets: [] })),
  MediaTypeOptions: { Images: "Images" },
}));
jest.mock("../../../src/net/order-copy-store", () => ({
  saveOrderCopy: async (order: OrderSnapshot) => {
    mockOrderCopies[order.id] = { at: new Date().toISOString(), order };
  },
  loadOrderCopy: async (id: string) => mockOrderCopies[id] ?? null,
  clearOrderCopy: async (id: string) => {
    delete mockOrderCopies[id];
  },
}));
jest.mock("../../../src/api/auth", () => ({
  getMe: async () => ({ profileId: "r1", role: "rider" }),
}));
jest.mock("../../../src/api/orders", () => ({
  getActiveOrder: (...args: unknown[]) => mockGetActiveOrder(...args),
  getOrder: (...args: [string]) => mockGetOrder(...args),
  confirmDelivery: (...args: unknown[]) => mockConfirmDelivery(...args),
  advanceStatus: (...args: unknown[]) => mockAdvanceStatus(...args),
  cancelOrder: (...args: unknown[]) => mockCancelOrder(...args),
  confirmItems: jest.fn(async () => ({})),
  markUndelivered: jest.fn(),
  rateSender: jest.fn(),
  attachPickupPhoto: jest.fn(),
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
jest.mock("../../../src/ui/order/OrderMap", () => ({ OrderMap: () => null }));
jest.mock("../../../src/query/use-wallet", () => ({ useWalletConfig: () => ({ config: { ratePct: 10 }, isLoading: false }) }));

import RiderJob from "../job";
import { ApiError } from "../../../src/api/client";

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
          <RiderJob />
        </QueryClientProvider>
      </SafeAreaProvider>,
    );
  });
  await settle();
  await settle();
  activeTree = tree;
  return tree;
}

function unmount(tree: renderer.ReactTestRenderer): void {
  act(() => tree.unmount());
  activeTree = null;
}

function buttons(tree: renderer.ReactTestRenderer, label: string): renderer.ReactTestInstance[] {
  return tree.root.findAll((n) => n.props.label === label && typeof n.props.onPress === "function");
}

function press(tree: renderer.ReactTestRenderer, label: string): void {
  const node = buttons(tree, label)[0];
  if (!node) throw new Error(`no button labelled "${label}"`);
  act(() => node.props.onPress());
}

function codeField(tree: renderer.ReactTestRenderer): renderer.ReactTestInstance {
  const node = tree.root.findAll((n) => n.props.accessibilityLabel === "DELIVERY CODE" && typeof n.props.onChangeText === "function")[0];
  if (!node) throw new Error("no delivery-code field found");
  return node;
}

function setDeliveryCode(tree: renderer.ReactTestRenderer, code: string): void {
  const node = codeField(tree);
  act(() => node.props.onChangeText(code));
}

function hasText(tree: renderer.ReactTestRenderer, s: string): boolean {
  const str = (c: unknown): string => (typeof c === "string" ? c : Array.isArray(c) ? c.filter((x) => typeof x === "string").join("") : "");
  return tree.root.findAll((n) => typeof n.type === "string" && str(n.props.children).includes(s)).length > 0;
}

const ARRIVED_DROP = JSON.stringify({ orderId: "order-1", at: "drop" });
const ARRIVED_PICKUP = JSON.stringify({ orderId: "order-1", at: "pickup" });

beforeEach(() => {
  mockSecureStore = { "lynia.riderJobArrival": ARRIVED_DROP };
  for (const k of Object.keys(mockOrderCopies)) delete mockOrderCopies[k];
  mockGetActiveOrder.mockReset();
  mockGetOrder.mockReset();
  mockConfirmDelivery.mockReset();
  mockAdvanceStatus.mockReset();
  mockAdvanceStatus.mockResolvedValue({});
  mockCancelOrder.mockReset();
  mockRequestCamera.mockReset();
  mockReplace.mockClear();
  onlineManager.setOnline(true);
});

afterEach(() => {
  if (activeTree) unmount(activeTree);
  onlineManager.setOnline(true);
});

describe("B2: a failed automatic status step is retried", () => {
  it("re-sends confirmed → en_route_pickup after a 5xx, at once on reconnect", async () => {
    mockSecureStore = {};
    mockGetActiveOrder.mockResolvedValue(baseOrder({ status: "confirmed" }));
    mockAdvanceStatus.mockRejectedValueOnce(new ApiError(503, "Service unavailable")).mockResolvedValue({});
    await render();
    expect(mockAdvanceStatus).toHaveBeenCalledTimes(1);
    expect(mockAdvanceStatus).toHaveBeenLastCalledWith("order-1", "en_route_pickup");

    // Back online: the pending retry fires now instead of never.
    act(() => {
      onlineManager.setOnline(false);
      onlineManager.setOnline(true);
    });
    await settle();
    await settle();
    expect(mockAdvanceStatus).toHaveBeenCalledTimes(2);
    expect(mockAdvanceStatus).toHaveBeenLastCalledWith("order-1", "en_route_pickup");
  });

  it("retries on its own after a short backoff", async () => {
    mockSecureStore = {};
    mockGetActiveOrder.mockResolvedValue(baseOrder({ status: "confirmed" }));
    mockAdvanceStatus.mockRejectedValueOnce(new ApiError(500, "Server error")).mockResolvedValue({});
    await render();
    expect(mockAdvanceStatus).toHaveBeenCalledTimes(1);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 2_100));
    });
    await settle();
    expect(mockAdvanceStatus).toHaveBeenCalledTimes(2);
  });
});

describe("B3: camera denied at the pickup", () => {
  it("shows the camera-off notice with Open phone settings", async () => {
    mockSecureStore = { "lynia.riderJobArrival": ARRIVED_PICKUP };
    mockGetActiveOrder.mockResolvedValue(baseOrder({ status: "en_route_pickup" }));
    mockRequestCamera.mockResolvedValue({ granted: false });
    const openSettings = jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);
    const tree = await render();
    expect(hasText(tree, "Allow camera and photo access")).toBe(false);

    press(tree, "Take photo");
    await settle();
    expect(hasText(tree, "Allow camera and photo access in your phone's settings, then try again.")).toBe(true);
    press(tree, "Open phone settings");
    expect(openSettings).toHaveBeenCalled();
    openSettings.mockRestore();
  });
});

describe("PJ-H2: Can't reach — persisted, and a way back to the code", () => {
  it("restores the wait after an app kill and leaves it for the code page", async () => {
    mockSecureStore["lynia.riderJobReach"] = JSON.stringify({ orderId: "order-1", startedAt: Date.now() - 65_000, calls: 2, wa: 0 });
    mockGetActiveOrder.mockResolvedValue(baseOrder());
    const tree = await render();
    expect(hasText(tree, "Waited 1:0")).toBe(true);
    expect(hasText(tree, "2 calls")).toBe(true);

    press(tree, "Enter the delivery code");
    await settle();
    expect(codeField(tree)).toBeTruthy();
    expect(mockSecureStore["lynia.riderJobReach"]).toBeUndefined();
  });

  it("PJ-L2: with no recipient number, Call and WhatsApp are off and count nothing", async () => {
    mockSecureStore["lynia.riderJobReach"] = JSON.stringify({ orderId: "order-1", startedAt: Date.now(), calls: 0, wa: 0 });
    mockGetActiveOrder.mockResolvedValue(baseOrder());
    const tree = await render();
    const call = buttons(tree, "Call")[0]!;
    expect(call.props.disabled).toBe(true);
    act(() => call.props.onPress());
    expect(hasText(tree, "0 calls")).toBe(true);
  });
});

describe("PJ-H4: offline cold start draws the saved job, not a legacy summary", () => {
  it("renders the normal code page from the saved copy with Job restored", async () => {
    const saved = baseOrder();
    mockSecureStore["lynia.lastActiveJob"] = JSON.stringify({
      id: "order-1",
      status: "en_route_dropoff",
      fare: "5.00",
      pickupLandmark: "Pickup spot",
      dropoffLandmark: "Drop-off spot",
      rider: null,
      savedAt: "2020-01-01T00:00:00.000Z",
    });
    mockOrderCopies["order-1"] = { at: "2020-01-01T00:00:00.000Z", order: saved };
    mockGetActiveOrder.mockRejectedValue(new ApiError(0, "Network request failed"));
    const tree = await render();
    await settle();
    expect(codeField(tree)).toBeTruthy();
    expect(hasText(tree, "Job restored.")).toBe(true);
    expect(hasText(tree, "Showing your last saved job")).toBe(false);
  });
});

describe("PJ-M2: the wrong-code state belongs to the rejected code", () => {
  it("doesn't paint a fresh code red, and won't resend the rejected one", async () => {
    mockGetActiveOrder.mockResolvedValue(baseOrder());
    mockConfirmDelivery.mockRejectedValue(new ApiError(401, "Wrong code"));
    const tree = await render();
    setDeliveryCode(tree, "111111");
    press(tree, "Confirm delivery");
    await settle();
    await settle();
    expect(hasText(tree, "Wrong code. 4 tries left.")).toBe(true);

    setDeliveryCode(tree, "222222");
    expect(hasText(tree, "Wrong code.")).toBe(false);
    expect(buttons(tree, "Confirm delivery")[0]!.props.disabled).toBe(false);

    setDeliveryCode(tree, "111111");
    expect(buttons(tree, "Confirm delivery")[0]!.props.disabled).toBe(true);
  });
});

describe("PJ-M3 + PJ-M4: a confirm queued offline", () => {
  it("can't be tapped again, and is re-sent after an app kill", async () => {
    mockGetActiveOrder.mockResolvedValue(baseOrder());
    mockConfirmDelivery.mockReturnValue(new Promise(() => undefined));
    const tree = await render();
    setDeliveryCode(tree, "123456");
    act(() => onlineManager.setOnline(false));
    press(tree, "Confirm delivery");
    await settle();
    expect(hasText(tree, "Saved. Syncs when you're back online.")).toBe(true);
    expect(buttons(tree, "Confirm delivery")[0]!.props.disabled).toBe(true);
    expect(codeField(tree).props.editable).toBe(false);
    expect(JSON.parse(mockSecureStore["lynia.riderJobDeliverOutbox"]!)).toEqual({ orderId: "order-1", code: "123456" });
    expect(mockConfirmDelivery).not.toHaveBeenCalled();

    // App killed while queued; relaunched with data.
    unmount(tree);
    act(() => onlineManager.setOnline(true));
    await render();
    await settle();
    expect(mockConfirmDelivery).toHaveBeenCalledWith("order-1", "123456");
  });
});

describe("PJ-L1: code digits stop growing at 1.15×", () => {
  it("caps the digit font scale", async () => {
    mockGetActiveOrder.mockResolvedValue(baseOrder());
    const tree = await render();
    setDeliveryCode(tree, "7");
    const digit = tree.root.findAll((n) => n.props.children === "7" && n.props.maxFontSizeMultiplier != null)[0];
    expect(digit?.props.maxFontSizeMultiplier).toBe(1.15);
  });
});

describe("PJ-L3: cancelling returns to the board", () => {
  it("replaces to /rider after a cancel lands", async () => {
    mockSecureStore = {};
    mockGetActiveOrder.mockResolvedValue(baseOrder({ status: "en_route_pickup" }));
    mockCancelOrder.mockResolvedValue({ cooldownUntil: null });
    const tree = await render();
    const link = tree.root.findAll((n) => n.props.accessibilityLabel === "Problem with this job?" && typeof n.props.onPress === "function")[0];
    if (!link) throw new Error("no problem link");
    act(() => link.props.onPress());
    press(tree, "Cancel this job");
    press(tree, "Cancel job");
    await settle();
    await settle();
    expect(mockCancelOrder).toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith("/rider");
  });
});
