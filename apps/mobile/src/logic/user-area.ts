import { isInServiceArea, type LatLng, SERVICE_CORRIDOR } from "@lynia/shared";

/**
 * Where the person using the app is, roughly: the last point the app learned for them (Home's location, the
 * Send pickup's GPS fix, the rider board's fix). LyniaGo is live in Harare AND Bulawayo (owner, 2026-10-20,
 * ledger D-120), so the things that used to assume Harare read this instead:
 *
 *  - address search ranks places near this point first ({@link userPoint}, `src/api/places.ts`);
 *  - the device-geocoder retry names this town, not always Harare ({@link userTown}, `geocode.ts`);
 *  - a map with nothing to show yet opens here ({@link defaultMapCenter}).
 *
 * In memory only, for this run of the app. Before anything is known the maps fall back to Harare's centre
 * (the largest market) and search has no bias beyond Zimbabwe.
 */

let last: LatLng | null = null;

/** Remember where the user is. A point outside Zimbabwe (a phone abroad) is ignored. */
export function noteUserPoint(p: { lat: number; lng: number } | null | undefined): void {
  if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lng) || !isInServiceArea(p)) return;
  last = { lat: p.lat, lng: p.lng };
}

/** The last point noted for the user, or null when none is known yet. */
export function userPoint(): LatLng | null {
  return last;
}

/** Forget the point (sign-out, tests). */
export function resetUserArea(): void {
  last = null;
}

/** The towns we are live in, by centre. */
export const LIVE_TOWNS: readonly { name: string; lat: number; lng: number }[] = [
  { name: "Harare", lat: SERVICE_CORRIDOR.centerLat, lng: SERVICE_CORRIDOR.centerLng },
  { name: "Bulawayo", lat: -20.15, lng: 28.5833 },
];

/** How far from a live town's centre still counts as that town (km): its suburbs and satellite towns. */
export const TOWN_REACH_KM = 60;

function km(a: LatLng, b: LatLng): number {
  const r = (d: number): number => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** The live town the user is in or near ("Harare", "Bulawayo"), or null when unknown or elsewhere. */
export function userTown(p: LatLng | null = last): string | null {
  if (!p) return null;
  let best: { name: string; d: number } | null = null;
  for (const t of LIVE_TOWNS) {
    const d = km(p, t);
    if (d <= TOWN_REACH_KM && (!best || d < best.d)) best = { name: t.name, d };
  }
  return best?.name ?? null;
}

/** Where a map with nothing of its own to show opens: the user's point, else Harare's centre. */
export function defaultMapCenter(): { latitude: number; longitude: number } {
  const p = last ?? { lat: SERVICE_CORRIDOR.centerLat, lng: SERVICE_CORRIDOR.centerLng };
  return { latitude: p.lat, longitude: p.lng };
}

/** {@link defaultMapCenter} as a map region `delta` degrees across. */
export function defaultMapRegion(delta = 0.06): { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number } {
  return { ...defaultMapCenter(), latitudeDelta: delta, longitudeDelta: delta };
}
