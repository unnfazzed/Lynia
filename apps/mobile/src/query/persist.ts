import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { defaultShouldDehydrateQuery, type Query } from "@tanstack/react-query";
import type { PersistedClient } from "@tanstack/react-query-persist-client";
import Constants from "expo-constants";
import * as FileSystem from "expo-file-system";

/**
 * Disk persistence for the React Query cache — the "warm boot" layer. On a cold start over a slow or
 * dead link, the app used to render skeletons until the first fetch survived the network; with the
 * cache persisted, every whitelisted screen paints its last-known data instantly and revalidates in
 * the background (the same render-cached-then-revalidate shape Swiggy/Zomato use for first paint,
 * and the client-side counterpart of the server's ETag/304 story). This generalises the hand-rolled
 * per-feature snapshots (history-store, last-active-store) to the whole query cache.
 *
 * What persists is a deliberate ALLOWLIST, not everything (see {@link shouldPersistQuery}): profile,
 * history, earnings, wallet, notifications — data that is correct-if-stale and expensive to refetch.
 * LIVE marketplace state (active order/job, the auction offer list, the rider board) is exactly the
 * data a stale render can mislead on ("your rider is arriving" for a delivery that finished an hour
 * ago), so it stays memory-only and is always fetched fresh.
 *
 * Storage is a single JSON file under the app-private documentDirectory via expo-file-system —
 * already a dependency, async, and without SecureStore's ~2 KB value ceiling (the cache is tens of
 * KB). Writes are throttled; a corrupt/missing file deserialises to "no cache" and boots cold.
 */

/** Query-key roots that persist across launches. Everything else is memory-only. */
export const PERSISTED_KEY_ROOTS: ReadonlySet<string> = new Set([
  "me",
  "history",
  "earnings",
  "wallet",
  "notifications",
  // Restaurant catalog (RCA §1.3/§5.2): listings are stale-safe browse data, not live marketplace
  // state — persisting them warm-paints home's "Popular near you" and /food in the FIRST frame after
  // a cold start. This replaced the hand-rolled `net/restaurant-list-store.ts` SecureStore snapshot,
  // which (a) hydrated in a post-render effect so it could never reach the first frame, and (b)
  // stored ~30 KB of signed-URL JSON against SecureStore's ~2 KB Android value advisory. The stale
  // banner ("Showing what we had at HH:MM") now derives from the query's own persisted
  // `dataUpdatedAt` — see use-restaurants.ts.
  "restaurants",
]);

/**
 * Persist only settled-successful queries whose key root is allowlisted. Exported for unit tests —
 * the allowlist is a product decision (stale-safe data only), and a regression here either leaks
 * live marketplace state onto disk or silently kills the warm boot.
 */
export function shouldPersistQuery(query: Query): boolean {
  return defaultShouldDehydrateQuery(query) && PERSISTED_KEY_ROOTS.has(String(query.queryKey[0]));
}

/** Fields that may live in memory but must never be written to `rq-cache.json`. */
const NEVER_PERSISTED_ME_FIELDS = ["idNumber"] as const;

/**
 * Strip the caller's national ID out of the `["me"]` entry on its way to disk.
 *
 * `/auth/me` returns the ID in FULL (owner instruction 2026-08-16, `docs/DESIGN-DEVIATIONS.md`
 * D-23) so the Account screen can draw it — but `"me"` is on the persistence allowlist above, so
 * without this the plaintext national ID would be serialised into `rq-cache.json` and sit there
 * between launches. The file is app-private and {@link clearPersistedQueries} wipes it on sign-out,
 * but shared handsets are common in this market (S1) and a national ID is the one field in the
 * payload whose leak is not undone by signing out — so it is memory-only, full stop.
 *
 * The cost is one beat of latency: after a cold start the identity card warm-paints from cache with
 * every other field and the ID line appears when `/auth/me` revalidates. That is the right trade —
 * a stale ID would be worthless anyway, since it is the one thing about an account that never changes.
 *
 * Runs at SERIALIZE time rather than in {@link shouldPersistQuery}, because the allowlist decides
 * *whether* a query persists and this decides *what of it* does. Dropping the whole `["me"]` entry
 * instead would cost every account screen its warm boot to protect one field.
 */
export function redactBeforePersist(client: PersistedClient): PersistedClient {
  const queries = client.clientState.queries.map((q) => {
    if (String(q.queryKey[0]) !== "me") return q;
    const data = q.state.data;
    if (!data || typeof data !== "object") return q;
    const redacted = { ...(data as Record<string, unknown>) };
    let hit = false;
    for (const f of NEVER_PERSISTED_ME_FIELDS) {
      if (f in redacted) {
        delete redacted[f];
        hit = true;
      }
    }
    return hit ? { ...q, state: { ...q.state, data: redacted } } : q;
  });
  return { ...client, clientState: { ...client.clientState, queries } };
}

/** Drop cache entries older than a day on restore — yesterday's balance is a fine first paint,
 *  last month's is a lie. (Restore-time only; live refetching is governed by staleTime as usual.) */
export const PERSIST_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Cache-buster: a new app version starts cold rather than hydrating shapes an old build wrote. */
export const persistBuster: string = Constants.expoConfig?.version ?? "dev";

const CACHE_FILE = `${FileSystem.documentDirectory ?? ""}rq-cache.json`;

/**
 * AsyncStorage-shaped adapter over a single expo-file-system file. Every operation is best-effort:
 * a read failure (first launch, corrupt file) resolves null → cold boot; a write/delete failure is
 * swallowed — persistence is an accelerant, never a crash surface. Exported for unit tests.
 */
export const fileStorage = {
  getItem: (_key: string): Promise<string | null> =>
    FileSystem.readAsStringAsync(CACHE_FILE).catch(() => null),
  setItem: (_key: string, value: string): Promise<void> =>
    FileSystem.writeAsStringAsync(CACHE_FILE, value).catch(() => undefined),
  removeItem: (_key: string): Promise<void> =>
    FileSystem.deleteAsync(CACHE_FILE, { idempotent: true }).catch(() => undefined),
};

export const queryPersister = createAsyncStoragePersister({
  storage: fileStorage,
  key: "lynia-rq-cache",
  // The ONE hook every write passes through, so there is no second path that could reach the file
  // with an un-redacted payload. See {@link redactBeforePersist}.
  serialize: (client) => JSON.stringify(redactBeforePersist(client)),
  // Batch bursts of cache updates into one disk write every few seconds — a screen-load fires
  // several queries back-to-back and serialising the cache per update would churn the flash for
  // nothing. Loss window on a hard kill is one interval of the least-fresh data: acceptable for an
  // accelerant cache that revalidates on every boot anyway.
  throttleTime: 3000,
});

/**
 * Purge the persisted cache NOW. Called on both sign-out paths next to `queryClient.clear()` —
 * shared devices are common in the target market (S1), and waiting for the throttled persister to
 * flush the cleared state would leave the previous user's data on disk for a beat too long.
 */
export function clearPersistedQueries(): Promise<void> {
  return Promise.resolve(queryPersister.removeClient()).catch(() => undefined);
}
