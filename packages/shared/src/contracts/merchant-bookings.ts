/**
 * Contracts: merchant bookings (Book a biker) and preferred riders. Re-exported by ../contracts.ts
 * (the front door).
 */
import { z } from "zod";
import { FareUsd, LatLng, OrderItem, Waypoint } from "./core";

/* ── Merchant web upgrade L2: Book a rider (docs/archive/plans/2026-09-29-merchant-web-upgrade-plan.md D9) ──
 * A business books a Send delivery from its own pin. The order's customer of record is the business's
 * booking account (phone `business:<merchantId>`), so every booking is business-wide and the customer
 * app never sees one. These are the merchant-scoped shapes; Send's own contracts are unchanged. */

/** `POST /merchant/bookings`. The pickup is always the business's own pin, landmark and contact phone. */
export const CreateMerchantBookingRequest = z
  .object({
    /** The buyer: where to go, what riders look for there, and the phone the rider calls. */
    dropoff: Waypoint,
    /** What's going (Send's line items). */
    items: z.array(OrderItem).min(1).max(10),
    /** What it's worth — Send's declared value, the liability record. Send's pilot cap applies. */
    declaredValue: z.number().nonnegative().max(150),
    /** The fare the business offers, prefilled from `quoteFare` and editable (Send's model). */
    proposedFare: FareUsd,
    note: z.string().trim().max(280).optional(),
    /** The Send liability disclaimer version the booker accepted on the form. */
    disclaimerVersion: z.string().min(1).max(40),
    /** One per form attempt, so a double tap or a timed-out retry books once. */
    idempotencyKey: z.string().uuid(),
    /** D-48 PR 4b: the rider collects `declaredValue` from the buyer and brings it back to the shop. */
    collectCash: z.boolean().optional(),
  })
  .strict();
export type CreateMerchantBookingRequest = z.infer<typeof CreateMerchantBookingRequest>;

/** `POST /merchant/bookings/:id/try-again` — re-broadcast an expired booking's details, optionally for more. */
export const RetryMerchantBookingRequest = z
  .object({
    proposedFare: FareUsd.optional(),
    idempotencyKey: z.string().uuid(),
  })
  .strict();
export type RetryMerchantBookingRequest = z.infer<typeof RetryMerchantBookingRequest>;

/** `POST /merchant/bookings/:id/cancel` — before pickup only. */
export const CancelMerchantBookingRequest = z.object({ reason: z.string().trim().max(160).optional() }).strict();
export type CancelMerchantBookingRequest = z.infer<typeof CancelMerchantBookingRequest>;

/** `POST /merchant/bookings/resolve-link` — a Google Maps short link the browser can't follow itself. */
export const ResolveMapLinkRequest = z.object({ url: z.string().trim().min(1).max(500) }).strict();
export type ResolveMapLinkRequest = z.infer<typeof ResolveMapLinkRequest>;
export const ResolveMapLinkResponse = z.object({ point: LatLng }).strict();
export type ResolveMapLinkResponse = z.infer<typeof ResolveMapLinkResponse>;

/**
 * The merchant's view of Send's states (design doc L2 "States in the Deliveries list"):
 * finding / finding_again (a rider cancelled; Send re-broadcast it) → coming → picked_up → delivered,
 * or not_delivered, expired ("No rider picked in time") or cancelled.
 */
export const MerchantBookingState = z.enum([
  "finding",
  "finding_again",
  "coming",
  "picked_up",
  "delivered",
  "not_delivered",
  "expired",
  "cancelled",
]);
export type MerchantBookingState = z.infer<typeof MerchantBookingState>;

