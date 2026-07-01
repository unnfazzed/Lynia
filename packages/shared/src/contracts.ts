/**
 * API contracts — zod schemas + inferred types shared between the NestJS API and the
 * Expo / Next clients. Validation lives here so the wire shape can't drift between ends.
 */
import { z } from "zod";

export const LatLng = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type LatLng = z.infer<typeof LatLng>;

export const Waypoint = z.object({
  point: LatLng,
  landmark: z.string().min(1).max(160),
  contactPhone: z.string().min(6).max(20),
});
export type Waypoint = z.infer<typeof Waypoint>;

/** Customer creates a delivery and names a price (CONCEPT §1). */
export const CreateOrderRequest = z.object({
  pickup: Waypoint,
  dropoff: Waypoint,
  itemDescription: z.string().min(1).max(280),
  note: z.string().max(280).optional(),
  itemPhotoUrl: z.string().url().optional(),
  declaredValue: z.number().nonnegative().max(150), // pilot cap (CONCEPT §3.5)
  proposedFare: z.number().positive(),
});
export type CreateOrderRequest = z.infer<typeof CreateOrderRequest>;

/** Rider responds once: accept the proposed fare, or counter with their own. */
export const MakeOfferRequest = z.object({
  orderId: z.string().uuid(),
  type: z.enum(["accept", "counter"]),
  offeredFare: z.number().positive(),
  etaMinutes: z.number().int().positive().max(180),
});
export type MakeOfferRequest = z.infer<typeof MakeOfferRequest>;

/** Customer selects one offer; the guarded CAS assigns the order (ET1). */
export const SelectOfferRequest = z.object({
  orderId: z.string().uuid(),
  offerId: z.string().uuid(),
});
export type SelectOfferRequest = z.infer<typeof SelectOfferRequest>;

/** Rider advances the trip one step (the OTP-gated `delivered` step uses ConfirmDeliveryRequest). */
export const AdvanceStatusRequest = z.object({
  to: z.enum(["confirmed", "en_route_pickup", "picked_up", "en_route_dropoff"]),
});
export type AdvanceStatusRequest = z.infer<typeof AdvanceStatusRequest>;

/** Rider confirms the handover with the recipient's 6-digit delivery code → `delivered`. */
export const ConfirmDeliveryRequest = z.object({
  code: z.string().regex(/^\d{6}$/),
});
export type ConfirmDeliveryRequest = z.infer<typeof ConfirmDeliveryRequest>;

/** Customer rates the rider after delivery; this also closes the order (`completed`). */
export const RateRequest = z.object({
  score: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
});
export type RateRequest = z.infer<typeof RateRequest>;

/** Either party cancels an in-flight order. A rider-initiated cancel counts as a no-show strike. */
export const CancelRequest = z.object({
  reason: z.string().max(280).optional(),
});
export type CancelRequest = z.infer<typeof CancelRequest>;

/** Mobile registers (or clears) its device push token so the API can deliver FCM notifications. */
export const RegisterDeviceTokenRequest = z.object({
  token: z.string().min(1).max(4096),
  platform: z.enum(["android", "ios", "web"]).optional(),
});
export type RegisterDeviceTokenRequest = z.infer<typeof RegisterDeviceTokenRequest>;

export const ApiError = z.object({
  statusCode: z.number(),
  code: z.string(),
  message: z.string(),
});
export type ApiError = z.infer<typeof ApiError>;

// ── Realtime (WebSocket) events ─────────────────────────────────────────────
// Event names + payload schemas shared by the API gateway and the mobile client so the socket
// wire shape can't drift between ends (same guarantee this file gives the REST contract). Rooms
// are a server-only concern and live in apps/api/src/tracking/tracking.constants.ts.
export const WS_EVENTS = {
  /** server→client: rider GPS position, to an order room. */
  position: "position",
  /** server→client: an order's status changed. */
  orderStatus: "order:status",
  /** server→client: an order's offer set changed — SIGNAL ONLY (no offer contents); the client
   *  refetches the offer list. Keeps rider PII on the authenticated REST path. */
  offersChanged: "offers:changed",
  /** server→client: a new open order for the rider board — REDACTED (point + landmark, never
   *  contactPhone; mirrors GET /orders/open). */
  boardNewOrder: "board:new-order",
  /** client→server: join an order's room to receive position + status + offers-changed. */
  subscribeOrder: "subscribe:order",
  /** client→server: a verified, online rider joins the open-order board. */
  boardSubscribe: "board:subscribe",
  /** client→server: rider leaves the board (go-offline / unmount). */
  boardLeave: "board:leave",
  /** client→server: rider streams a GPS fix for an active order. */
  riderLocation: "rider:location",
} as const;
export type WsEvent = (typeof WS_EVENTS)[keyof typeof WS_EVENTS];

/** `offers:changed` payload — signal only; the client refetches `GET /orders/:id/offers`. */
export const OffersChangedEvent = z.object({ orderId: z.string().uuid(), at: z.string() });
export type OffersChangedEvent = z.infer<typeof OffersChangedEvent>;

/** Redacted waypoint a browsing (pre-assignment) rider may see: point + landmark only. `.strict()`
 *  so a stray `contactPhone` is REJECTED, not silently stripped — the board must never carry PII. */
export const PublicWaypoint = z.object({ point: LatLng, landmark: z.string() }).strict();
export type PublicWaypoint = z.infer<typeof PublicWaypoint>;

/** `board:new-order` payload — the redacted open-order row (mirrors the `GET /orders/open` shape). */
export const BoardNewOrderEvent = z.object({
  id: z.string().uuid(),
  pickup: PublicWaypoint,
  dropoff: PublicWaypoint,
  itemDesc: z.string(),
  suggestedFare: z.string(),
  proposedFare: z.string(),
  distanceKm: z.number().nullable(),
  createdAt: z.string(),
});
export type BoardNewOrderEvent = z.infer<typeof BoardNewOrderEvent>;
