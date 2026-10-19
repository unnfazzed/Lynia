/**
 * Own bikers v1 · OB-R7 fleet job offer (ledger D-117). Pins what a fleet offer must and must not show:
 *   (1) no fare, no pay-the-kitchen tiles — the "Chicken Inn job" tag, the stops, the trip, and "Collect at the
 *       door" with who the money belongs to, only when the customer pays at the door;
 *   (2) Accept calls `acceptFleetJob` once and opens the job screen for its kind (an app order is a food job, a
 *       phone booking a Send job); "Not this one" calls `declineFleetJob` and says passing never counts;
 *   (3) F4: out of time or taken → "That one went to another biker", the hold in seconds, "Back to jobs".
 *
 * Fake timers: the screen re-reads every 3 s.
 */
import React from "react";
import { Text } from "react-native";
import renderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { FleetJobOffer } from "@lynia/shared";

jest.useFakeTimers();

const mockGetOffers = jest.fn<Promise<FleetJobOffer[]>, []>();
let mockParams: { orderId?: string } = {};
const mockAccept = jest.fn<Promise<unknown>, [string]>();
const mockDecline = jest.fn<Promise<unknown>, [string]>();
const mockReplace = jest.fn();
const mockDismissTo = jest.fn();
const mockDismissAll = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace, dismissTo: mockDismissTo, dismissAll: mockDismissAll }),
  useNavigation: () => ({ getState: () => undefined }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock("expo-location", () => ({ getLastKnownPositionAsync: async () => null }));
jest.mock("expo-secure-store", () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
  deleteItemAsync: async () => undefined,
}));
jest.mock("../../../src/api/fleet", () => ({
  getFleetOffers: () => mockGetOffers(),
  acceptFleetJob: (orderId: string) => mockAccept(orderId),
  declineFleetJob: (orderId: string) => mockDecline(orderId),
}));
jest.mock("../../../src/query/use-my-fleet", () => ({
  useMyFleet: () => ({ fleet: { shop: "Chicken Inn Avondale", paused: false, joinedAt: "2026-10-01T10:00:00Z" }, invites: [], loaded: true }),
}));
jest.mock("../../../src/query/use-tab-top", () => ({
  useTabTop: () => ({ greeting: "Good afternoon, Tendai", evening: false, unread: false, onBell: () => undefined, narrow: false, online: true }),
}));

import FleetOffer from "../fleet-offer";

const ORDER_ID = "11111111-1111-4111-8111-111111111111";
const SHOP = "Chicken Inn Avondale";

function offer(overrides: Partial<FleetJobOffer> = {}): FleetJobOffer {
  return {
    orderId: ORDER_ID,
    shop: SHOP,
    pickup: { point: { lat: -17.8, lng: 31.05 }, landmark: SHOP },
    dropoff: { point: { lat: -17.79, lng: 31.06 }, landmark: "22 King George Rd, Avondale" },
    itemsSummary: "2 dishes",
    collect: "14.00",
    distanceKm: 3.2,
    expiresAt: new Date(Date.now() + 40_000).toISOString(),
    kind: "app",
    ...overrides,
  };
}

function textOf(tree: renderer.ReactTestRenderer): string {
  return tree.root
    .findAllByType(Text)
    .flatMap((t) => React.Children.toArray(t.props.children as React.ReactNode))
    .join(" ");
}

async function render(): Promise<renderer.ReactTestRenderer> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={{ insets: { top: 0, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 360, height: 720 } }}>
        <QueryClientProvider client={client}>
          <FleetOffer />
        </QueryClientProvider>
      </SafeAreaProvider>,
    );
  });
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
  await act(async () => {
    (btn[0]!.props as { onPress: () => void }).onPress();
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  mockParams = { orderId: ORDER_ID };
  mockGetOffers.mockReset();
  mockAccept.mockReset();
  mockDecline.mockReset();
  mockReplace.mockReset();
});

describe("OB-R7 fleet job offer", () => {
  it("rings with the shop's name and the time left, no fare: the tag, the stops, the trip, collect at the door and whose money it is", async () => {
    mockGetOffers.mockResolvedValue([offer()]);
    const tree = await render();
    const text = textOf(tree);
    expect(text).toContain(`New ${SHOP} job`);
    expect(text).toMatch(/0:(39|40)/);
    expect(text).toContain(`${SHOP} job`);
    expect(text).toContain("22 King George Rd, Avondale");
    expect(text).toContain("3.2 km trip");
    expect(text).toContain("COLLECT AT THE DOOR");
    expect(text).toContain("$14.00");
    expect(text).toContain(`All of it goes back to ${SHOP}.`);
    expect(text).toContain("Passing or missing a job doesn't affect you.");
    expect(text).not.toMatch(/fare|Pay the kitchen|commission|top-up/i);
  });

  it("a prepaid order draws no collect tile", async () => {
    mockGetOffers.mockResolvedValue([offer({ collect: null })]);
    const tree = await render();
    expect(textOf(tree)).not.toContain("COLLECT AT THE DOOR");
  });

  it("Accept takes it once and opens the job screen for its kind: an app order is a food job, a booking a Send job", async () => {
    mockGetOffers.mockResolvedValue([offer()]);
    mockAccept.mockResolvedValue({ orderId: ORDER_ID, status: "assigned" });
    let tree = await render();
    await press(tree, "Accept this job");
    expect(mockAccept).toHaveBeenCalledTimes(1);
    expect(mockAccept).toHaveBeenCalledWith(ORDER_ID);
    expect(mockReplace).toHaveBeenCalledWith("/rider/food-job");
    act(() => tree.unmount());

    mockGetOffers.mockResolvedValue([offer({ kind: "booking" })]);
    tree = await render();
    await press(tree, "Accept this job");
    expect(mockReplace).toHaveBeenLastCalledWith("/rider/job");
    act(() => tree.unmount());
  });

  it("Not this one passes", async () => {
    mockGetOffers.mockResolvedValue([offer()]);
    mockDecline.mockResolvedValue({ orderId: ORDER_ID, declined: true });
    const tree = await render();
    await press(tree, "Not this one");
    expect(mockDecline).toHaveBeenCalledWith(ORDER_ID);
    expect(mockAccept).not.toHaveBeenCalled();
  });

  it("F4: gone from the read (taken or out of time) → 'That one went to another biker' with the hold in seconds", async () => {
    mockGetOffers.mockResolvedValue([]);
    const tree = await render();
    const text = textOf(tree);
    expect(text).toContain("That one went to another biker");
    // Nothing left to read the shop from: the biker's own fleet names it.
    expect(text).toContain(`${SHOP} jobs hold for 40 seconds, then go to the next biker.`);
    expect(tree.root.findAll((n) => n.props.label === "Back to jobs" && typeof n.props.onPress === "function")).toHaveLength(1);
  });
});
