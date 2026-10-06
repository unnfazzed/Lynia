/**
 * Google's Geocoding API in expo-location's shapes, for the customer web build. On the web,
 * `Location.reverseGeocodeAsync` throws and `Location.geocodeAsync` returns nothing (there is no platform
 * geocoder), and seven screens turn a pin into a landmark that way. metro-shims/expo-location-web.js swaps
 * these two in for them on web only, so no screen changes.
 *
 * Same contract as the native calls: results in expo-location's field names, an empty list for "nothing
 * here", and a rejection for "couldn't ask" (no key, network, refused key) so callers keep their existing
 * fallbacks. Key: the customer web key (`EXPO_PUBLIC_GOOGLE_PLACES_KEY`, restricted to app.lyniago.com,
 * with Geocoding enabled; plan W6).
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

interface GoogleComponent {
  long_name?: string;
  short_name?: string;
  types?: string[];
}

interface GoogleResult {
  address_components?: GoogleComponent[];
  formatted_address?: string;
  geometry?: { location?: { lat?: number; lng?: number } };
}

const ENDPOINT = "https://maps.googleapis.com/maps/api/geocode/json";
/** Harare's service area first, Zimbabwe only (the same bias the Places search uses). */
const COUNTRY = "ZW";

type FetchLike = (url: string) => Promise<{ json(): Promise<unknown> }>;

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

async function ask(params: Record<string, string>, key: string | null | undefined, fetchImpl: FetchLike): Promise<GoogleResult[]> {
  if (!key) throw new Error("geocode-unavailable: no key");
  const query = new URLSearchParams({ ...params, key, language: "en" }).toString();
  const body = (await (await fetchImpl(`${ENDPOINT}?${query}`)).json()) as { status?: string; results?: GoogleResult[] } | null;
  if (body?.status === "ZERO_RESULTS") return [];
  if (body?.status !== "OK" || !Array.isArray(body.results)) throw new Error(`geocode-unavailable: ${body?.status ?? "no response"}`);
  return body.results;
}

export async function reverseGeocodeGoogle(
  point: { latitude: number; longitude: number },
  key: string | null | undefined,
  fetchImpl: FetchLike = fetch,
): Promise<ExpoGeocodedAddress[]> {
  const results = await ask({ latlng: `${point.latitude},${point.longitude}` }, key, fetchImpl);
  return results.map(toExpoAddress);
}

export async function geocodeGoogle(address: string, key: string | null | undefined, fetchImpl: FetchLike = fetch): Promise<ExpoGeocodedLocation[]> {
  const results = await ask({ address, components: `country:${COUNTRY}` }, key, fetchImpl);
  const out: ExpoGeocodedLocation[] = [];
  for (const r of results) {
    const lat = r.geometry?.location?.lat;
    const lng = r.geometry?.location?.lng;
    if (typeof lat === "number" && typeof lng === "number") out.push({ latitude: lat, longitude: lng });
  }
  return out;
}
