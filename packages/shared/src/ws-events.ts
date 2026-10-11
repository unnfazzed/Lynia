/**
 * Realtime (WebSocket) event names, shared by the API gateway, the mobile client and the merchant web.
 *
 * MJ-RL24 (2026-10-07): a zod-free module of its own. It used to sit in `contracts.ts`, so the merchant
 * web — whose signed-in shell needs only these names — shipped zod and every API schema on every page,
 * /login included. `contracts.ts` re-exports it, so `import { WS_EVENTS } from "@lynia/shared"` is
 * unchanged for every consumer. Keep this file free of imports: plain constants only.
 */

// The names are shared so the socket wire can't drift between ends; the payload schemas stay in
// contracts.ts. Rooms are a server-only concern and live in apps/api/src/tracking/tracking.constants.ts.
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
  /** server→client: the auction window closed with no pick — pushed to ALL bidders on that order
   *  (INTERFACE-AUDIT C2). Distinct from `not_chosen` (someone else was picked). */
  bidExpired: "bid:expired",
  /** server→client: a customer picked a rider — pushed to the board (rider-journey 2·b1 / 3·b1).
   *  Browsers drop the now-taken card; bidders who weren't picked show the "not chosen" state. */
  orderTaken: "order:taken",
  /** server→client: the customer cancelled — pushed to the assigned rider (INTERFACE-AUDIT C3).
   *  Carries whether the parcel was already collected so the rider UI can show the hand-back path. */
  jobCancelled: "job:cancelled",
  /** server→client: the counterparty's socket has been dark past PRESENCE_ESCALATION_MS
   *  (INTERFACE-AUDIT C5) — the receiving app escalates its "live paused" treatment to a warning. */
  presenceStale: "presence:stale",
  /** server→client (BH-08): the counterparty a `presence:stale` was escalated for is back — the
   *  receiving app can clear its "may be offline" warning instead of waiting for the order's next
   *  status change. */
  presenceRecovered: "presence:recovered",
  /** server→client (to the CANCELLED order's room, i.e. the customer): the assigned rider bailed and
   *  the order was auto re-broadcast at the same price as a NEW order (INTERFACE-AUDIT F-01). Carries
   *  the new order id so the customer app moves to the fresh auction instead of a dead "cancelled"
   *  terminal — the customer never restarts the order themselves. */
  orderRebroadcast: "order:rebroadcast",
  /** server→client: a live food-dispatch offer landed for you (C5 "rider offer alarm channel vs
   *  parcel ping"). Food dispatch offers exactly ONE candidate at a time (food-dispatch.service.ts),
   *  so unlike `board:new-order` this is pushed to the single offered rider, not a geo-scoped room —
   *  the mirror of the parcel board's new-order card for the single-candidate flow. */
  foodOffer: "food:offer",
  /** server→client: the recipient's live food-dispatch offer is no longer live — it expired, they
   *  declined it (self-triggered, so mostly a no-op for that client), or the order left dispatch some
   *  other way. Mirrors `bid:expired`/`order:taken` closing the parcel board card; the client clears
   *  or refetches its offer state. */
  foodOfferClosed: "food:offer-closed",
  /** client→server: a merchant's kitchen tablet joins its own queue's live channel (C5 "kitchen
   *  socket queue"). Self-driven and carries no body — mirrors `board:subscribe`'s shape, but the
   *  merchant's own JWT (role="merchant") is enough for the server to resolve which merchantId to
   *  join, so there's nothing for the client to supply. */
  merchantQueueSubscribe: "merchant:queue-subscribe",
  /** server→client: something on the merchant's queue changed (a new order landed, the customer or
   *  kitchen advanced a lifecycle step, dispatch secured/held/lost a rider) — SIGNAL ONLY, mirrors
   *  `offers:changed`; the tablet refetches `GET /merchant/orders`. `orderId` names the order that
   *  triggered the push (informational only — the client still refetches the whole queue). */
  foodQueueChanged: "food:queue-changed",
} as const;
