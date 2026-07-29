import * as SecureStore from "expo-secure-store";
import type { FoodCartState } from "../logic/food-cart";

/**
 * §3 "survives an app restart": the PII-free cart draft (dish ids/names/prices/qty/notes only, no
 * customer PII) persists across a cold start, mirroring `net/history-store.ts`'s best-effort
 * SecureStore snapshot pattern.
 */
export const FOOD_CART_SNAPSHOT_KEY = "lynia.food-cart.snapshot.v1";

export async function saveFoodCart(cart: FoodCartState): Promise<void> {
  try {
    await SecureStore.setItemAsync(FOOD_CART_SNAPSHOT_KEY, JSON.stringify(cart));
  } catch {
    /* best-effort */
  }
}

export async function loadFoodCart(): Promise<FoodCartState | null> {
  try {
    const raw = await SecureStore.getItemAsync(FOOD_CART_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<FoodCartState>;
    if (!Array.isArray(parsed.lines)) return null;
    return {
      restaurantId: parsed.restaurantId ?? null,
      restaurantName: parsed.restaurantName ?? null,
      lines: parsed.lines,
      orderNote: parsed.orderNote ?? "",
    };
  } catch {
    return null;
  }
}

export async function clearFoodCart(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(FOOD_CART_SNAPSHOT_KEY);
  } catch {
    /* best-effort */
  }
}
