import { isInServiceArea, type LatLng, SERVICE_CORRIDOR } from "@lynia/shared";

/**
 * The map maths behind `LocationPin` (merchant web upgrade L1: the sign-up's confirmed map pin). Plain
 * Web Mercator over 256px OpenStreetMap tiles — the projection every slippy map uses — so the pin needs
 * no map library, no stylesheet and no lockfile change, and it stays light on a 2G/3G link.
 */

export const TILE_SIZE = 256;
export const MIN_ZOOM = 3;
export const MAX_ZOOM = 19;

/** Web Mercator's latitude limit; beyond it the projection runs off to infinity. */
const MAX_LAT = 85.05112878;

/** Where the pin starts when the browser can't (or won't) say where the merchant is: Harare CBD, the
 *  centre of the service corridor the API checks sign-ups against. */
export const HARARE_CBD: LatLng = { lat: SERVICE_CORRIDOR.centerLat, lng: SERVICE_CORRIDOR.centerLng };

export interface Pixel {
  x: number;
  y: number;
}

function worldSize(zoom: number): number {
  return TILE_SIZE * 2 ** zoom;
}

/** The point's position in whole-world pixels at `zoom`. */
export function project(point: LatLng, zoom: number): Pixel {
  const size = worldSize(zoom);
  const lat = Math.max(-MAX_LAT, Math.min(MAX_LAT, point.lat));
  const sin = Math.sin((lat * Math.PI) / 180);
  return {
    x: ((point.lng + 180) / 360) * size,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size,
  };
}

/** The inverse of `project`. Longitude wraps into [-180, 180); latitude is held inside the projection. */
export function unproject(pixel: Pixel, zoom: number): LatLng {
  const size = worldSize(zoom);
  const lng = (pixel.x / size) * 360 - 180;
  const y = Math.max(0, Math.min(size, pixel.y));
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / size))) * 180) / Math.PI;
  return { lat: roundCoord(lat), lng: roundCoord(((((lng + 180) % 360) + 360) % 360) - 180) };
}

/** Six decimals is about 11 cm — finer than any pin a finger can place, and it keeps saved rows tidy. */
function roundCoord(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

export function clampZoom(zoom: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(zoom)));
}

/** The point `dx`/`dy` screen pixels away from `center` at `zoom` — how dragging the map under a fixed
 *  centre pin moves the pin's point (drag right ⇒ the map moves right ⇒ the pin lands further west). */
export function panBy(center: LatLng, dx: number, dy: number, zoom: number): LatLng {
  const p = project(center, zoom);
  return unproject({ x: p.x - dx, y: p.y - dy }, zoom);
}

export interface VisibleTile {
  /** The tile's column, wrapped into [0, 2^zoom) for its URL. */
  x: number;
  y: number;
  zoom: number;
  /** Where the tile's top-left corner sits inside the viewport, in CSS pixels. */
  left: number;
  top: number;
  /** Unique per rendered position (the unwrapped column), so a world-wrap never duplicates a key. */
  key: string;
}

/** Every tile needed to cover a `width`×`height` viewport centred on `center`. */
export function visibleTiles(center: LatLng, zoom: number, width: number, height: number): VisibleTile[] {
  const c = project(center, zoom);
  const originX = c.x - width / 2;
  const originY = c.y - height / 2;
  const count = 2 ** zoom;
  const firstX = Math.floor(originX / TILE_SIZE);
  const lastX = Math.floor((originX + width) / TILE_SIZE);
  const firstY = Math.max(0, Math.floor(originY / TILE_SIZE));
  const lastY = Math.min(count - 1, Math.floor((originY + height) / TILE_SIZE));
  const tiles: VisibleTile[] = [];
  for (let ty = firstY; ty <= lastY; ty++) {
    for (let tx = firstX; tx <= lastX; tx++) {
      tiles.push({
        x: ((tx % count) + count) % count,
        y: ty,
        zoom,
        left: Math.round(tx * TILE_SIZE - originX),
        top: Math.round(ty * TILE_SIZE - originY),
        key: `${zoom}/${tx}/${ty}`,
      });
    }
  }
  return tiles;
}

export function tileUrl(tile: Pick<VisibleTile, "x" | "y" | "zoom">): string {
  return `https://tile.openstreetmap.org/${tile.zoom}/${tile.x}/${tile.y}.png`;
}

/** The same service-area rule `POST /merchant/become` applies (Harare metro + the satellite towns,
 *  `isInServiceArea` in @lynia/shared), so the form can say so while the pin is still being placed. The API
 *  stays the authority. */
export function insideServiceArea(point: LatLng): boolean {
  return isInServiceArea(point);
}
