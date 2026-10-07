/**
 * Rider v2 food offer (F1–F4, ledger D-54). Pins the two things a future change must not break:
 *   (1) the ACCEPT path — "Accept this job" calls `acceptFoodDispatch(offer.orderId)` exactly once and
 *       "Not this one" calls `declineFoodDispatch(offer.orderId)` — the food-dispatch mutations;
 *   (2) the money variants — F1 shows the fare and the stops; F2 (a kitchen paid up front) shows the
 *       "Pay the kitchen" / "Collect at the door" tiles; a prepaid (wallet) order shows neither tile;
 *       F4 is the expired state with "Back to jobs".
 *
 * Fake timers: the screen polls the offer via `refetchInterval: 3000`; without them the interval fires
 * outside `act(...)` at teardown and react-test-renderer surfaces it as a spurious render error.
 */
import React from "react";
import { Text } from "react-native";
import renderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { FoodOfferEvent } from "@lynia/shared";

jest.useFakeTimers();

const mockGetOffer = jest.fn<Promise<FoodOfferEvent | null>, []>();
let mockJob: Record<string, unknown> | null = null;
const mockAccept = jest.fn<Promise<unknown>, [string]>();
const mockDecline = jest.fn<Promise<unknown>, [string]>();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));
jest.mock("expo-secure-store", () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
  deleteItemAsync: async () => undefined,
}));
jest.mock("../../../src/api/food-rider", () => ({
  getFoodDispatchOfferWithJob: () => mockGetOffer().then((o) => ({ offer: o, job: mockJob })),
  acceptFoodDispatch: (orderId: string) => mockAccept(orderId),
  declineFoodDispatch: (orderId: string) => mockDecline(orderId),
}));
jest.mock("../../../src/net/use-feature-flags", () => ({
  useFeatureFlags: () => ({ restaurantsEnabled: true }),
}));

import FoodOffer from "../food-offer";

const ORDER_ID = "11111111-1111-1111-1111-111111111111";

function offer(overrides: Partial<FoodOfferEvent> = {}): FoodOfferEvent {
  return {
    orderId: ORDER_ID,
    merchantId: "22222222-2222-2222-2222-222222222222",
    pickup: { point: { lat: -17.8, lng: 31.05 }, landmark: "Sadza Republic" },
    dropoff: { point: { lat: -17.79, lng: 31.06 }, landmark: "Belgravia" },
    itemDesc: "Two plates of sadza",
    merchantGoodsTotal: 15.5,
    deliveryFee: 2.4,
    distanceKm: 2.4,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    merchantPaymentMethod: "cash",
    merchantCashRule: "collect_and_return",
    ...overrides,
  };
}

function textOf(tree: renderer.ReactTestRenderer): string {
  return tree.root.findAllByType(Text).flatMap((t) => React.Children.toArray(t.props.children as React.ReactNode)).join(" ");
}

async function render(): Promise<renderer.ReactTestRenderer> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <QueryClientProvider client={client}>
        <FoodOffer />
      </QueryClientProvider>,
    );
  });
  // Flush the (immediately-resolving) offer query onto the offer state.
  await act(async () => {
    await Promise.resolve();
    jest.advanceTimersByTime(1);
    await Promise.resolve();
  });
  // The sheet mounts once its area has a height, as on a device.
  const area = tree.root.findAll((n) => typeof n.type === "string" && n.props.testID === "food-offer-area")[0];
  if (area) act(() => area.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 610 } } }));
  return tree;
}

