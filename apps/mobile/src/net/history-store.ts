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

/** The saved list and when it was fetched — the Orders tab's offline banner says "as of 09:24". */
export interface HistorySnapshot {
  rows: OrderHistoryRow[];
  /** ISO time of the fetch the rows came from; null for a snapshot saved before Orders v2. */
  savedAt: string | null;
}

export async function saveHistorySnapshot(rows: OrderHistoryRow[], savedAt: Date = new Date()): Promise<void> {
  try {
    await SecureStore.setItemAsync(HISTORY_SNAPSHOT_KEY, JSON.stringify({ savedAt: savedAt.toISOString(), rows: rows.slice(0, MAX_ROWS) }));
  } catch {
    /* best-effort */
  }
}

export async function loadHistorySnapshot(): Promise<HistorySnapshot | null> {
  try {
    const raw = await SecureStore.getItemAsync(HISTORY_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    // Defensive: accept a non-empty rows array — the Orders v2 `{ savedAt, rows }` shape, or the bare array
    // an older build saved under this key. A malformed blob returns null (falls back to live).
    const rows = Array.isArray(parsed) ? parsed : (parsed as { rows?: unknown } | null)?.rows;
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const at = Array.isArray(parsed) ? null : (parsed as { savedAt?: unknown }).savedAt;
    return { rows: rows as OrderHistoryRow[], savedAt: typeof at === "string" ? at : null };
  } catch {
    return null;
  }
}
