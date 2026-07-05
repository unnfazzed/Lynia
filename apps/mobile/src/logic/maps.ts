/**
 * Pure Google Maps deep-link builders (Maps-sync, customer-journey §3·2). Extracted from the tracking
 * screens so the URL shapes are unit-testable without a device, and so the `Linking.openURL` sites stay
 * a one-liner. These use Google's universal cross-platform Maps URL scheme — NO API key required, so
 * the "Follow route in Google Maps" / "Open in Maps" rows work today, keyed or not.
 *
 * Reference: https://developers.google.com/maps/documentation/urls/get-started
 */

export interface MapsPoint {
  lat: number;
  lng: number;
}

// Query strings are built with encodeURIComponent (NOT URLSearchParams) — the latter isn't reliably
// polyfilled in the RN/Hermes runtime. encodeURIComponent yields the same output (the `,` → %2C).

/** `lat,lng` at a stable precision (~0.1 m) — trims float noise so the URL is tidy and deterministic. */
function coord(p: MapsPoint): string {
  return encodeURIComponent(`${p.lat.toFixed(6)},${p.lng.toFixed(6)}`);
}

/**
 * Turn-by-turn driving directions from `origin` to `destination` — the rider's leg (pickup → drop-off).
 * Opens Google Maps navigation so the rider follows the same route the customer is tracking.
 */
export function mapsDirectionsUrl(origin: MapsPoint, destination: MapsPoint): string {
  return `https://www.google.com/maps/dir/?api=1&origin=${coord(origin)}&destination=${coord(destination)}&travelmode=driving`;
}

/**
 * A single place pin (no route) — the customer's "Open drop-off in Maps": drops them on the drop-off
 * location so they can follow along or hand the pin to someone. `query` is the coordinate so it lands
 * exactly on the stored point rather than a fuzzy text match.
 */
export function mapsPlaceUrl(point: MapsPoint): string {
  return `https://www.google.com/maps/search/?api=1&query=${coord(point)}`;
}
