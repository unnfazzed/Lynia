/**
 * Contracts: realtime (WebSocket) events. Re-exported by ../contracts.ts (the front door).
 */
import { z } from "zod";
import { LatLng } from "./core";

// ── Realtime (WebSocket) events ─────────────────────────────────────────────
// The event names live in a zod-free module (MJ-RL24: the merchant web imports them on every page);
// their payload schemas stay below.
export { WS_EVENTS } from "../ws-events";

/** `order:rebroadcast` payload (F-01) — `orderId` is the cancelled order the customer is watching;
 *  `newOrderId` is the re-broadcast auction to move them to. */
export const OrderRebroadcastEvent = z.object({
  orderId: z.string().uuid(),
  newOrderId: z.string().uuid(),
  at: z.string(),
});
export type OrderRebroadcastEvent = z.infer<typeof OrderRebroadcastEvent>;

/** `offers:changed` payload — signal only; the client refetches `GET /orders/:id/offers`. */
export const OffersChangedEvent = z.object({ orderId: z.string().uuid(), at: z.string() });
export type OffersChangedEvent = z.infer<typeof OffersChangedEvent>;

/** `board:subscribe` payload — the rider's position, so the server scopes the live board to the
 *  rider's geo-cell neighbourhood. lat/lng are OPTIONAL: a loc-less subscribe falls back to the
 *  city-wide board room (mirrors the REST `GET /orders/open` city-wide fallback). */
export const BoardSubscribeEvent = z.object({
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});
export type BoardSubscribeEvent = z.infer<typeof BoardSubscribeEvent>;

/** `rider:location` payload — an assigned rider's GPS fix streamed for an active order (WS_EVENTS.
 *  riderLocation). DS20-02: the SAME bounded lat/lng every REST sibling enforces (riders.controller
 *  SetOnline/Heartbeat, lifecycle.controller AttachDeliveryProof) — the gateway must `.parse()` this
 *  at runtime, not trust the TS annotation, so an out-of-range/NaN fix is never broadcast to the order
 *  room or persisted via recordFix. lat/lng are REQUIRED here (unlike the optional board-subscribe
 *  position): a location beat with no coordinates is meaningless. */
