// Pure content-selection helpers for the launcher home screen (plan §5 Lane A2: LiveOrderCard /
// "Send again" rail / "Restaurants near you" rail) — no React, unit-testable in isolation, mirrors
// order-labels.ts / order-tracking.ts.
import type { MerchantHours } from "@lynia/shared";
import { isMerchantOpenNow, nextOpenDescription } from "@lynia/shared";
import type { OrderHistoryRow } from "../api/orders";
import { formatMoney } from "./money";

// Mirrors the customer-view step order in `src/ui/index.tsx`'s Stepper (STEP_ORDER) — the same
// 7-step Express-tracker grammar the home LiveOrderCard's progress strip echoes. Kept as an
// independent copy rather than importing from `ui` (logic stays framework/layer-free, matching
// every other file in this directory — `ui/index.tsx` itself already keeps its own private copies
// of the same status lists for the same reason).
const LIVE_ORDER_STEPS = [
  "assigned",
  "confirmed",
  "en_route_pickup",
  "picked_up",
  "en_route_dropoff",
  "delivered",
  "completed",
] as const;

export const LIVE_ORDER_STEP_COUNT = LIVE_ORDER_STEPS.length;

/** 0-based tracker index for a live order's current status; -1 pre-assignment (still in the
 *  auction) — the home LiveOrderCard's progress strip then correctly renders every segment unlit. */
export function liveOrderStepIndex(status: string): number {
  return LIVE_ORDER_STEPS.indexOf(status as (typeof LIVE_ORDER_STEPS)[number]);
}

export interface LiveOrderCardCopy {
  title: string;
  meta: string;
}

/**
 * Home LiveOrderCard copy for a customer's active order. Mirrors `send.tsx`'s own
 * `ActiveOrderBanner` copy so the same live order reads identically wherever it surfaces — home
 * (this) and the composer's own restore banner both read `["activeCustomerOrder"]`.
 *
 * "Any service" (plan §5 A2) is the design intent, but today this only ever renders a Send/parcel
 * order in practice: Restaurants' customer checkout/track (Lane D2/D3) hasn't shipped yet, so a
 * merchant order can't yet become the signed-in customer's active order — flagged as an open item
 * for D2/D3 rather than guessed at (e.g. a restaurant-name headline, live ETA minutes, and a
 * payment-method line all need wire-contract fields that don't exist yet).
 */
export function liveOrderCardCopy(
  order: {
    pickup: { landmark?: string | null };
    dropoff: { landmark?: string | null };
    agreedFare: string | null;
    proposedFare: string;
  },
  statusLabel: string,
): LiveOrderCardCopy {
  return {
    title: `Delivery in progress · ${statusLabel}`,
    meta: `${order.pickup.landmark || "Pickup"} → ${order.dropoff.landmark || "Drop-off"} · ${formatMoney(order.agreedFare ?? order.proposedFare)}`,
  };
}

export interface ReorderRailItem {
  id: string;
  name: string;
  price: string;
}

/**
 * "Send again" rail items (plan §5 A2) — the customer's own most-recently sent parcels, newest
 * first (the history API already orders by `createdAt desc`), capped so the rail is a bounded
 * shelf rather than the customer's whole history. Hidden by the caller while a live order shows
 * (`home.prompt.md`: "Hidden while a live order shows — the card takes its slot").
 */
export function reorderRailItems(rows: OrderHistoryRow[], limit = 10): ReorderRailItem[] {
  return rows
    .filter((r) => r.role === "customer")
    .slice(0, limit)
    .map((r) => ({
      id: r.id,
      name: r.dropoff.landmark || r.itemDesc || "Parcel",
      price: formatMoney(r.agreedFare ?? r.proposedFare),
    }));
}

export interface RestaurantCardStatus {
  closed: boolean;
  note: string | null;
}

/** Open/closed + the closed-card status pill (plan §5 A2 "Restaurants near you" rail), derived
 *  client-side exactly like the D1 browse list — the server never ships a staleable precomputed
 *  boolean (see `restaurant-hours.ts`). */
export function restaurantCardStatus(hours: MerchantHours | null, now: Date): RestaurantCardStatus {
  const open = isMerchantOpenNow(hours, now);
  return { closed: !open, note: open ? null : nextOpenDescription(hours, now) };
}
