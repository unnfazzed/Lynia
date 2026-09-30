import type { LatLng } from "@lynia/shared";

/**
 * Address search and "where am I" for the merchant web (merchant mobile redesign, D-48: "Google Places
 * search, OpenStreetMap map"). Places API (New) autocomplete + details, the same REST calls the
 * customer app makes (apps/mobile/src/api/places.ts), plus the Geocoding API's reverse lookup for a
 * GPS fix. Browser-direct with a referrer-restricted key in `NEXT_PUBLIC_GOOGLE_PLACES_KEY`.
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
const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
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
  return line ? { point, address: line.slice(0, 200) } : null;
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

export async function reverseGeocode(point: LatLng): Promise<ResolvedPlace | null> {
  if (!GOOGLE_PLACES_KEY) return null;
  const url = `${GEOCODE_URL}?latlng=${point.lat},${point.lng}&key=${encodeURIComponent(GOOGLE_PLACES_KEY)}`;
  return mapReverse(await getJson(url, { method: "GET" }), point);
}

/** One autocomplete+details pair bills as one session. */
export function newSessionToken(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now());
}
