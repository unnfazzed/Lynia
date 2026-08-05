import * as SecureStore from "expo-secure-store";
import type { OrderSnapshot } from "../api/orders";
import { deserializeLastActive, type LastActive, serializeLastActive, toLastActive } from "../logic/last-active";

/**
 * Persist a bounded summary of the active trip to SecureStore so an offline cold start can show the
 * last-known trip instead of a "couldn't load" dead-end. Two slots:
 *   - the customer's tracked order, keyed per order id (the tracker route carries the id), and
 *   - the rider's active job, a single slot (the rider fetches "my active job", not a specific id).
 * All best-effort — a native read/write failure must never trap a screen; the worst case is just the
 * normal error/retry state.
 */

// Shared core — one tiny projection, three operations, reused for both slots.
async function put(storeKey: string, o: OrderSnapshot): Promise<void> {
  try {
    await SecureStore.setItemAsync(storeKey, serializeLastActive(toLastActive(o, new Date().toISOString())));
  } catch {
    /* best-effort */
  }
}
async function get(storeKey: string): Promise<LastActive | null> {
  try {
    const raw = await SecureStore.getItemAsync(storeKey);
    return raw ? deserializeLastActive(raw) : null;
  } catch {
    return null;
  }
}
async function del(storeKey: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(storeKey);
  } catch {
    /* best-effort */
  }
}

// --- Customer's tracked order (keyed per order id, mirroring the delivery-code store) ---
const orderKey = (orderId: string): string => `lynia.lastActive.${orderId}`;

export const saveLastActiveOrder = async (o: OrderSnapshot): Promise<void> => {
  await Promise.all([put(orderKey(o.id), o), saveActiveOrderHint(o.id)]);
};
export const loadLastActiveOrder = (orderId: string): Promise<LastActive | null> => get(orderKey(orderId));
export const clearLastActiveOrder = async (orderId: string): Promise<void> => {
  await Promise.all([del(orderKey(orderId)), clearActiveOrderHintFor(orderId)]);
};

// --- "An order may be in flight" hint (single slot, customer side) ---
// The evidence `useActiveOrderCheckGate` (src/ui/ActiveOrderCheckFailedBanner.tsx) reads to decide
// whether a failed active-order check is worth interrupting for. Just the order id — no route, fare,
// or PII. Written the moment a broadcast succeeds (send.tsx) and alongside every saveLastActiveOrder;
// cleared when the check authoritatively returns "none", when the tracker sees the hinted order reach
// a terminal status, and at sign-out (clearDeviceState).
export const ORDER_HINT_KEY = "lynia.activeOrderHint";

export async function saveActiveOrderHint(orderId: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(ORDER_HINT_KEY, orderId);
  } catch {
    /* best-effort */
  }
}
export async function loadActiveOrderHint(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(ORDER_HINT_KEY);
  } catch {
    return null;
  }
}
export async function clearActiveOrderHint(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(ORDER_HINT_KEY);
  } catch {
    /* best-effort */
  }
}
/** Clear the hint only if it still points at `orderId` — the tracker calls this when a viewed order
 *  hits a terminal status, and a customer re-reading an OLD completed trip from history must not wipe
 *  the hint for a different, genuinely live order. */
export async function clearActiveOrderHintFor(orderId: string): Promise<void> {
  try {
    if ((await SecureStore.getItemAsync(ORDER_HINT_KEY)) === orderId) await SecureStore.deleteItemAsync(ORDER_HINT_KEY);
  } catch {
    /* best-effort */
  }
}

// --- Rider's active job (single slot — there's only ever one active job) ---
// Exported so sign-out (auth/session `clearDeviceState`) can wipe it — on a shared device the next
// rider's cold start must not paint the previous rider's job (route landmarks, fare, last GPS).
export const JOB_KEY = "lynia.lastActiveJob";

export const saveLastActiveJob = (o: OrderSnapshot): Promise<void> => put(JOB_KEY, o);
export const loadLastActiveJob = (): Promise<LastActive | null> => get(JOB_KEY);
export const clearLastActiveJob = (): Promise<void> => del(JOB_KEY);
