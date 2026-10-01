import type { Me } from "./auth";
import { apiFetch } from "./client";

/**
 * Rider v2 adapter (`packages/design/handoff/rider-v2/`, ledger D-54). The handoff draws a few figures
 * the API doesn't serve yet; each one is a typed function here with a `TODO(backend)` so the screens
 * render an honest empty value (never a fabricated one) until the endpoint lands. Everything the API
 * DOES already serve is read from its existing call — this file only covers the gaps.
 */

export interface RiderStanding {
  /** Share of offers/food jobs accepted in the last 30 days. */
  acceptancePct: number | null;
  /** Pre-pickup cancel strikes toward RIDER_STRIKE_LIMIT. */
  strikesUsed: number;
  /** When the oldest strike in the 30-day window drops off. */
  oldestClearsAt: Date | null;
}

/**
 * The rider's standing card. Strikes are real (`rider.cancelStrikes` on `/auth/me`).
 * TODO(backend): acceptance rate (accepted ÷ offered, 30 days) and the oldest strike's expiry are not
 * on any endpoint yet — the card shows "—" and leaves out the "clears on" sentence until they are.
 */
export function getRiderStanding(rider: Me["rider"] | null): RiderStanding {
  return {
    acceptancePct: null,
    strikesUsed: rider?.cancelStrikes ?? 0,
    oldestClearsAt: null,
  };
}

/** A busy area for the board map: centre, radius in metres, and how busy (0–1). */
export interface DemandZone {
  lat: number;
  lng: number;
  radiusM: number;
  level: number;
  /** The landmark the board names in "Busier near {place}". */
  place: string;
}

/**
 * The board's busy zones (owner 2026-10-01: "demand from orders pending and in progress") — the server
 * groups the last hour's waiting and on-the-road orders near the rider into ~1 km cells and returns the
 * busiest three. No position, no zones.
 */
export async function getDemandZones(loc: { lat: number; lng: number } | null): Promise<DemandZone[]> {
  if (!loc) return [];
  const rows = await apiFetch<DemandZone[]>(`/orders/demand?lat=${loc.lat}&lng=${loc.lng}`);
  return Array.isArray(rows) ? rows.filter((z) => Number.isFinite(z.lat) && Number.isFinite(z.lng) && z.place) : [];
}

/**
 * TODO(backend): the usual fare band for a trip distance. Until the server sends one, the offer screen
 * derives a band from the asking price (±20%) so the bar has something honest to show — and never
 * blocks sending.
 */
export function fareBand(asking: number): { lo: number; hi: number } {
  const lo = Math.max(0.5, Math.round(asking * 0.8 * 2) / 2);
  const hi = Math.max(lo + 0.5, Math.round(asking * 1.2 * 2) / 2);
  return { lo, hi };
}