export const RiderLocationEvent = z.object({
  orderId: z.string().uuid(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type RiderLocationEvent = z.infer<typeof RiderLocationEvent>;

/** `subscribe:order` payload — the order a socket wants to watch. `orderId` is a Postgres `@db.Uuid`
 *  column, so the gateway must runtime-validate it (mirroring RiderLocationEvent/BoardSubscribeEvent)
 *  before it reaches Prisma: a non-UUID string otherwise throws an uncaught `22P02` uuid-cast error
 *  instead of a clean rejection, with no ack returned and an ERROR logged per call. */
export const SubscribeOrderEvent = z.object({
  orderId: z.string().uuid(),
});
export type SubscribeOrderEvent = z.infer<typeof SubscribeOrderEvent>;

/** Redacted waypoint a browsing (pre-assignment) rider may see: point + landmark only. `.strict()`
 *  so a stray `contactPhone` is REJECTED, not silently stripped — the board must never carry PII. */
export const PublicWaypoint = z.object({ point: LatLng, landmark: z.string() }).strict();
export type PublicWaypoint = z.infer<typeof PublicWaypoint>;

/** `board:new-order` payload — the redacted open-order row (mirrors the `GET /orders/open` shape).
 *  `expiresAt` exposes the shared auction clock (INTERFACE-AUDIT C2) so a bidder's offer-sent screen
 *  can render a countdown of the same window the customer sees. Optional for back-compat with rows
 *  created before the field existed. */
export const BoardNewOrderEvent = z.object({
  id: z.string().uuid(),
  pickup: PublicWaypoint,
  dropoff: PublicWaypoint,
  itemDesc: z.string(),
  suggestedFare: z.string(),
  proposedFare: z.string(),
  distanceKm: z.number().nullable(),
  createdAt: z.string(),
  expiresAt: z.string().optional(),
});
export type BoardNewOrderEvent = z.infer<typeof BoardNewOrderEvent>;

/** `bid:expired` payload — the auction closed with no pick (INTERFACE-AUDIT C2). */
export const BidExpiredEvent = z.object({ orderId: z.string().uuid(), at: z.string() });
export type BidExpiredEvent = z.infer<typeof BidExpiredEvent>;

/** `order:taken` payload — a customer picked a rider for this order (rider-journey 2·b1 / 3·b1).
 *  Pushed to the board with `emitBidExpired`'s distribution so every rider who saw the card sees it
 *  close: browsers drop the card ("taken first"), bidders show "not chosen" (someone else was picked
 *  — distinct from `bid:expired`, where nobody was). */
export const OrderTakenEvent = z.object({ orderId: z.string().uuid(), at: z.string() });
export type OrderTakenEvent = z.infer<typeof OrderTakenEvent>;

/** `food:offer` payload (C5) — a live food-dispatch offer, REDACTED like `board:new-order` (point +
 *  landmark only, never contactPhone — the rider hasn't accepted yet). Also the response shape of
 *  `GET /merchant/orders/dispatch/offer` (poll fallback / reconnect source of truth for the same
 *  offer this event announces), so REST and WS never drift. `.strict()` enforces the no-PII
 *  guarantee on the wire, mirroring `BoardNewOrderEvent`. */
export const FoodOfferEvent = z
  .object({
    orderId: z.string().uuid(),
    merchantId: z.string().uuid(),
    pickup: PublicWaypoint,
    dropoff: PublicWaypoint,
    itemDesc: z.string(),
    merchantGoodsTotal: z.number().nullable(),
    deliveryFee: z.number().nullable(),
    /** D-71: the part of `deliveryFee` the venue pays (free delivery). The rider still earns all of
     *  `deliveryFee`; the venue's cash (pay first / hand back) is goods less this. Absent = none. */
    merchantDeliveryShare: z.number().nullable().optional(),
    distanceKm: z.number().nullable(),
    expiresAt: z.string(),
    // D5: R-01/R-03/R-10/R-12 — the offer variant (collect-and-return CASH / pay-upfront CASH /
    // WALLET) is decided BEFORE accept, so the rider's offer card can render the right money copy
    // ("YOU EARN $X" vs "THIS KITCHEN ASKS YOU TO PAY FIRST $X") instead of learning it only after
    // committing. Additive — a pre-D5 client (or an offer built before this field existed) reads both
    // as null and falls back to a neutral "confirm at the counter" copy. Inlined (not
    // MerchantPaymentMethod/MerchantCashRule, both declared further down this file) to avoid a
    // module-init temporal-dead-zone reference — same two literal enums either way.
    merchantPaymentMethod: z.enum(["cash", "wallet"]).nullable(),
    merchantCashRule: z.enum(["collect_and_return", "pay_upfront"]).nullable(),
  })
  .strict();
export type FoodOfferEvent = z.infer<typeof FoodOfferEvent>;

/** `GET /merchant/orders/dispatch/offer` response (C5) — wrapped in an object so "no live offer"
 *  round-trips as the well-formed JSON `{ offer: null }`, not an ambiguous empty response body (Nest
 *  sends NO body at all for a bare `null`/`undefined` controller return — `isNil` short-circuits
 *  straight to `response.send()`). */
export const FoodOfferResponse = z
  .object({
    offer: FoodOfferEvent.nullable(),
    // Order flow v2 (ledger D-59, RD1a–d): what the offer card tags — SHOP / PHARMACY, "Scheduled", "Rx".
    // A sibling of `offer`, never a key inside it: `FoodOfferEvent` is the strict `food:offer` socket
    // payload installed rider apps safeParse, so a new key there would make them drop every food offer.
    // Optional; omitted when there is no live offer. Inlined enums for the same TDZ reason as above.
    job: z
      .object({
        businessType: z.enum(["restaurant", "shop"]),
        shopKind: z.enum(["pharmacy", "grocery", "butchery", "fashion", "auto_parts", "hardware", "electronics", "other"]).nullable(),
        /** The customer's slot start (ISO) when the order was scheduled; null for an ASAP order. */
        scheduledFor: z.string().nullable(),
        /** A prescription order: the rider must see the original at the door (RD3). */
        rx: z.boolean(),
        /** BRIEF D3f: an earlier owed balance this order collects at the door on top of the goods and fee
         *  (the order's `previousBalanceUsd`). Absent when there is none. */
        carriedUsd: z.number().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type FoodOfferResponse = z.infer<typeof FoodOfferResponse>;

/** Every live food-dispatch offer ringing the rider, the one running out first first
 *  (`GET /merchant/orders/dispatch/offers`). Several orders can ring one rider at once, and the board
 *  lists each as its own card; the offer screen then reads one by `?orderId=` on `dispatch/offer`. */
export const FoodOffersResponse = z.object({ offers: z.array(FoodOfferEvent) }).strict();
export type FoodOffersResponse = z.infer<typeof FoodOffersResponse>;

/** `food:offer-closed` payload (C5) — the recipient's live food-dispatch offer stopped being live
 *  (expiry, decline, or otherwise). Signal only, mirrors `bid:expired`'s shape. */
export const FoodOfferClosedEvent = z.object({ orderId: z.string().uuid(), at: z.string() });
export type FoodOfferClosedEvent = z.infer<typeof FoodOfferClosedEvent>;

/** `food:queue-changed` payload (C5 kitchen socket queue) — signal only, mirrors `offers:changed`'s
 *  shape: the tablet never trusts the socket for order contents, only that it's time to refetch. */
export const FoodQueueChangedEvent = z.object({ orderId: z.string().uuid(), at: z.string() });
export type FoodQueueChangedEvent = z.infer<typeof FoodQueueChangedEvent>;

/** `job:cancelled` payload — an assigned job was cancelled out from under the rider, either by the
 *  customer (INTERFACE-AUDIT C3) or by ops (admin console). `collected` distinguishes the pre-pickup
 *  path (rider returns to the board) from post-pickup (sender contact shown for the hand-back).
 *  `cancelledBy` lets the rider's terminal name the actual actor instead of always blaming the
 *  customer — a rider's own bail-cancel never reaches this event (it re-broadcasts instead, see
 *  `order:rebroadcast`). No reliability impact on the rider. Optional (not `.default()`, so a new
 *  client can tell it apart from an explicit value) so a new mobile build talking to a not-yet-deployed
 *  API server during a rolling rollout still parses the old (fielded-less) payload instead of dropping
 *  the event outright — the client falls back to the pre-existing "customer" copy in that gap. */
export const JobCancelledEvent = z.object({
  orderId: z.string().uuid(),
  collected: z.boolean(),
  cancelledBy: z.enum(["customer", "admin"]).optional(),
  at: z.string(),
});
export type JobCancelledEvent = z.infer<typeof JobCancelledEvent>;

/** `presence:stale` payload — the counterparty has been dark past PRESENCE_ESCALATION_MS
 *  (INTERFACE-AUDIT C5). `role` is whose presence went stale; `lastSeenAt` is their last fix/beat. */
export const PresenceStaleEvent = z.object({
  orderId: z.string().uuid(),
  role: z.enum(["rider", "customer"]),
  lastSeenAt: z.string().nullable(),
  at: z.string(),
});
export type PresenceStaleEvent = z.infer<typeof PresenceStaleEvent>;

/** `presence:recovered` payload (BH-08) — the counterparty a `presence:stale` was escalated for
 *  reconnected. `role` matches the recovered `presence:stale` this cancels. */
export const PresenceRecoveredEvent = z.object({
  orderId: z.string().uuid(),
  role: z.enum(["rider", "customer"]),
  at: z.string(),
});
export type PresenceRecoveredEvent = z.infer<typeof PresenceRecoveredEvent>;