async function press(tree: renderer.ReactTestRenderer, label: string): Promise<void> {
  const btn = tree.root.findAll((n) => n.props.label === label && typeof n.props.onPress === "function");
  expect(btn).toHaveLength(1);
  // The tap fires the mutation; react-query invokes the mutationFn on a microtask, so flush it.
  await act(async () => {
    (btn[0]!.props as { onPress: () => void }).onPress();
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  mockJob = null;
  mockGetOffer.mockReset();
  mockAccept.mockReset();
  mockDecline.mockReset();
  // Keep the mutations pending so onSuccess (haptic / nav / invalidate) never fires — we only assert
  // the mutationFn was invoked with the right orderId.
  mockAccept.mockReturnValue(new Promise(() => {}));
  mockDecline.mockReturnValue(new Promise(() => {}));
});

describe("FoodOffer (Rider v2 F1–F4)", () => {
  it("F1: the kitchen, the fare, both stops — no pay-the-kitchen tiles at a collect-and-return kitchen", async () => {
    mockGetOffer.mockResolvedValue(offer());
    const tree = await render();
    const text = textOf(tree);

    expect(text).toContain("New food job");
    expect(text).toContain("Sadza Republic");
    expect(text).toContain("Belgravia");
    expect(text).toContain("Your fare");
    expect(text).toContain("$2.40");
    expect(text).toContain("Passing or missing a food offer doesn't affect your standing.");
    expect(text).not.toContain("Pay the kitchen");
  });

  it("F2: a kitchen paid up front shows what to pay and what to collect", async () => {
    mockGetOffer.mockResolvedValue(offer({ merchantCashRule: "pay_upfront" }));
    const tree = await render();
    const text = textOf(tree);

    expect(text).toContain("Pay the kitchen");
    expect(text).toContain("$15.50");
    expect(text).toContain("Collect at the door");
    expect(text).toContain("$17.90");
  });

  it("accepting calls acceptFoodDispatch(orderId) exactly once", async () => {
    mockGetOffer.mockResolvedValue(offer());
    const tree = await render();

    await press(tree, "Accept this job");

    expect(mockAccept).toHaveBeenCalledTimes(1);
    expect(mockAccept).toHaveBeenCalledWith(ORDER_ID);
    expect(mockDecline).not.toHaveBeenCalled();
  });

  it("declining calls declineFoodDispatch(orderId)", async () => {
    mockGetOffer.mockResolvedValue(offer());
    const tree = await render();

    await press(tree, "Not this one");

    expect(mockDecline).toHaveBeenCalledTimes(1);
    expect(mockDecline).toHaveBeenCalledWith(ORDER_ID);
    expect(mockAccept).not.toHaveBeenCalled();
  });

  it("a prepaid (wallet) order shows no money tiles and still accepts", async () => {
    mockGetOffer.mockResolvedValue(offer({ merchantPaymentMethod: "wallet", merchantCashRule: null }));
    const tree = await render();
    const text = textOf(tree);

    expect(text).not.toContain("Pay the kitchen");
    expect(text).not.toContain("Collect at the door");
    await press(tree, "Accept this job");
    expect(mockAccept).toHaveBeenCalledWith(ORDER_ID);
  });

  it("F4: an offer past its window is the expired state, with Back to jobs", async () => {
    mockGetOffer.mockResolvedValue(offer({ expiresAt: new Date(Date.now() - 1000).toISOString() }));
    const tree = await render();
    const text = textOf(tree);

    expect(text).toContain("That one went to another rider");
    expect(tree.root.findAll((n) => n.props.label === "Back to jobs" && typeof n.props.onPress === "function").length).toBe(1);
    expect(tree.root.findAll((n) => n.props.label === "Accept this job")).toHaveLength(0);
  });

  it("a FAILED offer read is the couldn't-load state, not F4's 'went to another rider' (LC-D-SIB-1)", async () => {
    mockGetOffer.mockRejectedValue(new Error("network"));
    const tree = await render();
    const text = textOf(tree);

    expect(text).toContain("Something went wrong");
    expect(text).toContain("Trying again in 10 s");
    expect(text).not.toContain("That one went to another rider");
    expect(tree.root.findAll((n) => n.props.label === "Accept this job")).toHaveLength(0);
  });

  it("RD1b: a pharmacy job wears the PHARMACY tag and the sealed-bag note (Order flow v2, D-59)", async () => {
    mockJob = { businessType: "shop", shopKind: "pharmacy", scheduledFor: null, rx: false };
    mockGetOffer.mockResolvedValue(offer());
    const text = textOf(await render());
    expect(text).toContain("New pharmacy job");
    expect(text).toContain("PHARMACY");
    expect(text).toContain("Sealed bag · photo at pickup");
  });

  it("RD1a: a shop job says SHOP; RD1c: a scheduled one says the customer's slot", async () => {
    const at = new Date();
    at.setHours(12, 30, 0, 0);
    mockJob = { businessType: "shop", shopKind: "grocery", scheduledFor: at.toISOString(), rx: false };
    mockGetOffer.mockResolvedValue(offer());
    const text = textOf(await render());
    expect(text).toContain("New shop job");
    expect(text).toContain("SHOP");
    expect(text).toContain("Scheduled · customer expects 12:30–13:00");
  });

  it("RD1d: a prescription order says to see the original at the door instead of the seal", async () => {
    mockJob = { businessType: "shop", shopKind: "pharmacy", scheduledFor: null, rx: true };
    mockGetOffer.mockResolvedValue(offer());
    const text = textOf(await render());
    expect(text).toContain("Prescription order · see the original at the door");
    expect(text).not.toContain("Sealed bag · photo at pickup");
  });
});
