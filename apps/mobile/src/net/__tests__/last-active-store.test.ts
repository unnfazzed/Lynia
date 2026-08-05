/**
 * UX-2026-08-05: the single-slot "an order may be in flight" hint that gates
 * ActiveOrderCheckFailedBanner (see useActiveOrderCheckGate). Two properties matter enough to pin:
 *  1. the hint tracks the last-active summary's lifecycle (armed on save, cleared on terminal), and
 *  2. clearing is CONDITIONAL on the order id — a customer re-reading an OLD completed trip from
 *     history mounts the same tracker effect (which calls clearLastActiveOrder for that old id) and
 *     must not disarm the banner for a different, genuinely live order.
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
import { clearActiveOrderHintFor, clearLastActiveOrder, loadActiveOrderHint, ORDER_HINT_KEY, saveActiveOrderHint, saveLastActiveOrder } from "../last-active-store";

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

describe("active-order hint slot", () => {
  it("saveLastActiveOrder arms the hint alongside the per-order summary", async () => {
    await saveLastActiveOrder(snapshot("order-1"));
    expect(await loadActiveOrderHint()).toBe("order-1");
    expect(secureStore["lynia.lastActive.order-1"]).toBeTruthy();
  });

  it("clearLastActiveOrder disarms the hint when it points at that same order", async () => {
    await saveLastActiveOrder(snapshot("order-1"));
    await clearLastActiveOrder("order-1");
    expect(await loadActiveOrderHint()).toBeNull();
  });

  it("clearing an OLD order's summary leaves a different live order's hint armed", async () => {
    await saveActiveOrderHint("order-live");
    await clearLastActiveOrder("order-old-completed");
    expect(await loadActiveOrderHint()).toBe("order-live");
  });

  it("clearActiveOrderHintFor is a no-op for a non-matching id", async () => {
    await saveActiveOrderHint("order-live");
    await clearActiveOrderHintFor("order-other");
    expect(secureStore[ORDER_HINT_KEY]).toBe("order-live");
  });

  it("hint reads/writes are best-effort: a throwing keystore yields null, never a rejection", async () => {
    mockGetItemAsync.mockRejectedValueOnce(new Error("keystore broken"));
    await expect(loadActiveOrderHint()).resolves.toBeNull();
    mockSetItemAsync.mockRejectedValueOnce(new Error("keystore broken"));
    await expect(saveActiveOrderHint("order-1")).resolves.toBeUndefined();
  });
});
