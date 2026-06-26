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

export const ApiError = z.object({
  statusCode: z.number(),
  code: z.string(),
  message: z.string(),
});
export type ApiError = z.infer<typeof ApiError>;
