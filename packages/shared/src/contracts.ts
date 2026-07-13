/**
 * API contracts — zod schemas + inferred types shared between the NestJS API and the
 * Expo / Next clients. Validation lives here so the wire shape can't drift between ends.
 */
import { z } from "zod";

/** Offer window length (CONCEPT §9). Wire-relevant: the customer's auction countdown renders from
 *  it (order.expiresAt = createdAt + OFFER_WINDOW_MS), and the API schedules expiry off the same
 *  value — one source so the clock the customer sees and the server enforces can't drift. */
export const OFFER_WINDOW_MS = 90_000;

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
 *  (ITEM-DESIGN-REVIEW decision 2026-07-02; size/category/photo stay deferred seams). */
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
 *  enum + attempt count are persisted and shown verbatim to the customer. Allowed only post-pickup. */
export const MarkUndeliveredRequest = z.object({
  reason: z.enum(["unreachable", "refused", "wrong_address", "breakdown"]),
  note: z.string().max(280).optional(),
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
 *  ping them the moment a rider comes online nearby (on the no-riders-online auction state). */
export const NotifyWhenAvailableRequest = z.object({
  pickup: LatLng,
});
export type NotifyWhenAvailableRequest = z.infer<typeof NotifyWhenAvailableRequest>;

/** Customer rates the rider after delivery; this also closes the order (`completed`). */
export const RateRequest = z.object({
  score: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
});
export type RateRequest = z.infer<typeof RateRequest>;

/** Rider rates the sender after delivery (rider-journey 4·7). Optional, recorded-only — a no-show or
 *  cash problem here protects other riders; it does NOT change the order status. */
export const RateSenderRequest = z.object({
  score: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
});
export type RateSenderRequest = z.infer<typeof RateSenderRequest>;

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
  /** server→client (to the CANCELLED order's room, i.e. the customer): the assigned rider bailed and
   *  the order was auto re-broadcast at the same price as a NEW order (INTERFACE-AUDIT F-01). Carries
   *  the new order id so the customer app moves to the fresh auction instead of a dead "cancelled"
   *  terminal — the customer never restarts the order themselves. */
  orderRebroadcast: "order:rebroadcast",
} as const;
export type WsEvent = (typeof WS_EVENTS)[keyof typeof WS_EVENTS];

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
 *  fetched at app start so an already-installed binary can be walked to the Play Store when a breaking
 *  change strands it. "0.0.0" (the server default when MIN_SUPPORTED_APP_VERSION is unset) = gate off.
 *  Same dotted-version dialect as the mobile comparator (`isVersionBelow` in apps/mobile/src/config.ts). */
export const VersionGateResponse = z.object({ minSupportedVersion: z.string().max(24) }).strict();
export type VersionGateResponse = z.infer<typeof VersionGateResponse>;
