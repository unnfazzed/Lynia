/**
 * API contracts — zod schemas + inferred types shared between the NestJS API and the
 * Expo / Next clients. Validation lives here so the wire shape can't drift between ends.
 */
import { z } from "zod";

/** Offer window length (CONCEPT §9). Wire-relevant: the customer's auction countdown renders from
 *  it (order.expiresAt = createdAt + OFFER_WINDOW_MS), and the API schedules expiry off the same
 *  value — one source so the clock the customer sees and the server enforces can't drift. */
export const OFFER_WINDOW_MS = 90_000;

/** Choose grace after the offer window (after-send v2). When the countdown hits 0, offers already on
 *  the customer's screen stay choosable for this long; NEW offers are refused from the window end.
 *  The API expires an order with pending offers only once the grace has run out (one with none
 *  expires at the window end). `expiresAt` still marks the window end, not the end of the grace. */
export const OFFER_CHOOSE_GRACE_MS = 15_000;

/** Presence escalation window (INTERFACE-AUDIT C5). One shared constant for BOTH sides of a live
 *  trip: after this long with a socket dark, the muted "live paused" treatment escalates to a
 *  warning (customer: "rider offline — call your rider"; rider: reassurance → warning). Rider
 *  position older than this must not be rendered as live on the customer's tracking. */
export const PRESENCE_ESCALATION_MS = 120_000;

/** Delivery-OTP attempt cap (R9). One shared constant: the server enforces the lock at this count,
 *  the client mirrors it to show attempts-remaining and disable the field at the cap — a single
 *  source so the two can't drift apart. */
export const DELIVERY_OTP_MAX_ATTEMPTS = 5;

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

/** One "what are you sending?" line — description + quantity, nothing more for the pilot
 *  (order item-model decision 2026-07-02, recorded in packages/design/HANDOFF.md; size/category/photo stay deferred seams). */
export const OrderItem = z.object({
  description: z.string().min(1).max(140),
  quantity: z.number().int().min(1).max(99),
});
export type OrderItem = z.infer<typeof OrderItem>;

/** Compact one-line rendering of a line-item list — "2× Documents · 1× Phone charger". A single
 *  qty-1 item renders as its bare description, so a legacy `itemDescription` normalized to one row
 *  round-trips into the stored `itemDesc` summary UNCHANGED (back-compat for board/history/admin). */
export function summarizeItems(items: readonly OrderItem[]): string {
  if (items.length === 1 && items[0]!.quantity === 1) return items[0]!.description;
  return items.map((it) => `${it.quantity}× ${it.description}`).join(" · ");
}

/** Customer creates a delivery and names a price (CONCEPT §1).
 *  Item shape is dual for the deployed pilot: NEW clients send `items` (line-items, §5b seam);
 *  OLD clients send only `itemDescription`. Exactly one is required (superRefine); when both
 *  arrive, the server treats `items` as authoritative. */
export const CreateOrderRequest = z
  .object({
    pickup: Waypoint,
    dropoff: Waypoint,
    itemDescription: z.string().min(1).max(280).optional(),
    items: z.array(OrderItem).min(1).max(10).optional(),
    note: z.string().max(280).optional(),
    itemPhotoUrl: z.string().url().optional(),
    declaredValue: z.number().nonnegative().max(150), // pilot cap (CONCEPT §3.5)
    proposedFare: z.number().positive().max(100_000).multipleOf(0.01), // sane cap + 2dp (money is NUMERIC(10,2))
    // Pre-broadcast liability disclaimer consent (A1-8). The version the customer accepted; the
    // server stamps the acceptance time on the order. Optional for back-compat with old clients.
    disclaimerVersion: z.string().min(1).max(40).optional(),
    // Client-generated, one per compose attempt (a fresh uuid each time the customer opens/edits the
    // form — NOT per tap). A client-side timeout+retry or a double-tap on "Broadcast" replays the
    // same key; the server dedupes on (customerId, idempotencyKey) and returns the original order
    // instead of opening a second live auction for the same trip. Optional for back-compat with old
    // clients, who keep the prior no-dedupe behavior.
    idempotencyKey: z.string().uuid().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.items === undefined && v.itemDescription === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["items"],
        message: "Say what you're sending — add at least one item.",
      });
    }
  });
export type CreateOrderRequest = z.infer<typeof CreateOrderRequest>;

/** Rider responds once: accept the proposed fare, or counter with their own. */
export const MakeOfferRequest = z.object({
  orderId: z.string().uuid(),
  type: z.enum(["accept", "counter"]),
  offeredFare: z.number().positive().max(100_000).multipleOf(0.01), // sane cap + 2dp (money is NUMERIC(10,2))
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

/** Rider marks a hand-off as failed → terminal `undelivered` (INTERFACE-AUDIT C6 / F-02). The reason
 *  enum + attempt count are persisted and shown verbatim to the customer. Allowed only post-pickup.
 *
 *  UNDELIVERED-NOTE-01: there is deliberately no free-text `note`. The contract used to accept one
 *  that no client ever sent and the API never stored (the controller passed only `reason`). It's
 *  removed rather than stored, since collecting it would be a new rider-app screen, not a fix. The
 *  object stays non-strict so a stale client that still sends `note` is stripped, never 400'd out of
 *  a terminal hand-off. Evidence for disputes is the proof-of-drop photo + GPS (KB-POD-DISPUTE). */
export const MarkUndeliveredRequest = z.object({
  reason: z.enum(["unreachable", "refused", "wrong_address", "breakdown", "other"]),
});
export type MarkUndeliveredRequest = z.infer<typeof MarkUndeliveredRequest>;

/** Rider ticks off the sender's items at pickup before riding on (rider-journey "pickup item
 *  verification"). Persists which line-items were physically collected; the recipient still verifies
 *  delivery with the 6-digit code. `confirmedIndexes` indexes into the order's `items` array. */
export const ConfirmItemsRequest = z.object({
  confirmedIndexes: z.array(z.number().int().min(0).max(9)).min(1),
});
export type ConfirmItemsRequest = z.infer<typeof ConfirmItemsRequest>;

/** Customer records consent to the pre-broadcast liability disclaimer before an order is created
 *  (customer-journey A1-8). Persisted on the order as {policyVersion, timestamp}. */
export const AcceptDisclaimerRequest = z.object({
  policyVersion: z.string().min(1).max(40),
});
export type AcceptDisclaimerRequest = z.infer<typeof AcceptDisclaimerRequest>;

/** 2·b1 "notify me when a rider's online": the customer registers their pickup point so the server can
 *  ping them the moment a rider comes online nearby (on the no-riders-online auction state). `orderId`
 *  (optional) associates the waiter with the still-open auction that triggered the register, so the
 *  fulfillment push can route the tap to that live request instead of a blank home form (KB-NOTIFY-ORDERID).
 *  Optional + additive: an older client that omits it keeps the prior "route home" behaviour exactly. */
export const NotifyWhenAvailableRequest = z.object({
  pickup: LatLng,
  orderId: z.string().uuid().optional(),
});
export type NotifyWhenAvailableRequest = z.infer<typeof NotifyWhenAvailableRequest>;

/** #672: the delivered/rate feedback chips the food mock draws (RC.delivered_rate). A controlled
 *  vocabulary — new tags are added here, not typed free-form — so the merchant/admin side can count
 *  them. Order matches the mock's chip row. */
export const FoodRatingTag = z.enum(["hot_food", "on_time", "polite", "right_order"]);
export type FoodRatingTag = z.infer<typeof FoodRatingTag>;

/** The parcel delivered/rate feedback chips (the redesigned customer order screen): four positive and
 *  four negative. Same controlled-vocabulary rule as {@link FoodRatingTag}. `on_time` deliberately
 *  shares its wire value with the food set — it means the same thing on both. */
export const ParcelRatingTag = z.enum(["on_time", "careful", "friendly", "communication", "late", "damaged", "rude", "hard_to_reach"]);
export type ParcelRatingTag = z.infer<typeof ParcelRatingTag>;

/** Every rating chip `RateRequest.tags` accepts: the food set plus the parcel set (`on_time` once). One
 *  flat enum rather than a z.union so the wire contract is a pure enum WIDENING of the food-only list
 *  (the contract-snapshot gate reads new enum values as additive; a union would read as a retype). */
export const RatingTag = z.enum([
  ...FoodRatingTag.options,
  ...ParcelRatingTag.exclude(["on_time"]).options,
  // Order flow v2 D1 (O.d.tagsR): the merchant-order rider chips "Careful with food" and "Easy to reach"
  // ("On time" and "Friendly" already exist). A pure enum widening — additive for every installed app.
  "careful_with_food",
  "easy_to_reach",
]);
export type RatingTag = z.infer<typeof RatingTag>;

/** Order flow v2 D1 (O.d.tagsV / tagsVbad): the venue-rating chips — four positive, four negative, in
 *  the order the handoff draws them. Same controlled-vocabulary rule as {@link FoodRatingTag}. */
export const VenueRatingTag = z.enum(["tasty", "hot", "well_packed", "right_order", "cold", "missing_item", "spilled", "wrong_item"]);
export type VenueRatingTag = z.infer<typeof VenueRatingTag>;

/** `POST /restaurants/orders/:orderId/venue-rating` — the customer rates the venue (BRIEF §11's first
 *  rating row), alongside the rider rating (`RateRequest`). Only after delivery; idempotent (the first
 *  rating stands, a repeat returns it). Feeds the venue's star rating (`ratingAvg`/`ratingCount`). */
export const RateVenueRequest = z
  .object({
    score: z.number().int().min(1).max(5),
    tags: z.array(VenueRatingTag).max(8).optional(),
  })
  .strict();
export type RateVenueRequest = z.infer<typeof RateVenueRequest>;

/** The customer's own venue rating, on their merchant-order read (D1b "You rated"). */
export const VenueRatingView = z
  .object({
    score: z.number().int().min(1).max(5),
    tags: z.array(z.string()),
    at: z.string(),
  })
  .strict();
export type VenueRatingView = z.infer<typeof VenueRatingView>;

/** Customer rates the rider after delivery; this also closes the order (`completed`). For a food
 *  order the same call also carries the food score + feedback tags the delivered mock draws (#672);
 *  both are OPTIONAL so the parcel path (single rider score) is unchanged and an old client keeps
 *  working. The rider `score` alone drives rider reputation; `foodScore` feeds the restaurant rating
 *  aggregate (#673). */
export const RateRequest = z.object({
  score: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
  foodScore: z.number().int().min(1).max(5).optional(),
  // Either vocabulary: food chips on a merchant order, parcel chips on a parcel order. Persisted as-is
  // (ratings.tags is text[]); RatingTag keeps both sets controlled without a per-orderType schema.
  tags: z.array(RatingTag).max(8).optional(),
});
export type RateRequest = z.infer<typeof RateRequest>;

/** Rider rates the sender after delivery (rider-journey 4·7). Optional, recorded-only — a no-show or
 *  cash problem here protects other riders; it does NOT change the order status. */
export const RateSenderRequest = z.object({
  score: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
});
export type RateSenderRequest = z.infer<typeof RateSenderRequest>;

/** Customer raises their own fare in place on a still-open auction (POST /orders/:orderId/price). Same
 *  money bounds as CreateOrderRequest.proposedFare; the server also requires it to be strictly higher
 *  than the current fare. The offer window is NOT reset — the countdown keeps running. */
export const RaisePriceRequest = z.object({
  proposedFare: z.number().positive().max(100_000).multipleOf(0.01),
});
export type RaisePriceRequest = z.infer<typeof RaisePriceRequest>;

/** One-tap resend of a finished (expired / cancelled / undelivered) parcel order at a new fare
 *  (POST /orders/:orderId/resend). Re-uses an already-open re-broadcast clone when one exists. */
export const ResendOrderRequest = z.object({
  proposedFare: z.number().positive().max(100_000).multipleOf(0.01),
});
export type ResendOrderRequest = z.infer<typeof ResendOrderRequest>;

/** Either party cancels an in-flight order. A rider-initiated cancel counts as a no-show strike. */
export const CancelRequest = z.object({
  reason: z.string().max(280).optional(),
});
export type CancelRequest = z.infer<typeof CancelRequest>;

/** Either party raises a dispute / help request against an order (A-05, "get help with this trip").
 *  The server derives the opener + role from the auth context; the subject is the order counterparty. */
export const RaiseIssueRequest = z.object({
  orderId: z.string().uuid(),
  type: z.enum(["not_delivered", "wrong_item", "damaged", "payment_dispute", "rider_conduct", "customer_conduct", "other"]),
  description: z.string().min(1).max(1000),
  // BH-22: client-derived from (orderId, type, description), mirroring CreateOrderRequest.idempotencyKey.
  // A lost-response retry resubmits the identical content and hits the same key; the server dedupes on
  // (openedByProfileId, idempotencyKey) and returns the original issue instead of opening a second one.
  // Optional for back-compat with old clients, who keep the prior no-dedupe behavior.
  idempotencyKey: z.string().uuid().optional(),
});
export type RaiseIssueRequest = z.infer<typeof RaiseIssueRequest>;

/** Ops resolves an issue (A-05). `refund` records a refund netted off the rider's settlement (A-06)
 *  and needs `refundAmount`; `rider_strike` adds a strike; `close_no_action` just closes it. */
export const ResolveIssueRequest = z
  .object({
    resolution: z.enum(["refund", "rider_strike", "close_no_action"]),
    note: z.string().max(1000).optional(),
    // Money is stored as Decimal(10,2); constrain to whole cents so a sub-cent value can't be silently
    // rounded into the durable Refund ledger. The per-order upper bound (≤ fare) is enforced server-side.
    refundAmount: z.number().positive().max(1000).multipleOf(0.01).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.resolution === "refund" && v.refundAmount === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["refundAmount"], message: "A refund needs an amount." });
    }
  });
