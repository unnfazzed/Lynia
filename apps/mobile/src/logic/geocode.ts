import * as Location from "expo-location";
import { Platform } from "react-native";
import { FAST_TIMEOUT_MS } from "../net/network-policy";
import type { ResolvedPlace } from "./places";
import { withTimeout } from "../util";
import { userTown } from "./user-area";

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

/** Appended when the query names one of the {@link NAMES_TOWN} towns but not the country. */
const COUNTRY_SUFFIX = "Zimbabwe";

/**
 * The town appended when the query names neither the country nor a listed town: the live town the user is
 * in (Bulawayo for someone in Bulawayo — owner 2026-10-20, D-120; user-area.ts), else Harare. The platform
 * geocoder is global and a bare "14 Glenara Ave" resolves as happily in Glasgow as in the Avenues; biasing to
 * the user's town is what makes a one-line query usable. Only ever a SECOND attempt, after the verbatim
 * query: tried first, it would move a Mutare street to Harare whenever the customer left the town out.
 */
function corridorSuffix(town: string | null): string {
  return `${town ?? "Harare"}, ${COUNTRY_SUFFIX}`;
}

/** The query already names the country, so neither suffix could add anything. */
const NAMES_COUNTRY = /\b(zimbabwe|zw)\b/i;

/**
 * The query names one of these towns, so the town suffix would be noise or wrong. Some of these names
 * exist abroad too (there is a Norton and an Epworth in England), so such a query still gets a second
 * attempt with the country appended: without one, a verbatim hit abroad fails the box below and the
 * lookup ends in not-found. A town missing from this list (Masvingo, Kwekwe) is treated like any other
 * text: its retry gets the user's town.
 */
const NAMES_TOWN = /\b(harare|bulawayo|mutare|gweru|chitungwiza|norton|ruwa|epworth)\b/i;

/**
 * Zimbabwe's extent (lat −22.42…−15.61, lng 25.24…33.06), padded by about 10 km so a point on the
 * border itself is never clipped.
 *
 * The platform geocoder searches the whole world, so the first result for a bare "westgate" can be
 * Westgate-on-Sea in Kent or Westgate in Nairobi. A result outside the box counts as no result: the
 * next query gets its turn, and when none is left the lookup reports not-found rather than a pin in
 * another country. That turn matters most on Android, where `geocodeAsync` asks `Geocoder` for a
 * single result, so a hit abroad leaves nothing else in the list to fall back on.
 *
 * A sanity check, not a border, so never reuse it as a country test: the rectangle also takes in whole
 * towns across the border (Livingstone, Francistown, Musina, Manica). Whether a point is served is
 * still decided by the service-corridor check at broadcast (`isWithinServiceCorridor`, which
 * `app/send.tsx` runs before broadcasting, and the server's own).
 */
const ZIMBABWE = { south: -22.5, north: -15.5, west: 25.1, east: 33.2 };

/** The contract caps `Waypoint.landmark` well above this; 120 mirrors the confirm sheet's own field. */
const LANDMARK_MAX = 120;

/**
 * The queries to try, in order. Always the trimmed input first, so what the customer typed is never
 * overridden. A query that names neither the country nor a listed town gets a second attempt in the user's town
 * ({@link corridorSuffix}), and one that names a listed town but not the country gets a country-suffixed one. Returns
 * `[]` for a query too short to be worth a geocoder round trip (mirrors the 3-character autocomplete
 * threshold).
 */
export function geocodeQueries(input: string, town: string | null = userTown()): string[] {
  const q = input.trim().replace(/\s+/g, " ");
  if (q.length < 3) return [];
  if (NAMES_COUNTRY.test(q)) return [q];
  if (NAMES_TOWN.test(q)) return [q, `${q}, ${COUNTRY_SUFFIX}`];
  return [q, `${q}, ${corridorSuffix(town)}`];
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
 * Inside the {@link ZIMBABWE} sanity box, edges included. `ComposeMap` applies the same sanity check to a
 * tap on a map that has not loaded yet, whose camera may be nowhere near Harare (MOB-MAP-04).
 */
export function inZimbabwe({ latitude, longitude }: GeocodedLocation): boolean {
  return (
    latitude >= ZIMBABWE.south &&
    latitude <= ZIMBABWE.north &&
    longitude >= ZIMBABWE.west &&
    longitude <= ZIMBABWE.east
  );
}

/**
 * First usable result inside Zimbabwe → the same `ResolvedPlace` shape the Places path produces, so the
 * caller feeds the identical confirm-then-commit flow. Null when there is none, including when every
 * result is abroad. `landmark` is the customer's OWN typed query: the platform geocoder returns no
 * formatted address, and inventing one would put words in the rider's hands that nobody chose.
 * `placeId` is empty by construction — this point did not come from Google, and `send.tsx` only
 * attaches a `placeId` to the order payload when it is truthy, so an empty one is correctly never sent
 * as if it were a real Google place.
 */
export function toResolvedPlace(results: readonly GeocodedLocation[], query: string): ResolvedPlace | null {
  const hit = results.find((r) => isUsable(r) && inZimbabwe(r));
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


/**
 * Resolve a typed address to a point using the device's own geocoder.
 *
 * Android requires foreground location permission before `Geocoder` may be used (expo-location's own
 * documented constraint), so this CHECKS it — a check, never a request (P41): since First Run v2 (ledger
 * D-82) the OS dialog only opens from the PC1 explainer's own button, and this runs from as-you-type
 * address search, where a dialog would pop over a screen that never said why.
 *
 * `"permission"` ("Turn it on in Settings") is reported ONLY for a permission refused for good
 * (`canAskAgain: false`) — the one case where Settings is the honest next step. An undecided (or
 * still-askable) permission goes ahead and asks the geocoder anyway: iOS's geocoder needs no permission,
 * and where Android's refuses, that lands as `"unavailable"` ("tap the map") rather than pointing at a
 * Settings toggle iOS doesn't even show before the first ask. The web build's geocoder is Google's
 * (metro-shims/expo-location-web.js), which needs no permission at all, so the web skips the check. The suffixed retry only runs when the verbatim attempt finds nothing
 * in Zimbabwe, so a verbatim hit costs exactly one round trip, and a hit abroad is a miss like any
 * other: it never becomes the answer.
 */
export async function geocodeAddress(query: string): Promise<GeocodeOutcome> {
  const queries = geocodeQueries(query);
  if (queries.length === 0) return { ok: false, reason: "not-found" };

  if (Platform.OS !== "web") {
    try {
      const { status, canAskAgain } = await Location.getForegroundPermissionsAsync();
      if (status !== "granted" && canAskAgain === false) return { ok: false, reason: "permission" };
    } catch {
      return { ok: false, reason: "unavailable" };
    }
  }

  for (const q of queries) {
    try {
      const results = await withTimeout(Location.geocodeAsync(q), FAST_TIMEOUT_MS, "geocode-timeout");
      const place = toResolvedPlace(results, query);
      if (place) return { ok: true, place };
    } catch {
      // No geocoder on the device, a timeout, or an offline lookup — none of which the suffixed retry
      // can rescue, so stop here rather than paying a second stalled call.
      return { ok: false, reason: "unavailable" };
    }
  }
  return { ok: false, reason: "not-found" };
}
