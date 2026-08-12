/**
 * RJM.offer_food (mock→RN codegen, region `offer`). The rider's incoming food-dispatch offer screen,
 * realigned to the RJM mock: an AppBar + the adopted offer Card + a pinned Screen.footer accept/decline
 * pair. Product rule (owner 2026-08-12): riders NEVER front their own cash — the old `cash_upfront`
 * danger-wash "front $X" card + "Accept · front $X" label drew a non-existent flow and is removed.
 *
 * This pins the two things a future change must not break:
 *   (1) the ACCEPT path — tapping "Accept this job" calls `acceptFoodDispatch(offer.orderId)` exactly
 *       once, and "Not this one" calls `declineFoodDispatch(offer.orderId)` — the sensitive food-
 *       dispatch mutations, unchanged by the realignment;
 *   (2) the money-variant rendering — cash-collect shows the "MONEY AT THE DOOR" card, wallet shows the
 *       customer-prepaid card, and the removed cash-upfront danger copy ("PAY FIRST" / "front") is gone
 *       from BOTH.
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
  getFoodDispatchOffer: () => mockGetOffer(),
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
  mockGetOffer.mockReset();
  mockAccept.mockReset();
  mockDecline.mockReset();
  // Keep the mutations pending so onSuccess (haptic / nav / invalidate) never fires — we only assert
  // the mutationFn was invoked with the right orderId.
  mockAccept.mockReturnValue(new Promise(() => {}));
  mockDecline.mockReturnValue(new Promise(() => {}));
});

describe("FoodOffer (RJM.offer_food)", () => {
  it("cash-collect: renders the 'money at the door' card, no cash-upfront danger copy", async () => {
    mockGetOffer.mockResolvedValue(offer());
    const tree = await render();
    const text = textOf(tree);

    expect(text).toContain("MONEY AT THE DOOR");
    expect(text).toContain("$15.50"); // the kitchen's money (merchantGoodsTotal)
    expect(text).toContain("$2.40"); // the rider's fixed fare (deliveryFee)
    expect(text).toContain("Food job");

    // The removed cash-upfront flow must be gone.
    expect(text).not.toMatch(/PAY FIRST/i);
    expect(text).not.toMatch(/front \$/i);
    expect(tree.root.findAll((n) => typeof n.props.label === "string" && /front/i.test(n.props.label))).toHaveLength(0);
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

  it("wallet (customer prepaid): renders the prepaid card, no collect-at-door or upfront copy", async () => {
    mockGetOffer.mockResolvedValue(offer({ merchantPaymentMethod: "wallet", merchantCashRule: null }));
    const tree = await render();
    const text = textOf(tree);

    expect(text).toContain("No money from your pocket");
    expect(text).toContain("The customer already paid the restaurant");
    expect(text).not.toContain("MONEY AT THE DOOR");
    expect(text).not.toMatch(/PAY FIRST/i);

    // Accept still wired to the same mutation for the wallet variant.
    await press(tree, "Accept this job");
    expect(mockAccept).toHaveBeenCalledWith(ORDER_ID);
  });
});
