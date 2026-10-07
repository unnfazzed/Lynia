import TestRenderer, { act } from "react-test-renderer";

const mockSetItemAsync = jest.fn().mockResolvedValue(undefined);
const mockGetItemAsync = jest.fn().mockResolvedValue(null);
const mockDeleteItemAsync = jest.fn().mockResolvedValue(undefined);
jest.mock("expo-secure-store", () => ({
  setItemAsync: (...a: unknown[]) => mockSetItemAsync(...a),
  getItemAsync: (...a: unknown[]) => mockGetItemAsync(...a),
  deleteItemAsync: (...a: unknown[]) => mockDeleteItemAsync(...a),
}));

import { foodOrderIdempotencyKey } from "../../logic/food-cart";
import { CART_PERSIST_DEBOUNCE_MS, FoodCartProvider, useFoodCart, type FoodCartApi } from "../cart-context";

/**
 * Cart persistence is debounced (docs/ANDROID-TAP-RESPONSIVENESS-RCA-2026-08-19.md §2.5).
 *
 * `saveFoodCart` is a SecureStore write — AndroidKeyStore AES encryption plus a SharedPreferences
 * commit — and it used to fire on EVERY cart mutation: every `+`/`-` on the quantity stepper, and
 * every keystroke of the order note. The write never blocked the render, but it queues on the
 * native-modules thread that every other native call shares, so a burst landed squarely on the tap
 * path. These tests pin both halves of the trade: a burst coalesces to one write, and nothing is
 * lost when the provider goes away before the debounce fires.
 */

const LINE = { dishId: "d1", name: "Sadza & beef", priceUsd: 3.5, quantity: 1, note: "" };

function mountCart(): { api: () => FoodCartApi; unmount: () => void } {
  let latest!: FoodCartApi;
  const Probe = (): null => {
    latest = useFoodCart();
    return null;
  };
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      <FoodCartProvider>
        <Probe />
      </FoodCartProvider>,
    );
  });
  // Let the initial `loadFoodCart()` read settle so `ready` flips and writes are armed.
  act(() => {
    jest.runOnlyPendingTimers();
  });
  return {
    api: () => latest,
    unmount: () =>
      act(() => {
        tree.unmount();
      }),
  };
}

beforeEach(() => {
  jest.useFakeTimers();
  mockSetItemAsync.mockClear();
  mockGetItemAsync.mockClear().mockResolvedValue(null);
});
afterEach(() => jest.useRealTimers());

describe("cart persistence", () => {
  it("coalesces a burst of edits into ONE keystore write", async () => {
    const cart = mountCart();
    await act(async () => {
      cart.api().addItem("r1", "Gava's", LINE);
    });
    mockSetItemAsync.mockClear();

    // A run of stepper taps — the shape that used to mint one encrypted write each.
    await act(async () => {
      cart.api().setQuantity("d1", "", 2);
      cart.api().setQuantity("d1", "", 3);
      cart.api().setQuantity("d1", "", 4);
    });
    expect(mockSetItemAsync).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(CART_PERSIST_DEBOUNCE_MS);
    });
    expect(mockSetItemAsync).toHaveBeenCalledTimes(1);
    const [, payload] = mockSetItemAsync.mock.calls[0] as [string, string];
    // The write that lands is the LAST state, not a stale intermediate one.
    expect(JSON.parse(payload).lines[0].quantity).toBe(4);
  });

  it("still persists once the edits stop", async () => {
    const cart = mountCart();
    await act(async () => {
      cart.api().addItem("r1", "Gava's", LINE);
    });
    await act(async () => {
      jest.advanceTimersByTime(CART_PERSIST_DEBOUNCE_MS);
    });
    expect(mockSetItemAsync).toHaveBeenCalledTimes(1);
  });

  it("flushes on unmount, so leaving the tab mid-debounce cannot lose the edit", async () => {
    const cart = mountCart();
    await act(async () => {
      cart.api().addItem("r1", "Gava's", LINE);
    });
    mockSetItemAsync.mockClear();

    await act(async () => {
      cart.api().setOrderNote("no chilli");
    });
    expect(mockSetItemAsync).not.toHaveBeenCalled(); // still inside the debounce window

    cart.unmount();
    expect(mockSetItemAsync).toHaveBeenCalledTimes(1);
    const [, payload] = mockSetItemAsync.mock.calls[0] as [string, string];
    expect(JSON.parse(payload).orderNote).toBe("no chilli");
  });
});

/**
 * U02 (BLOCKER): the place-order key used to be derived from the basket alone, so ordering the same
 * dishes to the same address again replayed the OLD order (cancelled / delivered) instead of placing a
 * new one. A cart now carries a nonce minted when it starts and dropped with it.
 */
describe("cart nonce → place-order idempotency key (U02)", () => {
  const ATTEMPT = "-17.8,31.0|cash|asap||";

  it("the same attempt keeps the same key, across a restart (retries still dedupe)", async () => {
    let cart = mountCart();
    await act(async () => {
      cart.api().addItem("r1", "Gava's", LINE);
    });
    const before = foodOrderIdempotencyKey(cart.api().cart, ATTEMPT);
    expect(cart.api().cart.nonce).toEqual(expect.any(String));
    // A second add to the same cart keeps its nonce.
    await act(async () => {
      cart.api().addItem("r1", "Gava's", { ...LINE, dishId: "d2" });
      cart.api().removeItem("d2", "");
    });
    expect(foodOrderIdempotencyKey(cart.api().cart, ATTEMPT)).toBe(before);

    // Restart: the persisted draft (with its nonce) is read back.
    cart.unmount();
    const [, payload] = mockSetItemAsync.mock.calls[mockSetItemAsync.mock.calls.length - 1] as [string, string];
    mockGetItemAsync.mockResolvedValue(payload);
    cart = mountCart();
    await act(async () => {});
    expect(cart.api().ready).toBe(true);
    expect(foodOrderIdempotencyKey(cart.api().cart, ATTEMPT)).toBe(before);
    cart.unmount();
  });

  it("a new cart after clear() with the very same basket gets a NEW key", async () => {
    const cart = mountCart();
    await act(async () => {
      cart.api().addItem("r1", "Gava's", LINE);
    });
    const first = foodOrderIdempotencyKey(cart.api().cart, ATTEMPT);
    await act(async () => {
      cart.api().clear();
    });
    expect(cart.api().cart.nonce).toBeUndefined();
    await act(async () => {
      cart.api().addItem("r1", "Gava's", LINE);
    });
    expect(foodOrderIdempotencyKey(cart.api().cart, ATTEMPT)).not.toBe(first);
    cart.unmount();
  });

  it("a draft saved before nonces existed gets one on load (no collision with a past order's key)", async () => {
    mockGetItemAsync.mockResolvedValue(JSON.stringify({ restaurantId: "r1", restaurantName: "Gava's", lines: [LINE], orderNote: "" }));
    const cart = mountCart();
    await act(async () => {});
    expect(cart.api().cart.nonce).toEqual(expect.any(String));
    expect(foodOrderIdempotencyKey(cart.api().cart, ATTEMPT)).not.toBe(foodOrderIdempotencyKey({ ...cart.api().cart, nonce: undefined }, ATTEMPT));
    cart.unmount();
  });
});
