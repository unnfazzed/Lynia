import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { defaultShouldDehydrateQuery, type Query } from "@tanstack/react-query";
import type { PersistedClient } from "@tanstack/react-query-persist-client";
import Constants from "expo-constants";
import { Platform } from "react-native";
// SDK 54 (expo-file-system 19) moved this path-and-promise API to the `/legacy` entry; the package
// root is now the object API (File / Directory). Same functions, same on-disk file.
import * as FileSystem from "expo-file-system/legacy";
import { clearAllOrderCopies } from "../net/order-copy-store";
import { webKvGet, webKvRemove, webKvSet } from "../net/web-kv";

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
  // Shops & Pharmacy lists and catalogues (ledger D-58): the same stale-safe browse data.
  "shops",
  // The Popular rails' ranking (ledger D-72): venue ids and order counts over 30 days — an ordering
  // hint, no personal data, correct-if-stale by design (it moves by the day). Persisted so the rails a
  // cold start paints under the splash are already in their ranked order, instead of nearest-open order
  // that reshuffles a beat after Home rises when the ranking lands.
  "popularity",
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
const NEVER_PERSISTED_ME_FIELDS = ["idNumber", "kycIdNumber"] as const;

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

/**
 * Drop the saved cache on restore once it is older than a WEEK (P08). It was a day, which meant any
 * customer who orders less than daily booted with an empty cache and the splash (D-64, which waits for
 * Home's profile + rails) held on network round trips. The browse LISTS revalidate on mount and /food
 * shows its own "Showing what we had at HH:MM", so a week-old list is a fine first paint. Anything that
 * carries money, a price or account state keeps the old one-day ceiling — see {@link isDayLimited}.
 * (Restore-time only; live refetching is governed by staleTime as usual.)
 */
export const PERSIST_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** The ceiling for {@link isDayLimited} entries: yesterday's balance or price is a fine first paint,
 *  last week's is a lie. */
export const DAY_LIMITED_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Query-key roots whose WHOLE subtree keeps the one-day ceiling:
 *  - `wallet`, `earnings` — balances, the ledger, the rider's earnings;
 *  - `history` — trip / order rows with their fares; rider Money's "this week" and cash-held totals are
 *    summed from them, and `["history", "customer"]` is the Orders tab.
 * `me` deliberately keeps the week: it carries no money, it revalidates on mount, and Home's profile
 * is what the splash waits for — a one-day ceiling on it would put most cold starts back on the network.
 */
export const DAY_LIMITED_KEY_ROOTS: ReadonlySet<string> = new Set(["wallet", "earnings", "history"]);

/**
 * Entries restored for at most a day (P08). Besides {@link DAY_LIMITED_KEY_ROOTS}, every PRICED browse
 * entry: a restaurant menu (`["restaurants", id, "menu"]`) and a shop / pharmacy catalogue
 * (`["shops", "catalogue", id]`) — Review & place totals the cart from their prices while the server
 * prices from dish ids, so a week-old price would put the wrong "Place · $X" under the customer's
 * thumb. The venue LISTS (`["restaurants"]`, `["shops", service]` incl. pharmacy) carry no item prices
 * (Review & place reads its venue from the menu / catalogue), so they keep the week.
 */
export function isDayLimited(queryKey: readonly unknown[]): boolean {
  const root = String(queryKey[0]);
  if (DAY_LIMITED_KEY_ROOTS.has(root)) return true;
  if (root === "restaurants" && queryKey[2] === "menu") return true;
  if (root === "shops" && queryKey[1] === "catalogue") return true;
  return false;
}

/**
 * Restore-time filter: drop {@link isDayLimited} entries whose data is older than
 * {@link DAY_LIMITED_MAX_AGE_MS}, so raising the whole-cache ceiling to a week never paints a week-old
 * balance, fare or price. Exported for tests.
 */
export function dropStaleDayLimited(client: PersistedClient, now: number = Date.now()): PersistedClient {
  const queries = client.clientState.queries.filter(
    (q) => !isDayLimited(q.queryKey) || now - q.state.dataUpdatedAt <= DAY_LIMITED_MAX_AGE_MS,
  );
  if (queries.length === client.clientState.queries.length) return client;
  return { ...client, clientState: { ...client.clientState, queries } };
}

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

/**
 * The same adapter for the customer web build. expo-file-system has no web implementation (every call
 * rejects), so on app.lyniago.com the warm boot silently never happened: each reload on a slow link
 * painted skeletons until the first fetch survived, and offline painted nothing. localStorage holds the
 * cache instead (tens of KB, well inside the ~5 MB quota); the redaction in `serialize` below still runs
 * first, so the national ID never reaches browser storage either. Exported for unit tests.
 */
export const webStorage = {
  getItem: (key: string): Promise<string | null> => Promise.resolve(webKvGet(key)),
  setItem: (key: string, value: string): Promise<void> => Promise.resolve(webKvSet(key, value)),
  removeItem: (key: string): Promise<void> => Promise.resolve(webKvRemove(key)),
};

export const queryPersister = createAsyncStoragePersister({
  storage: Platform.OS === "web" ? webStorage : fileStorage,
  key: "lynia-rq-cache",
  // The ONE hook every write passes through, so there is no second path that could reach the file
  // with an un-redacted payload. See {@link redactBeforePersist}.
  serialize: (client) => JSON.stringify(redactBeforePersist(client)),
  // The ONE hook every restore passes through: money, price and account entries keep a one-day ceiling (P08).
  deserialize: (cached) => dropStaleDayLimited(JSON.parse(cached) as PersistedClient),
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
  // The order screen's saved copies (net/order-copy-store) are the same kind of disk cache — they go too.
  return Promise.all([Promise.resolve(queryPersister.removeClient()).catch(() => undefined), clearAllOrderCopies()]).then(() => undefined);
}
