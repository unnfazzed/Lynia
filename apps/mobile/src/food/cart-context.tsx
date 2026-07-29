import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  addLine,
  cartItemCount,
  cartSmallOrderFee,
  cartSubtotal,
  cartTotal,
  EMPTY_CART,
  type FoodCartLine,
  type FoodCartState,
  isBelowMinimumOrder,
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
  /** Adds a line for `restaurantId`. Switching to a DIFFERENT restaurant than the one already in the
   *  cart replaces it outright (one kitchen's basket at a time — matches the menu screen only ever
   *  showing one restaurant); returns `true` when that happened, so the caller can toast about it. */
  addItem: (restaurantId: string, restaurantName: string, line: FoodCartLine) => boolean;
  setQuantity: (dishId: string, note: string, quantity: number) => void;
  removeItem: (dishId: string, note: string) => void;
  setOrderNote: (note: string) => void;
  /** Replace the lines wholesale (used by the cart screen's OOS/price-change reconciliation). */
  replaceLines: (lines: FoodCartLine[]) => void;
  clear: () => void;
}

const FoodCartContext = createContext<FoodCartApi | null>(null);

export function FoodCartProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [cart, setCart] = useState<FoodCartState>(EMPTY_CART);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadFoodCart().then((saved) => {
      if (cancelled) return;
      if (saved) setCart(saved);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist every change once the initial load has landed (so a load-in-progress can't be clobbered
  // by writing the still-default EMPTY_CART over a just-restored draft).
  useEffect(() => {
    if (ready) void saveFoodCart(cart);
  }, [cart, ready]);

  const addItem = useCallback((restaurantId: string, restaurantName: string, line: FoodCartLine): boolean => {
    let switched = false;
    setCart((prev) => {
      if (prev.restaurantId && prev.restaurantId !== restaurantId) {
        switched = true;
        return { restaurantId, restaurantName, lines: [line], orderNote: "" };
      }
      return { restaurantId, restaurantName, lines: addLine(prev.lines, line), orderNote: prev.orderNote };
    });
    return switched;
  }, []);

  const setQuantity = useCallback((dishId: string, note: string, quantity: number): void => {
    setCart((prev) => {
      const lines = setLineQuantity(prev.lines, dishId, note, quantity);
      return lines.length ? { ...prev, lines } : EMPTY_CART;
    });
  }, []);

  const removeItem = useCallback((dishId: string, note: string): void => {
    setCart((prev) => {
      const lines = removeLine(prev.lines, dishId, note);
      return lines.length ? { ...prev, lines } : EMPTY_CART;
    });
  }, []);

  const setOrderNote = useCallback((note: string): void => {
    setCart((prev) => ({ ...prev, orderNote: note }));
  }, []);

  const replaceLines = useCallback((lines: FoodCartLine[]): void => {
    setCart((prev) => (lines.length ? { ...prev, lines } : EMPTY_CART));
  }, []);

  const clear = useCallback((): void => {
    setCart(EMPTY_CART);
    void clearFoodCart();
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
    [cart, ready, addItem, setQuantity, removeItem, setOrderNote, replaceLines, clear],
  );

  return <FoodCartContext.Provider value={value}>{children}</FoodCartContext.Provider>;
}

export function useFoodCart(): FoodCartApi {
  const ctx = useContext(FoodCartContext);
  if (!ctx) throw new Error("useFoodCart must be used within a FoodCartProvider");
  return ctx;
}