export type ResolveIssueRequest = z.infer<typeof ResolveIssueRequest>;

/** Report the order counterparty after a trip (both roles). Subject is derived from the order. */
export const ReportUserRequest = z.object({
  orderId: z.string().uuid(),
  reason: z.enum(["rude", "unsafe", "fraud", "no_show", "inappropriate", "other"]),
  note: z.string().max(500).optional(),
  /** Also block a future rematch with this counterparty. */
  block: z.boolean().optional(),
});
export type ReportUserRequest = z.infer<typeof ReportUserRequest>;

/** Raise an SOS on a live trip (both roles, R-16/F-13). Location optional (may be denied). */
export const RaiseSosRequest = z.object({
  orderId: z.string().uuid(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});
export type RaiseSosRequest = z.infer<typeof RaiseSosRequest>;

/** Mobile registers (or clears) its device push token so the API can deliver FCM notifications. */
export const RegisterDeviceTokenRequest = z.object({
  token: z.string().min(1).max(4096),
  platform: z.enum(["android", "ios", "web"]).optional(),
});
export type RegisterDeviceTokenRequest = z.infer<typeof RegisterDeviceTokenRequest>;

/**
 * STREAMLINE-01: dismiss one row of the in-app notifications centre (the swipe).
 *
 * The centre is a DERIVED read model — there is no Notification table — so the client cannot send a
 * database id. It sends back the row's stable SYNTHETIC id, exactly as the feed emitted it
 * (`<orderId>:<status>:<iso>`, `offers:<offerId>`, `account:<auditId>`, `sos:<eventId>`, …). The API
 * stores it opaquely and filters that id out of subsequent reads, so no format is parsed or trusted
 * server-side; the bound just stops an unbounded string from being written. Composite ids run to a
 * couple of UUIDs plus an ISO timestamp, so 200 is comfortable headroom over the longest real id.
 */
export const DismissNotificationRequest = z.object({
  id: z.string().min(1).max(200),
});
export type DismissNotificationRequest = z.infer<typeof DismissNotificationRequest>;

/** STREAMLINE-01: how many feed rows the caller has not seen — drives the Account row's "N new" hint. */
export const NotificationsUnreadCountResponse = z.object({
  count: z.number().int().min(0),
});
export type NotificationsUnreadCountResponse = z.infer<typeof NotificationsUnreadCountResponse>;

/** A freshly-verified account has an empty name (verifyOtp creates the profile with firstName ""),
 *  so the app collects it once on the "Tell us who you are" step and PATCHes it here. Both names are
 *  required and length-capped — trimmed, non-empty, and bounded so a name can't grow unbounded text. */
export const UpdateProfileRequest = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  // National ID stored on the account record (customer-journey 0·6) — NOT verified (riders KYC
  // separately). Optional so existing callers and the returning-user path are unaffected; same 4–40
  // bound as the rider KYC id field. Absent/empty leaves the stored value untouched.
  idNumber: z.string().trim().min(4).max(40).optional(),
});
export type UpdateProfileRequest = z.infer<typeof UpdateProfileRequest>;

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
      })
      .strict()
      .optional(),
  })
  .strict();
export type FoodOfferResponse = z.infer<typeof FoodOfferResponse>;

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

// ── Client RUM (glass-to-glass latency) ─────────────────────────────────────
// The app already emits SERVER-side latency SLOs (docs/OBSERVABILITY.md); those miss network RTT +
// client render. This is the client's side of the picture: the mobile app measures perceived latency
// and posts a small batch to `POST /client-metrics`, which records it into the SAME OTEL pipeline as
// `client_*_latency_ms` histograms. TRUST BOUNDARY: unlike the server instruments (labels derived by
// trusted interceptor/gateway code), every value here is client-supplied — so the wire schema is a
// hard allowlist. `event`/`role` are enums (bounded label cardinality — the fixed-vocabulary rule),
// `ms` is clamped to a sane ceiling, and `.strict()` REJECTS any stray field (no ids/phones/lat-lng
// can ride in as a label). The server re-clamps and buckets on ingest; nothing here is trusted as-is.
//
// Clock-skew note: `apifetch` is measured entirely on-client (skew-free). The WS-glass events subtract
// a SERVER-stamped `at` from a client clock, so the client drops out-of-range samples before sending
// and reports the count in `dropped` — skew stays observable instead of poisoning the p95.

/** What a client-side latency sample measures. Bounded enum → safe as a metric label. */
export const ClientMetricEvent = z.enum([
  /** glass-to-glass: rider fix `at` → customer map marker updated. */
  "position_glass",
  /** glass-to-glass: offer `offers:changed` `at` → customer offer list refreshed. */
  "offer_glass",
  /** glass-to-glass: `board:new-order` `createdAt` → rider board row rendered. */
  "board_glass",
  /** client-measured REST round-trip (skew-free: start + end both client `Date.now()`). */
  "apifetch",
  /**
   * Cold start, first half: JS bundle evaluation began → the native splash is released and the first
   * React frame is visible. Covers module evaluation (the whole eager startup graph) plus the font
   * gate. Skew-free — both ends are the client's own monotonic clock, measured from Metro's
   * `__BUNDLE_START_TIME__`. It deliberately EXCLUDES native process start (zygote → JS bundle load),
   * which JS cannot see; a device stopwatch will always read a little higher than this.
   */
  "boot_paint",
  /**
   * Cold start, second half: same origin → the boot route decision resolves and the app leaves the
   * splash for a real screen. `boot_home - boot_paint` is the cost of the device-local boot reads
   * (keychain session/role/onboarding + the cold-start notification), which is the segment the
   * prewarm exists to collapse.
   */
  "boot_home",
  /**
   * Cold start, third mark: same origin → the customer home screen's first PRESENTED frame, as
   * closely as JS can observe it (the client enqueues from a post-interaction callback after home's
   * first commit, not a layout effect — layout effects run before the native frame is on glass and
   * would understate the gap; the Paper architecture exposes no compositor-presentation callback,
   * so this remains a LOWER BOUND on what the customer saw, never an overstatement).
   * `boot_home_paint - boot_home` is the redirect→home segment the RCA found unpainted and
   * unmeasured (docs/CUSTOMER-JOURNEY-LOAD-PERF-2026-08-17.md §1.2). SCOPE CAVEAT: only fires when
   * the boot lands on the customer home — deep-link cold starts (push-tap → order screen) and
   * rider boots never emit it, so read this histogram alongside `boot_home`, not as a universal
   * cold-start number.
   */
  "boot_home_paint",
  /**
   * Tap acknowledgement headroom: `onPressIn` → the next animation frame the JS thread can actually
   * run. NOT "how long until the button lit up" — since the Android press state is now a native
   * ripple painted by the platform on the UI thread, there is no JS press state left to time. What
   * this measures is the thing that made taps feel late in the first place: how backed-up the JS
   * thread was at the instant the touch arrived, i.e. how late a JS-driven response WOULD have been.
   * An idle thread reads ~one frame (≈16 ms); a screen mid-poll, mid-socket-push or mid-clock-tick
   * reads far higher, and that is the signal. Sampled 1-in-N on the client (taps are frequent).
   * See docs/ANDROID-TAP-RESPONSIVENESS-RCA-2026-08-19.md §1.2.
   */
  "tap_ack",
  /**
   * Tap → destination screen on glass: the touch that preceded a route change → the first presented
   * frame of the new route, observed from a post-interaction callback (the same technique and the
   * same LOWER-BOUND caveat as `boot_home_paint` — Paper exposes no compositor-presentation
   * callback). Only emitted when a real touch preceded the navigation, so redirects, deep links and
   * programmatic pushes never enter the histogram. This is the number the route-prewarm registry
   * (src/boot/prewarm-routes.ts) exists to move.
   */
  "nav_open",
]);
export type ClientMetricEvent = z.infer<typeof ClientMetricEvent>;

/** One latency sample. `ms` capped at 60s — anything larger is treated as garbage and dropped. */
export const ClientMetricSample = z
  .object({ event: ClientMetricEvent, ms: z.number().int().min(0).max(60_000) })
  .strict();
export type ClientMetricSample = z.infer<typeof ClientMetricSample>;

/** `POST /client-metrics` body — a bounded, fire-and-forget batch. `.strict()` rejects stray keys so
 *  no unbounded/PII field can become a label. `appVersion` is coerced to a `major.minor` bucket on the
 *  server (or dropped) before it's ever used as an attribute. `dropped` carries the count of skewed
 *  samples the client discarded, so tail distortion is measurable rather than silent. */
export const ClientMetricsBatch = z
  .object({
    role: z.enum(["rider", "customer"]),
    appVersion: z.string().max(24).optional(),
    samples: z.array(ClientMetricSample).min(1).max(20),
    dropped: z.number().int().min(0).max(10_000).optional(),
  })
  .strict();
export type ClientMetricsBatch = z.infer<typeof ClientMetricsBatch>;

// ---------------------------------------------------------------------------
// App version gate (docs/LAUNCH-DEPLOYMENT-STRATEGY.md §1c)
// ---------------------------------------------------------------------------

/** `GET /app/version-gate` — the SERVER-DRIVEN force-update minimum. The build-time gate
 *  (mobile `EXPO_PUBLIC_MIN_APP_VERSION`) can only affect builds that already carry it; this value is
 *  fetched at app start so an already-installed binary can be walked to its store when a breaking
 *  change strands it. "0.0.0" (the server default when MIN_SUPPORTED_APP_VERSION is unset) = gate off.
 *  Same dotted-version dialect as the mobile comparator (`isVersionBelow` in apps/mobile/src/config.ts).
 *  Per platform via the query string: `?platform=ios` answers with MIN_SUPPORTED_APP_VERSION_IOS, and
 *  anything else (including no parameter) with MIN_SUPPORTED_APP_VERSION. The body never varies in
 *  shape: it is strict, so an added key would fail every installed client's parse. */
export const VersionGateResponse = z.object({ minSupportedVersion: z.string().max(24) }).strict();
export type VersionGateResponse = z.infer<typeof VersionGateResponse>;

/** `GET /app/feature-flags` — merchant-vertical kill switches, served publicly (the version-gate
 *  precedent: read at app cold start BEFORE sign-in; a dormant tab must be able to learn it's
 *  dormant). Server truth is the env flags (plan §0b.3); all-false is the launch-inert default.
 *  This is the mobile app's "remote config" for the Restaurants rollout — tabs ship dark in the
 *  binary/OTA and light up when their flag flips. Cohort gating (which pilot merchants/devices)
 *  is a separate, authenticated concern on domain rows — it does NOT belong in this contract. */
export const MerchantFeatureFlagsResponse = z
  .object({
    restaurantsEnabled: z.boolean(),
    merchantDispatchAutoEnabled: z.boolean(),
    merchantWalletEnabled: z.boolean(),
  })
  .strict();
export type MerchantFeatureFlagsResponse = z.infer<typeof MerchantFeatureFlagsResponse>;

