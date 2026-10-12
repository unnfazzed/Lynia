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
import renderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { OrderSnapshot } from "../../../src/api/orders";
import type { OfferRow } from "../../../src/api/offers";

const mockGetOrder = jest.fn<Promise<OrderSnapshot>, [string]>();
const mockListOffers = jest.fn<Promise<OfferRow[]>, [string]>();
const mockSelectOffer = jest.fn();

jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
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
  raiseOrderPrice: jest.fn(),
  resendOrder: jest.fn(),
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
// JobDetailsCard stub.
jest.mock("../../../src/ui/order/OrderMap", () => ({
  OrderMap: () => null,
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
  const node = tree.root.findAll((n) => typeof n.props.accessibilityLabel === "string" && n.props.accessibilityLabel.startsWith(label) && typeof n.props.onPress === "function")[0];
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
    press(tree, "Choose Tapiwa M.");
    await settle();
    await settle(); // the reconciliation getOrder() call + onSettled's invalidate both resolve async

    expect(has(tree, "Tapiwa M. was just taken by another customer. Pick another rider.")).toBe(false);
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
    press(tree, "Choose Tapiwa M.");
    await settle();
    await settle();

    expect(has(tree, "Tapiwa M. was just taken by another customer. Pick another rider.")).toBe(true);
  });
});

describe("U62 (C10): the 409's reason picks the words; the grace end re-reads the order", () => {
  async function refuse(code: string): Promise<renderer.ReactTestRenderer> {
    mockGetOrder.mockResolvedValue(openOrder());
    mockListOffers.mockResolvedValue([baseOffer()]);
    const { ApiError } = require("../../../src/api/client");
    mockSelectOffer.mockRejectedValue(new ApiError(409, "Rider just became unavailable, pick another", code));
    const tree = await render();
    press(tree, "Choose Tapiwa M.");
    await settle();
    await settle();
    return tree;
  }

  it("a rider who went offline or lost standing isn't 'taken by another customer'", async () => {
    const tree = await refuse("rider_unavailable");
    expect(has(tree, "Tapiwa M. is unavailable. Pick another rider.")).toBe(true);
    expect(has(tree, "Tapiwa M. was just taken by another customer. Pick another rider.")).toBe(false);
  });

  it("the rider really was assigned elsewhere — the drawn 'taken' toast", async () => {
    const tree = await refuse("rider_taken");
    expect(has(tree, "Tapiwa M. was just taken by another customer. Pick another rider.")).toBe(true);
  });

  it("the time to choose ran out — no 'pick another rider' at all", async () => {
    const tree = await refuse("choose_ended");
    expect(has(tree, "Tapiwa M. was just taken by another customer. Pick another rider.")).toBe(false);
    expect(has(tree, "Tapiwa M. is unavailable. Pick another rider.")).toBe(false);
  });

  it("an order that left offers by the time it's re-read gets no 'pick another rider'", async () => {
    let calls = 0;
    mockGetOrder.mockImplementation(async () => (++calls === 1 ? openOrder() : openOrder({ status: "expired" })));
    mockListOffers.mockResolvedValue([baseOffer()]);
    const { ApiError } = require("../../../src/api/client");
    mockSelectOffer.mockRejectedValue(new ApiError(409, "Order was just taken, pick another", "Conflict"));
    const tree = await render();
    press(tree, "Choose Tapiwa M.");
    await settle();
    await settle();
    expect(has(tree, "Tapiwa M. was just taken by another customer. Pick another rider.")).toBe(false);
  });

  it("at 'Choose in 0:00' on the phone's clock Choose stays live (no server clock offset); the order is re-read, and a late pick's choose_ended says nothing", async () => {
    // The window ended 20 s ago on this phone's clock: the grace (15 s) reads over here.
    mockGetOrder.mockResolvedValue(openOrder({ expiresAt: new Date(Date.now() - 20_000).toISOString() }));
    mockListOffers.mockResolvedValue([baseOffer()]);
    const { ApiError } = require("../../../src/api/client");
    mockSelectOffer.mockRejectedValue(new ApiError(409, "This order is no longer open for offers — the time to choose has ended", "choose_ended"));
    const tree = await render();
    expect(mockGetOrder.mock.calls.length).toBeGreaterThanOrEqual(2);
    const choose = tree.root.findAll((n) => typeof n.props.accessibilityLabel === "string" && n.props.accessibilityLabel.startsWith("Choose Tapiwa M.") && typeof n.props.onPress === "function")[0]!;
    expect(choose.props.disabled).toBeFalsy();
    press(tree, "Choose Tapiwa M.");
    await settle();
    await settle();
    // A phone clock running fast mustn't block a pick the server still takes: the tap reaches the server.
    expect(mockSelectOffer).toHaveBeenCalled();
    expect(has(tree, "Tapiwa M. was just taken by another customer. Pick another rider.")).toBe(false);
  });
});

describe("review: a new bid is announced by its id, not by the count", () => {
  it("an offer that leaves and comes back is not announced again; a genuinely new one is", async () => {
    const spy = jest.spyOn(require("react-native").AccessibilityInfo, "announceForAccessibility");
    const second = baseOffer({ id: "offer-2", rider: { ...baseOffer().rider, profileId: "r2", profile: { firstName: "Farai", lastName: "K", photoUrl: null } } });
    mockGetOrder.mockResolvedValue(openOrder());
    mockListOffers.mockResolvedValue([baseOffer(), second]);
    const tree = await render();
    const qc = tree.root.findByType(require("@tanstack/react-query").QueryClientProvider).props.client;
    const refetchOffers = async (rows: OfferRow[]): Promise<void> => {
      mockListOffers.mockResolvedValue(rows);
      await act(async () => {
        await qc.refetchQueries({ queryKey: ["offers", "order-1"] });
      });
      await settle();
    };
    const bidAnnouncements = (): number => spy.mock.calls.filter((c) => /^\d+ offers?$/.test(String(c[0]))).length;
    expect(bidAnnouncements()).toBe(0);
    await refetchOffers([baseOffer()]); // Farai's offer drops out (a stale heartbeat)…
    await refetchOffers([baseOffer(), second]); // …and comes back: not a new bid.
    expect(bidAnnouncements()).toBe(0);
    await refetchOffers([baseOffer(), second, baseOffer({ id: "offer-3" })]);
    expect(bidAnnouncements()).toBe(1);
    spy.mockRestore();
  });
});
