import type { LatLng } from "@lynia/shared";

/**
 * Address search and "where am I" for the merchant web (merchant mobile redesign, D-48; maps are Google's
 * too since D-80). Places API (New) autocomplete + details, the same REST calls the
 * customer app makes (apps/mobile/src/api/places.ts), plus a reverse lookup for a GPS fix. The reverse
 * lookup goes through the Maps JavaScript API's Geocoder, not the Geocoding web service: the web service
 * refuses a key restricted to a website ("API keys with referer restrictions cannot be used with this
 * API", seen on app.lyniago.com 2026-10-06), and this browser key is restricted to merchant.lyniago.com.
 * So the key needs Maps JavaScript API and Geocoding API as well as Places API (New) and Maps Static API. Browser-direct with a referrer-restricted key in `NEXT_PUBLIC_GOOGLE_PLACES_KEY` — the same key
 * draws the tracking band's Static Maps image (`components/m/StaticMap.tsx`).
 *
 * Key-gated and failure-quiet: with no key, or on any refusal or network drop, search returns nothing
 * and reverse lookup returns null, and the screen falls back to "Your current location". The mapping
 * functions are pure and exported for the tests.
 */

export const GOOGLE_PLACES_KEY: string | null = process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY || null;

export function placesEnabled(): boolean {
  return GOOGLE_PLACES_KEY !== null;
}

const AUTOCOMPLETE_URL = "https://places.googleapis.com/v1/places:autocomplete";
const DETAILS_URL = "https://places.googleapis.com/v1/places/";
/** Harare, and the API's maximum bias radius — local places first, Zimbabwe only. */
const BIAS = { circle: { center: { latitude: -17.8292, longitude: 31.0522 }, radius: 50_000 } };
const TIMEOUT_MS = 8_000;

export interface PlaceSuggestion {
  placeId: string;
  primary: string;
  secondary: string;
}

export interface ResolvedPlace {
  point: LatLng;
  /** The line the location card shows: "5th Street, Mbare". */
  address: string;
  /** A reverse lookup's suburb alone ("Copacabana"), for S4's "Pin the buyer sent · Copacabana". */
  area?: string;
}

type RawText = { text?: unknown } | undefined;
const textOf = (t: RawText): string => (typeof t?.text === "string" ? t.text : "");

export function mapSuggestions(body: unknown): PlaceSuggestion[] {
  const suggestions = (body as { suggestions?: unknown } | null)?.suggestions;
  if (!Array.isArray(suggestions)) return [];
  const out: PlaceSuggestion[] = [];
  for (const raw of suggestions as {
    placePrediction?: { placeId?: unknown; text?: RawText; structuredFormat?: { mainText?: RawText; secondaryText?: RawText } };
  }[]) {
    const p = raw?.placePrediction;
    if (typeof p?.placeId !== "string" || !p.placeId) continue;
    out.push({
      placeId: p.placeId,
      primary: textOf(p.structuredFormat?.mainText) || textOf(p.text),
      secondary: textOf(p.structuredFormat?.secondaryText),
    });
  }
  return out;
}

/** A place's coordinates and its line: the tapped suggestion's name, then the first part of the
 *  address that isn't already the name ("5th Street" + "Mbare, Harare" → "5th Street, Mbare"). */
export function mapDetails(body: unknown, name: string): ResolvedPlace | null {
  const place = body as { location?: { latitude?: unknown; longitude?: unknown }; formattedAddress?: unknown } | null;
  const lat = place?.location?.latitude;
  const lng = place?.location?.longitude;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  const formatted = typeof place?.formattedAddress === "string" ? place.formattedAddress : "";
  return { point: { lat, lng }, address: shortAddress(name, formatted) };
}