/** `GET /app/service-flags` — the Shops and Pharmacy kill switches (browse-v2 README §7,
 *  `SHOPS_ENABLED` / `PHARMACY_ENABLED`). Its own endpoint, not two more keys on
 *  `MerchantFeatureFlagsResponse`: that body is strict, so an added key would fail every installed
 *  client's parse and drop all of their flags to defaults (the rider food board among them). */
export const ServiceFlagsResponse = z.object({ shopsEnabled: z.boolean(), pharmacyEnabled: z.boolean() }).strict();
export type ServiceFlagsResponse = z.infer<typeof ServiceFlagsResponse>;

/** `GET /app/order-flags` — Order flow v2's switches (ledger D-59): `rxEnabled` is the prescription
 *  flag (BRIEF §13, env `RX_ENABLED`, default off). Its own body, not a key on `ServiceFlagsResponse`:
 *  that body is strict and installed apps parse it strictly, so a third key would fail their parse and
 *  drop them to their defaults. Deliberately NOT strict, so a later switch is an additive key here. */
export const OrderFlagsResponse = z.object({ rxEnabled: z.boolean() });
export type OrderFlagsResponse = z.infer<typeof OrderFlagsResponse>;

// ---------------------------------------------------------------------------
// Rider prepaid commission wallet (docs/plans/2026-rider-wallet-design.md)
// ---------------------------------------------------------------------------
// A prepaid float a rider tops up; each completed ride debits `perRideCommission(agreedFare)` from it.
// Ships inert at ratePct 0 (no debits, wallet hidden). Money values on the wire are plain JS numbers
// (the API converts its Decimal columns to numbers before serialising) so `formatMoney` renders them
// directly; every amount is 2dp USD.

/** Payment rail for a top-up. Mobile-money rails push a USSD prompt to the rider's phone; `manual`
 *  is an ops-recorded credit (rider paid Lynia's merchant line off-app) — the launch rail for
 *  InnBucks/O'mari and the fallback for EcoCash. */
export const TopupRail = z.enum(["ecocash", "innbucks", "omari", "manual"]);
export type TopupRail = z.infer<typeof TopupRail>;

/** A single ledger entry type. Credits are positive, debits negative (see WalletEntry.amount).
 *  `reversal` is reserved (no writer in the wallet-core build) — fare-adjusts append an `adjustment`. */
export const WalletEntryType = z.enum(["commission", "topup", "grace", "adjustment", "reversal"]);
export type WalletEntryType = z.infer<typeof WalletEntryType>;

/** A pending/terminal top-up intent. `pending` waits on the rail prompt; the rest are terminal. */
export const TopupStatus = z.enum(["pending", "succeeded", "declined", "expired"]);
export type TopupStatus = z.infer<typeof TopupStatus>;

/** Top-up window: the rail prompt sits on the rider's phone this long before the intent expires. */
export const TOPUP_WINDOW_MS = 90_000;

/**
 * `GET /wallet/config` — the commission rate + policy the whole wallet UI reads (design decision 2A:
 * server-authoritative). `ratePct` is the resolved live rate (the env "flip" value, not the bundled
 * constant) — all client-side money maths read it, never a hardcoded percentage. `floor` = the
 * go-online balance floor; `graceCredit` = the flip starting credit.
 */
export const CommissionConfig = z
  .object({
    ratePct: z.number().min(0).max(100),
    floor: z.number().nonnegative(),
    graceCredit: z.number().nonnegative(),
    minTopUp: z.number().positive(),
    maxTopUp: z.number().positive(),
    /** D-70: commission-free first jobs a new rider gets (Calm Mint v2 R1/R3). Optional — older servers omit it. */
    freeFirstJobs: z.number().int().nonnegative().optional(),
  })
  .strict();
export type CommissionConfig = z.infer<typeof CommissionConfig>;

/** `GET /wallet` — the prepaid balance. `balance` may be negative (a debit that crossed zero is owed,
 *  netted by the next top-up — design Premise 3). `updatedAt` backs the offline "as of…" stale label. */
export const Wallet = z
  .object({
    balance: z.number(),
    currency: z.literal("USD"),
    updatedAt: z.string(),
  })
  .strict();
export type Wallet = z.infer<typeof Wallet>;

/** One rider-visible ledger row — a checkable receipt. A `commission` debit carries the `orderId` it
 *  came from and the `ratePct` + `fare` it was charged at, so a rider can reconcile any deduction
 *  ("−$0.30 · 10% of $3.00 · delivery to Avondale") without contacting support. Credits carry rail + ref. */
export const WalletEntry = z
  .object({
    id: z.string(),
    type: WalletEntryType,
    /** Signed: debit negative, credit positive. */
    amount: z.number(),
    /** Balance immediately after this entry — lets the ledger render a running total. */
    balanceAfter: z.number(),
    title: z.string(),
    meta: z.string(),
    /** The rate a `commission` debit was charged at (design OV-2A: stored per row), else absent. */
    ratePct: z.number().optional(),
    /** The ride's agreed fare a `commission` debit derives from, for the show-the-math receipt. */
    fare: z.number().optional(),
    orderId: z.string().optional(),
    rail: TopupRail.optional(),
    ref: z.string().optional(),
    createdAt: z.string(),
  })
  .strict();
export type WalletEntry = z.infer<typeof WalletEntry>;

/** `GET /wallet/ledger?cursor=` — reverse-chronological page of entries + an opaque next cursor. */
export const WalletLedgerPage = z
  .object({
    entries: z.array(WalletEntry),
    nextCursor: z.string().optional(),
  })
  .strict();
export type WalletLedgerPage = z.infer<typeof WalletLedgerPage>;

/** A top-up intent as returned by the top-up endpoints. `expiresAt` drives the 90s wait ring. */
export const Topup = z
  .object({
    id: z.string(),
    status: TopupStatus,
    amount: z.number(),
    rail: TopupRail,
    phone: z.string(),
    expiresAt: z.string(),
    createdAt: z.string(),
  })
  .strict();
export type Topup = z.infer<typeof Topup>;

/** `POST /wallet/topups` body. Amount is clamped server-side to [minTopUp, maxTopUp]; `rail` is a
 *  self-serve mobile-money rail (never `manual` — that path is the admin console). Phone is the number
 *  the rail prompt is pushed to (pre-filled with the rider's registered line, editable). */
export const CreateTopupRequest = z
  .object({
    amount: z.number().positive().multipleOf(0.01),
    rail: z.enum(["ecocash", "innbucks", "omari"]),
    phone: z.string().min(6).max(20),
    // BH-09: client-generated, one per top-up attempt (mirrors CreateOrderRequest.idempotencyKey). A
    // client-side timeout+retry replays the same key; the server dedupes on (riderId, idempotencyKey)
    // and returns the original pending intent instead of opening a second one for the same attempt.
    // Optional for back-compat with old clients, who keep the prior no-dedupe behavior.
    idempotencyKey: z.string().uuid().optional(),
  })
  .strict();
export type CreateTopupRequest = z.infer<typeof CreateTopupRequest>;

// ---------------------------------------------------------------------------
// Restaurants vertical — merchant domain + menu (C1,
// docs/plans/2026-07-28-restaurants-send-joint-launch-plan.md §5 Lane C)
// ---------------------------------------------------------------------------
// Everything here is dormant until RESTAURANTS_ENABLED=true AND (for the customer read API) the
// merchant's own `pilotEnabled` cohort flag is set — the pre-launch allowlist corridor. Money/pricing
// (delivery fee, min order) is deliberately NOT here yet — that lands with C2's order lifecycle.

/** R-03: the merchant's own cash-handling rule, shown to a rider on the offer before they accept. */
export const MerchantCashRule = z.enum(["collect_and_return", "pay_upfront"]);
export type MerchantCashRule = z.infer<typeof MerchantCashRule>;

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
/** One day's open/close window, "HH:MM" 24h. Both present or the day is treated as closed. */
export const MerchantHoursWindow = z.object({ open: z.string().regex(HHMM), close: z.string().regex(HHMM) }).strict();
export type MerchantHoursWindow = z.infer<typeof MerchantHoursWindow>;
/** Weekly hours keyed by day; an absent day means closed that day. */
export const MerchantHours = z.record(z.enum(DAY_KEYS), MerchantHoursWindow);
export type MerchantHours = z.infer<typeof MerchantHours>;

/** Merchant web upgrade L1 (docs/plans/2026-09-29-merchant-web-upgrade-plan.md): what a business sells,
 *  chosen once at sign-up. There is no endpoint that changes it — a wrong pick is a support fix. */
export const MerchantBusinessType = z.enum(["restaurant", "shop"]);
export type MerchantBusinessType = z.infer<typeof MerchantBusinessType>;

/** A shop's kind: the website's "We deliver for" list plus the owner's examples. */
export const MerchantShopKind = z.enum(["pharmacy", "grocery", "butchery", "fashion", "auto_parts", "hardware", "electronics", "other"]);
export type MerchantShopKind = z.infer<typeof MerchantShopKind>;

/** What a shopkeeper calls each kind — the design doc's words and order (merchant web upgrade L1.4), shared
 *  so the sign-up and the admin console never name a kind two ways. */
export const MERCHANT_SHOP_KIND_LABELS: Readonly<Record<MerchantShopKind, string>> = {
  pharmacy: "Pharmacy",
  grocery: "Grocery",
  butchery: "Butchery",
  fashion: "Clothes & shoes",
  auto_parts: "Car parts",
  hardware: "Hardware",
  electronics: "Phones & electronics",
  other: "Something else",
};

/** Two roles, not a permissions matrix (design doc L4's permission table). */
export const MerchantMemberRole = z.enum(["owner", "staff"]);
export type MerchantMemberRole = z.infer<typeof MerchantMemberRole>;

/** A business's own location as the merchant sends it (merchant mobile redesign, ledger D-48): the point
 *  from GPS or an address search, the address line that search or reverse-geocode gave, and the contact
 *  phone. The landmark is optional — the redesign dropped the field. The API stores a full `Waypoint`
 *  (see `merchantWaypoint`), so every rider-facing read still gets a non-empty landmark. */
export const MerchantLocationInput = z
  .object({
    point: LatLng,
    landmark: z.string().trim().min(1).max(160).optional(),
    address: z.string().trim().min(1).max(200).optional(),
    contactPhone: z.string().min(6).max(20),
  });
export type MerchantLocationInput = z.infer<typeof MerchantLocationInput>;

/** The stored `Waypoint` for a merchant location: the landmark if one was given, else the address line,
 *  else the business's name — never empty, because riders read it at every pickup. */
export function merchantWaypoint(input: MerchantLocationInput, businessName: string): Waypoint {
  const landmark = (input.landmark ?? input.address ?? businessName).trim().slice(0, 160) || businessName.slice(0, 160);
  return { point: input.point, landmark, contactPhone: input.contactPhone };
}

/** `POST /merchant/become` — self-serve sign-up (L1). Creates the Merchant and the caller's OWNER
 *  membership in one transaction; it never touches `profiles.role` (RCA 2026-08-18 C-4). The business
 *  starts dormant — go-live (`pilotEnabled`) is an ops switch, restaurants only. A second call 409s
 *  `{reason:"already_member"}`, which the web treats as success (a lost-response retry). */
export const BecomeMerchantRequest = z
  .object({
    /** The person's own name ("Your name"). Saved to their profile only when it is still empty. */
    ownerName: z.string().trim().min(1).max(60),
    name: z.string().trim().min(1).max(120),
    businessType: MerchantBusinessType,
    /** Refused for a restaurant. Optional for a shop since the mobile redesign (D-48): its "What do you
     *  sell?" asks only restaurant or shop, and a shop without a kind is stored as `other`. */
    shopKind: MerchantShopKind.optional(),
    /** Where the business is: GPS or search, the contact phone, and optionally a landmark (D-48). */
    location: MerchantLocationInput,
    /** The one-tap "I accept the merchant terms and privacy notice" line. */
    termsAccepted: z.literal(true),
    cashRule: MerchantCashRule.optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.businessType === "restaurant" && v.shopKind !== undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["shopKind"], message: "Only a shop has a kind." });
    }
  });
export type BecomeMerchantRequest = z.infer<typeof BecomeMerchantRequest>;

