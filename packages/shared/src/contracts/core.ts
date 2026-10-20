/**
 * Contracts: parcel orders, offers, delivery codes, ratings, issues, SOS, devices, notifications and
 * the profile. Re-exported by ../contracts.ts (the front door).
 */
import { roundFare } from "../money";
import { normalizePhone } from "../phone";
import { z } from "zod";

/** A fare a customer, business or admin names: money bounds + 2dp (NUMERIC(10,2)), then snapped to the
 *  nearest 50c (owner 2026-10-15: every fare is a whole number of 50c). Snapped, not refused, so an app
 *  build from before the rule still books — what's stored and echoed back is always on the grid. */
export const FareUsd = z.number().positive().max(100_000).multipleOf(0.01).transform(roundFare);

/** Offer window length (CONCEPT §9). Wire-relevant: the customer's auction countdown renders from
 *  it (order.expiresAt = createdAt + OFFER_WINDOW_MS), and the API schedules expiry off the same
 *  value — one source so the clock the customer sees and the server enforces can't drift. */
export const OFFER_WINDOW_MS = 90_000;

/**
 * A storage object key a client sends back after an upload (D7 review, 2026-10-07). Keys are only ever
 * minted by the API (`<kind>/<ownerId>/<uuid>.<ext>`), so anything that could steer a storage SDK outside
 * the caller's namespace is refused at the edge: a leading `/`, `..`, `//`, `\`, `%` (pre-encoded
 * escapes) and control characters. The API also checks the exact minted shape and the owner.
 */
// oxlint-disable-next-line no-control-regex -- control characters are exactly what this refuses
export const SAFE_OBJECT_KEY_RE = /^(?!\/)(?!.*\.\.)(?!.*\/\/)[^\\%\u0000-\u001f\u007f]+$/;
export const UploadObjectKey = z.string().min(1).max(256).regex(SAFE_OBJECT_KEY_RE, "Invalid photo key");

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

/** D2 review (2026-10-11): how many times one order's hand-over code may be re-issued after a LOCKOUT
 *  (every try used). Each lockout re-issue resets the tries, so without a cap a rider could cycle
 *  5 guesses → re-issue → 5 guesses for ever. With it, an order allows at most
 *  DELIVERY_OTP_MAX_ATTEMPTS × (1 + this) guesses; past it the server refuses (`code_reissue_limit` /
 *  `pickup_code_reissue_limit`) and the order goes to support / not delivered. Server-enforced per order,
 *  separately for the delivery code and the pickup code. */
export const HANDOVER_CODE_MAX_REISSUES = 2;

export const LatLng = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type LatLng = z.infer<typeof LatLng>;

export const Waypoint = z.object({
  point: LatLng,
  landmark: z.string().min(1).max(160),
  // JQ-R4-03: the same plausibility gate the Send form applies (`phoneOk`), so a non-app client can't hand
  // the biker an uncallable number.
  contactPhone: z.string().min(6).max(20).refine((v) => normalizePhone(v) !== null, { message: "Enter a valid phone number" }),
});
export type Waypoint = z.infer<typeof Waypoint>;

/** One "what are you sending?" line — description + quantity, nothing more for the pilot
 *  (order item-model decision 2026-07-02, recorded in packages/design/HANDOFF.md; size/category/photo stay deferred seams). */
export const OrderItem = z.object({
  description: z.string().trim().min(1).max(140),
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
    itemDescription: z.string().trim().min(1).max(280).optional(),
    items: z.array(OrderItem).min(1).max(10).optional(),
    note: z.string().max(280).optional(),
    itemPhotoUrl: z.string().url().optional(),
    declaredValue: z.number().nonnegative().max(150), // pilot cap (CONCEPT §3.5)
    proposedFare: FareUsd, // sane cap + 2dp, snapped to 50c
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
  // Sane cap + 2dp. Not FareUsd: an accept must equal the ask, which can predate the 50c rule; the
  // service snaps a counter to 50c (offers.service).
  offeredFare: z.number().positive().max(100_000).multipleOf(0.01),
  etaMinutes: z.number().int().positive().max(180),
});
export type MakeOfferRequest = z.infer<typeof MakeOfferRequest>;

/** Customer selects one offer; the guarded CAS assigns the order (ET1). */
export const SelectOfferRequest = z.object({
  orderId: z.string().uuid(),
  offerId: z.string().uuid(),
});
export type SelectOfferRequest = z.infer<typeof SelectOfferRequest>;

/**
 * U62 + MJ-RL2 (C10): why a select was refused (409), on the error body's `reason` (additive — an older
 * API sends none, and the message is unchanged). `rider_taken`: the rider was just assigned to another
 * order (the one case the drawn "taken by another customer" toast is true for). `rider_unavailable`: the
 * rider went offline, lost standing or owes cash. `offer_gone`: the offer was withdrawn or closed.
 * `choose_ended` / `order_closed`: the time to choose ran out, or the order already left offers.
 */
export const SELECT_OFFER_CONFLICT_REASONS = ["rider_taken", "rider_unavailable", "offer_gone", "choose_ended", "order_closed"] as const;
export type SelectOfferConflictReason = (typeof SELECT_OFFER_CONFLICT_REASONS)[number];

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
  proposedFare: FareUsd,
});
export type RaisePriceRequest = z.infer<typeof RaisePriceRequest>;

/** One-tap resend of a finished (expired / cancelled / undelivered) parcel order at a new fare
 *  (POST /orders/:orderId/resend). Re-uses an already-open re-broadcast clone when one exists. */
export const ResendOrderRequest = z.object({
  proposedFare: FareUsd,
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
    /** The reason the operator picked in the console. Optional so older clients keep working. */
    reasonCode: z.string().min(1).max(64).optional(),
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
