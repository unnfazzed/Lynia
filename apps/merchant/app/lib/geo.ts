import { isInServiceArea, type LatLng } from "@lynia/shared";

/**
 * The merchant web's map helpers. Maps are Google's (owner decision D-80, replacing D-48's OpenStreetMap):
 * the tracking screens' band is one Maps Static API image, so it needs no map library or script and stays
 * light on a 2G/3G link.
 */

/** The Static Maps API's largest free-tier image side, in CSS pixels (`scale=2` doubles the bitmap). */
export const STATIC_MAP_MAX = 640;

/** One Static Maps image of `width`×`height` CSS pixels centred on `center`, with no marker (the band
 *  draws its own pin). Each side is held to 1..640, the API's limit. */
export function staticMapUrl(center: LatLng, width: number, height: number, key: string, zoom = 15): string {
  const side = (n: number) => Math.max(1, Math.min(STATIC_MAP_MAX, Math.round(n)));
  const params = new URLSearchParams({
    center: `${center.lat},${center.lng}`,
    zoom: String(zoom),
    size: `${side(width)}x${side(height)}`,
    scale: "2",
    key,
  });
  return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
}

/** The same service-area rule `POST /merchant/become` applies (Harare metro + the satellite towns,
 *  `isInServiceArea` in @lynia/shared), so the form can say so while the pin is still being placed. The API
 *  stays the authority. */
export function insideServiceArea(point: LatLng): boolean {
  return isInServiceArea(point);
}
