/**
 * Suggested-fare model — the price *anchor* Lynia shows the customer (CONCEPT §1: customer names
 * the price; we seed a fair starting point). Pure and shared so the API stores the same number the
 * mobile client can preview live as pickup/dropoff move. Riders still counter, customers still decide.
 *
 * Pilot numbers are USD for Harare-corridor motorbike-courier runs; tune at the pricing T0 spike.
 */
import type { LatLng } from "./contracts";

export const FARE = {
  /** Flag-fall: pickup + handling, independent of distance. */
  baseUsd: 1.5,
  /** Distance component. */
  perKmUsd: 0.6,
  /** Never quote below this — short hops still cost the rider time. */
  minUsd: 1.5,
  earthRadiusKm: 6371,
} as const;

const toRad = (deg: number): number => (deg * Math.PI) / 180;
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Great-circle distance between two points (Haversine), in kilometres. */
export function haversineKm(a: LatLng, b: LatLng): number {
  if (![a.lat, a.lng, b.lat, b.lng].every(Number.isFinite)) return 0;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * FARE.earthRadiusKm * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Suggested fare (USD, 2dp) for a trip of the given distance — floored at FARE.minUsd. */
export function suggestFare(distanceKm: number): number {
  const km = Number.isFinite(distanceKm) ? Math.max(0, distanceKm) : 0;
  return round2(Math.max(FARE.minUsd, FARE.baseUsd + FARE.perKmUsd * km));
}

/** Distance (km) + suggested fare for a pickup→dropoff pair, both rounded to 2dp. */
export function quoteFare(pickup: LatLng, dropoff: LatLng): { distanceKm: number; suggestedFare: number } {
  const distanceKm = round2(haversineKm(pickup, dropoff));
  return { distanceKm, suggestedFare: suggestFare(distanceKm) };
}
