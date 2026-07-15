import * as SecureStore from "expo-secure-store";
import type { OrderHistoryRow } from "../api/orders";

/**
 * Persist a bounded snapshot of the trips list to SecureStore so a cold start (esp. offline) paints the
 * last-known trips instantly instead of a bare skeleton or a "couldn't load" dead-end — the same
 * warm-paint discipline the tracker already uses for the active order/job (net/last-active-store). The
 * live fetch takes over the moment it lands. Best-effort throughout: a native read/write failure just
 * falls back to the normal loading/error state.
 *
 * Bounded to the most recent rows so the blob stays small (SecureStore values are size-limited on
 * Android) and no more than a screenful is cached.
 */

/** SecureStore key — exported so sign-out (auth/session `clearDeviceState`) clears the same slot. */
export const HISTORY_SNAPSHOT_KEY = "lynia.history.snapshot.v1";
const MAX_ROWS = 20;

export async function saveHistorySnapshot(rows: OrderHistoryRow[]): Promise<void> {
  try {
    await SecureStore.setItemAsync(HISTORY_SNAPSHOT_KEY, JSON.stringify(rows.slice(0, MAX_ROWS)));
  } catch {
    /* best-effort */
  }
}

export async function loadHistorySnapshot(): Promise<OrderHistoryRow[] | null> {
  try {
    const raw = await SecureStore.getItemAsync(HISTORY_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Defensive: only accept a non-empty array shape; a malformed blob returns null (falls back to live).
    return Array.isArray(parsed) && parsed.length > 0 ? (parsed as OrderHistoryRow[]) : null;
  } catch {
    return null;
  }
}

