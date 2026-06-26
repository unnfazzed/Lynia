import type { CancelRequest, CreateOrderRequest, OrderStatus, RateRequest } from "@lynia/shared";
import { apiFetch } from "./client";

export interface CreateOrderResult {
  id: string;
  status: OrderStatus;
  proposedFare: string;
  suggestedFare: string;
  distanceKm: number;
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
  rider: { profileId: string; currentLat: number | null; currentLng: number | null; updatedAt: string | null } | null;
  events: OrderEvent[];
  counterpartyPhone: string | null;
}

export function createOrder(body: CreateOrderRequest): Promise<CreateOrderResult> {
  return apiFetch<CreateOrderResult>("/orders", { method: "POST", body });
}

export function getOrder(orderId: string): Promise<OrderSnapshot> {
  return apiFetch<OrderSnapshot>(`/orders/${orderId}`);
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