/** D-30 shop-front fields, editable by the merchant against a live customer-view miniature. */
export const UpdateMerchantProfileRequest = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(500).optional(),
    coverPhotoUrl: z.string().min(1).max(256).optional(),
    logoUrl: z.string().min(1).max(256).optional(),
    cuisineTags: z.array(z.string().trim().min(1).max(24)).max(3).optional(),
    priceLevel: z.number().int().min(1).max(3).optional(),
  })
  .strict();
export type UpdateMerchantProfileRequest = z.infer<typeof UpdateMerchantProfileRequest>;

export const UpdateMerchantHoursRequest = z.object({ hours: MerchantHours }).strict();
export type UpdateMerchantHoursRequest = z.infer<typeof UpdateMerchantHoursRequest>;

export const UpdateMerchantCashRuleRequest = z.object({ cashRule: MerchantCashRule }).strict();
export type UpdateMerchantCashRuleRequest = z.infer<typeof UpdateMerchantCashRuleRequest>;

/** N-17: busy mode is a manual on/off the merchant flips from the kitchen board's empty-queue state —
 *  a +10min prep-time bump signal while true. No auto-expiry; the merchant flips it back off. */
export const SetMerchantBusyModeRequest = z.object({ active: z.boolean() }).strict();
export type SetMerchantBusyModeRequest = z.infer<typeof SetMerchantBusyModeRequest>;

/** `PATCH /merchant/order-settings` (owner) and `PATCH /admin/merchants/:id/order-settings` (ops):
 *  how the restaurant takes orders. Both fields optional; at least one must be sent. */
export const UpdateMerchantOrderSettingsRequest = z
  .object({ autoAccept: z.boolean().optional(), showPhoneToCustomers: z.boolean().optional(), freeDelivery: z.boolean().optional() })
  .strict()
  .refine((v) => v.autoAccept !== undefined || v.showPhoneToCustomers !== undefined || v.freeDelivery !== undefined, {
    message: "Nothing to change",
  });
export type UpdateMerchantOrderSettingsRequest = z.infer<typeof UpdateMerchantOrderSettingsRequest>;

/** Change an order's items after placement (agreed with the customer by phone): the new quantity per
 *  line, 0 removes it. Optional new prep time. At least one line must stay. */
export const EditMerchantOrderItemsRequest = z
  .object({
    lines: z
      .array(z.object({ itemId: z.string().uuid(), quantity: z.number().int().min(0).max(99) }).strict())
      .min(1)
      .max(30),
    prepMinutes: z.number().int().min(5).max(120).optional(),
  })
  .strict();
export type EditMerchantOrderItemsRequest = z.infer<typeof EditMerchantOrderItemsRequest>;

/** `POST /merchant/orders/:id/collected` — the rider's no-code pickup at an auto-accept restaurant.
 *  Accepted only within RESTAURANTS_AUTO_ACCEPT.pickupGeofenceM of the restaurant. */
export const ConfirmCollectedRequest = z.object({ point: LatLng }).strict();
export type ConfirmCollectedRequest = z.infer<typeof ConfirmCollectedRequest>;

/** `PATCH /merchant/open` — the Orders header's open/closed switch (merchant mobile B1/B5, D-48).
 *  Closing holds until the next day starts or the merchant opens again; opening clears it. */
export const SetMerchantOpenRequest = z.object({ open: z.boolean() }).strict();
export type SetMerchantOpenRequest = z.infer<typeof SetMerchantOpenRequest>;

/** `GET/PATCH /merchant/me` response — the authenticated merchant's own view of their shop. */
export const MerchantProfileResponse = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    ownerPhoneMasked: z.string(),
    description: z.string().nullable(),
    coverPhotoUrl: z.string().nullable(),
    logoUrl: z.string().nullable(),
    cuisineTags: z.array(z.string()),
    priceLevel: z.number().int().nullable(),
    hours: MerchantHours.nullable(),
    cashRule: MerchantCashRule,
    busy: z.boolean(),
    pilotEnabled: z.boolean(),
    /** L1: what the business sells; drives the web's vocabulary, nav and `/setup` checklist. */
    businessType: MerchantBusinessType,
    shopKind: MerchantShopKind.nullable(),
    /** L1: the CALLER's role on this business (the web hides owner-only sections for staff). */
    myRole: MerchantMemberRole,
    /** L2: the business's pin, landmark and contact phone — every booking's pickup, and the booking
     *  form's map centre and fare quote. Null until the business has a pin; absent from an API older
     *  than L2 (optional, so the change stays additive). */
    location: Waypoint.nullable().optional(),
    /** L4: the CALLER's name on this business's team, for the top bar ("Tendai · Staff"). Absent from an
     *  API older than L4 (optional, so the change stays additive). */
    myName: z.string().optional(),
    /** D-48: closed by hand until this time (ISO); absent or null = open by hours. */
    closedUntil: z.string().nullable().optional(),
    /** Auto-accept: new orders skip the accept window (optional, so older APIs stay valid). */
    autoAccept: z.boolean().optional(),
    /** The restaurant agreed to show its phone number to customers with a live order. */
    showPhoneToCustomers: z.boolean().optional(),
    /** D-71: the venue pays the delivery fee on new cash orders (customers pay $0 delivery). */
    freeDelivery: z.boolean().optional(),
    /** Order flow v2 (BRIEF §13): the CALLER may approve or decline prescriptions. Optional/additive. */
    myIsPharmacist: z.boolean().optional(),
  })
  .strict();
export type MerchantProfileResponse = z.infer<typeof MerchantProfileResponse>;

/** D-29: categories are merchant-created; name + optional time-limited availability window. */
export const MerchantCategoryRequest = z
  .object({
    name: z.string().trim().min(1).max(60),
    availableFrom: z.string().regex(HHMM).optional(),
    availableTo: z.string().regex(HHMM).optional(),
  })
  .strict();
export type MerchantCategoryRequest = z.infer<typeof MerchantCategoryRequest>;

/** PATCH-only fields on an existing category — all optional (mirrors CreateOrderRequest-style partials
 *  elsewhere), plus `hidden`/`sortOrder` which only ever change post-creation. */
export const UpdateMerchantCategoryRequest = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    availableFrom: z.string().regex(HHMM).nullable().optional(),
    availableTo: z.string().regex(HHMM).nullable().optional(),
    hidden: z.boolean().optional(),
    sortOrder: z.number().int().min(0).optional(),
  })
  .strict();
export type UpdateMerchantCategoryRequest = z.infer<typeof UpdateMerchantCategoryRequest>;

export const MerchantCategoryResponse = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    sortOrder: z.number().int(),
    availableFrom: z.string().nullable(),
    availableTo: z.string().nullable(),
    hidden: z.boolean(),
    dishCount: z.number().int(),
  })
  .strict();
export type MerchantCategoryResponse = z.infer<typeof MerchantCategoryResponse>;

/** D-31: a dish saved with no `photoUrl` persists as a draft (server sets `isDraft`, never the
 *  client) — visible to the kitchen, excluded from the customer read API until a photo lands. */
export const MerchantDishRequest = z
  .object({
    categoryId: z.string().uuid(),
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(300).optional(),
    priceUsd: z.number().positive().multipleOf(0.01).max(1000),
    photoUrl: z.string().min(1).max(256).optional(),
    /** Order flow v2 (BRIEF §13): "Prescription needed". Pharmacies only; default false. */
    rxRequired: z.boolean().optional(),
  })
  .strict();
export type MerchantDishRequest = z.infer<typeof MerchantDishRequest>;

export const UpdateMerchantDishRequest = z
  .object({
    categoryId: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(80).optional(),
    description: z.string().trim().max(300).nullable().optional(),
    priceUsd: z.number().positive().multipleOf(0.01).max(1000).optional(),
    photoUrl: z.string().min(1).max(256).optional(),
    sortOrder: z.number().int().min(0).optional(),
    /** Order flow v2 (BRIEF §13): "Prescription needed". Pharmacies only. */
    rxRequired: z.boolean().optional(),
  })
  .strict();
export type UpdateMerchantDishRequest = z.infer<typeof UpdateMerchantDishRequest>;

/** How long a dish stays out of stock (`RM.oos_sheet`, merchant web upgrade L5): until the kitchen turns it
 *  back on, the rest of today (the default, N-14's always-safe choice) or one hour. */
export const DishOutOfStockFor = z.enum(["until_back", "rest_of_today", "one_hour"]);
export type DishOutOfStockFor = z.infer<typeof DishOutOfStockFor>;

/** `POST /merchant/dishes/:id/out-of-stock`. The body is optional: none means the rest of today. */
export const SetDishOutOfStockRequest = z.object({ for: DishOutOfStockFor.optional() }).strict();
export type SetDishOutOfStockRequest = z.infer<typeof SetDishOutOfStockRequest>;

export const MerchantDishResponse = z
  .object({
    id: z.string().uuid(),
    categoryId: z.string().uuid(),
    name: z.string(),
    description: z.string().nullable(),
    priceUsd: z.number(),
    photoUrl: z.string().nullable(),
    isDraft: z.boolean(),
    outOfStock: z.boolean(),
    /** D-48 C1: when an off dish comes back on its own (ISO). Absent on older servers; null when on.
     *  Year 9999 means "until I turn it back on". */
    outOfStockUntil: z.string().nullable().optional(),
    sortOrder: z.number().int(),
    /** Order flow v2 (BRIEF §13): "Prescription needed". Absent on older servers. */
    rxRequired: z.boolean().optional(),
  })
  .strict();
export type MerchantDishResponse = z.infer<typeof MerchantDishResponse>;

// --- Customer read API (flag + per-merchant pilotEnabled allowlist gated) ---

export const RestaurantListItem = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    coverPhotoUrl: z.string().nullable(),
    logoUrl: z.string().nullable(),
    cuisineTags: z.array(z.string()),
    priceLevel: z.number().int().nullable(),
    // D1 (browse): open/closed + "closing soon"/"opens at" are derived client-side from this via
    // ./restaurant-hours — the server sends the raw weekly hours only, never a stale precomputed
    // boolean. Additive on the customer read API (C1 shipped this response without it).
    hours: MerchantHours.nullable(),
    // D2 (checkout): the geo-point ONLY, never the full Merchant.location Waypoint — that object's
    // `landmark`/`contactPhone` are the shop's own address label + raw contact number, and D-17
    // ("merchant phone numbers are masked everywhere") forbids shipping the latter to a customer
    // client. This lets checkout compute an honest delivery-fee ESTIMATE the same way the server
    // will (haversineKm + deliveryFeeForDistance, ./restaurants-order + ./pricing) before placing
    // the order — null until the merchant has set a location (placeOrder itself requires one).
    location: LatLng.nullable(),
    // #673 discovery: the restaurant's star rating, a denormalised aggregate of customers' food
    // scores (Rating.foodScore, #672). `ratingAvg` is null until `ratingCount > 0` — the card shows
    // no star rather than an invented "0" or "new" for an unrated shop (not-drawn ⇒ not-rendered).
    ratingAvg: z.number().nullable(),
    ratingCount: z.number().int(),
    // #673 discovery: the merchant's typical kitchen prep time (minutes). The card's ETA is this +
    // a delivery-leg estimate the client computes from `location` (same haversine path as the fee
    // above). Null until the merchant sets it → the client falls back to a default prep. All three
    // fields are additive (C1 shipped this response without them; an old client ignores them).
    prepBaselineMinutes: z.number().int().nullable(),
    // D-71: the venue pays the delivery fee (handoffs calm-mint-v2 §5, browse-v2 §7 — "Free delivery"
    // only when the venue funds it). Optional/additive: absent on an older server = not free.
    freeDelivery: z.boolean().optional(),
  })
  .strict();
export type RestaurantListItem = z.infer<typeof RestaurantListItem>;

// B-O10: `nextCursor` is additive (omitted = no more pages) — the same opaque-cursor shape as
// `WalletLedgerPage`, so an already-deployed client reading only `.restaurants` keeps working
// unchanged against a server that starts paginating.
export const RestaurantListResponse = z
  .object({ restaurants: z.array(RestaurantListItem), nextCursor: z.string().optional() })
  .strict();
export type RestaurantListResponse = z.infer<typeof RestaurantListResponse>;

/** #673: a search hit on a specific dish, across all pilot restaurants — the mock's cross-restaurant
 *  "DISHES" section under search (r-customer-a.jsx). Carries the dish's restaurant id + name so the
 *  row renders "Dish · Restaurant · $price" and can deep-link to that restaurant's menu. */
