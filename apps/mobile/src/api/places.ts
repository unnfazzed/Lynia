import { GOOGLE_PLACES_KEY, placesEnabled } from "../config";
import { mapPlaceDetails, mapPredictions, type PlaceSuggestion, type ResolvedPlace } from "../logic/places";
import { FAST_TIMEOUT_MS } from "../net/network-policy";

/**
 * Google Places REST client for search-first addressing (customer-journey §1·2/§1·3). These call Google
 * DIRECTLY (not the Lynia API), reading the key from config. The whole module is key-gated: with no key
 * every call resolves to the empty/absent result so the caller falls back to the pin-on-map picker.
 *
 * Shape-mapping lives in `src/logic/places.ts` (pure, unit-tested); this file is only the network edge:
 * build the URL, fetch, bound the request, and hand the raw body to the mapper. Errors NEVER throw out
 * of here — a keyless build, a network drop, or a non-OK Places `status` all degrade to []/null so the
 * search box simply shows nothing and the pin stays the primary path.
 *
 * Uses the legacy Places web-service endpoints (no native SDK / no extra dependency — REST + fetch only).
 */

const AUTOCOMPLETE_URL = "https://maps.googleapis.com/maps/api/place/autocomplete/json";
const DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json";

/**
 * Small bounded, TTL'd, LRU-evicted memo cache (LC-A09 / A-O16). Address entry has heavy call overlap
 * that a plain debounce doesn't remove: a backspace-then-retype correction re-sends the exact same query
 * text, the same address is often searched twice in one order (pickup, then dropoff), and a suggestion
 * can be re-resolved (back-then-reselect) without its coordinates having changed. Keying by the exact
 * (normalized) request — query text for autocomplete, `place_id` for details — serves those repeats from
 * memory instead of paying for another Google round trip, with zero change to what's shown for any
 * request that wasn't already answered inside the TTL window.
 */
class TtlLruCache<T> {
  private readonly entries = new Map<string, { value: T; expiresAt: number }>();
  constructor(private readonly maxEntries: number, private readonly ttlMs: number) {}

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.entries.delete(key);
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, entry); // bump recency
    return entry.value;
  }

  set(key: string, value: T): void {
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    if (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey !== undefined) this.entries.delete(oldestKey);
    }
  }

  clear(): void {
    this.entries.clear();
  }
}

// 2 min for autocomplete — long enough to absorb a typing correction or a second address in the same
// order composition, short enough that a stale local answer can't linger across an app session.
const AUTOCOMPLETE_CACHE_MAX = 50;
const AUTOCOMPLETE_CACHE_TTL_MS = 2 * 60 * 1000;
// 10 min for details — a resolved place's coordinates don't move mid-order, and re-selecting the same
// suggestion (back-then-reselect) is common enough to be worth a longer window than autocomplete text.
const DETAILS_CACHE_MAX = 50;
const DETAILS_CACHE_TTL_MS = 10 * 60 * 1000;

const autocompleteCache = new TtlLruCache<PlaceSuggestion[]>(AUTOCOMPLETE_CACHE_MAX, AUTOCOMPLETE_CACHE_TTL_MS);
const detailsCache = new TtlLruCache<ResolvedPlace | null>(DETAILS_CACHE_MAX, DETAILS_CACHE_TTL_MS);

/** Test-only: reset both caches so cases don't leak state into each other. */
export function __resetPlacesCacheForTests(): void {
  autocompleteCache.clear();
  detailsCache.clear();
}

/** Build a `?a=b&c=d` query string, encoding each value. (URLSearchParams isn't reliably polyfilled in
 *  the RN/Hermes runtime, so we assemble the query by hand.) Empty/undefined values are skipped. */
function queryString(params: Record<string, string | undefined>): string {
  const pairs: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "") continue;
    pairs.push(`${k}=${encodeURIComponent(v)}`);
  }
  return pairs.join("&");
}

// Bias results toward the pilot corridor (Harare) and Zimbabwe, so a short query surfaces local places
// first. Not a hard filter beyond the country — a valid out-of-area place still resolves (the service
// corridor is enforced later, on broadcast).
const BIAS_LOCATION = "-17.8292,31.0522";
const BIAS_RADIUS_M = "50000";
const BIAS_COUNTRY = "country:zw";

async function getJson(url: string): Promise<unknown | null> {
  const controller = new AbortController();
  // FAST_TIMEOUT_MS (net/network-policy.ts, C-O2): a stalled Places call must fail into the pin
  // fallback fast, not hang behind a spinner on a constrained link.
  const timer = setTimeout(() => controller.abort(), FAST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    // Abort / offline / non-JSON — treat as "no result" so the flow falls back to the pin.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Autocomplete an address query → suggestion rows. Returns [] when the key is absent, the input is too
 * short to be worth a call, or the request fails. `sessionToken` groups an autocomplete+details pair
 * into one billable session (pass the same token to `placeDetails`).
 */
export async function autocompletePlaces(input: string, sessionToken?: string): Promise<PlaceSuggestion[]> {
  const q = input.trim();
  if (!placesEnabled() || q.length < 3) return [];
  const cacheKey = q.toLowerCase();
  const cached = autocompleteCache.get(cacheKey);
  if (cached !== undefined) return cached;
  const query = queryString({
    input: q,
    key: GOOGLE_PLACES_KEY as string,
    components: BIAS_COUNTRY,
    location: BIAS_LOCATION,
    radius: BIAS_RADIUS_M,
    sessiontoken: sessionToken,
  });
  const body = await getJson(`${AUTOCOMPLETE_URL}?${query}`);
  const rows = mapPredictions(body);
  // Only memoize a real answer — `body === null` means the request itself failed (timeout/offline/non-OK),
  // and caching that as "no results" would keep hiding suggestions for the TTL window even once the
  // network recovers.
  if (body !== null) autocompleteCache.set(cacheKey, rows);
  return rows;
}

/**
 * Resolve a chosen suggestion's `place_id` → coordinates + landmark (the picked-point the MapPicker
 * would otherwise produce). Returns null when the key is absent or the lookup fails — the caller then
 * leaves the flow on the pin path.
 */
export async function placeDetails(placeId: string, sessionToken?: string): Promise<ResolvedPlace | null> {
  if (!placesEnabled() || placeId.length === 0) return null;
  const cached = detailsCache.get(placeId);
  if (cached !== undefined) return cached;
  const query = queryString({
    place_id: placeId,
    key: GOOGLE_PLACES_KEY as string,
    fields: "geometry,name,formatted_address,place_id",
    sessiontoken: sessionToken,
  });
  const body = await getJson(`${DETAILS_URL}?${query}`);
  const place = mapPlaceDetails(body, placeId);
  // Same failure-vs-empty distinction as autocomplete: don't memoize a timeout/offline miss.
  if (body !== null) detailsCache.set(placeId, place);
  return place;
}

export { placesEnabled } from "../config";
export type { PlaceSuggestion, ResolvedPlace } from "../logic/places";
