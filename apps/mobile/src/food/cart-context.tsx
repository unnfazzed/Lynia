import React, { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import {
  addLine,
  cartItemCount,
  cartSmallOrderFee,
  cartSubtotal,
  cartTotal,
  EMPTY_CART,
  type FoodCartLine,
  type FoodCartState,
  type FoodCartVenue,
  isBelowMinimumOrder,
  newCartNonce,
  removeLine,
  setLineQuantity,
} from "../logic/food-cart";
import { clearFoodCart, loadFoodCart, saveFoodCart } from "../net/food-cart-store";

export interface FoodCartApi {
  cart: FoodCartState;
  itemCount: number;
  subtotal: number;
  smallOrderFee: number;
  total: number;
  belowMinimum: boolean;
  /** True once the persisted draft has been read (or found absent) — screens can wait on this
   *  before deciding "cart is empty" vs "still loading the restart-survival snapshot". */
  ready: boolean;
  /** Adds a line for `restaurantId` (any venue: restaurant, shop or pharmacy — `venue` records which).
   *  Switching to a DIFFERENT venue than the one already in the cart replaces it outright (one basket at
   *  a time; the storefront asks first, I3); returns `true` when that happened. */
  addItem: (restaurantId: string, restaurantName: string, line: FoodCartLine, venue?: FoodCartVenue | null) => boolean;
  setQuantity: (dishId: string, note: string, quantity: number) => void;
  removeItem: (dishId: string, note: string) => void;
  setOrderNote: (note: string) => void;
  /** Replace the lines wholesale (used by the cart screen's OOS/price-change reconciliation). */
  replaceLines: (lines: FoodCartLine[]) => void;
  clear: () => void;
}

/** How long a burst of cart edits is coalesced before it reaches SecureStore. Long enough to absorb
 *  typing in the order note and a run of stepper taps, short enough that an ordinary pause persists
 *  well before the customer could kill the app. */
export const CART_PERSIST_DEBOUNCE_MS = 600;

const FoodCartContext = createContext<FoodCartApi | null>(null);

/**
 * ONE cart across every venue (Order flow v2, ledger D-59: "Start a new cart?" spans restaurants, shops
 * and pharmacies). `/food`, `/shops` and `/pharmacy` each mount a FoodCartProvider in their layout, so the
 * state lives here, outside React, and every mounted provider reads the same snapshot: a shop storefront
 * pushing the Review route (which lives under `/food`) sees the basket it just built, with no SecureStore
 * round trip in between. The snapshot is loaded when the first provider mounts and dropped (after a
 * final flush) when the last one unmounts, so a later visit re-reads what was persisted.
 */
interface SharedCart {
  cart: FoodCartState;
  ready: boolean;
  mounts: number;
  /** Bumped on every reset so a load that started before it can't land on the next session. */
  epoch: number;
  timer: ReturnType<typeof setTimeout> | null;
  listeners: Set<() => void>;
}

const shared: SharedCart = { cart: EMPTY_CART, ready: false, mounts: 0, epoch: 0, timer: null, listeners: new Set() };

function emit(): void {
  for (const l of shared.listeners) l();
}

function flush(): void {
  if (shared.timer) {
    clearTimeout(shared.timer);
    shared.timer = null;
  }
  if (shared.ready) void saveFoodCart(shared.cart);
}

function update(next: (prev: FoodCartState) => FoodCartState): void {
  shared.cart = next(shared.cart);
  emit();
  // Persist once the initial load has landed (so a load-in-progress can't be clobbered by writing the
  // still-default EMPTY_CART over a just-restored draft).
  //
  // DEBOUNCED (docs/ANDROID-TAP-RESPONSIVENESS-RCA-2026-08-19.md §2.5). `saveFoodCart` is a SecureStore
  // write — AndroidKeyStore AES encryption plus a SharedPreferences commit — and it used to fire on EVERY
  // cart mutation: each `+`/`-` on the quantity stepper, and each keystroke of the order note. The write
  // is async, but it queues on the native-modules thread every other native call shares, so a burst of
  // them landed squarely on the tap path. Coalescing a burst into one write costs nothing the contract
  // cares about: the snapshot exists to survive a RESTART, and the flush when a provider unmounts closes
  // the only window that could lose (the last few hundred ms before it goes away).
  if (!shared.ready) return;
  if (shared.timer) clearTimeout(shared.timer);
  shared.timer = setTimeout(() => {
    shared.timer = null;
    void saveFoodCart(shared.cart);
  }, CART_PERSIST_DEBOUNCE_MS);
}

function subscribe(listener: () => void): () => void {
  shared.listeners.add(listener);
  return () => {
    shared.listeners.delete(listener);
  };
}

/** The snapshot `useSyncExternalStore` reads — a new object only when the cart or `ready` changes. */
let snap = { cart: shared.cart, ready: shared.ready };
function getSnapshot(): { cart: FoodCartState; ready: boolean } {
  if (snap.cart !== shared.cart || snap.ready !== shared.ready) snap = { cart: shared.cart, ready: shared.ready };
  return snap;
}

function mount(): void {
  shared.mounts += 1;
  if (shared.mounts > 1) return;
  const epoch = shared.epoch;
  void loadFoodCart().then((saved) => {
    if (epoch !== shared.epoch) return;
    // U02: a draft saved before carts carried a nonce gets one now (and keeps it across restarts), so
    // its place-order key is still stable for retries but no longer collides with a past order.
    const legacy = !!saved && saved.lines.length > 0 && !saved.nonce;
    if (saved) shared.cart = legacy ? { ...saved, nonce: newCartNonce() } : saved;
    shared.ready = true;
    emit();
    if (legacy) void saveFoodCart(shared.cart);
  });
}

function unmount(): void {
  // Unmount flush: a pending debounced write is cancelled and written now, so a customer who edits the
  // cart and immediately leaves the section can't lose the edit.
  flush();
  shared.mounts = Math.max(0, shared.mounts - 1);
  if (shared.mounts > 0) return;
  shared.epoch += 1;
  shared.cart = EMPTY_CART;
  shared.ready = false;
}

const addItem = (restaurantId: string, restaurantName: string, line: FoodCartLine, venue?: FoodCartVenue | null): boolean => {
  let switched = false;
  update((prev) => {
    if (prev.restaurantId && prev.restaurantId !== restaurantId) {
      switched = true;
      return { restaurantId, restaurantName, lines: [line], orderNote: "", venue: venue ?? null, nonce: newCartNonce() };
    }
    // U02: a cart starts with its first line — that is when its nonce is minted; later lines keep it.
    const nonce = prev.lines.length > 0 && prev.nonce ? prev.nonce : newCartNonce();
    return { restaurantId, restaurantName, lines: addLine(prev.lines, line), orderNote: prev.orderNote, venue: venue ?? prev.venue ?? null, nonce };
  });
  return switched;
};

const setQuantity = (dishId: string, note: string, quantity: number): void => {
  update((prev) => {
    const lines = setLineQuantity(prev.lines, dishId, note, quantity);
    return lines.length ? { ...prev, lines } : EMPTY_CART;
  });
};

const removeItem = (dishId: string, note: string): void => {
  update((prev) => {
    const lines = removeLine(prev.lines, dishId, note);
    return lines.length ? { ...prev, lines } : EMPTY_CART;
  });
};

const setOrderNote = (note: string): void => update((prev) => ({ ...prev, orderNote: note }));

const replaceLines = (lines: FoodCartLine[]): void => update((prev) => (lines.length ? { ...prev, lines } : EMPTY_CART));

const clear = (): void => {
  if (shared.timer) {
    clearTimeout(shared.timer);
    shared.timer = null;
  }
  // U02: EMPTY_CART carries no nonce — the next cart mints its own, so it is a new order.
  shared.cart = EMPTY_CART;
  emit();
  void clearFoodCart();
};

export function FoodCartProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const { cart, ready } = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    mount();
    return unmount;
  }, []);

  const value = useMemo<FoodCartApi>(
    () => ({
      cart,
      itemCount: cartItemCount(cart.lines),
      subtotal: cartSubtotal(cart.lines),
      smallOrderFee: cartSmallOrderFee(cart.lines),
      total: cartTotal(cart.lines),
      belowMinimum: isBelowMinimumOrder(cart.lines),
      ready,
      addItem,
      setQuantity,
      removeItem,
      setOrderNote,
      replaceLines,
      clear,
    }),
    [cart, ready],
  );

  return <FoodCartContext.Provider value={value}>{children}</FoodCartContext.Provider>;
}

export function useFoodCart(): FoodCartApi {
  const ctx = useContext(FoodCartContext);
  if (!ctx) throw new Error("useFoodCart must be used within a FoodCartProvider");
  return ctx;
}
