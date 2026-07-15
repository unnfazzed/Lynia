import type {
  AcceptDisclaimerRequest,
  AdvanceStatusRequest,
  CancelRequest,
  ConfirmItemsRequest,
  CreateOrderRequest,
  LatLng,
  OrderStatus,
  RateRequest,
  RateSenderRequest,
  UndeliveredReason,
} from "@lynia/shared";
import { apiFetch } from "./client";

export interface CreateOrderResult {
  id: string;
  status: OrderStatus;
  proposedFare: string;
  suggestedFare: string;
  distanceKm: number;
  /** ISO end of the offer window (createdAt + OFFER_WINDOW_MS) — drives the auction countdown. */
  expiresAt: string | null;
  /** Online riders within the broadcast radius at broadcast time (2·b1); null = supply unknown. */
  ridersNearby?: number | null;
}

export interface OrderEvent {
  status: OrderStatus;
  lat: number | null;
  lng: number | null;
  createdAt: string;
}
export interface OrderSnapshot {
  id: string;
  status: OrderStatus;
  // Which party is viewing this order — the server derives it from the same party check that gates the
  // snapshot. Lets the tracking screen flip customer-voiced/customer-gated UI (rating card, cancel-blame
  // copy, counterparty-phone label) for a rider viewing their own trip. Optional for older APIs that
  // don't send it — treat an absent value as the customer view (the historical default).
  viewerRole?: "customer" | "rider";
  agreedFare: string | null;
  proposedFare: string;
  // contactPhone arrives only for the ASSIGNED rider inside the reveal window (§5d) — absent for
  // the customer view and outside the window.
  pickup: { point: LatLng; landmark: string; contactPhone?: string | null };
  dropoff: { point: LatLng; landmark: string; contactPhone?: string | null };
  // Line-items — null/absent on orders created before the items column (clients render nothing).
  items?: { description: string; quantity: number }[] | null;
  // Per-item pickup confirmation (indexes into `items`) the rider ticked at `en_route_pickup`, persisted
  // server-side so the checklist state survives a reconnect/refetch. null/absent until confirmed, on old
  // orders, or on an older API. Also lets the rider screen's durable confirmItems retry (KB-CONFIRMITEMS-
  // RETRY) tell whether the confirmation still needs to be (re-)sent.
  itemsCollected?: number[] | null;
  // The sender's note for the rider ("ask for Rita at reception") — parties on the order only.
  note?: string | null;
  // §5c proof-of-pickup: a short-lived signed URL for the rider's optional parcel photo, served to
  // BOTH parties once attached ("parcel is with your rider — photo attached"). Absent/null when no
  // photo was added, on old orders, and on an older API — optional everywhere, purely additive.
  pickupPhotoUrl?: string | null;
  rider: { profileId: string; currentLat: number | null; currentLng: number | null; updatedAt: string | null } | null;
  events: OrderEvent[];
  counterpartyPhone: string | null;
  /** ISO end of the offer window while `open_for_offers`, else null — drives the auction countdown. */
  expiresAt: string | null;
  /** Live count of online riders nearby while `open_for_offers` (2·b1); null otherwise / supply unknown. */
  ridersNearby?: number | null;
  // Set only on the terminal `undelivered` status (INTERFACE-AUDIT C6 / F-02): the reason the rider
  // recorded + how many hand-off attempts were made, shown verbatim on the customer's terminal card.
  // Absent/null on every other status.
  undeliveredReason?: UndeliveredReason | null;
  undeliveredAttempts?: number | null;
  // The server's committed delivery-code attempt count — lets the rider's screen resync its lockout
  // state (e.g. after the customer re-issues the code, which resets this to 0 server-side) instead of
  // trusting a purely local counter that has no way to learn about a server-side reset.
  deliveryOtpAttempts?: number | null;
  // ISO timestamp stamped server-side every time the delivery code is issued or rotated (KB-DELIVERY-CODE-
  // ROTATION-SIGNAL). The PRIMARY, always-reliable rotation signal for the customer's stored plaintext
  // code: when it moves past the value last confirmed locally, the code was re-issued and the local copy
  // is dead (see reconcileDeliveryCode). Null/absent on an older API or a cached pre-field snapshot, in
  // which case the client falls back to the deliveryOtpAttempts high-water heuristic.
  codeRotatedAt?: string | null;
  // Set only on the terminal `cancelled` status (3·b3): the recorded reason + which side cancelled.
  cancelReason?: string | null;
  cancelledBy?: "customer" | "rider" | null;
  // F-01: on a rider-bail cancel, the id of the fresh clone the job was auto re-broadcast to (same
  // price) — lets the cancelled terminal link the customer forward to the re-sent request. Null/absent
  // when the cancel produced no rebroadcast (customer/admin cancel) or on an older API.
  rebroadcastedToId?: string | null;
  // UX-2026-07-12 #11: set only on a no-supply `expired` order (window closed with zero bids AND nobody
  // online near the pickup) — lets the expired terminal show the honest "no riders were online" copy
  // instead of "nudge the price up". Null/absent on a normal expiry, other statuses, or an older API.
  expiryNoSupply?: boolean | null;
  // UX-2026-07-14: set only on an `expired` order — whether ANY rider ever bid on this auction (a plain
  // server-side count of offer rows, which survive expiry). The client's own live `bidCount` sees nothing
  // on a COLD read into an already-expired order (it queries only `pending` offers, gone post-expiry), so
  // this is what lets the expired terminal honestly say "riders did offer, you didn't pick in time" vs.
  // "no riders took this price". Null/absent on every non-expired status and on an older API.
  hadOffers?: boolean | null;
}