export const RestaurantSearchDish = z
  .object({
    dishId: z.string().uuid(),
    name: z.string(),
    priceUsd: z.number(),
    photoUrl: z.string().nullable(),
    merchantId: z.string().uuid(),
    merchantName: z.string(),
  })
  .strict();
export type RestaurantSearchDish = z.infer<typeof RestaurantSearchDish>;

/** #673: cross-restaurant search result — matching PLACES (restaurants) + DISHES (menu items across
 *  the pilot corridor). Both arrays are empty for a blank / too-short query (the search screen only
 *  shows results once the customer types). This is the server dish index the client search screen
 *  noted it was missing (it could only filter the already-loaded restaurant list before). */
export const RestaurantSearchResponse = z
  .object({ restaurants: z.array(RestaurantListItem), dishes: z.array(RestaurantSearchDish) })
  .strict();
export type RestaurantSearchResponse = z.infer<typeof RestaurantSearchResponse>;

/** Browse v2 X1 (ledger D-57): "Popular near you" — the most-ordered dish names, most popular first. */
export const SearchPopularResponse = z.object({ terms: z.array(z.string()) }).strict();
export type SearchPopularResponse = z.infer<typeof SearchPopularResponse>;

/** Ledger D-72: one venue's place in the "Popular" ranking — its delivered orders over the window and
 *  their time-decayed weight (a fresh order counts 1, one a half-life old counts 0.5). */
export const PopularVenueRank = z.object({ id: z.string().uuid(), orders: z.number().int().nonnegative(), score: z.number().nonnegative() }).strict();
export type PopularVenueRank = z.infer<typeof PopularVenueRank>;

/** Ledger D-72: `GET /restaurants/popular` and `GET /shops/popular` — the live venues of that list ranked
 *  by recent delivered orders, most popular first. EMPTY while the corridor's order history is too thin
 *  to rank (cold start): the client then keeps its nearest-open order. Open-now and "delivers to you"
 *  are applied on the phone, which already owns the clock and the customer's location. */
export const PopularVenuesResponse = z.object({ venues: z.array(PopularVenueRank) }).strict();
export type PopularVenuesResponse = z.infer<typeof PopularVenuesResponse>;

/** A single customer-facing menu item. `outOfStock` is derived server-side from `outOfStockUntil`
 *  (N-14 daily auto-reset — a past timestamp reads as back in stock, no reset job needed). Draft
 *  (photoless) dishes never appear here at all (D-31). */
export const RestaurantMenuDish = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    description: z.string().nullable(),
    priceUsd: z.number(),
    photoUrl: z.string().nullable(),
    outOfStock: z.boolean(),
    /** Order flow v2 (BRIEF §13): sent (true) only on a pharmacy item that needs a prescription, and only
     *  while RX_ENABLED is on — with it off such items are not listed at all. Absent = no. */
    rxRequired: z.boolean().optional(),
  })
  .strict();
export type RestaurantMenuDish = z.infer<typeof RestaurantMenuDish>;

export const RestaurantMenuCategory = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    dishes: z.array(RestaurantMenuDish),
    // Browse v2 (D-57): a category's time window ("Breakfast 07:00–11:00", D-29), "HH:MM" or null =
    // always served. Additive and optional: an installed client ignores it, and a server that predates
    // it simply omits it.
    availableFrom: z.string().nullable().optional(),
    availableTo: z.string().nullable().optional(),
  })
  .strict();
export type RestaurantMenuCategory = z.infer<typeof RestaurantMenuCategory>;

export const RestaurantMenuResponse = z
  .object({
    restaurant: RestaurantListItem,
    categories: z.array(RestaurantMenuCategory),
    // Browse v2 (D-57): the storefront's "Popular" rail — this kitchen's most-ordered dishes over the
    // last 30 days, most-ordered first. Ids only (each one is also in `categories`). Empty when the
    // kitchen has too little history to rank honestly. Additive and optional.
    popularDishIds: z.array(z.string().uuid()).optional(),
  })
  .strict();
export type RestaurantMenuResponse = z.infer<typeof RestaurantMenuResponse>;

// --- Customer Shops & Pharmacy read API (browse-v2 B2–B4, S3–S4; ledger D-58) ---
// A shop is the same row as a restaurant with `businessType = shop` (plan 2026-09-29 D1), so the
// customer shapes reuse the restaurant ones and add the kind. Pharmacy is the `pharmacy` kind, listed
// on its own; Shops is every other kind. Gated by SHOPS_ENABLED / PHARMACY_ENABLED + `pilotEnabled`.

/** Which customer section a shop belongs to. */
export const ShopService = z.enum(["shops", "pharmacy"]);
export type ShopService = z.infer<typeof ShopService>;

export const ShopListItem = RestaurantListItem.extend({ shopKind: MerchantShopKind }).strict();
export type ShopListItem = z.infer<typeof ShopListItem>;

export const ShopListResponse = z.object({ shops: z.array(ShopListItem), nextCursor: z.string().optional() }).strict();
export type ShopListResponse = z.infer<typeof ShopListResponse>;

/** A shop's catalogue: categories → items, drafts and hidden categories already removed. */
export const ShopCatalogueResponse = z.object({ shop: ShopListItem, categories: z.array(RestaurantMenuCategory) }).strict();
export type ShopCatalogueResponse = z.infer<typeof ShopCatalogueResponse>;

/** Search inside one section: PLACES (shop names) + ITEMS (catalogue items across its shops). */
export const ShopSearchResponse = z.object({ shops: z.array(ShopListItem), items: z.array(RestaurantSearchDish) }).strict();
export type ShopSearchResponse = z.infer<typeof ShopSearchResponse>;

/**
 * D1 `menu_closed` / `list_empty` — "Remind me when they open". `set` is whether the customer is
 * currently waiting on this kitchen. `alreadyOpen` only comes back from the POST: the kitchen was open
 * when they asked, so no reminder was banked and the honest answer is "go ahead and order" rather
 * than silently arming something that would next fire tomorrow morning.
 */
export const RestaurantReopenReminderResponse = z
  .object({
    set: z.boolean(),
    alreadyOpen: z.boolean().optional(),
  })
  .strict();
export type RestaurantReopenReminderResponse = z.infer<typeof RestaurantReopenReminderResponse>;

// ---------------------------------------------------------------------------
// Restaurants vertical — food order lifecycle (C2,
// docs/plans/2026-07-28-restaurants-send-joint-launch-plan.md §5 Lane C). Dormant behind
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
    photoKeys: z.array(z.string().min(1).max(256)).min(1).max(3),
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

// ── Order flow v2 (packages/design/handoff/order-flow-v2, ledger D-59) — wire shapes ─────────────

/** BRIEF §8: what the venue proposes for one line. `remove` and `reduce` (a quantity drop) apply at once
 *  and are announced; `swap` (another item from the same venue's catalogue) needs the customer's yes. */
export const SubstitutionAction = z.enum(["remove", "swap", "reduce"]);
export type SubstitutionAction = z.infer<typeof SubstitutionAction>;

export const SubstitutionProposalLine = z.discriminatedUnion("action", [
  z.object({ action: z.literal("remove"), itemId: z.string().uuid() }).strict(),
  z
    .object({
      action: z.literal("swap"),
      itemId: z.string().uuid(),
      /** The replacement, from the venue's own catalogue (a `MerchantDish` id). Priced server-side. */
      dishId: z.string().uuid(),
      /** Defaults to the line's quantity. */
      quantity: z.number().int().min(1).max(20).optional(),
    })
    .strict(),
  z.object({ action: z.literal("reduce"), itemId: z.string().uuid(), quantity: z.number().int().min(1).max(98) }).strict(),
]);
export type SubstitutionProposalLine = z.infer<typeof SubstitutionProposalLine>;

/** `POST /merchant/orders/:orderId/substitution` — U1a (at accept, from the ringing sheet) and U4a (mid-
 *  prep "Change items"). At accept on a manual-accept venue (`merchantPhase: awaiting_accept`) this IS the
 *  accept, so `prepMinutes` is required there and ignored otherwise. One open round per order. */
export const ProposeSubstitutionRequest = z
  .object({
    lines: z.array(SubstitutionProposalLine).min(1).max(30),
    prepMinutes: z.union([z.literal(10), z.literal(15), z.literal(20), z.literal(30), z.literal(45)]).optional(),
  })
  .strict();
export type ProposeSubstitutionRequest = z.infer<typeof ProposeSubstitutionRequest>;

/** `POST /restaurants/orders/:orderId/substitution/confirm` — U2 "Confirm changes": the customer's answer
 *  for EVERY swap line of the open round (`accept: true` = Accept swap, false = Remove it). */
export const ConfirmSubstitutionRequest = z
  .object({
    roundId: z.string().uuid(),
    answers: z.array(z.object({ lineId: z.string().uuid(), accept: z.boolean() }).strict()).min(1).max(30),
  })
  .strict();
export type ConfirmSubstitutionRequest = z.infer<typeof ConfirmSubstitutionRequest>;

/** A round's state. `open` = waiting for the customer; `confirmed` = answered; `timed_out` = no answer
 *  in time (swaps declined); `applied` = removals/quantity drops only, nothing to answer (U4b);
 *  `cancelled` = the order was cancelled while it was open. */
export const SubstitutionRoundStatus = z.enum(["open", "confirmed", "timed_out", "applied", "cancelled"]);
export type SubstitutionRoundStatus = z.infer<typeof SubstitutionRoundStatus>;

export const SubstitutionLineView = z
  .object({
    id: z.string().uuid(),
    /** The order line this proposal is about (`MerchantOrderItemView.itemId`). */
    itemId: z.string().uuid(),
    action: SubstitutionAction,
    /** The original line, as ordered: "Out of {name} · ~~$price~~". */
    name: z.string(),
    priceUsd: z.number(),
    quantity: z.number().int(),
    /** `reduce`: the new quantity. */
    newQuantity: z.number().int().nullable(),
    /** `swap`: the replacement and its unit price; `quantity` of it replaces the line. */
    swapDishId: z.string().uuid().nullable(),
    swapName: z.string().nullable(),
    swapPriceUsd: z.number().nullable(),
    swapQuantity: z.number().int().nullable(),
    swapPhotoUrl: z.string().nullable(),
    /** `swap` only: null until answered; `accept` = Swap accepted, `remove` = declined/removed. */
    answer: z.enum(["accept", "remove"]).nullable(),
  })
  .strict();
export type SubstitutionLineView = z.infer<typeof SubstitutionLineView>;

/** The order's latest substitution round (open, or the last one resolved, for M2's "Rudo accepted" and
 *  U3's timeout line). Totals: `wasTotal` before the round; while open, `keptSubtotal` + the shared
 *  `substitutionTotals()` give the live "New total" for any set of answers. */
export const SubstitutionRoundView = z
  .object({
    id: z.string().uuid(),
    /** `at_accept` (the ringing sheet, before cooking) or `mid_prep` ("Change items"). */
    kind: z.enum(["at_accept", "mid_prep"]),
    status: SubstitutionRoundStatus,
    createdAt: z.string(),
    deadlineAt: z.string().nullable(),
    resolvedAt: z.string().nullable(),
    lines: z.array(SubstitutionLineView),
    wasTotal: z.number(),
    keptSubtotal: z.number(),
  })
  .strict();
export type SubstitutionRoundView = z.infer<typeof SubstitutionRoundView>;

/** BRIEF §4: the merchant order's four-step track (`deriveMerchantOrderTrack` in ./restaurants-order). */
export const MerchantOrderTrackView = z
  .object({
    step: z.enum(["confirmed", "making", "on_the_way", "delivered"]),
    index: z.number().int().min(0).max(3),
    rxChecked: z.boolean(),
  })
  .strict();
export type MerchantOrderTrackView = z.infer<typeof MerchantOrderTrackView>;

/** BRIEF §9 pickup proof: the rider's photo of the bag at the counter + the "Bag is sealed" tick. */
export const MerchantPickupProofView = z
  .object({
    /** Short-lived signed read URL; null when no photo was taken (or on a storage blip). */
    photoUrl: z.string().nullable(),
    takenAt: z.string().nullable(),
    bagSealed: z.boolean(),
  })
  .strict();
export type MerchantPickupProofView = z.infer<typeof MerchantPickupProofView>;

