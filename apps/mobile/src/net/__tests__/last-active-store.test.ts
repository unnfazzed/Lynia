/**
 * The customer's per-order "last active" summary slot.
 *
 * This file used to pin the single-slot `lynia.activeOrderHint` that gated
 * `ActiveOrderCheckFailedBanner` (UX-2026-08-05's `useActiveOrderCheckGate`). Both the banner and the
 * gate are GONE — owner instruction 2026-08-12: an error card belongs to an action the customer took,
 * never to a background poll, the same rule that removed the rider board's card. So the hint has no
 * reader left and its read/write helpers are deleted.
 *
 * What's pinned now: (1) the per-order summary still saves/loads/clears (it's what paints the tracker's
 * warm cold-start), and (2) the retired hint is genuinely NOT written any more — a regression here
 * would mean the removed banner's evidence machinery had quietly crept back in.
 */
const mockDeleteItemAsync = jest.fn(async (key: string) => {
  delete secureStore[key];
});
const mockGetItemAsync = jest.fn(async (key: string) => secureStore[key] ?? null);
const mockSetItemAsync = jest.fn(async (key: string, value: string) => {
  secureStore[key] = value;
});
let secureStore: Record<string, string> = {};

jest.mock("expo-secure-store", () => ({
  deleteItemAsync: (...args: [string]) => mockDeleteItemAsync(...args),
  getItemAsync: (...args: [string]) => mockGetItemAsync(...args),
  setItemAsync: (...args: [string, string]) => mockSetItemAsync(...args),
}));

import type { OrderSnapshot } from "../../api/orders";
import { clearLastActiveOrder, loadLastActiveOrder, ORDER_HINT_KEY, saveLastActiveOrder } from "../last-active-store";

function snapshot(id: string): OrderSnapshot {
  return {
    id,
    status: "en_route_pickup",
    agreedFare: "8.00",
    proposedFare: "7.50",
    pickup: { point: { lat: 0, lng: 0 }, landmark: "A" },
    dropoff: { point: { lat: 0, lng: 0 }, landmark: "B" },
    rider: null,
  } as unknown as OrderSnapshot;
}

afterEach(() => {
  secureStore = {};
  jest.clearAllMocks();
});

describe("last-active order summary slot", () => {
  it("saves and reads back a per-order summary", async () => {
    await saveLastActiveOrder(snapshot("order-1"));
    expect(secureStore["lynia.lastActive.order-1"]).toBeTruthy();
    const back = await loadLastActiveOrder("order-1");
    expect(back?.id).toBe("order-1");
  });

  it("clearLastActiveOrder drops that order's summary", async () => {
    await saveLastActiveOrder(snapshot("order-1"));
    await clearLastActiveOrder("order-1");
    expect(secureStore["lynia.lastActive.order-1"]).toBeUndefined();
    expect(await loadLastActiveOrder("order-1")).toBeNull();
  });

  it("clearing one order's summary leaves another order's summary intact", async () => {
    await saveLastActiveOrder(snapshot("order-live"));
    await saveLastActiveOrder(snapshot("order-old"));
    await clearLastActiveOrder("order-old");
    expect(await loadLastActiveOrder("order-live")).not.toBeNull();
  });

  it("a throwing keystore is best-effort: a failed save never rejects", async () => {
    mockSetItemAsync.mockRejectedValueOnce(new Error("keystore broken"));
    await expect(saveLastActiveOrder(snapshot("order-1"))).resolves.toBeUndefined();
  });

  it("a throwing keystore is best-effort: a failed read yields null, never a rejection", async () => {
    mockGetItemAsync.mockRejectedValueOnce(new Error("keystore broken"));
    await expect(loadLastActiveOrder("order-1")).resolves.toBeNull();
  });

  // The removal pin: saving a live order must no longer arm the retired banner's evidence slot.
  it("does NOT write the retired active-order hint (the banner it gated is gone)", async () => {
    await saveLastActiveOrder(snapshot("order-1"));
    expect(secureStore[ORDER_HINT_KEY]).toBeUndefined();
    expect(mockSetItemAsync).not.toHaveBeenCalledWith(ORDER_HINT_KEY, expect.anything());
  });

  // ORDER_HINT_KEY itself is deliberately still exported for `clearDeviceState` only: an install
  // upgrading from a build that DID write the hint must still have it wiped at sign-out on a shared
  // device. Pin the constant so that wipe can't silently start targeting the wrong key.
  it("still exports the legacy hint key for the sign-out wipe", () => {
    expect(ORDER_HINT_KEY).toBe("lynia.activeOrderHint");
  });
});
