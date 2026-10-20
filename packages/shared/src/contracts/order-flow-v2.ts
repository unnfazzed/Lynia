/**
 * Contracts: Order flow v2 wire shapes (ledger D-59). Re-exported by ../contracts.ts (the front door).
 */
import { z } from "zod";
import { UploadObjectKey, VenueRatingView } from "./core";
import { MerchantCashRule } from "./merchant";
import { MerchantOrderItemView, MerchantPaymentMethod, MerchantPhase, OutOfStockPref } from "./food-order";

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
    key: UploadObjectKey.optional(),
    bagSealed: z.boolean().optional(),
  })
  .strict()
  .refine((b) => b.key !== undefined || b.bagSealed !== undefined, { message: "Send a photo key or the bag-sealed tick" });
export type AttachMerchantPickupProofRequest = z.infer<typeof AttachMerchantPickupProofRequest>;

/** `POST /merchant/orders/:orderId/door-proof` (the assigned rider, RD4c/RD4d): the photo key from
 *  `POST /uploads/delivery-proof`, why the code couldn't be used, and who it was handed to. */
export const AttachMerchantDoorProofRequest = z
  .object({
    key: UploadObjectKey,
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
    /** Customer brief 07 (U66, ledger D-97 D3g): the venue's own note on a "Something else" (`other`)
     *  rejection — plain text, trimmed, at most MERCHANT_REASON_NOTE_MAX. Omitted when there is none. */
    venueNote: z.string().nullable().optional(),
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
    /** Own bikers (D-117): one of the business's own bikers carries it, so the delivery fee comes back to the
     *  shop with the food (OB-M13 K5 "food $12.00 + delivery $2.00"). Merchant view only; omitted otherwise. */
    ownBiker: z.literal(true).optional(),
    /** Own bikers (D-117): the branch whose own biker carries it, on the rider's own read (OB-R8/R9). Omitted otherwise. */
    fleetShop: z.string().optional(),
    dispatchAttempt: z.number().int(),
    dispatchOfferExpiresAt: z.string().nullable(),
    noRiderHoldAt: z.string().nullable(),
    // N-16: the server-committed pickup-code attempt count, mirroring `deliveryOtpAttempts` on the
    // generic OrderSnapshot — lets the rider's pickup screen resync its lockout state from the server
    // (a merchant's lockout re-reveal resets this to 0; since D2 an ordinary reveal returns the same code
    // and leaves it alone) instead of trusting a purely local counter.
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
    /** Merchant v2 (ledger D-77): the customer's first name — on the merchant's own views only. */
    customerFirstName: z.string().optional(),
    /** Merchant v2 (ledger D-77): the assigned rider's phone — on the merchant's own views only. */
    riderPhone: z.string().optional(),
    /** Merchant v2 (ledger D-77): when the rider reached the counter ("at your counter"); absent until then. */
    riderArrivedAt: z.string().optional(),
    /** Merchant v2 (ledger D-77): the rider's estimated arrival at their next stop — the counter before
     *  pickup, the customer after ("arrives 07:38"). Absent while unknown. */
    riderEtaAt: z.string().optional(),
    /** Owner decision D5 (2026-10-07, U10): when the rider tapped "I'm here" at the drop-off. A hint only —
     *  the customer's pay step never waits on it. Absent until then. */
    riderAtDropoffAt: z.string().nullable().optional(),
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
    /** C9 (reviewed list 2026-10-07): the ONE server-computed amount the customer pays at the door —
     *  the agreed total plus any carried `previousBalanceUsd` (`merchantAmountDueUsd`). The doorstep
     *  handshake, the pushes and the Orders history row use the same figure. Additive; older apps read
     *  `total`, which now carries the same value. */
    amountDueUsd: z.number().nullable().optional(),
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
    /** Retired (ledger D-100): the pickup photo is optional for every venue, so the server no longer sends
     *  this. Kept in the contract for installed apps, which read an absent flag as "optional". */
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
/** Merchant v2 P1 (ledger D-77): the pharmacist's three ticks, all needed before Approve. Stored on the
 *  prescription for the audit trail. Optional, so an installed merchant screen without it still approves. */
export const RX_CHECKLIST = ["nameMatches", "signedStamped", "recentDate"] as const;
export const ApprovePrescriptionRequest = z
  .object({
    checklist: z
      .object({ nameMatches: z.literal(true), signedStamped: z.literal(true), recentDate: z.literal(true) })
      .strict()
      .optional(),
  })
  .strict()
  .optional();
export type ApprovePrescriptionRequest = z.infer<typeof ApprovePrescriptionRequest>;

export const DeclinePrescriptionRequest = z
  .object({
    reason: RxDeclineReason,
    note: z.string().trim().max(300).optional(),
    /** Merchant v2 P1 (D-77): which of the three boxes were ticked when the pharmacist declined. */
    checklist: z.object({ nameMatches: z.boolean(), signedStamped: z.boolean(), recentDate: z.boolean() }).strict().optional(),
  })
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
  // Merchant v2 follow-ups (D-77): S2a's "Out of stock" (a shop), and K3b's "Ran out and can't swap" /
  // "Kitchen problem" ("Shop problem") when a started order can't be finished.
  "out_of_stock",
  "ran_out",
  "kitchen_problem",
  "other",
]);
export type MerchantRejectionReasonCode = z.infer<typeof MerchantRejectionReasonCode>;

/** Merchant v2 follow-ups (D-77): the optional note with "Something else" — the customer sees it. */
export const MERCHANT_REASON_NOTE_MAX = 80;

export const MerchantRejectOrderRequest = z
  .object({ reason: MerchantRejectionReasonCode, note: z.string().trim().max(MERCHANT_REASON_NOTE_MAX).optional() })
  .strict();
export type MerchantRejectOrderRequest = z.infer<typeof MerchantRejectOrderRequest>;

/** `POST /merchant/orders/:orderId/cancel` (K3b, D-77): why a started cash order can't be finished. The
 *  body is optional, so an older screen's empty POST still cancels (reason `other`).
 *  MJ-M2 (C8): an auto-accepted order's ring answers "Can't take it" with the K2a / S2a reasons
 *  (`out_of_ingredient`, `out_of_stock`, `closing_soon`), so the customer reads the same reason a
 *  declined ring gives. Additive: the K3b reasons are unchanged. */
export const MerchantCancelOrderRequest = z
  .object({
    reason: z.enum(["ran_out", "kitchen_problem", "too_busy", "other", "out_of_ingredient", "out_of_stock", "closing_soon"]).optional(),
    note: z.string().trim().max(MERCHANT_REASON_NOTE_MAX).optional(),
  })
  .strict();
export type MerchantCancelOrderRequest = z.infer<typeof MerchantCancelOrderRequest>;

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

/**
 * MJ-RM19 (2026-10-07): "+5 min" with the prep minutes the kitchen's screen showed (additive — an older
 * merchant page sends no body). The API adds five only while the order still has that many, so a retried
 * tap (a 2G POST the client gave up on that still landed) can't push the ready time back twice: it 409s
 * `prep_changed` instead.
 */
export const MerchantExtendPrepRequest = z.object({ expectedPrepMinutes: z.number().int().min(0).max(1_440).optional() }).strict();
export type MerchantExtendPrepRequest = z.infer<typeof MerchantExtendPrepRequest>;
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