/** RD4c (O.rd.why): why the rider couldn't use the delivery code. */
export const DoorProofReason = z.enum(["customer_unreachable", "handed_to_someone_else", "left_at_gate"]);
export type DoorProofReason = z.infer<typeof DoorProofReason>;

/** BRIEF §9 door proof (P5, M5b): the photo the rider took because the code couldn't be used. */
export const MerchantDoorProofView = z
  .object({
    photoUrl: z.string().nullable(),
    takenAt: z.string().nullable(),
    reason: DoorProofReason.nullable(),
    /** RD4c "Who did you hand it to?" — e.g. "Chipo". */
    handedTo: z.string().nullable(),
  })
  .strict();
export type MerchantDoorProofView = z.infer<typeof MerchantDoorProofView>;

/** `POST /merchant/orders/:orderId/pickup-proof` (the assigned rider, RD2b): the photo key from
 *  `POST /uploads/pickup-photo` and/or the "Bag is sealed" tick. Required for shops and pharmacies before
 *  pickup completes, optional for restaurants. */
export const AttachMerchantPickupProofRequest = z
  .object({
    key: z.string().min(1).max(256).optional(),
    bagSealed: z.boolean().optional(),
  })
  .strict()
  .refine((b) => b.key !== undefined || b.bagSealed !== undefined, { message: "Send a photo key or the bag-sealed tick" });
export type AttachMerchantPickupProofRequest = z.infer<typeof AttachMerchantPickupProofRequest>;

/** `POST /merchant/orders/:orderId/door-proof` (the assigned rider, RD4c/RD4d): the photo key from
 *  `POST /uploads/delivery-proof`, why the code couldn't be used, and who it was handed to. */
export const AttachMerchantDoorProofRequest = z
  .object({
    key: z.string().min(1).max(256),
    reason: DoorProofReason,
    handedTo: z.string().trim().min(1).max(60).optional(),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
  })
  .strict();
export type AttachMerchantDoorProofRequest = z.infer<typeof AttachMerchantDoorProofRequest>;

/** The venue block on a merchant order (D1 receipt "From", the header's venue name, per-service copy). */
export const MerchantOrderVenueView = z
  .object({
    name: z.string(),
    businessType: z.enum(["restaurant", "shop"]),
    shopKind: z.string().nullable(),
  })
  .strict();
export type MerchantOrderVenueView = z.infer<typeof MerchantOrderVenueView>;

/** WS `order:status` payload. `merchantPhase` and `track` are added (optional) on merchant orders, so a
 *  phone can move the track without waiting for the refetch the event also triggers. */
export const OrderStatusEvent = z.object({
  orderId: z.string().uuid(),
  status: z.string(),
  at: z.string(),
  merchantPhase: z.string().nullable().optional(),
  track: MerchantOrderTrackView.nullable().optional(),
});
export type OrderStatusEvent = z.infer<typeof OrderStatusEvent>;

/** C4: the collect-and-return merchant-debt ledger's derived state (R-01/R-06/N-20/N-21). Null on
 *  any order the debt model doesn't apply to (parcels, WALLET food orders, pay_upfront kitchens). */
export const MerchantDebtStatus = z.enum(["open", "settled_cash", "settled_goods", "written_off"]);
export type MerchantDebtStatus = z.infer<typeof MerchantDebtStatus>;

/** #670 payment-prompt push flow: the customer's chosen mobile-money rail for a pushed payment
 *  prompt. `manual` is deliberately excluded — that's the separate reference-entry path, not a
 *  pushed prompt. */
export const PaymentPromptRail = z.enum(["ecocash", "innbucks", "omari"]);
export type PaymentPromptRail = z.infer<typeof PaymentPromptRail>;

/** #670: the order's payment-prompt lifecycle — pending (prompt on the customer's phone) → confirmed
 *  (the rail moved the money) / declined / expired. Mirrors TopUpStatus; null on the order means no
 *  prompt was ever sent (the manual-reference path, or pre-#670 orders). */
export const PaymentPromptStatus = z.enum(["pending", "confirmed", "declined", "expired"]);
export type PaymentPromptStatus = z.infer<typeof PaymentPromptStatus>;

/** #670: customer asks us to push a mobile-money prompt to their phone for this order (RC.pay_now's
 *  "Send payment prompt"). */
export const SendPaymentPromptRequest = z.object({ rail: PaymentPromptRail });
export type SendPaymentPromptRequest = z.infer<typeof SendPaymentPromptRequest>;

/** #671: the assigned rider's public identity, surfaced on a food order so the map-anchored live
 *  tracker can draw the "rider secured" card (RC.track_secured: name · plate · vehicle · rating ·
 *  KYC). Populated ONLY once a rider is assigned (`riderId != null`), else the whole block is
 *  omitted. Unlike the parcel path — which caches the chosen offer's rider identity on-device — a
 *  food rider is auto-dispatched with no offer-selection moment, so identity must come from the
 *  order read itself. `ratingAvg` is the Prisma Float sent as a raw JSON number (like the offer
 *  path's `rider.ratingAvg`), not the Decimal-as-string the fare fields use. Public profile data
 *  only (name/photo/rating/vehicle/plate) — no contact PII; the phone stays on the masked
 *  `counterpartyPhone` reveal path. */
export const FoodOrderRiderIdentity = z
  .object({
    profileId: z.string().uuid(),
    firstName: z.string(),
    lastName: z.string(),
    photoUrl: z.string().nullable(),
    ratingAvg: z.number(),
    ratingCount: z.number().int(),
    tripsCount: z.number().int(),
    /** Free-text vehicle description (`riders.vehicle_info`) — e.g. "Red Honda Ace". */
    vehicleInfo: z.string().nullable(),
    /** Registration plate (`riders.bike_reg`) — the "AEE 4471" chip the tracking mock draws. */
    plate: z.string().nullable(),
    /** Derived from `riders.kyc_status === "verified"` — the trust badge on the rider card. */
    kycVerified: z.boolean(),
  })
  .strict();
export type FoodOrderRiderIdentity = z.infer<typeof FoodOrderRiderIdentity>;

/** Order flow v2 (BRIEF §13): a prescription's check state. */
export const RxStatus = z.enum(["pending", "approved", "declined"]);
export type RxStatus = z.infer<typeof RxStatus>;

/** BRIEF §13: the pharmacist's decline chips — Unreadable · Expired · Not valid for this medicine · Other. */
export const RxDeclineReason = z.enum(["unreadable", "expired", "not_valid", "other"]);
export type RxDeclineReason = z.infer<typeof RxDeclineReason>;

/** BRIEF §13: the prescription as an order read shows it (customer, pharmacy, rider). */
export const MerchantOrderPrescriptionView = z
  .object({
    status: RxStatus,
    patientName: z.string(),
    pageCount: z.number().int(),
    declineReason: RxDeclineReason.nullable().optional(),
    declineNote: z.string().nullable().optional(),
    checkedAt: z.string().nullable().optional(),
    /** RD3: the rider ticked "I saw the original prescription". Required before delivery completes. */
    riderSawOriginalAt: z.string().nullable().optional(),
  })
  .strict();
export type MerchantOrderPrescriptionView = z.infer<typeof MerchantOrderPrescriptionView>;

/** Shared shape both the customer's order view and the merchant's queue card render. Every
 *  timestamp is an ISO-8601 string (server-authoritative; the client never computes one). */
export const MerchantOrderResponse = z
  .object({
    id: z.string().uuid(),
    merchantId: z.string().uuid(),
    status: z.string(),
    merchantPhase: MerchantPhase.nullable(),
    items: z.array(MerchantOrderItemView),
    note: z.string().nullable(),
    paymentMethod: MerchantPaymentMethod.nullable(),
    // D-24 manual rail: the shop's own payment-receiving number, UNMASKED — this is the customer's
    // own active order, not a third party's view of the merchant (D-17 masking doesn't apply here;
    // see the doc comment on the API side, food-order.service.ts's ORDER_WITH_ITEMS_INCLUDE).
    merchantPaymentPhone: z.string().nullable(),
    // D-08: never merged into one figure — goods total is what's owed to the merchant, deliveryFee
    // is what the rider keeps. `total` is goods + delivery, the number the customer pays.
    merchantGoodsTotal: z.number().nullable(),
    deliveryFee: z.number().nullable(),
    total: z.number().nullable(),
    /** D-71: the part of `deliveryFee` the venue pays (free delivery); null/absent = the customer pays it
     *  all. `deliveryFee` stays what the rider earns; `total` already has the share taken off. */
    merchantDeliveryShare: z.number().nullable().optional(),
    /** D-71: what the customer pays for delivery (`deliveryFee` less the venue's share; 0 = free). */
    customerDeliveryFee: z.number().nullable().optional(),
    acceptDeadlineAt: z.string().nullable(),
    itemApprovalDeadlineAt: z.string().nullable(),
    prepMinutes: z.number().int().nullable(),
    prepStartedAt: z.string().nullable(),
    readyAt: z.string().nullable(),
    rejectionReason: z.string().nullable(),
    paymentCallLoggedAt: z.string().nullable(),
    paymentRequestedAt: z.string().nullable(),
    merchantPaymentReference: z.string().nullable(),
    merchantPaymentConfirmedAt: z.string().nullable(),
    // #670: the payment-prompt lifecycle, ALONGSIDE the manual-reference fields above. All null/omitted
    // until a prompt is sent (RC.pay_wait/pay_confirmed render off these). `paymentPromptSentAt` is an
    // ISO string. Additive — an old client that reads only the manual fields is unaffected.
    paymentPromptStatus: PaymentPromptStatus.nullable().optional(),
    paymentPromptRail: PaymentPromptRail.nullable().optional(),
    paymentPromptRef: z.string().nullable().optional(),
    paymentPromptSentAt: z.string().nullable().optional(),
    // C3: dispatch view. `riderId` is null until a candidate accepts (D-04 "rider secured"), at which
    // point `status`/`merchantPhase` have already moved on (assigned, merchantPhase cleared) — this
    // stays the one place a poller can see WHO, without a second round-trip to the generic order read.
    riderId: z.string().uuid().nullable(),
    // #671: the assigned rider's public identity block (name/photo/rating/vehicle/plate/KYC) for the
    // food live tracker's "rider secured" card. Omitted until a rider is assigned (see A-O14 omit
    // note below); optional so an OLD client that never reads it is unaffected (additive contract).
    rider: FoodOrderRiderIdentity.nullable().optional(),
    dispatchAttempt: z.number().int(),
    dispatchOfferExpiresAt: z.string().nullable(),
    noRiderHoldAt: z.string().nullable(),
    // N-16: the server-committed pickup-code attempt count, mirroring `deliveryOtpAttempts` on the
    // generic OrderSnapshot — lets the rider's pickup screen resync its lockout state from the server
    // (a merchant re-reveal resets this to 0) instead of trusting a purely local counter.
    pickupCodeAttempts: z.number().int(),
    // C4: doorstep handshake (R-04/R-05/N-19) — CASH orders only, null otherwise. R-12: WALLET orders
    // show PAID via merchantPaymentConfirmedAt/merchantPaymentReference above; this is CASH's mirror.
    // A-O14: `.optional()` alongside `.nullable()` — food-order.service.ts's toResponse() omits these
    // keys entirely (rather than sending an explicit `null`) whenever they're not applicable, to cut
    // guaranteed-null-padding bytes off every food poll (LC-A06). A missing key and an explicit `null`
    // mean the same thing to every consumer (all read via `??`/truthy/`===`, never `"key" in order`).
    cashHandshakeAmount: z.number().nullable().optional(),
    customerCashConfirmedAt: z.string().nullable().optional(),
    riderCashConfirmedAt: z.string().nullable().optional(),
    cashHandshakeDeadlineAt: z.string().nullable().optional(),
    cashHandshakeFrozenAt: z.string().nullable().optional(),
    // N-10: the rider's logged pre-no-show call attempts (D5) — server-timestamped, never a
    // client-side timer, so the 8:00 wait + 2-call minimum reads off the same clock the
    // reportNoShow guard itself enforces.
    noShowCallTimestamps: z.array(z.string()),
    // C4: the collect-and-return merchant-debt ledger's derived state (R-01/R-06/N-20/N-21). A-O14:
    // see the cash-handshake fields' comment above — same omit-when-null treatment.
    merchantCashRule: MerchantCashRule.nullable().optional(),
    debtStatus: MerchantDebtStatus.nullable().optional(),
    debtAmount: z.number().nullable().optional(),
    debtOpenedAt: z.string().nullable().optional(),
    debtSettledAt: z.string().nullable().optional(),
    // C4/D-12: a merchant-issued refund on an already-paid order the merchant can't fulfil. A-O14:
    // same omit-when-null treatment.
    refundReference: z.string().nullable().optional(),
    refundAmount: z.number().nullable().optional(),
    refundedAt: z.string().nullable().optional(),
    // D-48 (merchant mobile redesign): what the Orders screens draw beyond the kitchen phases — when it
    // was placed and delivered, when the rider's cash back is due, whether the merchant closed its side
    // without cash, and (single-order reads only) the step times for the tracking stepper. All
    // optional and omitted when empty, so an installed client is unaffected.
    createdAt: z.string().optional(),
    deliveredAt: z.string().nullable().optional(),
    cashDueAt: z.string().nullable().optional(),
    merchantClosedAt: z.string().nullable().optional(),
    merchantCloseReason: z.enum(["no_cash", "force"]).nullable().optional(),
    timeline: z.array(z.object({ status: z.string(), at: z.string() })).optional(),
    // Auto-accept (docs/plans/2026-09-30-restaurant-auto-accept.md). All optional/additive.
    /** The order skipped the accept window. Until `kitchenConfirmedAt` is set no rider is sent, and the
     *  rider picks up with "Collected" instead of the pickup code. */
    autoAccepted: z.boolean().optional(),
    kitchenConfirmedAt: z.string().nullable().optional(),
    kitchenConfirmedBy: z.enum(["merchant", "ops"]).nullable().optional(),
    itemsEditedAt: z.string().nullable().optional(),
    /** The restaurant's number, only when it agreed to show it to customers. */
    restaurantPhone: z.string().nullable().optional(),
    /** The customer's contact number — on the restaurant's own views only. */
    customerPhone: z.string().nullable().optional(),
    // ── Order flow v2 (ledger D-59, backend B). All optional and additive: an installed app ignores them.
    // (The venue kind — Cooking vs Packing, the tile colour — is backend A's `venue.businessType/shopKind`.)
    /** BRIEF §12: the slot's start (ISO) of a scheduled order; omitted for an ASAP order. */
    scheduledFor: z.string().nullable().optional(),
    /** When the order rings the merchant ("Rings at 12:05 like a new order") = slot − prep − delivery. */
    ringsAt: z.string().nullable().optional(),
    /** When it actually rang. A scheduled order with this unset is in the Scheduled state (T13a, free
     *  cancel, Change time); once set it runs like any new order (T13b). */
    scheduleStartedAt: z.string().nullable().optional(),
    /** BRIEF §13: the prescription on a pharmacy order (no photo URLs here — see the prescription read). */
    prescription: MerchantOrderPrescriptionView.nullable().optional(),
    /** BRIEF D3f: on a merchant order the customer cancelled after the rider collected it — what they owe
     *  for it ("You owe $16.50 — pay it on your next order"). */
    owedUsd: z.number().nullable().optional(),
    /** BRIEF D3f: an earlier owed balance this order collects, as its own line. Already inside `total`
     *  (and the doorstep cash amount); NOT inside `merchantGoodsTotal` / `deliveryFee`. */
    previousBalanceUsd: z.number().nullable().optional(),
    // ── Order flow v2 (ledger D-59). All optional/additive: an installed app never reads them. ──
    /** "Order #A1B2" (`orderShortId`). */
    shortId: z.string().optional(),
    /** The venue: name for the header and receipt, type/kind for per-service copy. */
    venue: MerchantOrderVenueView.optional(),
    /** D1 receipt: the items subtotal and the N-15 small-order fee (they add up to `merchantGoodsTotal`). */
    itemsSubtotal: z.number().nullable().optional(),
    smallOrderFee: z.number().nullable().optional(),
    /** BRIEF §4: the four-step track; null once the order ended without delivery. */
    track: MerchantOrderTrackView.nullable().optional(),
    /** BRIEF §7: the customer's out-of-stock preference ("ask" when they never chose). */
    outOfStockPref: OutOfStockPref.optional(),
    /** BRIEF §8: the latest substitution round (omitted when the order never had one). */
    substitution: SubstitutionRoundView.nullable().optional(),
    /** BRIEF §9: shops and pharmacies need the pickup photo before pickup completes. */
    pickupProofRequired: z.boolean().optional(),
    /** BRIEF §9: the pickup photo + sealed tick (single-order reads; omitted until there is one). */
    pickupProof: MerchantPickupProofView.nullable().optional(),
    /** BRIEF §9: the door photo when the code couldn't be used (single-order reads; omitted otherwise). */
    doorProof: MerchantDoorProofView.nullable().optional(),
    /** BRIEF §11: the customer's own venue rating (customer reads only; omitted until rated). */
    venueRating: VenueRatingView.nullable().optional(),
  })
  .strict();
