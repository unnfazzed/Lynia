import * as SecureStore from "expo-secure-store";

/**
 * Browse v2 X1 (ledger D-57): the customer's recent searches, kept on the device only (a few words they
 * typed — no account data). Newest first, deduped case-insensitively, at most {@link RECENT_MAX}.
 * Silent on failure: a storage error leaves the list empty, never an error state.
 */
export const RECENT_SEARCHES_KEY = "lynia.recentSearches.v1";
export const RECENT_MAX = 6;

export function parseRecent(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

/** `term` first, any earlier copy dropped, capped. Pure. */
export function withRecent(list: readonly string[], term: string): string[] {
  const t = term.trim();
  if (t.length < 2) return list.slice(0, RECENT_MAX);
  return [t, ...list.filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, RECENT_MAX);
}

export async function loadRecentSearches(): Promise<string[]> {
  try {
    return parseRecent(await SecureStore.getItemAsync(RECENT_SEARCHES_KEY));
  } catch {
    return [];
  }
}

export async function saveRecentSearches(list: readonly string[]): Promise<void> {
  try {
    await SecureStore.setItemAsync(RECENT_SEARCHES_KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
  } catch {
    // On-device convenience only.
  }
}
