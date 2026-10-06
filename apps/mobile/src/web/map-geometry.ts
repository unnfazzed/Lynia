/**
 * Pure camera and style maths for the customer web build's Google map
 * (metro-shims/react-native-maps-web.js, docs/plans/2026-10-06-customer-web-app-plan.md P2). The screens
 * speak react-native-maps (regions with lat/lng deltas, RN colour strings); Google's Maps JavaScript API
 * speaks zoom levels, bounds and hex + opacity. Kept free of the DOM and of Google's globals so it is
 * unit-tested.
 */

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface Region extends LatLng {
  latitudeDelta: number;
  longitudeDelta: number;
}

/** Web Mercator tile size at zoom 0. */
const TILE = 256;
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 20;

const clampZoom = (z: number): number => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));

/** The zoom at which `region` fits a `width`×`height` CSS-pixel map, the way react-native-maps frames it. */
export function zoomForRegion(region: Region, width: number, height: number): number {
  const w = width > 0 ? width : 360;
  const h = height > 0 ? height : 360;
  const lngZoom = Math.log2((w * 360) / (Math.max(region.longitudeDelta, 1e-9) * TILE));
  // Latitude spans stretch with Mercator; scale by the centre's secant so tall regions fit too.
  const latSpan = Math.max(region.latitudeDelta, 1e-9) / Math.cos((region.latitude * Math.PI) / 180);
  const latZoom = Math.log2((h * 360) / (latSpan * TILE));
  return clampZoom(Math.min(lngZoom, latZoom));
}

/** The region a map shows between its south-west and north-east corners. */
export function regionFromBounds(sw: LatLng, ne: LatLng): Region {
  return {
    latitude: (sw.latitude + ne.latitude) / 2,
    longitude: (sw.longitude + ne.longitude) / 2,
    latitudeDelta: Math.abs(ne.latitude - sw.latitude),
    longitudeDelta: Math.abs(ne.longitude - sw.longitude),
  };
}

export interface GoogleColour {
  color: string;
  opacity: number;
}

/** An RN colour string (`#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()`, `rgba()`) as Google's hex + opacity. */
export function toGoogleColour(input: string | undefined, fallback = "#000000"): GoogleColour {
  if (!input) return { color: fallback, opacity: 1 };
  const s = input.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(s);
  if (hex) {
    let h = hex[1]!;
    if (h.length === 3) h = h.replace(/./g, (c) => c + c);
    const opacity = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return { color: `#${h.slice(0, 6)}`, opacity: round2(opacity) };
  }
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(s);
  if (rgb) {
    const to2 = (n: string): string => Math.min(255, Number(n)).toString(16).padStart(2, "0");
    return { color: `#${to2(rgb[1]!)}${to2(rgb[2]!)}${to2(rgb[3]!)}`, opacity: rgb[4] === undefined ? 1 : round2(Number(rgb[4])) };
  }
  return { color: s, opacity: 1 };
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * react-native-maps' `lineDashPattern` ([dash, gap] in points) as the spacing of Google's repeated dash
 * symbol: Google draws dashes as icons along an invisible line, one every `repeatPx`, each `dashPx` long.
 */
export function dashSpec(pattern: readonly number[] | undefined): { dashPx: number; repeatPx: number } | null {
  if (!pattern || pattern.length < 2) return null;
  const dash = Math.max(1, pattern[0]!);
  const gap = Math.max(0, pattern[1]!);
  return { dashPx: dash, repeatPx: dash + gap };
}

/** Where a marker's box sits so its `anchor` (0–1 of its own size) lands on the point at `x`,`y`. */
export function anchorOffset(x: number, y: number, width: number, height: number, anchor: { x: number; y: number } = { x: 0.5, y: 1 }): { left: number; top: number } {
  return { left: Math.round(x - width * anchor.x), top: Math.round(y - height * anchor.y) };
}
