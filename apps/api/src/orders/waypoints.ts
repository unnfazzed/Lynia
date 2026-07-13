import { BoardNewOrderEvent, OFFER_WINDOW_MS } from "@lynia/shared";
import type { Prisma } from "@prisma/client";

/**
 * Waypoint JSON helpers shared by the order create/announce path (OrdersService) and the widening
 * broadcast ticks (MatchingService.expandBroadcast) — extracted so both build byte-identical,
 * PII-redacted board payloads from a stored order row.
 */

/** Strip a stored Waypoint down to what a browsing rider may see — point + landmark, no contactPhone. */
export function publicWaypoint(w: Prisma.JsonValue): { point: unknown; landmark: unknown } {
  const o = (w ?? {}) as { point?: unknown; landmark?: unknown };
  return { point: o.point ?? null, landmark: o.landmark ?? null };
}

/** Pull the pickup's lat/lng + landmark out of a stored/input Waypoint JSON (the nearby-radius anchor
 *  and the push copy). Returns null when the point is malformed, so the broadcast is skipped rather
 *  than throwing (it's best-effort). Works for both the create input and a re-broadcast DB row. */
export function pickupPoint(w: Prisma.JsonValue): { lat: number; lng: number; landmark: string } | null {
  const o = (w ?? {}) as { point?: { lat?: unknown; lng?: unknown }; landmark?: unknown };
  const lat = o.point?.lat;
  const lng = o.point?.lng;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  return { lat, lng, landmark: typeof o.landmark === "string" ? o.landmark : "" };
}

/** The order fields a broadcast payload is built from (fares pre-serialized to strings). */
export interface BroadcastMeta {
  itemDesc: string;
  suggestedFare: string;
  proposedFare: string;
  distanceKm: number | null;
  createdAt: string;
}

/**
 * The redacted new-order board payload — same redaction as listOpen (point + landmark only, NEVER
 * contactPhone); parsing through the `.strict()` schema enforces the no-PII guarantee ON THE WIRE.
 * `expiresAt` exposes the shared auction clock (C2) so a bidder's offer-sent screen can render the
 * same countdown. Throws on a schema mismatch — callers guard it as best-effort.
 */
export function buildBoardNewOrderEvent(
  orderId: string,
  pickup: Prisma.JsonValue,
  dropoff: Prisma.JsonValue,
  meta: BroadcastMeta,
): BoardNewOrderEvent {
  return BoardNewOrderEvent.parse({
    id: orderId,
    pickup: publicWaypoint(pickup),
    dropoff: publicWaypoint(dropoff),
    itemDesc: meta.itemDesc,
    suggestedFare: meta.suggestedFare,
    proposedFare: meta.proposedFare,
    distanceKm: meta.distanceKm,
    createdAt: meta.createdAt,
    expiresAt: new Date(new Date(meta.createdAt).getTime() + OFFER_WINDOW_MS).toISOString(),
  });
}