/** One rider's offer on an open booking. */
export const MerchantBookingOffer = z
  .object({
    id: z.string().uuid(),
    type: z.enum(["accept", "counter"]),
    offeredFare: z.string(),
    etaMinutes: z.number().int(),
    rider: z
      .object({
        name: z.string(),
        photoUrl: z.string().nullable(),
        ratingAvg: z.number().nullable(),
        ratingCount: z.number().int(),
        tripsCount: z.number().int(),
      })
      .strict(),
    /** L3: one of the business's own riders. */
    preferred: z.boolean(),
    /** Someone on the business's team, who can't take its deliveries (409 `own_member` on pick). */
    ownMember: z.boolean(),
  })
  .strict();
export type MerchantBookingOffer = z.infer<typeof MerchantBookingOffer>;

export const MerchantBookingResponse = z
  .object({
    id: z.string().uuid(),
    state: MerchantBookingState,
    /** Send's own status, for support. */
    status: z.string(),
    createdAt: z.string(),
    /** Present only while finding a rider: when the 90-second window closes. */
    expiresAt: z.string().nullable(),
    /** The buyer's end: point, landmark and phone (the business's own buyer). */
    dropoff: Waypoint,
    itemsSummary: z.string(),
    declaredValue: z.string(),
    proposedFare: z.string(),
    agreedFare: z.string().nullable(),
    /** "Booked by Tendai"; null when the booker has left the team and has no name. */
    bookedBy: z.string().nullable(),
    /** Own bikers (D-117): one of the business's own bikers carries it (OB-M13's board and K5). Omitted otherwise. */
    ownBiker: z.literal(true).optional(),
    rider: z
      .object({
        name: z.string(),
        /** Only while Send's reveal window is open (assigned … delivered / undelivered). */
        phone: z.string().nullable(),
        bikeReg: z.string().nullable(),
      })
      .strict()
      .nullable(),
    offerCount: z.number().int(),
    undeliveredReason: z.string().nullable(),
    cancelledBy: z.enum(["business", "rider", "ops"]).nullable(),
    cancelReason: z.string().nullable(),
    /** A rider cancelled and Send re-broadcast this booking as a new one (follow it). */
    rebroadcastedToId: z.string().uuid().nullable(),
    /** This booking is Send's re-broadcast of an earlier one whose rider cancelled. */
    rebroadcastOfId: z.string().uuid().nullable(),
    /** When the delivery code was last issued (a teammate's "Send a new code" replaces it). */
    codeIssuedAt: z.string().nullable(),
    /** Detail only (empty in the list): pending offers while finding a rider. */
    offers: z.array(MerchantBookingOffer),
    /**
     * D-48 PR 4b: cash on delivery, when the booking asked for it. `awaiting_delivery` until the buyer
     * pays at the door; `due` while the rider owes it back (`dueAt` = delivered + 30 min, overdue after);
     * `returned` once the shop said "I got $X"; `closed` for "No cash on this one". Absent on older
     * servers; null when the booking is delivery-only.
     */
    /** Merchant v2 (ledger D-77): when the rider reached the shop; absent until then. */
    riderArrivedAt: z.string().optional(),
    /** Merchant v2 (ledger D-77): the rider's estimated arrival at the next stop; absent while unknown. */
    riderEtaAt: z.string().optional(),
    cashOnDelivery: z
      .object({
        amount: z.string(),
        status: z.enum(["awaiting_delivery", "due", "returned", "closed"]),
        dueAt: z.string().nullable(),
      })
      .strict()
      .nullable()
      .optional(),
    /**
     * Own bikers (D-117, OB-M9–M11): a "My bikers" booking while it rings the business's own bikers. `ringing` =
     * a round is live (`rung` bikers, the search ends at `endsAt`); `none_took` = every round ran out (OB-M10);
     * `none_online` = no Own biker was online to ring (OB-M11). Absent once a biker has it, and on Any biker
     * bookings. Inlined (not a named schema) because it is declared above the Own bikers section.
     */
    fleet: z
      .object({
        state: z.enum(["ringing", "none_took", "none_online"]),
        rung: z.number().int(),
        endsAt: z.string().nullable(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type MerchantBookingResponse = z.infer<typeof MerchantBookingResponse>;

/** `POST /merchant/bookings/:id/offers/:offerId/pick` — the delivery code, shown ONCE (only its hash is kept). */
export const PickMerchantBookingOfferResponse = z
  .object({
    booking: MerchantBookingResponse,
    deliveryCode: z.string(),
  })
  .strict();
export type PickMerchantBookingOfferResponse = z.infer<typeof PickMerchantBookingOfferResponse>;

/** D-48 PR 4b: `POST /merchant/bookings/:id/cash` — the shop closes a booking's cash on delivery: it
 *  counted the cash ("I got $X"), or there's none to come ("No cash on this one"). */
export const CloseMerchantBookingCashRequest = z.object({ outcome: z.enum(["returned", "no_cash"]) }).strict();
export type CloseMerchantBookingCashRequest = z.infer<typeof CloseMerchantBookingCashRequest>;

/** `POST /merchant/bookings/:id/code` — Send's code rotation: a new code replaces the old one. */
export const RotateMerchantBookingCodeResponse = z.object({ deliveryCode: z.string() }).strict();
export type RotateMerchantBookingCodeResponse = z.infer<typeof RotateMerchantBookingCodeResponse>;

/* ── Merchant web upgrade L3: Your riders (docs/designs/merchant-web-upgrade.md "L3") ─────────── */

/** A business keeps up to this many of its own riders. */
export const MERCHANT_PREFERRED_RIDER_CAP = 20;
/** …and adds at most this many a day, so the list can't be used to look numbers up (CEO-8). */
export const MERCHANT_PREFERRED_RIDER_DAILY_ADDS = 10;

/**
 * What a business sees about a number it added: an approved LyniaGo rider, not one (yet), or one who can't
 * take jobs right now (suspended, banned or held). Never why.
 */
export const MerchantRiderStatus = z.enum(["on_lyniago", "not_on_lyniago", "unavailable"]);
export type MerchantRiderStatus = z.infer<typeof MerchantRiderStatus>;

/** One of the business's own riders (`GET /merchant/riders`). Deliberately little about the person. */
export const MerchantPreferredRiderResponse = z
  .object({
    id: z.string().uuid(),
    /** The business's own name for the rider ("Blessing"). */
    label: z.string(),
    phoneMasked: z.string(),
    status: MerchantRiderStatus,
    /** D-48 E4: an `on_lyniago` rider whose app is online right now. Absent on older servers. */
    online: z.boolean().optional(),
    /** The number in international digits while it isn't a LyniaGo rider yet, so the business can send
     *  the rider sign-up link on WhatsApp; null otherwise. */
    invitePhone: z.string().nullable(),
    /** Deliveries this rider completed for this business: its restaurant orders and its bookings. */
    jobs: z.number().int(),
    /** Their average rating from those jobs; null until rated. */
    ratingAvg: z.number().nullable(),
    /** The rider's own LyniaGo name and photo, only once they've done a job for this business. */
    rider: z.object({ name: z.string(), photoUrl: z.string().nullable() }).strict().nullable(),
    addedAt: z.string(),
  })
  .strict();
export type MerchantPreferredRiderResponse = z.infer<typeof MerchantPreferredRiderResponse>;

export const MerchantRidersResponse = z
  .object({
    riders: z.array(MerchantPreferredRiderResponse),
    /** The most a business can keep (`MERCHANT_PREFERRED_RIDER_CAP`). */
    cap: z.number().int(),
  })
  .strict();
export type MerchantRidersResponse = z.infer<typeof MerchantRidersResponse>;

/** `POST /merchant/riders` (owner only): the business's label and the number the rider signs in with. */
export const AddMerchantRiderRequest = z
  .object({
    label: z.string().trim().min(1).max(40),
    phone: z.string().trim().min(6).max(20),
  })
  .strict();
export type AddMerchantRiderRequest = z.infer<typeof AddMerchantRiderRequest>;