/** The Geocoding API's reverse result → the shortest useful line: street + suburb. */
export function mapReverse(body: unknown, point: LatLng): ResolvedPlace | null {
  const results = (body as { results?: unknown } | null)?.results;
  if (!Array.isArray(results) || results.length === 0) return null;
  const first = results[0] as { address_components?: { long_name?: string; types?: string[] }[]; formatted_address?: string };
  const parts = first.address_components ?? [];
  const pick = (type: string) => parts.find((c) => c.types?.includes(type))?.long_name ?? "";
  const street = [pick("street_number"), pick("route")].filter(Boolean).join(" ");
  const area = pick("sublocality") || pick("neighborhood") || pick("locality");
  const line = [street, area].filter(Boolean).join(", ") || (first.formatted_address ?? "").split(",").slice(0, 2).join(",").trim();
  if (!line) return null;
  return area ? { point, address: line.slice(0, 200), area: area.slice(0, 80) } : { point, address: line.slice(0, 200) };
}

function shortAddress(name: string, formatted: string): string {
  const rest = formatted
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && s !== name && !/^zimbabwe$/i.test(s));
  const line = [name, rest.find((s) => !name.includes(s))].filter(Boolean).join(", ");
  return (line || formatted).slice(0, 200);
}

async function getJson(url: string, init: RequestInit): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    return (await res.json()) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function searchPlaces(input: string, sessionToken: string): Promise<PlaceSuggestion[]> {
  const q = input.trim();
  if (!GOOGLE_PLACES_KEY || q.length < 3) return [];
  const body = await getJson(AUTOCOMPLETE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": GOOGLE_PLACES_KEY },
    body: JSON.stringify({ input: q, includedRegionCodes: ["zw"], locationBias: BIAS, sessionToken }),
  });
  return mapSuggestions(body);
}

export async function resolvePlace(suggestion: PlaceSuggestion, sessionToken: string): Promise<ResolvedPlace | null> {
  if (!GOOGLE_PLACES_KEY) return null;
  const body = await getJson(`${DETAILS_URL}${encodeURIComponent(suggestion.placeId)}?sessionToken=${encodeURIComponent(sessionToken)}`, {
    method: "GET",
    headers: { "X-Goog-Api-Key": GOOGLE_PLACES_KEY, "X-Goog-FieldMask": "id,formattedAddress,location" },
  });
  return mapDetails(body, suggestion.primary);
}

/** S4 (Merchant v2, D-77): a pasted pin's line, "Pin the buyer sent · Copacabana" once its area is known. */
export function pinnedLine(area?: string | null): string {
  return area ? `Pin the buyer sent · ${area}` : "Pin the buyer sent";
}

interface MapsGeocoder {
  geocode(request: { location: { lat: number; lng: number } }): Promise<{ results?: unknown[] }>;
}
interface MapsNamespace {
  maps: { Geocoder: new () => MapsGeocoder };
}

let mapsLoading: Promise<MapsNamespace> | null = null;

/** Google's Maps JavaScript API script, loaded once and only when a reverse lookup is first needed. */
function loadMaps(key: string): Promise<MapsNamespace> {
  if (mapsLoading) return mapsLoading;
  mapsLoading = new Promise<MapsNamespace>((resolve, reject) => {
    const g = globalThis as unknown as Record<string, unknown> & { google?: MapsNamespace };
    if (g.google?.maps?.Geocoder) return resolve(g.google);
    if (typeof document === "undefined") return reject(new Error("no document"));
    g.__lyniaMerchantMapsReady = () => (g.google ? resolve(g.google) : reject(new Error("maps missing")));
    g.gm_authFailure = () => reject(new Error("maps key refused"));
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&language=en&region=ZW&callback=__lyniaMerchantMapsReady`;
    s.async = true;
    s.addEventListener("error", () => {
      mapsLoading = null;
      reject(new Error("maps script failed"));
    });
    document.head.appendChild(s);
  });
  return mapsLoading;
}

function withTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS))]);
}

export async function reverseGeocode(point: LatLng): Promise<ResolvedPlace | null> {
  if (!GOOGLE_PLACES_KEY) return null;
  try {
    const google = await withTimeout(loadMaps(GOOGLE_PLACES_KEY));
    const { results } = await withTimeout(new google.maps.Geocoder().geocode({ location: { lat: point.lat, lng: point.lng } }));
    return mapReverse({ results }, point);
  } catch {
    // No key access, a refused key, nothing at this point (ZERO_RESULTS rejects too) or no network:
    // the screen falls back to "Your current location".
    return null;
  }
}

/** One autocomplete+details pair bills as one session. */
export function newSessionToken(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now());
}
