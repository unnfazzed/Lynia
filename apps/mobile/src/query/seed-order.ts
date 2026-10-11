import type { QueryClient } from "@tanstack/react-query";
import type { OrderSnapshot } from "../api/orders";
import { orderKey } from "./client";

/** The running-orders list Home and the Orders tab share (`getActiveCustomerOrders`). */
export const ACTIVE_CUSTOMER_ORDERS_KEY = ["activeCustomerOrders"] as const;

/**
 * P34 (customer review 2026-10-07): the order screen's `orderKey(id)` entry, seeded from the running-orders
 * list the phone already holds — so opening a NOW card from the Orders tab (or Home after its own seed was
 * garbage-collected) paints the order at once instead of a skeleton for a full round trip. Spread into the
 * FIRST observer of `orderKey(id)`: `initialData` applies only when the entry doesn't exist yet, and
 * `initialDataUpdatedAt` keeps the list's real age, so a stale copy is still revalidated on mount.
 */
export function seedFromActiveOrders(
  qc: QueryClient,
  orderId: string,
): { initialData: () => OrderSnapshot | undefined; initialDataUpdatedAt: () => number | undefined } {
  return {
    initialData: () => {
      const list = qc.getQueryData<unknown>(ACTIVE_CUSTOMER_ORDERS_KEY);
      return Array.isArray(list) ? (list as OrderSnapshot[]).find((o) => o?.id === orderId) : undefined;
    },
    initialDataUpdatedAt: () => qc.getQueryState(ACTIVE_CUSTOMER_ORDERS_KEY)?.dataUpdatedAt,
  };
}

/** Where a placed restaurant / shop / pharmacy order goes — what Checkout holds at Place time. */
export interface MerchantSnapshotSeed {
  venue: { lat: number; lng: number };
  venueName: string;
  drop: { lat: number; lng: number; label: string };
  total: number;
}

/**
 * P23 (customer review 2026-10-07): Place seeds the generic snapshot next to the food order, the way Send
 * seeds a parcel — the order screen takes the map's venue and drop-off only from the snapshot, so without
 * this it opened on a Harare-wide map and waited a round trip for its pins. The screen's own snapshot
 * read (forced at mount) replaces the seed with the real one.
 */
export function seedMerchantSnapshot(qc: QueryClient, order: { id: string; status: string }, p: MerchantSnapshotSeed): void {
  if (qc.getQueryData(orderKey(order.id)) !== undefined) return;
  qc.setQueryData<OrderSnapshot>(orderKey(order.id), {
    id: order.id,
    orderType: "merchant",
    viewerRole: "customer",
    status: order.status as OrderSnapshot["status"],
    merchantName: p.venueName,
    agreedFare: null,
    proposedFare: p.total.toFixed(2),
    pickup: { point: { lat: p.venue.lat, lng: p.venue.lng }, landmark: p.venueName },
    dropoff: { point: { lat: p.drop.lat, lng: p.drop.lng }, landmark: p.drop.label },
    items: [],
    rider: null,
    events: [],
    counterpartyPhone: null,
    expiresAt: null,
    ridersNearby: null,
  });
}
