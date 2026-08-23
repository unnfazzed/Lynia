/**
 * CF-04 (crash-fuzz routine, 2026-08-23): `listOffers`'s response feeds `offersQ.data` with no
 * runtime shape validation (`apiFetch<T>` is a bare `JSON.parse(text) as T`) — a malformed 200 body
 * (any shape drift the untyped parse can't catch) used to be a truthy non-array that `offersQ.data ??
 * []` let straight through into `.map()`/`.find()`, crashing the whole order screen with no recovery
 * (live-reproduced via the tools/parity mobile harness: `TypeError: activeOrders.map is not a
 * function`, no error boundary in the render tree — same crash class as UIP-02's fixture-level
 * repro). Sensitive lane (bid acceptance): the fix guards every `offersQ.data` read behind one
 * `Array.isArray` check, so a malformed body degrades to "no offers yet" instead of crashing.
 */
import renderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { OrderSnapshot } from "../../../src/api/orders";

const mockGetOrder = jest.fn<Promise<OrderSnapshot>, [string]>();
const mockListOffers = jest.fn();

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "order-1" }),
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
}));
jest.mock("expo-secure-store", () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
  deleteItemAsync: async () => undefined,
}));
jest.mock("../../../src/api/orders", () => ({
  getOrder: (...args: [string]) => mockGetOrder(...args),
  cancelOrder: jest.fn(),
  notifyWhenRiderOnline: jest.fn(),
  rateOrder: jest.fn(),
  rotateDeliveryCode: jest.fn(),
}));
jest.mock("../../../src/api/offers", () => ({
  listOffers: (...args: unknown[]) => mockListOffers(...args),
  selectOffer: jest.fn(),
}));
jest.mock("../../../src/realtime/use-order-socket", () => ({
  useOrderSocket: () => ({ connected: false }),
}));
jest.mock("../../../src/realtime/use-foreground-refetch", () => ({
  useForegroundRefetch: () => undefined,
}));
jest.mock("../../../src/ui/order/LiveTrackingCard", () => ({
  LiveTrackingCard: () => null,
}));

import OrderScreen from "../[id]";

function openOrder(): OrderSnapshot {
  return {
    id: "order-1",
    status: "open_for_offers",
    agreedFare: null,
    proposedFare: "5.00",
    pickup: { point: { lat: -17.82, lng: 31.05 }, landmark: "Pickup spot" },
    dropoff: { point: { lat: -17.83, lng: 31.06 }, landmark: "Drop-off spot" },
    rider: null,
    events: [],
    counterpartyPhone: null,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    ridersNearby: 3,
  } as OrderSnapshot;
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
  await settle(); // the offers list is a second, dependent fetch (enabled once status resolves open_for_offers)
  activeTree = tree;
  return tree;
}

beforeEach(() => {
  mockGetOrder.mockReset();
  mockListOffers.mockReset();
});

afterEach(() => {
  if (activeTree) {
    act(() => activeTree!.unmount());
    activeTree = null;
  }
});

describe("order/[id].tsx — malformed offers response (CF-04)", () => {
  it("does not throw when listOffers resolves a non-array body, and renders the open auction with zero offers", async () => {
    mockGetOrder.mockResolvedValue(openOrder());
    // A malformed 200 body: an object instead of the documented array.
    mockListOffers.mockResolvedValue({ offers: [] } as unknown);

    await expect(render()).resolves.toBeTruthy();
    // The screen stayed mounted and rendered the open-auction empty-offers state, not a blank
    // crashed tree.
    expect(activeTree!.root.findAll((n) => n.props.children === "No offers yet — riders nearby have been pinged. Hang tight.").length).toBeGreaterThan(0);
    expect(activeTree!.root.findAll((n) => n.props.label === "Choose this rider").length).toBe(0);
  });

  it("does not throw when listOffers resolves null", async () => {
    mockGetOrder.mockResolvedValue(openOrder());
    mockListOffers.mockResolvedValue(null as unknown);

    await expect(render()).resolves.toBeTruthy();
    expect(activeTree!.root.findAll((n) => n.props.children === "No offers yet — riders nearby have been pinged. Hang tight.").length).toBeGreaterThan(0);
  });
});
