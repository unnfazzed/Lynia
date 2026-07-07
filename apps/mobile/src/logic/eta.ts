import { haversineKm } from "@lynia/shared";
import type { MapPoint } from "../ui/LiveMap";

/**
 * A live "arriving in ~N min" headline for the tracking screen — the single glanceable number modern
 * ride-hailing apps lead with, which Lynia had the inputs for (rider GPS + pickup/dropoff) but only ever
 * surfaced as prose ("Rider is on the move"). Pure and framework-free so it unit-tests off-device.
 *
 * The phase follows the trip: before collection the rider is heading to PICKUP, after it to DROP-OFF, so
 * the target point (and the verb) switch at `picked_up`. Distance is the straight-line haversine — we
 * have no routing engine and mustn't add a network dependency to a screen that already streams GPS — so
 * it is deliberately labelled a rough "~" estimate, inflated by a road-winding factor rather than shown
 * as a false-precision routed ETA.
 */

/** Urban motorbike speed used to turn straight-line distance into minutes (matches the board's seed). */
export const ETA_SPEED_KMH = 22;
/**
 * Straight-line → road multiplier. Real roads wind, so a 2 km crow-flight leg is ~2.6 km ridden; without
 * this the ETA reads optimistically low every time. A rough, honest inflation, not a routed truth.
 */
export const ROAD_WINDING_FACTOR = 1.3;

export type EtaPhase = "to_pickup" | "to_dropoff";

export interface LiveEta {
  phase: EtaPhase;
  /** Whole minutes, floored at 1 (we never show "arriving in 0 min" while still en route). */
  minutes: number;
}

/** The active leg's target point + phase for a live status. `null` once the trip is no longer moving. */
function legFor(status: string, pickup: MapPoint, dropoff: MapPoint): { phase: EtaPhase; target: MapPoint } | null {
  switch (status) {
    // Heading toward the pickup.
    case "assigned":
    case "confirmed":
    case "en_route_pickup":
      return { phase: "to_pickup", target: pickup };
    // Parcel is on the bike — heading toward the drop-off.
    case "picked_up":
    case "en_route_dropoff":
      return { phase: "to_dropoff", target: dropoff };
    default:
      // delivered / completed / cancelled / undelivered / open_for_offers — nothing to estimate.
      return null;
  }
}

/**
 * Compute the live ETA from the rider's current position to the active leg's target. Returns `null` when
 * there's nothing to show — no rider fix yet, or a status with no in-flight leg — so the caller can fall
 * back to its existing "waiting for GPS" copy rather than render a bogus number.
 */
export function liveEta(args: {
  status: string;
  rider: MapPoint | null;
  pickup: MapPoint;
  dropoff: MapPoint;
  speedKmh?: number;
}): LiveEta | null {
  const { status, rider, pickup, dropoff } = args;
  if (!rider) return null;
  const leg = legFor(status, pickup, dropoff);
  if (!leg) return null;

  const speed = args.speedKmh ?? ETA_SPEED_KMH;
  if (!(speed > 0)) return null;

  const km = haversineKm({ lat: rider.lat, lng: rider.lng }, { lat: leg.target.lat, lng: leg.target.lng }) * ROAD_WINDING_FACTOR;
  const minutes = Math.max(1, Math.ceil((km / speed) * 60));
  return { phase: leg.phase, minutes };
}

/** The customer-facing headline for a computed ETA, e.g. "Arriving at drop-off in ~4 min". */
export function etaHeadline(eta: LiveEta): string {
  const where = eta.phase === "to_pickup" ? "pickup" : "drop-off";
  return `Arriving at ${where} in ~${eta.minutes} min`;
}
