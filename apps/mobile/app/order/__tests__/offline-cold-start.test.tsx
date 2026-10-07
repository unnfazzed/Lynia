/**
 * U05 (customer review 2026-10-07): an offline cold start into a live order (Android killed the app
 * mid-trip; the customer taps the notification with no signal). React Query PAUSES the order fetch for
 * the network, and a paused query is neither loading nor an error, so `loadErrorKind` stayed null and
 * the screen sat on "Opening your order…" forever: no saved copy, no Try again, and no delivery code,
 * which the customer needs at the door. A paused fetch now counts as transient (as app/rider/job.tsx
 * does): the saved copy shows (2.4, with the code card), or the 2.2 "Couldn't open" sheet with Try again.
 */
import renderer, { act } from "react-test-renderer";
import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { OrderSnapshot } from "../../../src/api/orders";
import type { OrderCopy } from "../../../src/net/order-copy-store";

const CODE_KEY_PREFIX = "lynia.deliveryCode.";

const mockGetOrder = jest.fn<Promise<OrderSnapshot>, [string]>();
let mockSavedCopy: OrderCopy | null = null;

jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  useLocalSearchParams: () => ({ id: "order-1" }),
  useRouter: () => ({ replace: jest.fn(), push: jest.fn(), back: jest.fn(), dismissAll: jest.fn() }),
}));
jest.mock("expo-secure-store", () => ({
  getItemAsync: async (key: string) => (key.startsWith(CODE_KEY_PREFIX) ? "482913" : null),
  setItemAsync: async () => undefined,
  deleteItemAsync: async () => undefined,
}));
jest.mock("../../../src/net/order-copy-store", () => ({
  loadOrderCopy: async () => mockSavedCopy,
  saveOrderCopy: async () => undefined,
  clearOrderCopy: async () => undefined,
}));
jest.mock("../../../src/api/orders", () => ({
  getOrder: (...args: [string]) => mockGetOrder(...args),
  cancelOrder: jest.fn(),
  notifyWhenRiderOnline: jest.fn(),
  rateOrder: jest.fn(),
  rotateDeliveryCode: jest.fn(),
  raiseOrderPrice: jest.fn(),
  resendOrder: jest.fn(),
}));
jest.mock("../../../src/api/offers", () => ({
  listOffers: async () => [],
  selectOffer: jest.fn(),
}));
jest.mock("../../../src/realtime/use-order-socket", () => ({
  useOrderSocket: () => ({ connected: false }),
}));
jest.mock("../../../src/realtime/use-foreground-refetch", () => ({
  useForegroundRefetch: () => undefined,
}));
jest.mock("../../../src/ui/order/OrderMap", () => ({
  OrderMap: () => null,
  BlankMap: () => null,
}));

import OrderScreen from "../[id]";

function assignedOrder(): OrderSnapshot {
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
  } as unknown as OrderSnapshot;
}

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
        <OrderScreen />
      </QueryClientProvider>,
    );
  });
  await settle();
  await settle();
  await settle();
  activeTree = tree;
  return tree;
}

function textHits(tree: renderer.ReactTestRenderer, needle: string): number {
  return tree.root.findAll((n) => typeof n.props.children === "string" && n.props.children.includes(needle)).length;
}

function codeShown(tree: renderer.ReactTestRenderer, code: string): boolean {
  const spoken = `DELIVERY CODE, ${code.split("").join(" ")}`;
  return tree.root.findAll((n) => n.props.accessibilityLabel === spoken).length > 0;
}

beforeEach(() => {
  mockGetOrder.mockReset();
  mockGetOrder.mockResolvedValue(assignedOrder());
  mockSavedCopy = null;
  onlineManager.setOnline(false);
});

afterEach(() => {
  if (activeTree) {
    act(() => activeTree!.unmount());
    activeTree = null;
  }
  onlineManager.setOnline(true);
});

describe("order screen — offline cold start (U05)", () => {
  it("shows the saved copy and its delivery code while the fetch is paused for the network", async () => {
    mockSavedCopy = { at: "2026-10-07T09:24:00.000Z", order: assignedOrder() };

    const tree = await render();

    expect(mockGetOrder).not.toHaveBeenCalled(); // paused, not failed
    expect(textHits(tree, "Opening your order")).toBe(0);
    expect(textHits(tree, "Reconnecting…")).toBeGreaterThan(0);
    expect(codeShown(tree, "482913")).toBe(true);
  });

  it("with no saved copy, offers 'Couldn't open your order' and Try again instead of an endless spinner", async () => {
    const tree = await render();

    expect(textHits(tree, "Opening your order")).toBe(0);
    expect(textHits(tree, "Couldn't open your order")).toBeGreaterThan(0);
    expect(textHits(tree, "Try again")).toBeGreaterThan(0);
  });
});
