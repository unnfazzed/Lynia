import * as Location from "expo-location";
import { FAST_TIMEOUT_MS } from "../net/network-policy";
import type { ResolvedPlace } from "./places";

/**
 * Device-geocoder address resolution — the KEYLESS address→coordinates path.
 *
 * Why this exists: `coordsOk` in app/send.tsx is the hard gate on broadcasting, and it accepts nothing
 * but a lat/lng. Only three things ever produced one: a tap on the compose map, "Use my location" (the
 * ACTIVE slot only, and only the device's own position), and Google Places search — which is key-gated
 * on `EXPO_PUBLIC_GOOGLE_PLACES_KEY`. On a build where the Places key is absent AND the map's tiles
 * never render (a bad/mis-restricted Maps key, blocked tiles), the drop-off point could not be set by
 * any means and the send flow was a permanent dead end — the reported symptom.
 *
 * `expo-location`'s `geocodeAsync` closes that hole: it goes through the PLATFORM geocoder (Android's
 * `Geocoder`, backed by Play services), so it needs neither of our Google API keys and works with no
 * map on screen. It is deliberately the fallback, not the primary — it returns coordinates only (no
 * formatted address, no place_id, no predictions), so the customer's own typed text becomes the
 * landmark and the existing confirm step (`AddressConfirmSheet`) is where they check the result.
 *
 * The corridor biasing and the result mapping are PURE (and unit-tested as such); the `expo-location`
 * edge is the one effectful export at the foot of the file. It lives here rather than in `src/api/`
 * because `src/api/` is the NETWORK layer — the Lynia API and Google's REST endpoints — and this is a
 * platform-module call. `src/ui/ComposeMap.tsx` and `MapPicker.tsx` already reach for
 * `Location.reverseGeocodeAsync` the same way, and `.dependency-cruiser.cjs`'s `mobile-ui-no-api`
 * boundary (UI must not fetch) is honoured by construction as a result.
 */

/** Shape of one `Location.geocodeAsync` result we care about (a `LocationGeocodedLocation`). */
export interface GeocodedLocation {
  latitude: number;
  longitude: number;
}

/**
 * Appended when the query names no locality of its own. The platform geocoder is global and a bare
 * "14 Glenara Ave" resolves as happily in Glasgow as in the Avenues; biasing to the pilot corridor is
 * what makes a one-line query usable. Only ever a SECOND attempt — a query that already carries its
 * own city/country is tried verbatim first so we never override what the customer actually typed.
 */
const CORRIDOR_SUFFIX = "Harare, Zimbabwe";

/** Words that mean the query already places itself, so the corridor suffix would be noise. */
const LOCATED = /\b(harare|zimbabwe|zw|bulawayo|mutare|gweru|chitungwiza|norton|ruwa|epworth)\b/i;

/** The contract caps `Waypoint.landmark` well above this; 120 mirrors the confirm sheet's own field. */
const LANDMARK_MAX = 120;

/**
 * The queries to try, in order. Always at least the trimmed input; a query that doesn't already name a
 * Zimbabwean locality gets a corridor-biased second attempt. Returns `[]` for a query too short to be
 * worth a geocoder round trip (mirrors the 3-character autocomplete threshold).
 */
export function geocodeQueries(input: string): string[] {
  const q = input.trim().replace(/\s+/g, " ");
  if (q.length < 3) return [];
  if (LOCATED.test(q)) return [q];
  return [q, `${q}, ${CORRIDOR_SUFFIX}`];
}

/**
 * Build a short landmark string from a REVERSE-geocode result — the most human parts, capped.
 *
 * The inverse direction to everything else in this file (point → words, not words → point), but the
 * same platform geocoder and the same `LANDMARK_MAX` cap, so it belongs beside them rather than as a
 * private copy in each caller. It was one: `ui/ComposeMap.tsx`, `ui/MapPicker.tsx` and the pickup
 * auto-locate hook each need it, and three independently-maintained versions of "what do we call this
 * pin" is exactly how the landmark the rider is handed starts differing by which control set it.
 */
export function landmarkFromAddress(r: Location.LocationGeocodedAddress): string {
  return [r.name, r.street, r.district ?? r.city].filter(Boolean).join(", ").trim().slice(0, LANDMARK_MAX);
}

/** A finite coordinate inside the real lat/lng domain. Guards against a geocoder returning junk. */
function isUsable(c: GeocodedLocation | undefined): c is GeocodedLocation {
  if (!c) return false;
  const { latitude, longitude } = c;
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180 &&
    // 0,0 is the geocoder's "I found nothing but must return something" answer often enough to be
    // worth rejecting outright — it is in the Gulf of Guinea, never a Lynia address.
    !(latitude === 0 && longitude === 0)
  );
}

/**
 * First usable result → the same `ResolvedPlace` shape the Places path produces, so the caller feeds
 * the identical confirm-then-commit flow. `landmark` is the customer's OWN typed query: the platform
 * geocoder returns no formatted address, and inventing one would put words in the rider's hands that
 * nobody chose. `placeId` is empty by construction — this point did not come from Google, and
 * `send.tsx` only attaches a `placeId` to the order payload when it is truthy, so an empty one is
 * correctly never sent as if it were a real Google place.
 */
export function toResolvedPlace(results: readonly GeocodedLocation[], query: string): ResolvedPlace | null {
  const hit = results.find(isUsable);
  if (!hit) return null;
  const landmark = query.trim().replace(/\s+/g, " ").slice(0, LANDMARK_MAX);
  if (landmark.length === 0) return null;
  return { lat: hit.latitude, lng: hit.longitude, landmark, placeId: "" };
}

// ---------------------------------------------------------------------------
// The `expo-location` edge
// ---------------------------------------------------------------------------

/** Why a lookup produced no point — each maps to a different, actionable thing to tell the customer. */
export type GeocodeFailure = "permission" | "not-found" | "unavailable";

export type GeocodeOutcome = { ok: true; place: ResolvedPlace } | { ok: false; reason: GeocodeFailure };

/** Reject if `p` doesn't settle in time. Mirrors ComposeMap/MapPicker's own GPS bound: the platform
 *  geocoder is a network call with no timeout of its own, and a stalled one must fail into the
 *  tap-the-map path rather than sit behind a spinner. Clears the timer on the winning path. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error("geocode-timeout")), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Resolve a typed address to a point using the device's own geocoder.
 *
 * Android requires foreground location permission before `Geocoder` may be used (expo-location's own
 * documented constraint), so this asks for it — and reports `"permission"` rather than a confusing
 * "not found" when it is refused. The corridor-biased retry only runs when the first, verbatim attempt
 * finds nothing, so a query that already names its city costs exactly one round trip.
 */
export async function geocodeAddress(query: string): Promise<GeocodeOutcome> {
  const queries = geocodeQueries(query);
  if (queries.length === 0) return { ok: false, reason: "not-found" };

  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return { ok: false, reason: "permission" };
  } catch {
    return { ok: false, reason: "unavailable" };
  }

  for (const q of queries) {
    try {
      const results = await withTimeout(Location.geocodeAsync(q), FAST_TIMEOUT_MS);
      const place = toResolvedPlace(results, query);
      if (place) return { ok: true, place };
    } catch {
      // No geocoder on the device, a timeout, or an offline lookup — none of which the corridor-biased
      // retry can rescue, so stop here rather than paying a second stalled call.
      return { ok: false, reason: "unavailable" };
    }
  }
  return { ok: false, reason: "not-found" };
}
