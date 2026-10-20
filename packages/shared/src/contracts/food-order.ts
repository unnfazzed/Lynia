/**
 * Contracts: the food order lifecycle (Restaurants C2). Re-exported by ../contracts.ts (the front door).
 */
import { z } from "zod";
import { UploadObjectKey, Waypoint } from "./core";
import { MerchantLocationInput } from "./merchant";

// ---------------------------------------------------------------------------
// Restaurants vertical — food order lifecycle (C2,
// docs/archive/plans/2026-07-28-restaurants-send-joint-launch-plan.md §5 Lane C). Dormant behind
// RestaurantsEnabledGuard like every other merchant/restaurants route (C1). Pricing config
// (RESTAURANTS_PRICING, N-01/N-15) and timing config (RESTAURANTS_TIMING, N-03/N-18) live in
// ./restaurants-order — the client never computes a total or a deadline, only renders the server's.
// ---------------------------------------------------------------------------

/** Kitchen-side sub-state OrderStatus has no room for (plan §0b.1 locked decision) — mirrors the
 *  Prisma `MerchantPhase` enum. Once `ready_for_pickup`, C3's dispatch takes over exactly like a
 *  parcel (open_for_offers → assigned → ...). */
export const MerchantPhase = z.enum([
  "awaiting_accept",
  "awaiting_item_approval",
  "awaiting_payment",
  "preparing",
  "ready_for_pickup",
]);
export type MerchantPhase = z.infer<typeof MerchantPhase>;

/** The customer's chosen settlement rail (R-01/R-11) — orthogonal to the merchant's own `cashRule`. */
export const MerchantPaymentMethod = z.enum(["cash", "wallet"]);
export type MerchantPaymentMethod = z.infer<typeof MerchantPaymentMethod>;

/** The shop's own pickup point (same Waypoint shape as a parcel's pickup) — required before
 *  `placeOrder` can price a trip (N-01 needs a distance). */
export const UpdateMerchantLocationRequest = z.object({ location: MerchantLocationInput }).strict();
export type UpdateMerchantLocationRequest = z.infer<typeof UpdateMerchantLocationRequest>;

/** Order flow v2 (BRIEF §7/§8): what the customer wants when an item is out of stock. `ask` = the venue
 *  may propose swaps the customer answers; `remove` = missing items are just taken off (the server
 *  refuses swap proposals on such an order). */
export const OutOfStockPref = z.enum(["ask", "remove"]);
export type OutOfStockPref = z.infer<typeof OutOfStockPref>;

export const PlaceMerchantOrderItem = z
  .object({
    dishId: z.string().uuid(),
    quantity: z.number().int().min(1).max(20),
    // D-35: a note on a single dish line — free text, never alters the price.
    note: z.string().trim().max(200).optional(),
  })
  .strict();
export type PlaceMerchantOrderItem = z.infer<typeof PlaceMerchantOrderItem>;

/** Order flow v2 (BRIEF §13, behind `rxEnabled`): the prescription a pharmacy order with "Prescription
 *  needed" items carries. `photoKeys` are keys minted by `POST /uploads/prescription-photo` (1–3 pages);
 *  `consent` is the "I'll show the original prescription to the rider" tick, which must be ticked. */
export const PrescriptionInput = z
  .object({
    photoKeys: z.array(UploadObjectKey).min(1).max(3),
    patientName: z.string().trim().min(1).max(80),
    consent: z.literal(true),
  })
  .strict();
export type PrescriptionInput = z.infer<typeof PrescriptionInput>;

/** `POST /restaurants/:merchantId/orders`. Price is ALWAYS server-computed from the dish price
 *  snapshot + N-01/N-15 config (D-35 "a note can never alter the price") — the client sends the
 *  basket, never a total. The same endpoint takes shop and pharmacy orders (ledger D-59): `merchantId`
 *  is any customer-visible venue, restaurant or shop. */
export const PlaceMerchantOrderRequest = z
  .object({
    items: z.array(PlaceMerchantOrderItem).min(1).max(30),
    // D-35: the whole-order note ("pack the sadza separately from the stew").
    note: z.string().trim().max(300).optional(),
    dropoff: Waypoint,
    paymentMethod: MerchantPaymentMethod,
    idempotencyKey: z.string().uuid().optional(),
    /** Order flow v2 (BRIEF §12): the chosen slot's START (ISO), exactly as `GET .../schedule-slots`
     *  returned it. Omitted = ASAP. A closed venue takes only a scheduled order. */
    scheduledFor: z.string().datetime({ offset: true }).optional(),
    /** Order flow v2 (BRIEF §13): required when any line is "Prescription needed" (and `rxEnabled`). */
    prescription: PrescriptionInput.optional(),
    // Order flow v2 R2 (BRIEF §7): "If something's out of stock" — Ask me (default) / Remove it. Optional
    // and additive: an installed app that never sends it gets "ask".
    outOfStockPref: OutOfStockPref.optional(),
  })
  .strict();
export type PlaceMerchantOrderRequest = z.infer<typeof PlaceMerchantOrderRequest>;

export const MerchantOrderItemView = z
  .object({
    /** The line's own id — what an item edit refers to. Optional so older APIs stay valid. */
    itemId: z.string().uuid().optional(),
    dishId: z.string().uuid().nullable(),
    name: z.string(),
    priceUsd: z.number(),
    quantity: z.number().int(),
    note: z.string().nullable(),
    // D-23: null = merchant hasn't decided yet, true = kept, false = "don't have it".
    available: z.boolean().nullable(),
    /** Order flow v2 (BRIEF §13): a "Prescription needed" line. Sent only when true. */
    rxRequired: z.boolean().optional(),
    /** Order flow v2 (BRIEF §8): set on a line an accepted swap added — the line it replaced (which is
     *  then `available: false`). Omitted on every other line. */
    replacesItemId: z.string().uuid().nullable().optional(),
  })
  .strict();
export type MerchantOrderItemView = z.infer<typeof MerchantOrderItemView>;