/**
 * The create payload as SENT: CreateOrderRequest plus an OPTIONAL `placeId` riding on each waypoint.
 * Search-first addressing (§1·3) stores the Google `place_id` alongside `{point, landmark, contactPhone}`
 * in the waypoint JSON — no shared-schema change, the server persists the waypoint object as JSON. The
 * field is absent on the pin-on-map path, so this is a pure superset (old flow unaffected).
 */
export type CreateOrderBody = CreateOrderRequest & {
  pickup: CreateOrderRequest["pickup"] & { placeId?: string };
  dropoff: CreateOrderRequest["dropoff"] & { placeId?: string };
};

export function createOrder(body: CreateOrderBody): Promise<CreateOrderResult> {
  return apiFetch<CreateOrderResult>("/orders", { method: "POST", body });
}

export function getOrder(orderId: string): Promise<OrderSnapshot> {
  return apiFetch<OrderSnapshot>(`/orders/${orderId}`);
}

// --- Rider-facing reads + lifecycle drive ---

// contactPhone is redacted server-side until assignment (§5d) — riders see point + landmark only.
export interface OpenOrder {
  id: string;
  pickup: { point: LatLng; landmark: string };
  dropoff: { point: LatLng; landmark: string };
  itemDesc: string;
  suggestedFare: string;
  proposedFare: string;
  distanceKm: number | null;
  createdAt: string;
}

/** Open orders the rider can bid on. When the rider's location is known, the server scopes to nearby
 *  orders (distance-sorted); with no location it falls back to the newest city-wide (backward compat). */
export function getOpenOrders(loc?: { lat: number; lng: number }, radiusM?: number): Promise<OpenOrder[]> {
  const q = loc ? `?lat=${loc.lat}&lng=${loc.lng}${radiusM ? `&radiusM=${radiusM}` : ""}` : "";
  return apiFetch<OpenOrder[]>(`/orders/open${q}`);
}

export function getActiveOrder(): Promise<OrderSnapshot | null> {
  return apiFetch<OrderSnapshot | null>("/orders/mine/active");
}

/** The signed-in customer's current live order (auction or active ride), or null — used to restore
 *  them to their tracking screen on a cold start instead of a blank compose form. */
export function getActiveCustomerOrder(): Promise<OrderSnapshot | null> {
  return apiFetch<OrderSnapshot | null>("/orders/mine/active-order");
}

// A past/present order as it appears in the trip-history list — summary only, no phones (§5d).
export interface OrderHistoryRow {
  id: string;
  role: "customer" | "rider";
  pickup: { point: LatLng; landmark: string };
  dropoff: { point: LatLng; landmark: string };
  itemDesc: string;
  proposedFare: string;
  agreedFare: string | null;
  status: OrderStatus;
  createdAt: string;
  rating: { score: number; comment: string | null } | null;
  counterpartyName: string | null;
}

export function getHistory(): Promise<OrderHistoryRow[]> {
  return apiFetch<OrderHistoryRow[]>("/orders/history");
}

// WD-004: the rider's true lifetime earnings total + trip count, independent of the 50-row history cap.
export interface EarningsSummary {
  total: string;
  count: number;
}

export function getEarningsSummary(): Promise<EarningsSummary> {
  return apiFetch<EarningsSummary>("/orders/earnings/summary");
}

export function advanceStatus(orderId: string, to: AdvanceStatusRequest["to"]): Promise<{ orderId: string; status: OrderStatus }> {
  return apiFetch(`/orders/${orderId}/status`, { method: "POST", body: { to } });
}

