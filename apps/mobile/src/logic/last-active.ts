import type { OrderStatus } from "@lynia/shared";
import type { OrderSnapshot } from "../api/orders";

/**
 * A tiny, bounded summary of the customer's active order — just enough to render a "here's your order"
 * card at an OFFLINE COLD START (app killed, relaunched with no signal) instead of a bare "couldn't
 * load" dead-end. Deliberately small so it fits comfortably in SecureStore (the app's only persistence,
 * ~2KB/value): the id, status, fare, the two landmarks, and the rider's last-known pin. NOT the full
 * snapshot (no offers, no events, no phones) — this is a last-known placeholder that the live query
 * replaces the instant we reconnect, not a source of truth.
 */
export interface LastActive {
  id: string;
  status: OrderStatus;
  /** The fare the customer sees — agreed once assigned, else the proposed price. */
  fare: string;
  pickupLandmark: string;
  dropoffLandmark: string;
  /** The rider's last-known position, or null before a first GPS fix. */
  rider: { lat: number; lng: number; updatedAt: string } | null;
  /** ISO time this summary was saved — drives the "last saved" honesty line. */
  savedAt: string;
}

// Landmarks are user-entered free text; clip so a pathological value can't bloat the stored blob.
const MAX_LANDMARK = 120;
const clip = (s: string): string => (s.length > MAX_LANDMARK ? s.slice(0, MAX_LANDMARK) : s);

/** Project a live snapshot down to the bounded summary. `savedAtIso` is passed in so this stays pure. */
export function toLastActive(o: OrderSnapshot, savedAtIso: string): LastActive {
  const rider =
    o.rider && o.rider.currentLat != null && o.rider.currentLng != null && o.rider.updatedAt != null
      ? { lat: o.rider.currentLat, lng: o.rider.currentLng, updatedAt: o.rider.updatedAt }
      : null;
  return {
    id: o.id,
    status: o.status,
    fare: o.agreedFare ?? o.proposedFare,
    pickupLandmark: clip(o.pickup.landmark ?? ""),
    dropoffLandmark: clip(o.dropoff.landmark ?? ""),
    rider,
    savedAt: savedAtIso,
  };
}

export function serializeLastActive(la: LastActive): string {
  return JSON.stringify(la);
}

/**
 * Parse a persisted summary back, defensively — a corrupt or older-shape blob returns null (the caller
 * just falls back to the normal error/retry state) rather than throwing into the render.
 */
export function deserializeLastActive(raw: string): LastActive | null {
  try {
    const v = JSON.parse(raw) as Partial<LastActive>;
    if (typeof v.id !== "string" || typeof v.status !== "string" || typeof v.fare !== "string") return null;
    const r = v.rider;
    const rider =
      r && typeof r.lat === "number" && typeof r.lng === "number" && typeof r.updatedAt === "string"
        ? { lat: r.lat, lng: r.lng, updatedAt: r.updatedAt }
        : null;
    return {
      id: v.id,
      status: v.status,
      fare: v.fare,
      pickupLandmark: typeof v.pickupLandmark === "string" ? v.pickupLandmark : "",
      dropoffLandmark: typeof v.dropoffLandmark === "string" ? v.dropoffLandmark : "",
      rider,
      savedAt: typeof v.savedAt === "string" ? v.savedAt : "",
    };
  } catch {
    return null;
  }
}
