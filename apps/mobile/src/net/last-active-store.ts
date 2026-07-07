import * as SecureStore from "expo-secure-store";
import type { OrderSnapshot } from "../api/orders";
import { deserializeLastActive, type LastActive, serializeLastActive, toLastActive } from "../logic/last-active";

/**
 * Persist a bounded summary of the customer's active order to SecureStore (keyed per order, mirroring
 * the delivery-code store) so an offline cold start can show the last-known order instead of a dead-end.
 * All best-effort — a native read/write failure must never trap the tracking screen; the worst case is
 * just the normal "couldn't load / retry" state.
 */
const key = (orderId: string): string => `lynia.lastActive.${orderId}`;

export async function saveLastActiveOrder(o: OrderSnapshot): Promise<void> {
  try {
    await SecureStore.setItemAsync(key(o.id), serializeLastActive(toLastActive(o, new Date().toISOString())));
  } catch {
    /* best-effort */
  }
}

export async function loadLastActiveOrder(orderId: string): Promise<LastActive | null> {
  try {
    const raw = await SecureStore.getItemAsync(key(orderId));
    return raw ? deserializeLastActive(raw) : null;
  } catch {
    return null;
  }
}

export async function clearLastActiveOrder(orderId: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key(orderId));
  } catch {
    /* best-effort */
  }
}
