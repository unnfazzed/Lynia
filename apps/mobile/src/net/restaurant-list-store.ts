import type { RestaurantListItem } from "@lynia/shared";
import * as SecureStore from "expo-secure-store";

/**
 * Warm-paint snapshot for the restaurant list (D-19 offline state: "restaurant list cached with a
 * visible timestamp"), mirroring `net/history-store.ts`'s best-effort SecureStore snapshot. `savedAt`
 * is what the offline banner shows ("Showing what we had at HH:MM").
 */
export const RESTAURANT_LIST_SNAPSHOT_KEY = "lynia.restaurants.list-snapshot.v1";

export interface RestaurantListSnapshot {
  restaurants: RestaurantListItem[];
  savedAt: string;
}

export async function saveRestaurantListSnapshot(restaurants: RestaurantListItem[]): Promise<void> {
  try {
    const snapshot: RestaurantListSnapshot = { restaurants, savedAt: new Date().toISOString() };
    await SecureStore.setItemAsync(RESTAURANT_LIST_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    /* best-effort */
  }
}

export async function loadRestaurantListSnapshot(): Promise<RestaurantListSnapshot | null> {
  try {
    const raw = await SecureStore.getItemAsync(RESTAURANT_LIST_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RestaurantListSnapshot>;
    if (!parsed || !Array.isArray(parsed.restaurants) || typeof parsed.savedAt !== "string") return null;
    return parsed as RestaurantListSnapshot;
  } catch {
    return null;
  }
}
