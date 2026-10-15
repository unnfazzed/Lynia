/**
 * Suggested-fare model — the price *anchor* Lynia shows the customer (CONCEPT §1: customer names
 * the price; we seed a fair starting point). Pure and shared so the API stores the same number the
 * mobile client can preview live as pickup/dropoff move. Riders still counter, customers still decide.
 *
 * Pilot numbers are USD for Harare-corridor motorbike-courier runs; tune at the pricing T0 spike.
 */
import type { LatLng } from "./contracts";
import { fromCents, roundToCents, toCents } from "./money";

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
// Money rounding centralised in ./money (roundToCents === the former local round2, to the cent).
const round2 = roundToCents;

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

/**
 * Every fare is a whole number of 50 cents (owner, 2026-10-15): the suggestion, what the customer names,
 * a raise or resend, a biker's counter and an admin's correction. Cash only, so nobody hands over 42c.
 */
export const FARE_UNIT_USD = 0.5;
const FARE_UNIT_CENTS = 50;

/** A fare to the nearest 50c (half rounds up, like the restaurant delivery fee), never below 50c. */
export function roundFare(usd: number): number {
  if (!Number.isFinite(usd)) return FARE_UNIT_USD;
  const units = Math.round(toCents(usd) / FARE_UNIT_CENTS);
  return fromCents(Math.max(1, units) * FARE_UNIT_CENTS);
}

/** Whether a fare already sits on the 50c grid. */
export function isFareUnit(usd: number): boolean {
  return Number.isFinite(usd) && toCents(usd) % FARE_UNIT_CENTS === 0;
}

/**
 * − / + on a fare: to the next 50c in that direction ($3.42 → $3.50 / $3.00; $3.50 → $4.00 / $3.00),
 * never below `min`. An off-grid fare (an order from before the rule) snaps onto the grid on the first tap.
 */
export function stepFare(usd: number, dir: 1 | -1, min: number = FARE_UNIT_USD): number {
  const cents = Number.isFinite(usd) ? toCents(usd) : 0;
  const units = dir > 0 ? Math.floor(cents / FARE_UNIT_CENTS) + 1 : Math.ceil(cents / FARE_UNIT_CENTS) - 1;
  return Math.max(min, fromCents(units * FARE_UNIT_CENTS));
}

/** Suggested fare (USD) for a trip of the given distance — to the nearest 50c, floored at FARE.minUsd. */
export function suggestFare(distanceKm: number): number {
  const km = Number.isFinite(distanceKm) ? Math.max(0, distanceKm) : 0;
  return Math.max(FARE.minUsd, roundFare(FARE.baseUsd + FARE.perKmUsd * km));
}

/** Distance (km, 2dp) + suggested fare (50c) for a pickup→dropoff pair. */
export function quoteFare(pickup: LatLng, dropoff: LatLng): { distanceKm: number; suggestedFare: number } {
  const distanceKm = round2(haversineKm(pickup, dropoff));
  return { distanceKm, suggestedFare: suggestFare(distanceKm) };
}