export function confirmDelivery(orderId: string, code: string): Promise<{ orderId: string; status: "delivered" }> {
  return apiFetch(`/orders/${orderId}/deliver`, { method: "POST", body: { code } });
}

/**
 * Rider marks a post-pickup hand-off as failed → terminal `undelivered` (R1 / INTERFACE-AUDIT C6).
 * POSTs the reason enum; the server stamps it on the order + frees the rider for the next job, exactly
 * like a clean delivery. Allowed only on `picked_up` / `en_route_dropoff` — a closed order answers 409.
 */
export function markUndelivered(orderId: string, reason: UndeliveredReason): Promise<{ orderId: string; status: "undelivered" }> {
  return apiFetch(`/orders/${orderId}/undelivered`, { method: "POST", body: { reason } });
}

export function rateOrder(orderId: string, body: RateRequest): Promise<{ orderId: string; status: "completed" }> {
  return apiFetch(`/orders/${orderId}/rating`, { method: "POST", body });
}

/**
 * Rider rates the sender after delivery (rider-journey 4·7). Optional and recorded-only — it does NOT
 * change the order status (unlike the customer's rateOrder), so the returned status is whatever the
 * order already is (`delivered`, or `completed` once the customer has rated).
 */
export function rateSender(orderId: string, body: RateSenderRequest): Promise<{ orderId: string; status: OrderStatus }> {
  return apiFetch(`/orders/${orderId}/sender-rating`, { method: "POST", body });
}

export function rotateDeliveryCode(orderId: string): Promise<{ deliveryCode: string }> {
  return apiFetch(`/orders/${orderId}/delivery-code/rotate`, { method: "POST" });
}

export function cancelOrder(
  orderId: string,
  body: CancelRequest = {},
): Promise<{ orderId: string; status: "cancelled"; cancelledBy: "customer" | "rider"; cooldownUntil: string | null }> {
  return apiFetch(`/orders/${orderId}/cancel`, { method: "POST", body });
}

/**
 * Acknowledge the customer's pre-broadcast disclaimer consent at the gate (A1-8) and get the
 * server-authoritative timestamp. Best-effort — the binding record is the order's own
 * `disclaimerVersion`, stamped at create (the broadcast payload carries it), so a reject here must
 * never block the broadcast; the local flag already prevents the gate re-showing.
 */
export function acceptDisclaimer(body: AcceptDisclaimerRequest): Promise<{ policyVersion: string; acceptedAt: string }> {
  return apiFetch(`/orders/disclaimer`, { method: "POST", body });
}

/**
 * 2·b1: register to be pinged when a rider comes online near the pickup — the "notify me" on the
 * no-riders-online auction state. `queued` is false when the server has no waiting-list store (no
 * Redis), so the UI can stay honest rather than promise a ping it can't send.
 */
export function notifyWhenRiderOnline(pickup: LatLng, orderId?: string): Promise<{ queued: boolean }> {
  // KB-NOTIFY-ORDERID: carry the still-open order so the fulfillment push can route the tap to that
  // live auction (and use honest "we're pinging riders on your live request" copy). Additive — omitted
  // when the caller has no order in scope, preserving the prior "route home to re-broadcast" behaviour.
  return apiFetch(`/orders/notify-me`, { method: "POST", body: orderId ? { pickup, orderId } : { pickup } });
}

/**
 * Rider confirms which of the sender's line-items were physically collected at pickup (rider-journey
 * "pickup item verification"). `confirmedIndexes` indexes into the order's `items` array; the server
 * persists them on the order (`itemsCollected`) at `en_route_pickup`, before the advance to picked_up.
 */
export function confirmItems(orderId: string, body: ConfirmItemsRequest): Promise<{ orderId: string; confirmedIndexes: number[] }> {
  return apiFetch(`/orders/${orderId}/items/confirm`, { method: "POST", body });
}

/**
 * Rider attaches the optional proof-of-pickup photo (§5c "Mark collected (+ pickup photo)"). `key`
 * is the object key from requestPickupPhotoUpload (uploads.ts) after the signed PUT. Rider-only,
 * allowed at `en_route_pickup`/`picked_up`, and idempotent — re-attaching replaces (a retake wins).
 * Strictly optional on the client: collecting without a photo stays one tap.
 */
export function attachPickupPhoto(orderId: string, key: string): Promise<{ orderId: string; pickupPhotoKey: string }> {
  return apiFetch(`/orders/${orderId}/pickup-photo`, { method: "POST", body: { key } });
}
