import * as SecureStore from "expo-secure-store";

/**
 * Restart-survival snapshot for a placed food order (RESTAURANTS-DECISIONS.md §3 "Survives an app
 * restart: live order id + last known status") — PII-free (id + status + two booleans), mirroring
 * `net/restaurant-list-store.ts`'s best-effort SecureStore pattern. Lets the order screen warm-paint
 * a status pill immediately on mount (app kill mid-order, deep link, cold start) instead of a bare
 * skeleton while the live `GET /restaurants/orders/:id` round-trip is in flight. Full "land directly
 * on the live order" boot routing is D4's job (its own restart-tolerance bullet) — this is scoped to
 * the order screen's own warm paint.
 *
 * `sawRider` also survives the restart: a dropped food order is byte-for-byte identical to one that
 * never had a rider (`riderId` null, `merchantPhase: "ready_for_pickup"`), so the only thing that
 * tells them apart is having SEEN a rider. Persisting that boolean lets a cold start after a drop
 * still show the specific "your rider dropped off" screen instead of a generic "finding a rider".
 */
export const FOOD_ORDER_SNAPSHOT_KEY = "lynia.food-order.snapshot.v1";

export interface FoodOrderSnapshot {
  orderId: string;
  status: string;
  merchantPhase: string | null;
  /** True once this order has had a rider assigned — latches, so it distinguishes a rider-dropped
   *  order from a never-assigned one across an app kill. */
  sawRider: boolean;
  savedAt: string;
}

export async function saveFoodOrderSnapshot(
  orderId: string,
  status: string,
  merchantPhase: string | null,
  sawRider: boolean,
): Promise<void> {
  try {
    const snapshot: FoodOrderSnapshot = { orderId, status, merchantPhase, sawRider, savedAt: new Date().toISOString() };
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
    return {
      orderId: parsed.orderId,
      status: parsed.status,
      merchantPhase: parsed.merchantPhase ?? null,
      sawRider: parsed.sawRider === true,
      savedAt: parsed.savedAt,
    };
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