export type MerchantOrderResponse = z.infer<typeof MerchantOrderResponse>;

/** BRIEF §12: `GET /restaurants/:merchantId/schedule-slots` (any customer-visible venue). Slots are
 *  ORDER_SCHEDULE.slotMinutes long; `start`/`end` are ISO instants and `label` is the venue's local
 *  "12:30–13:00". Only slots the venue can meet are listed (inside its hours, starting no earlier than now
 *  + prep + delivery); a slot at ORDER_SCHEDULE.slotCapacity scheduled orders is listed with `full`. */
export const ScheduleSlot = z
  .object({ start: z.string(), end: z.string(), label: z.string(), full: z.boolean() })
  .strict();
export type ScheduleSlot = z.infer<typeof ScheduleSlot>;

export const ScheduleSlotsResponse = z
  .object({
    slotMinutes: z.number().int(),
    /** Open right now (an ASAP order is possible). A closed venue still lists its first slots. */
    openNow: z.boolean(),
    /** The minutes the venue needs before a slot starts (prep + delivery estimate) — "{v} starts {making}". */
    leadMinutes: z.number().int(),
    today: z.object({ date: z.string(), slots: z.array(ScheduleSlot) }).strict(),
    tomorrow: z.object({ date: z.string(), slots: z.array(ScheduleSlot) }).strict(),
    /** The earliest slot that isn't full — the closed venue's "Order for when they open · 10:30–11:00". */
    firstAvailable: ScheduleSlot.nullable(),
  })
  .strict();
export type ScheduleSlotsResponse = z.infer<typeof ScheduleSlotsResponse>;

/** BRIEF §12 "Change time": `POST /restaurants/orders/:orderId/schedule`, before the order rings. */
export const ChangeOrderScheduleRequest = z.object({ scheduledFor: z.string().datetime({ offset: true }) }).strict();
export type ChangeOrderScheduleRequest = z.infer<typeof ChangeOrderScheduleRequest>;

/** BRIEF §13: `POST /merchant/orders/:orderId/prescription/decline` — the reason chips + an optional note. */
export const DeclinePrescriptionRequest = z
  .object({ reason: RxDeclineReason, note: z.string().trim().max(300).optional() })
  .strict();
export type DeclinePrescriptionRequest = z.infer<typeof DeclinePrescriptionRequest>;

/** BRIEF §13: the prescription's photos, as short-lived signed read URLs, page order. Served only to the
 *  order's customer (`GET /restaurants/orders/:id/prescription`), its pharmacy
 *  (`GET /merchant/orders/:id/prescription`) and admin (`GET /admin/orders/:id/prescription`). */
export const PrescriptionPhotosResponse = z
  .object({
    photos: z.array(z.object({ page: z.number().int(), url: z.string() }).strict()),
    expiresInSeconds: z.number().int(),
  })
  .strict();
export type PrescriptionPhotosResponse = z.infer<typeof PrescriptionPhotosResponse>;

/** BRIEF D3f: `GET /restaurants/balance` — what the customer owes from cancels after collection. A line
 *  carried on a live order (`carriedOnOrderId`) still counts until that order is delivered. */
export const CustomerBalanceResponse = z
  .object({
    owedUsd: z.number(),
    lines: z.array(
      z
        .object({
          orderId: z.string().uuid(),
          amount: z.number(),
          createdAt: z.string(),
          carriedOnOrderId: z.string().uuid().nullable(),
        })
        .strict(),
    ),
  })
  .strict();
export type CustomerBalanceResponse = z.infer<typeof CustomerBalanceResponse>;

/** D-23: merchant's accept — full accept when `unavailableDishIds` is omitted/empty, item-level
 *  accept otherwise (the customer then gets N-18's 60s approval window on the shortened order). */
export const MerchantAcceptOrderRequest = z
  .object({
    prepMinutes: z.union([z.literal(10), z.literal(15), z.literal(20), z.literal(30), z.literal(45)]),
    unavailableDishIds: z.array(z.string().uuid()).max(30).optional(),
  })
  .strict();
export type MerchantAcceptOrderRequest = z.infer<typeof MerchantAcceptOrderRequest>;

/** D-11: the reason IS the customer's copy (MERCHANT_REJECTION_REASONS in ./restaurants-order). */
export const MerchantRejectionReasonCode = z.enum([
  "out_of_ingredient",
  "too_busy",
  "closing_soon",
  "unreachable_customer",
  "shop_closed",
  // C3/D-13: the NO_RIDER apology — the reconciler's own cap-exhausted exit, or the merchant's
  // explicit "cancel" choice from the D-34 hold screen.
  "no_rider",
  // Auto-accept: the kitchen was never confirmed (RESTAURANTS_AUTO_ACCEPT.autoCancelAfterMs).
  "kitchen_unconfirmed",
  // Order flow v2 U5: every line ended up removed (substitution). Set by the server, never by a merchant.
  "all_out_of_stock",
  "other",
]);
export type MerchantRejectionReasonCode = z.infer<typeof MerchantRejectionReasonCode>;

export const MerchantRejectOrderRequest = z.object({ reason: MerchantRejectionReasonCode }).strict();
export type MerchantRejectOrderRequest = z.infer<typeof MerchantRejectOrderRequest>;

/** R-11/D-06: the merchant matches the customer's rail reference against their own statement — a
 *  mismatched amount blocks release and names the gap (checked server-side, not just displayed). */
export const MerchantConfirmPaymentRequest = z
  .object({
    reference: z.string().trim().min(1).max(80),
    amount: z.number().positive().max(100_000).multipleOf(0.01),
  })
  .strict();
export type MerchantConfirmPaymentRequest = z.infer<typeof MerchantConfirmPaymentRequest>;

/** D-23: the customer's response to a shortened (item-level accept) order. */
export const ApproveMerchantOrderItemsRequest = z.object({ approve: z.boolean() }).strict();
export type ApproveMerchantOrderItemsRequest = z.infer<typeof ApproveMerchantOrderItemsRequest>;

/** D-24 "I paid another way" manual rail — the customer's own submitted reference, matched by the
 *  merchant against their statement at confirm-payment. */
export const SubmitMerchantPaymentReferenceRequest = z
  .object({ reference: z.string().trim().min(1).max(80) })
  .strict();
export type SubmitMerchantPaymentReferenceRequest = z.infer<typeof SubmitMerchantPaymentReferenceRequest>;

/** R-16: the request-payment button unlocks after a logged call; `overrideCallLog` is the named
 *  escape hatch for regulars and in-person confirms. */
export const MerchantRequestPaymentRequest = z.object({ overrideCallLog: z.boolean().optional() }).strict();
export type MerchantRequestPaymentRequest = z.infer<typeof MerchantRequestPaymentRequest>;

/** N-16: the rider's pickup code, checked against the one the merchant reads out at the counter. Six
 *  digits since Order flow v2 (ledger D-59, BRIEF §16, `PICKUP_CODE_DIGITS`). The wire still accepts
 *  the legacy four (`LEGACY_PICKUP_CODE_DIGITS`) so an installed rider app's four-digit attempt reaches
 *  the service and gets the ordinary "That code doesn't match" (400) instead of a validation error,
 *  and a code minted before the switch still verifies (additive widening, LAUNCH-DEPLOYMENT-STRATEGY
 *  §1c). */
export const ConfirmMerchantPickupRequest = z.object({ code: z.string().regex(/^(?:\d{4}|\d{6})$/) }).strict();
export type ConfirmMerchantPickupRequest = z.infer<typeof ConfirmMerchantPickupRequest>;

