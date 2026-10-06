/**
 * Google geocoding in expo-location's shapes, for the customer web build. On the web,
 * `Location.reverseGeocodeAsync` throws and `Location.geocodeAsync` returns nothing (there is no platform
 * geocoder), and seven screens turn a pin into a landmark that way. metro-shims/expo-location-web.js swaps
 * these two in for them on web only, so no screen changes.
 *
 * It goes through the Maps JavaScript API's Geocoder, not the Geocoding web service: the web service
 * refuses any key restricted to a website ("API keys with referer restrictions cannot be used with this
 * API", seen live on app.lyniago.com 2026-10-06), and a browser key must be restricted to its website.
 * The key is the customer web key (`EXPO_PUBLIC_GOOGLE_PLACES_KEY`; Maps JavaScript + Geocoding APIs).
 *
 * Same contract as the native calls: results in expo-location's field names, an empty list for "nothing
 * here", and a rejection for "couldn't ask" (no key, network, refused key) so callers keep their fallbacks.
 */

export interface ExpoGeocodedAddress {
  city: string | null;
  district: string | null;
  streetNumber: string | null;
  street: string | null;
  region: string | null;
  subregion: string | null;
  country: string | null;
  postalCode: string | null;
  name: string | null;
  isoCountryCode: string | null;
  timezone: string | null;
  formattedAddress: string | null;
}

export interface ExpoGeocodedLocation {
  latitude: number;
  longitude: number;
  altitude?: number;
  accuracy?: number;
}

export interface GoogleComponent {
  long_name?: string;
  short_name?: string;
  types?: string[];
}

export interface GoogleResult {
  address_components?: GoogleComponent[];
  formatted_address?: string;
  /** Plain numbers in the web service's JSON; `lat()` / `lng()` methods on the Maps JavaScript API's LatLng. */
  geometry?: { location?: { lat?: number | (() => number); lng?: number | (() => number) } };
}

/** The Maps JavaScript API Geocoder's `geocode`, injected so this module stays free of Google's globals. */
export type JsGeocode = (request: {
  location?: { lat: number; lng: number };
  address?: string;
  componentRestrictions?: { country: string };
}) => Promise<{ results?: GoogleResult[] }>;

/** Zimbabwe only (the same bias the Places search uses). */
const COUNTRY = "ZW";

/** One Google result as expo-location's address. `name` is only a real place name (a shop, a school),
 *  never the street again, so `landmarkFromAddress` doesn't repeat itself. */
export function toExpoAddress(result: GoogleResult): ExpoGeocodedAddress {
  const parts = result.address_components ?? [];
  const pick = (type: string, short = false): string | null => {
    const c = parts.find((p) => p.types?.includes(type));
    return (short ? c?.short_name : c?.long_name) ?? null;
  };
  return {
    name: pick("point_of_interest") ?? pick("establishment") ?? pick("premise"),
    streetNumber: pick("street_number"),
    street: pick("route"),
    district: pick("sublocality") ?? pick("sublocality_level_1") ?? pick("neighborhood"),
    city: pick("locality") ?? pick("administrative_area_level_2"),
    subregion: pick("administrative_area_level_2"),
    region: pick("administrative_area_level_1"),
    country: pick("country"),
    isoCountryCode: pick("country", true),
    postalCode: pick("postal_code"),
    timezone: null,
    formattedAddress: result.formatted_address ?? null,
  };
}

/** The Geocoder rejects "nothing here" with code ZERO_RESULTS; that is an answer, not a failure. */
function isZeroResults(err: unknown): boolean {
  const e = err as { code?: unknown; message?: unknown } | null;
  return e?.code === "ZERO_RESULTS" || (typeof e?.message === "string" && e.message.includes("ZERO_RESULTS"));
}

async function ask(geocode: JsGeocode, request: Parameters<JsGeocode>[0]): Promise<GoogleResult[]> {
  try {
    const { results } = await geocode(request);
    return Array.isArray(results) ? results : [];
  } catch (err) {
    if (isZeroResults(err)) return [];
    throw err;
  }
}

const num = (v: number | (() => number) | undefined): number | undefined => (typeof v === "function" ? v() : v);

export async function reverseGeocodeGoogle(point: { latitude: number; longitude: number }, geocode: JsGeocode): Promise<ExpoGeocodedAddress[]> {
  const results = await ask(geocode, { location: { lat: point.latitude, lng: point.longitude } });
  return results.map(toExpoAddress);
}

export async function geocodeGoogle(address: string, geocode: JsGeocode): Promise<ExpoGeocodedLocation[]> {
  const results = await ask(geocode, { address, componentRestrictions: { country: COUNTRY } });
  const out: ExpoGeocodedLocation[] = [];
  for (const r of results) {
    const lat = num(r.geometry?.location?.lat);
    const lng = num(r.geometry?.location?.lng);
    if (typeof lat === "number" && typeof lng === "number") out.push({ latitude: lat, longitude: lng });
  }
  return out;
}
