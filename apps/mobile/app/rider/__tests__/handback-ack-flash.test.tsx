/**
 * MOB-BOOT-02 (sibling of the feature-flag boot flash): a screen must never render a decision it has
 * not yet made. `ackedHandbacks` was seeded with an EMPTY Set and filled by an async SecureStore read,
 * so between mount and that read landing the screen asserted "this rider has acknowledged nothing" —
 * and for a cancelled order still inside its 24h reopen window that meant re-showing the whole
 * hand-back terminal to a rider who had already tapped "Back to board", then swapping it for
 * "No active job" once the read resolved. Two different full screens, back to back, on a screen the
 * rider reaches straight from the board.
 *
 * The fix gives the state a `"loading"` sentinel — the same idiom `persistedTerminal` in this screen
 * already used — and holds the skeleton until the read settles. These tests drive the real screens
 * with the handback read held open deliberately, so the pre-fix code fails them: with an empty Set it
 * renders the cancelled terminal immediately rather than the skeleton.
 */
import React from "react";
import renderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { OrderSnapshot } from "../../../src/api/orders";

const HANDBACK_ACK_KEY = "lynia.handbackAck";

const mockGetActiveOrder = jest.fn<Promise<OrderSnapshot | null>, unknown[]>();
const mockGetOrder = jest.fn<Promise<OrderSnapshot>, [string]>();
const mockReplace = jest.fn();

/** SecureStore reads for the handback-ack key are held open until the test releases them, so the
 *  "read still in flight" window — normally a few ms — can be asserted on deterministically. */
let releaseHandbackRead: ((value: string | null) => void) | null = null;
let secureStore: Record<string, string> = {};
const mockGetItemAsync = jest.fn(async (key: string) => {
  if (key === HANDBACK_ACK_KEY) {
    return new Promise<string | null>((resolve) => {
      releaseHandbackRead = resolve;
    });
  }
  return secureStore[key] ?? null;
});

function cancelledOrder(overrides: Partial<OrderSnapshot> = {}): OrderSnapshot {
  return {
    id: "order-1",
    status: "cancelled",
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
    cancelledBy: "customer",
    rebroadcastedToId: null,
    ...overrides,
  } as OrderSnapshot;
}

jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
jest.mock("expo-secure-store", () => ({
  getItemAsync: (...args: [string]) => mockGetItemAsync(...args),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));
jest.mock("../../../src/api/auth", () => ({
  getMe: async () => ({ profileId: "r1", role: "rider" }),
}));
jest.mock("../../../src/api/orders", () => ({
  getActiveOrder: (...args: unknown[]) => mockGetActiveOrder(...args),
  getOrder: (...args: [string]) => mockGetOrder(...args),
  confirmDelivery: jest.fn(),
  advanceStatus: jest.fn(),
  cancelOrder: jest.fn(),
  confirmItems: jest.fn(),
  markUndelivered: jest.fn(),
  rateSender: jest.fn(),
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

/** Counts rendered text nodes whose string content contains `needle`. */
function textHits(tree: renderer.ReactTestRenderer, needle: string): number {
  return tree.root.findAll((n) => typeof n.props.children === "string" && n.props.children.includes(needle)).length;
}

function isSkeletonShowing(tree: renderer.ReactTestRenderer): boolean {
  return tree.root.findAll((n) => n.props.accessibilityState?.busy === true || n.props.accessibilityLabel === "Loading").length > 0;
}

beforeEach(() => {
  secureStore = {};
  releaseHandbackRead = null;
  mockGetActiveOrder.mockReset();
  mockGetOrder.mockReset();
  mockReplace.mockClear();
  mockGetItemAsync.mockClear();
});

afterEach(() => {
  if (activeTree) {
    act(() => activeTree!.unmount());
    activeTree = null;
  }
});

describe("rider job — no hand-back terminal flashes before the acknowledged list is read (MOB-BOOT-02)", () => {
  it("holds the skeleton while the acknowledged-handbacks read is in flight, instead of asserting the cancel is unacknowledged", async () => {
    mockGetActiveOrder.mockResolvedValue(cancelledOrder());

    const tree = await render();

    // The read is deliberately still pending here. Pre-fix, `ackedHandbacks` was an empty Set from the
    // first render, so `!ackedHandbacks.has(order.id)` was true and the full hand-back terminal
    // rendered — the wrong screen, and one this rider may have already dismissed.
    expect(textHits(tree, "This order was cancelled")).toBe(0);
    expect(textHits(tree, "No active job")).toBe(0);
    expect(isSkeletonShowing(tree)).toBe(true);
  });

  it("settles to 'No active job' (not the hand-back terminal) once the read shows this order was already acknowledged", async () => {
    mockGetActiveOrder.mockResolvedValue(cancelledOrder());

    const tree = await render();
    await act(async () => {
      releaseHandbackRead?.(JSON.stringify(["order-1"]));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(textHits(tree, "No active job")).toBeGreaterThan(0);
    expect(textHits(tree, "This order was cancelled")).toBe(0);
  });

  it("still shows the hand-back terminal when the read confirms the cancel was NOT acknowledged — the fix delays the decision, it doesn't suppress it", async () => {
    mockGetActiveOrder.mockResolvedValue(cancelledOrder());

    const tree = await render();
    await act(async () => {
      releaseHandbackRead?.(JSON.stringify(["some-other-order"]));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(textHits(tree, "No active job")).toBe(0);
    // The hand-back terminal owns the screen: its "Back to board" action is present.
    expect(tree.root.findAll((n) => n.props.label === "Back to board" && typeof n.props.onPress === "function").length).toBeGreaterThan(0);
  });
});
