import type {
  AcceptDisclaimerRequest,
  AdvanceStatusRequest,
  CancelRequest,
  ConfirmItemsRequest,
  CreateOrderRequest,
  LatLng,
  OrderStatus,
  RateRequest,
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
  agreedFare: string | null;
  proposedFare: string;
  // contactPhone arrives only for the ASSIGNED rider inside the reveal window (§5d) — absent for
  // the customer view and outside the window.
  pickup: { point: LatLng; landmark: string; contactPhone?: string | null };
  dropoff: { point: LatLng; landmark: string; contactPhone?: string | null };
  // Line-items — null/absent on orders created before the items column (clients render nothing).
  items?: { description: string; quantity: number }[] | null;
  rider: { profileId: string; currentLat: number | null; currentLng: number | null; updatedAt: string | null } | null;
  events: OrderEvent[];
  counterpartyPhone: string | null;
  /** ISO end of the offer window while `open_for_offers`, else null — drives the auction countdown. */
  expiresAt: string | null;
  // Set only on the terminal `undelivered` status (INTERFACE-AUDIT C6 / F-02): the reason the rider
  // recorded + how many hand-off attempts were made, shown verbatim on the customer's terminal card.
  // Absent/null on every other status.
  undeliveredReason?: UndeliveredReason | null;
  undeliveredAttempts?: number | null;
}

export function createOrder(body: CreateOrderRequest): Promise<CreateOrderResult> {
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

export function advanceStatus(orderId: string, to: AdvanceStatusRequest["to"]): Promise<{ orderId: string; status: OrderStatus }> {
  return apiFetch(`/orders/${orderId}/status`, { method: "POST", body: { to } });
}

export function confirmDelivery(orderId: string, code: string): Promise<{ orderId: string; status: "delivered" }> {
  return apiFetch(`/orders/${orderId}/deliver`, { method: "POST", body: { code } });
}

export function rateOrder(orderId: string, body: RateRequest): Promise<{ orderId: string; status: "completed" }> {
  return apiFetch(`/orders/${orderId}/rating`, { method: "POST", body });
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
 * Rider confirms which of the sender's line-items were physically collected at pickup (rider-journey
 * "pickup item verification"). `confirmedIndexes` indexes into the order's `items` array; the server
 * persists them on the order (`itemsCollected`) at `en_route_pickup`, before the advance to picked_up.
 */
export function confirmItems(orderId: string, body: ConfirmItemsRequest): Promise<{ orderId: string; confirmedIndexes: number[] }> {
  return apiFetch(`/orders/${orderId}/items/confirm`, { method: "POST", body });
}
