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
  await put(orderKey(o.id), o);
};
export const loadLastActiveOrder = (orderId: string): Promise<LastActive | null> => get(orderKey(orderId));
export const clearLastActiveOrder = async (orderId: string): Promise<void> => {
  await del(orderKey(orderId));
};

// --- "An order may be in flight" hint (single slot, customer side) — RETIRED ---
// This slot existed for exactly one reader: `useActiveOrderCheckGate`, the evidence gate in front of
// `ActiveOrderCheckFailedBanner`. Both are gone (owner instruction 2026-08-12: an error card belongs
// to an action the customer took, never to a background poll — the same rule that removed the rider
// board's card), so nothing reads or writes this any more and the read/write helpers are deleted.
//
// The KEY itself is deliberately KEPT, for `clearDeviceState` only: installs upgrading from a build
// that DID write the hint still have the value sitting in SecureStore, and on a shared device it must
// still be wiped at sign-out rather than left behind for the next user. Delete this constant (and its
// line in auth/device-state.ts) once the pre-removal builds are no longer in the field.
export const ORDER_HINT_KEY = "lynia.activeOrderHint";

// --- Rider's active job (single slot — there's only ever one active job) ---
// Exported so sign-out (auth/session `clearDeviceState`) can wipe it — on a shared device the next
// rider's cold start must not paint the previous rider's job (route landmarks, fare, last GPS).
export const JOB_KEY = "lynia.lastActiveJob";

export const saveLastActiveJob = (o: OrderSnapshot): Promise<void> => put(JOB_KEY, o);
export const loadLastActiveJob = (): Promise<LastActive | null> => get(JOB_KEY);
export const clearLastActiveJob = (): Promise<void> => del(JOB_KEY);
