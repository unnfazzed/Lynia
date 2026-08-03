/**
 * LC-C08 (offline & 2G resilience audit, C-T1 finding): `selectM`'s (accept-an-offer) mutation's
 * `onError` used to show the identical muted "that rider was just taken" notice for BOTH a genuine
 * race-loss 409 AND a lost-response case where the customer's OWN pick actually landed server-side —
 * self-heals within one render via `onSettled`'s unconditional invalidate (so never a stuck/incorrect
 * end state), but a slow reconnect could make the misleading flash user-perceptible.
 *
 * The fix reconciles a 409 via a direct `getOrder`, mirroring the rider-side advanceM/deliverM
 * 409-reconciliation pattern (`app/rider/job.tsx`): only surface the notice once the fresh snapshot
 * confirms the order did NOT land on the rider whose offer was tapped. This drives the real screen
 * (mocking only the API/router/storage/socket edges, per the pattern in `app/rider/__tests__/job.test.tsx`).
 */
import React from "react";
import renderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { OrderSnapshot } from "../../../src/api/orders";
import type { OfferRow } from "../../../src/api/offers";

const mockGetOrder = jest.fn<Promise<OrderSnapshot>, [string]>();
const mockListOffers = jest.fn<Promise<OfferRow[]>, [string]>();
const mockSelectOffer = jest.fn();

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
  listOffers: (...args: [string]) => mockListOffers(...args),
  selectOffer: (...args: unknown[]) => mockSelectOffer(...args),
}));
jest.mock("../../../src/realtime/use-order-socket", () => ({
  useOrderSocket: () => ({ connected: false }),
}));
jest.mock("../../../src/realtime/use-foreground-refetch", () => ({
  useForegroundRefetch: () => undefined,
}));
// react-native-maps can't mount in this test environment — same precedent as job.test.tsx's
// JobDetailsCard stub / order-screen.test.tsx's LiveTrackingCard stub.
jest.mock("../../../src/ui/order/LiveTrackingCard", () => ({
  LiveTrackingCard: () => null,
}));

import OrderScreen from "../[id]";

function baseOffer(overrides: Partial<OfferRow> = {}): OfferRow {
  return {
    id: "offer-1",
    type: "accept",
    offeredFare: "5.00",
    etaMinutes: 8,
    rider: {
      profileId: "r1",
      ratingAvg: "4.8",
      ratingCount: 20,
      tripsCount: 100,
      profile: { firstName: "Tapiwa", lastName: "M", photoUrl: null },
    },
    ...overrides,
  } as OfferRow;
}

function openOrder(overrides: Partial<OrderSnapshot> = {}): OrderSnapshot {
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
    ...overrides,
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

function press(tree: renderer.ReactTestRenderer, label: string): void {
  const node = tree.root.findAll((n) => n.props.label === label && typeof n.props.onPress === "function")[0];
  if (!node) throw new Error(`no button labelled "${label}"`);
  act(() => node.props.onPress());
}

function has(tree: renderer.ReactTestRenderer, text: string): boolean {
  return tree.root.findAll((n) => n.props.children === text).length > 0;
}

beforeEach(() => {
  mockGetOrder.mockReset();
  mockListOffers.mockReset();
  mockSelectOffer.mockReset();
});

afterEach(() => {
  if (activeTree) {
    act(() => activeTree!.unmount());
    activeTree = null;
  }
});

describe("selectOffer 409 reconciliation (LC-C08)", () => {
  it("suppresses the 'just taken' notice when a fresh getOrder confirms the customer's OWN pick actually landed", async () => {
    let getOrderCalls = 0;
    mockGetOrder.mockImplementation(async () => {
      getOrderCalls += 1;
      if (getOrderCalls === 1) return openOrder();
      // Every call after the initial mount reflects the truth post-409: OUR pick (r1) landed —
      // both the onError reconciliation check AND onSettled's invalidate-triggered refetch see this.
      return openOrder({ status: "assigned", agreedFare: "5.00", rider: { profileId: "r1", currentLat: null, currentLng: null, updatedAt: null } });
    });
    mockListOffers.mockResolvedValue([baseOffer()]);
    const { ApiError } = require("../../../src/api/client");
    mockSelectOffer.mockRejectedValue(new ApiError(409, "That offer is no longer available"));

    const tree = await render();
    press(tree, "Choose this rider");
    await settle();
    await settle(); // the reconciliation getOrder() call + onSettled's invalidate both resolve async

    expect(has(tree, "That rider was just taken — choose another.")).toBe(false);
  });

  it("shows the 'just taken' notice when a fresh getOrder confirms the auction is still open — the tapped rider genuinely became unavailable", async () => {
    let getOrderCalls = 0;
    mockGetOrder.mockImplementation(async () => {
      getOrderCalls += 1;
      if (getOrderCalls === 1) return openOrder();
      // A genuine race-loss (the tapped rider went offline/stale): the order is STILL open —
      // deliberately kept `open_for_offers` here (not "assigned to a different rider") so this case
      // stays visible in the tree after onSettled's invalidate refetch — the offers section only
      // unmounts once the order actually leaves `open_for_offers`, which is exactly the point: a
      // genuine race-loss self-heals back to "still choosing", never to a misleading dead end.
      return openOrder();
    });
    mockListOffers.mockResolvedValue([baseOffer()]);
    const { ApiError } = require("../../../src/api/client");
    mockSelectOffer.mockRejectedValue(new ApiError(409, "Rider just became unavailable, pick another"));

    const tree = await render();
    press(tree, "Choose this rider");
    await settle();
    await settle();

    expect(has(tree, "That rider was just taken — choose another.")).toBe(true);
  });
});
