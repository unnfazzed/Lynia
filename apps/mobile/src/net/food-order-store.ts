import * as SecureStore from "expo-secure-store";

/**
 * Restart-survival snapshot for a placed food order (RESTAURANTS-DECISIONS.md §3 "Survives an app
 * restart: live order id + last known status") — PII-free (id + status only), mirroring
 * `net/restaurant-list-store.ts`'s best-effort SecureStore pattern. Lets the order screen warm-paint
 * a status pill immediately on mount (app kill mid-order, deep link, cold start) instead of a bare
 * skeleton while the live `GET /restaurants/orders/:id` round-trip is in flight. Full "land directly
 * on the live order" boot routing is D4's job (its own restart-tolerance bullet) — this is scoped to
 * the order screen's own warm paint.
 */
export const FOOD_ORDER_SNAPSHOT_KEY = "lynia.food-order.snapshot.v1";

export interface FoodOrderSnapshot {
  orderId: string;
  status: string;
  merchantPhase: string | null;
  savedAt: string;
}

export async function saveFoodOrderSnapshot(orderId: string, status: string, merchantPhase: string | null): Promise<void> {
  try {
    const snapshot: FoodOrderSnapshot = { orderId, status, merchantPhase, savedAt: new Date().toISOString() };
    await SecureStore.setItemAsync(FOOD_ORDER_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    /* best-effort */
  }
}

export async function loadFoodOrderSnapshot(): Promise<FoodOrderSnapshot | null> {
  try {
    const raw = await SecureStore.getItemAsync(FOOD_ORDER_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<FoodOrderSnapshot>;
    if (!parsed || typeof parsed.orderId !== "string" || typeof parsed.status !== "string" || typeof parsed.savedAt !== "string") return null;
    return { orderId: parsed.orderId, status: parsed.status, merchantPhase: parsed.merchantPhase ?? null, savedAt: parsed.savedAt };
  } catch {
    return null;
  }
}

export async function clearFoodOrderSnapshot(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(FOOD_ORDER_SNAPSHOT_KEY);
  } catch {
    /* best-effort */
  }
}
