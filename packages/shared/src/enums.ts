/**
 * Shared domain enums — the single source of truth imported by api, mobile, and admin.
 * Mirrors the Prisma enums in apps/api/prisma/schema.prisma. Keep the two in lockstep.
 */

export const Role = {
  CUSTOMER: "customer",
  RIDER: "rider",
  MERCHANT: "merchant",
  ADMIN: "admin",
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const OrderType = {
  PARCEL: "parcel",
  MERCHANT: "merchant",
} as const;
export type OrderType = (typeof OrderType)[keyof typeof OrderType];

/**
 * Order lifecycle (CONCEPT §5 "Order status flow").
 * requested → open_for_offers → assigned → confirmed → en_route_pickup
 *   → picked_up → en_route_dropoff → delivered → completed
 * plus terminal cancelled / expired.
 */
export const OrderStatus = {
  REQUESTED: "requested",
  OPEN_FOR_OFFERS: "open_for_offers",
  ASSIGNED: "assigned",
  CONFIRMED: "confirmed",
  EN_ROUTE_PICKUP: "en_route_pickup",
  PICKED_UP: "picked_up",
  EN_ROUTE_DROPOFF: "en_route_dropoff",
  DELIVERED: "delivered",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  EXPIRED: "expired",
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

/** Statuses during which a rider counts as "on an active ride" (ET2 one_active_ride index). */
export const ACTIVE_RIDE_STATUSES: OrderStatus[] = [
  OrderStatus.ASSIGNED,
  OrderStatus.CONFIRMED,
  OrderStatus.EN_ROUTE_PICKUP,
  OrderStatus.PICKED_UP,
  OrderStatus.EN_ROUTE_DROPOFF,
];

/** Statuses in which the customer may still cancel (before the parcel is collected). Server-enforced
 *  in the order lifecycle; clients import this for the cancel affordance so the two can't drift. */
export const CUSTOMER_CANCELLABLE_STATUSES: OrderStatus[] = [
  OrderStatus.OPEN_FOR_OFFERS,
  OrderStatus.ASSIGNED,
  OrderStatus.CONFIRMED,
  OrderStatus.EN_ROUTE_PICKUP,
];

/** The single window during which the counterparty's real phone is revealed (CONCEPT §5d). */
export const PHONE_REVEAL_STATUSES: OrderStatus[] = [
  ...ACTIVE_RIDE_STATUSES,
  OrderStatus.DELIVERED,
  OrderStatus.COMPLETED,
];

export const OfferType = {
  ACCEPT: "accept",
  COUNTER: "counter",
} as const;
export type OfferType = (typeof OfferType)[keyof typeof OfferType];

export const OfferStatus = {
  PENDING: "pending",
  SELECTED: "selected",
  DECLINED: "declined",
  EXPIRED: "expired",
} as const;
export type OfferStatus = (typeof OfferStatus)[keyof typeof OfferStatus];

export const KycStatus = {
  PENDING: "pending",
  VERIFIED: "verified",
  FAILED: "failed",
} as const;
export type KycStatus = (typeof KycStatus)[keyof typeof KycStatus];
