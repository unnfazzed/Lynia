import type { Fleet, FleetPoint, LiveBreach } from "../lib/adminTypes";

/**
 * Admin console v2 §7 — the live map's geometry. The admin app has no Maps key (D-80's Google key is the
 * merchant web's own, browser-restricted to that site), so the map is drawn to scale on a plain box: every
 * point is projected into one bounding box (equirectangular, longitudes shrunk by cos(latitude)).
 */
export const MAP_W = 640;
export const MAP_H = 380;
const PAD = 24;
/** The smallest box side (degrees, ≈1 km), so one biker alone isn't drawn at infinite zoom. */
const MIN_SPAN_DEG = 0.01;

export interface MapBiker {
  riderId: string;
  name: string;
  x: number;
  y: number;
  fresh: boolean;
  onJob: boolean;
  at: string | null;
}

export interface MapOrder {
  orderId: string;
  breach: LiveBreach | null;
  pickup: { x: number; y: number } | null;
  dropoff: { x: number; y: number } | null;
}

export interface FleetLayout {
  bikers: MapBiker[];
  orders: MapOrder[];
  /** Bikers online with no position to draw. */
  unplaced: number;
}

/** A real fix (not missing, not the 0,0 a broken GPS reports). */
const usable = (p: FleetPoint | null | undefined): p is FleetPoint =>
  !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180 && !(p.lat === 0 && p.lng === 0);

export function layoutFleet(fleet: Fleet): FleetLayout {
  const pts: FleetPoint[] = [];
  for (const r of fleet.riders) if (usable(r.position)) pts.push(r.position);
  for (const o of fleet.orders) {
    if (usable(o.pickup)) pts.push(o.pickup);
    if (usable(o.dropoff)) pts.push(o.dropoff);
  }
  const unplaced = fleet.riders.filter((r) => !usable(r.position)).length;
  if (pts.length === 0) return { bikers: [], orders: [], unplaced };

  let minLat = Math.min(...pts.map((p) => p.lat));
  let maxLat = Math.max(...pts.map((p) => p.lat));
  let minLng = Math.min(...pts.map((p) => p.lng));
  let maxLng = Math.max(...pts.map((p) => p.lng));
  const midLat = (minLat + maxLat) / 2;
  const k = Math.cos((midLat * Math.PI) / 180) || 1;
  if (maxLat - minLat < MIN_SPAN_DEG) {
    minLat = midLat - MIN_SPAN_DEG / 2;
    maxLat = midLat + MIN_SPAN_DEG / 2;
  }
  if ((maxLng - minLng) * k < MIN_SPAN_DEG) {
    const mid = (minLng + maxLng) / 2;
    minLng = mid - MIN_SPAN_DEG / (2 * k);
    maxLng = mid + MIN_SPAN_DEG / (2 * k);
  }
  const spanX = (maxLng - minLng) * k;
  const spanY = maxLat - minLat;
  const scale = Math.min((MAP_W - 2 * PAD) / spanX, (MAP_H - 2 * PAD) / spanY);
  const offX = (MAP_W - spanX * scale) / 2;
  const offY = (MAP_H - spanY * scale) / 2;
  const project = (p: FleetPoint) => ({
    x: Math.round((offX + (p.lng - minLng) * k * scale) * 10) / 10,
    y: Math.round((offY + (maxLat - p.lat) * scale) * 10) / 10,
  });

  const bikers: MapBiker[] = [];
  for (const r of fleet.riders) {
    if (!usable(r.position)) continue;
    bikers.push({ riderId: r.riderId, name: r.name, ...project(r.position), fresh: r.position.fresh, onJob: r.orderId !== null, at: r.position.at });
  }
  const orders: MapOrder[] = fleet.orders
    .map((o) => ({
      orderId: o.orderId,
      breach: o.breach,
      pickup: usable(o.pickup) ? project(o.pickup) : null,
      dropoff: usable(o.dropoff) ? project(o.dropoff) : null,
    }))
    .filter((o) => o.pickup || o.dropoff);
  return { bikers, orders, unplaced };
}
