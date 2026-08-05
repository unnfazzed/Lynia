/**
 * The food-order restart snapshot (kit `resume`). The screen has always WRITTEN this snapshot, but
 * `loadFoodOrderSnapshot` was never called anywhere in the app — the read half was dead code, so an
 * app-kill mid-order came back to a bare skeleton instead of "picking up where you left off". Now
 * that the order screen reads it to warm-paint, these pin the round trip and the guards the warm
 * paint depends on: a malformed or absent blob must degrade to `null` (never throw into a mount
 * effect), and a cleared order must not resurrect.
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

import { clearFoodOrderSnapshot, FOOD_ORDER_SNAPSHOT_KEY, loadFoodOrderSnapshot, saveFoodOrderSnapshot } from "../food-order-store";

beforeEach(() => {
  secureStore = {};
  mockDeleteItemAsync.mockClear();
  mockGetItemAsync.mockClear();
  mockSetItemAsync.mockClear();
});

describe("food order restart snapshot (kit `resume`)", () => {
  it("round-trips the id, status and kitchen phase the warm paint needs", async () => {
    await saveFoodOrderSnapshot("order-1", "requested", "preparing");
    const snap = await loadFoodOrderSnapshot();
    expect(snap).not.toBeNull();
    expect(snap!.orderId).toBe("order-1");
    expect(snap!.status).toBe("requested");
    // merchantPhase is what resolves the two pre-dispatch steps — losing it would put the restored
    // tracker back at "Order placed" no matter how far the kitchen had actually got.
    expect(snap!.merchantPhase).toBe("preparing");
    expect(typeof snap!.savedAt).toBe("string");
  });

  it("keeps a null kitchen phase null (post-dispatch orders have no merchantPhase)", async () => {
    await saveFoodOrderSnapshot("order-2", "picked_up", null);
    const snap = await loadFoodOrderSnapshot();
    expect(snap!.merchantPhase).toBeNull();
    expect(snap!.status).toBe("picked_up");
  });

  it("returns null when nothing was ever saved", async () => {
    expect(await loadFoodOrderSnapshot()).toBeNull();
  });

  it("returns null (never throws) on a malformed blob — this runs inside a mount effect", async () => {
    secureStore[FOOD_ORDER_SNAPSHOT_KEY] = "{not json";
    await expect(loadFoodOrderSnapshot()).resolves.toBeNull();
  });

  it("returns null on a structurally wrong blob rather than warm-painting garbage", async () => {
    secureStore[FOOD_ORDER_SNAPSHOT_KEY] = JSON.stringify({ orderId: 42, status: null });
    await expect(loadFoodOrderSnapshot()).resolves.toBeNull();
  });

  it("does not resurrect a cleared order (cancel clears the snapshot)", async () => {
    await saveFoodOrderSnapshot("order-3", "requested", "awaiting_accept");
    await clearFoodOrderSnapshot();
    expect(await loadFoodOrderSnapshot()).toBeNull();
  });
});
