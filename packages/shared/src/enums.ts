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
  /** Terminal: the rider could not complete the hand-off (INTERFACE-AUDIT C6 / F-02). The reason
   *  (`undeliveredReason`) + attempt count are recorded on the order and shown verbatim to the
   *  customer. No return obligation on Lynia; the call-rider action stays available. */
  UNDELIVERED: "undelivered",
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

/** Why a hand-off failed (INTERFACE-AUDIT C6). Persisted on the order + rendered on the customer's
 *  terminal screen. `breakdown` also covers a post-pickup rider mechanical failure (C3). */
export const UndeliveredReason = {
  UNREACHABLE: "unreachable",
  REFUSED: "refused",
  WRONG_ADDRESS: "wrong_address",
  BREAKDOWN: "breakdown",
} as const;
export type UndeliveredReason = (typeof UndeliveredReason)[keyof typeof UndeliveredReason];

/** Which side left a rating (INTERFACE-AUDIT C8 — two-way rating). */
export const RaterRole = {
  CUSTOMER: "customer",
  RIDER: "rider",
} as const;
export type RaterRole = (typeof RaterRole)[keyof typeof RaterRole];

/** Terminal statuses — no further transition. UI renders these as a closed order. */
export const TERMINAL_STATUSES: OrderStatus[] = [
  OrderStatus.COMPLETED,
  OrderStatus.CANCELLED,
  OrderStatus.EXPIRED,
  OrderStatus.UNDELIVERED,
];

/** Statuses during which a rider counts as "on an active ride" (ET2 one_active_ride index). */
export const ACTIVE_RIDE_STATUSES: OrderStatus[] = [
  OrderStatus.ASSIGNED,
  OrderStatus.CONFIRMED,
  OrderStatus.EN_ROUTE_PICKUP,
  OrderStatus.PICKED_UP,
  OrderStatus.EN_ROUTE_DROPOFF,
];

/** Statuses in which the CUSTOMER may cancel. INTERFACE-AUDIT C3: the customer can cancel at ANY
 *  live status (pre- OR post-pickup). Pre-pickup returns the rider to the board; post-pickup pushes
 *  a `job_cancelled` terminal to the rider with the sender contact for the hand-back. No reliability
 *  impact on the rider either way. Server-enforced; clients import this for the cancel affordance. */
export const CUSTOMER_CANCELLABLE_STATUSES: OrderStatus[] = [
  OrderStatus.OPEN_FOR_OFFERS,
  OrderStatus.ASSIGNED,
  OrderStatus.CONFIRMED,
  OrderStatus.EN_ROUTE_PICKUP,
  OrderStatus.PICKED_UP,
  OrderStatus.EN_ROUTE_DROPOFF,
];

/** Statuses in which the RIDER may cancel/bail. INTERFACE-AUDIT C3: allowed only up to arrival at
 *  pickup — BLOCKED from `picked_up` onward (the parcel is on the bike; a post-pickup failure is an
 *  `undelivered(breakdown)`, not a cancel). Triggers auto re-broadcast at the same price + a
 *  reliability decrement. Server-enforced; the rider UI removes the action outside this set. */
export const RIDER_CANCELLABLE_STATUSES: OrderStatus[] = [
  OrderStatus.ASSIGNED,
  OrderStatus.CONFIRMED,
  OrderStatus.EN_ROUTE_PICKUP,
];

/** The single window during which the counterparty's real phone is revealed (CONCEPT §5d).
 *  Includes `undelivered` so the "call the rider" action survives on the customer's terminal
 *  screen for a failed hand-off (INTERFACE-AUDIT C6). */
export const PHONE_REVEAL_STATUSES: OrderStatus[] = [
  ...ACTIVE_RIDE_STATUSES,
  OrderStatus.DELIVERED,
  OrderStatus.COMPLETED,
  OrderStatus.UNDELIVERED,
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

/** Rider account standing, distinct from KYC + reliability (A-04). `suspended` and `banned` are admin
 *  actions (or a settlement auto-pause → `suspended`); `active` is the only status that may go online.
 *  A reliability `on_hold` is a SEPARATE, auto flag (see policy.ts) — a rider can be active-but-on-hold. */
export const RiderAccountStatus = {
  ACTIVE: "active",
  SUSPENDED: "suspended",
  BANNED: "banned",
} as const;
export type RiderAccountStatus = (typeof RiderAccountStatus)[keyof typeof RiderAccountStatus];

/** Canonical KYC decline reasons (A-02). Single source for API validation, the admin reason picker,
 *  and the rider-app decline copy — replaces the api/admin duplicated lists. */
export const KycDeclineReason = {
  ID_EXPIRED: "id_expired",
  ID_UNREADABLE: "id_unreadable",
  FACE_MISMATCH: "face_mismatch",
  LIVENESS_FAILED: "liveness_failed",
  DOC_TAMPERED: "doc_tampered",
  NAME_MISMATCH: "name_mismatch",
  DUPLICATE: "duplicate",
  OTHER: "other",
} as const;
export type KycDeclineReason = (typeof KycDeclineReason)[keyof typeof KycDeclineReason];

/** Human labels for the KYC decline reasons (rider-facing + admin picker). */
export const KYC_DECLINE_REASON_LABELS: Record<KycDeclineReason, string> = {
  id_expired: "ID document expired",
  id_unreadable: "ID photo unreadable",
  face_mismatch: "Selfie doesn't match the ID",
  liveness_failed: "Liveness check failed",
  doc_tampered: "Document looks altered",
  name_mismatch: "Name doesn't match registration",
  duplicate: "Already registered on another account",
  other: "Other (see notes)",
};

/** Weekly cash settlement status (A-06). */
export const SettlementStatus = {
  PENDING: "pending",
  PAID: "paid",
  OVERDUE: "overdue",
} as const;
export type SettlementStatus = (typeof SettlementStatus)[keyof typeof SettlementStatus];