/** D-11: a merchant's no-penalty release of an unpaid (awaiting_payment) order (R-17 zombie mitigation). */
export const MerchantReleaseUnpaidRequest = z.object({ reason: MerchantRejectionReasonCode }).strict();
export type MerchantReleaseUnpaidRequest = z.infer<typeof MerchantReleaseUnpaidRequest>;

// ── C4: food money evidence layer ────────────────────────────────────────────────────────────────

/** R-06/N-21/D-06: the merchant's counted amount — must match the recorded debt exactly, a mismatch
 *  blocks release and names the gap in dollars (checked server-side, never just displayed). */
export const ConfirmMerchantReturnedCashRequest = z
  .object({ amount: z.number().positive().max(100_000).multipleOf(0.01) })
  .strict();
export type ConfirmMerchantReturnedCashRequest = z.infer<typeof ConfirmMerchantReturnedCashRequest>;

/** R-07: the merchant's plain-words declaration that a rider never returned the cash. */
export const ReportMerchantNonReturnRequest = z.object({ note: z.string().trim().min(1).max(500).optional() }).strict();
export type ReportMerchantNonReturnRequest = z.infer<typeof ReportMerchantNonReturnRequest>;

/** D-12: a merchant cannot cancel an already-WALLET-paid order without entering their own refund
 *  reference AND the exact amount first — the customer's order keeps the reference forever. */
export const RefundMerchantOrderRequest = z
  .object({
    reference: z.string().trim().min(1).max(80),
    amount: z.number().positive().max(100_000).multipleOf(0.01),
  })
  .strict();
export type RefundMerchantOrderRequest = z.infer<typeof RefundMerchantOrderRequest>;

/** `POST /merchant/orders/:id/close` — the merchant closes its side of a food order after pickup
 *  without counting cash (D-48): "no_cash" is B7's "No cash on this one · mark completed", "force" is
 *  B6's "Mark ride completed". The delivery itself, the rider and the customer are untouched. */
export const CloseMerchantOrderRequest = z.object({ reason: z.enum(["no_cash", "force"]) }).strict();
export type CloseMerchantOrderRequest = z.infer<typeof CloseMerchantOrderRequest>;

// ── E3: merchant money surfaces — weekly statement + end-of-day summary (N-13) ──────────────────────

/** One delivered order's row on the weekly statement. */
export const MerchantStatementLineItem = z
  .object({
    orderId: z.string().uuid(),
    deliveredAt: z.string(),
    paymentMethod: MerchantPaymentMethod,
    amount: z.number(),
    commission: z.number(),
  })
  .strict();
export type MerchantStatementLineItem = z.infer<typeof MerchantStatementLineItem>;

/** N-13: 0% commission today, with the "would have been" comparator shown for transparency — never a
 *  committed rate. `cookedFoodLossTotal` is D-34's NO_RIDER-cancelled-after-cooking loss, logged here
 *  as the amount LyniaGo covers (visibility only; no ledger transfer is built yet — flagged, not
 *  silently decided). */
export const MerchantWeeklyStatementResponse = z
  .object({
    rangeStart: z.string(),
    rangeEnd: z.string(),
    ordersDelivered: z.number().int(),
    foodSalesTotal: z.number(),
    commissionRatePct: z.number(),
    commissionCharged: z.number(),
    illustrativeRatePct: z.number(),
    illustrativeCommission: z.number(),
    cookedFoodLossTotal: z.number(),
    lineItems: z.array(MerchantStatementLineItem),
  })
  .strict();
export type MerchantWeeklyStatementResponse = z.infer<typeof MerchantWeeklyStatementResponse>;

/** M4·6: "what the owner actually asks at closing time" — a read-only summary, not a close action
 *  (N-23's end-of-day close already runs automatically; see food-order.service.ts:sweepEndOfDayClose).
 *  `cashTaken` is scoped to what the merchant actually confirmed today (collect-and-return returns) —
 *  pay-me-upfront cash has no ledger yet (same C4 scope cut RESTAURANTS-DECISIONS.md §7 names), so it
 *  is honestly left out rather than estimated. */
export const MerchantEndOfDaySummaryResponse = z
  .object({
    date: z.string(),
    delivered: z.number().int(),
    rejected: z.number().int(),
    cashTaken: z.number(),
    walletTaken: z.number(),
    averagePrepMinutes: z.number().nullable(),
    // D-48: the Orders header's tiles and Money's overdue row. `orders` counts today's orders that went
    // through (placed, not cancelled); `sales` is their food total; `cashOverdue` is cash a rider owes
    // back past its due time and not yet confirmed or closed, with one row per order in `overdue`.
    orders: z.number().int().optional(),
    sales: z.number().optional(),
    cashOverdue: z.number().optional(),
    /** Merchant v2 (D-77): all the cash riders still owe back — delivered, neither counted nor closed —
     *  overdue or not. The Orders top card's "Cash due". */
    cashDue: z.number().optional(),
    overdue: z
      .array(
        z.object({
          orderId: z.string().uuid(),
          amount: z.number(),
          riderName: z.string().nullable(),
          dueAt: z.string(),
          /** D-48 PR 4b: a shop booking's cash on delivery (opens /deliveries/:id) rather than a food order. */
          kind: z.enum(["order", "booking"]).optional(),
        }),
      )
      .optional(),
    // D-48 C3: Money's "Orders" list for today, newest first. `at` is when it ended (delivered or
    // cancelled), else when it was placed; `amount` is what it earned (0 unless delivered or still on).
    // "rejected" = never accepted (declined or missed); "cancelled" = accepted, then cancelled.
    lines: z
      .array(
        z.object({
          orderId: z.string().uuid(),
          at: z.string(),
          outcome: z.enum(["delivered", "not_delivered", "rejected", "cancelled", "in_progress"]),
          amount: z.number(),
        }),
      )
      .optional(),
  })
  .strict();
export type MerchantEndOfDaySummaryResponse = z.infer<typeof MerchantEndOfDaySummaryResponse>;

/* ── Merchant web upgrade L2: Book a rider (docs/plans/2026-09-29-merchant-web-upgrade-plan.md D9) ──
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
    proposedFare: z.number().positive().max(100_000).multipleOf(0.01),
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
    proposedFare: z.number().positive().max(100_000).multipleOf(0.01).optional(),
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
    cashOnDelivery: z
      .object({
        amount: z.string(),
        status: z.enum(["awaiting_delivery", "due", "returned", "closed"]),
        dueAt: z.string().nullable(),
      })
      .strict()
      .nullable()
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

/* ── Multi-branch owners (docs/plans/2026-09-30-multi-branch-owners.md) ─────────────────────────── */

/** An owner opens at most this many branches (each is a business of its own). */
export const MERCHANT_BRANCHES_MAX = 20;

/** One business the signed-in person is on (`GET /merchant/branches`). */
export const MerchantBranchResponse = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    /** Where it is, as riders read it at pickup. Null until the business has a pin. */
    landmark: z.string().nullable(),
    role: MerchantMemberRole,
    /** The branch every other merchant call is working on. Exactly one is active. */
    active: z.boolean(),
    /** Switched on by LyniaGo ops (restaurants: customers can order from it). */
    pilotEnabled: z.boolean(),
  })
  .strict();
export type MerchantBranchResponse = z.infer<typeof MerchantBranchResponse>;

/** The active branch first. A person on one business gets a list of one. */
export const MerchantBranchesResponse = z.object({ branches: z.array(MerchantBranchResponse) }).strict();
export type MerchantBranchesResponse = z.infer<typeof MerchantBranchesResponse>;

/** `POST /merchant/branches/switch` — work on another branch. Answers with that branch's `/merchant/me`.
 *  Reconnect the kitchen socket after it: the old branch's feed is left server-side. */
export const SwitchMerchantBranchRequest = z.object({ merchantId: z.string().uuid() }).strict();
export type SwitchMerchantBranchRequest = z.infer<typeof SwitchMerchantBranchRequest>;

/** `POST /merchant/branches` (owner only) — open a new branch from the active one. It copies the shop
 *  front (logo, cover, description, tags, price level), hours and cash rule, and the menu when asked; it
 *  starts dormant until ops switch it on, and becomes the active branch. */
export const CreateMerchantBranchRequest = z
  .object({
    /** As customers will see it, e.g. "Mama's Kitchen · Avondale". Unique among the owner's branches. */
    name: z.string().trim().min(1).max(120),
    location: MerchantLocationInput,
    copyMenu: z.boolean().optional(),
  })
  .strict();
export type CreateMerchantBranchRequest = z.infer<typeof CreateMerchantBranchRequest>;

/* ── Merchant web upgrade L4: Team (docs/designs/merchant-web-upgrade.md "L4 — Team") ──────────── */

/** An invite lasts this long before the person must be invited again. */
export const MERCHANT_INVITE_TTL_DAYS = 14;
/** A business sends at most this many invites a day (rate-limited and audit-logged). */
export const MERCHANT_INVITES_PER_DAY = 10;

/** One person on the business's team (`GET /merchant/team`, owner only). */
export const MerchantTeamMemberResponse = z
  .object({
    profileId: z.string().uuid(),
    /** The name the business knows them by. */
    name: z.string(),
    phoneMasked: z.string(),
    role: MerchantMemberRole,
    /** The signed-in person themselves. */
    you: z.boolean(),
    joinedAt: z.string(),
    /** Order flow v2 (BRIEF §13): may approve or decline prescriptions. Absent on older servers. */
    isPharmacist: z.boolean().optional(),
  })
  .strict();
export type MerchantTeamMemberResponse = z.infer<typeof MerchantTeamMemberResponse>;

/** An invite still waiting for the person's Join or Not me. */
export const MerchantTeamInviteResponse = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    phoneMasked: z.string(),
    /** International digits, so the owner can send the link from their own WhatsApp. */
    invitePhone: z.string(),
    createdAt: z.string(),
    expiresAt: z.string(),
  })
  .strict();
export type MerchantTeamInviteResponse = z.infer<typeof MerchantTeamInviteResponse>;

export const MerchantTeamResponse = z
  .object({
    members: z.array(MerchantTeamMemberResponse),
    invites: z.array(MerchantTeamInviteResponse),
  })
  .strict();
export type MerchantTeamResponse = z.infer<typeof MerchantTeamResponse>;

/** `POST /merchant/team/members/:profileId/pharmacist` (owner only, BRIEF §13). */
export const SetMerchantPharmacistRequest = z.object({ isPharmacist: z.boolean() }).strict();
export type SetMerchantPharmacistRequest = z.infer<typeof SetMerchantPharmacistRequest>;

/** `POST /merchant/team/invites` (owner only). Never reveals whether the number works elsewhere. */
export const CreateMerchantInviteRequest = z
  .object({
    name: z.string().trim().min(1).max(60),
    phone: z.string().trim().min(6).max(20),
  })
  .strict();
export type CreateMerchantInviteRequest = z.infer<typeof CreateMerchantInviteRequest>;

/** An invite waiting for the signed-in person (`GET /merchant/invites`): "{Owner} added you to {Business}". */
export const MyMerchantInviteResponse = z
  .object({
    id: z.string().uuid(),
    businessName: z.string(),
    businessType: MerchantBusinessType,
    /** The owner's first name, as the invite line says it. */
    ownerName: z.string(),
    role: MerchantMemberRole,
    /** The name the owner gave, which the person confirms or corrects at Join. */
    name: z.string(),
    expiresAt: z.string(),
  })
  .strict();
export type MyMerchantInviteResponse = z.infer<typeof MyMerchantInviteResponse>;

export const MyMerchantInvitesResponse = z.object({ invites: z.array(MyMerchantInviteResponse) }).strict();
export type MyMerchantInvitesResponse = z.infer<typeof MyMerchantInvitesResponse>;

/** `POST /merchant/invites/:id/join`: the person's name as they want it, and the one-tap terms line. */
export const JoinMerchantInviteRequest = z
  .object({
    name: z.string().trim().min(1).max(60),
    termsAccepted: z.literal(true),
  })
  .strict();
export type JoinMerchantInviteRequest = z.infer<typeof JoinMerchantInviteRequest>;

/** `POST /admin/merchants/:id/owner`: support hands a business to another person after an identity check. */
export const TransferMerchantOwnerRequest = z
  .object({
    phone: z.string().trim().min(6).max(20),
    note: z.string().trim().min(10).max(500),
  })
  .strict();
export type TransferMerchantOwnerRequest = z.infer<typeof TransferMerchantOwnerRequest>;
