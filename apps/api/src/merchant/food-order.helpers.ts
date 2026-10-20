/**
 * FoodOrderService's module-level constants, types and pure helpers, shared by the facade and its parts
 * (R-6, QA 2026-10-20). food-order.service.ts re-exports the ones it always exported.
 */
import { Prisma } from "@prisma/client";
import { addMoney, deriveMerchantOrderTrack, merchantGoodsForSubtotal, orderShortId, fromCents, type MerchantOrderResponse, type LyniaCancelReason, type MerchantRejectionReasonCode, roundToCents, toCents, type MerchantOrderPrescriptionView, type RxDeclineReason } from "@lynia/shared";
import { harareWallClock } from "./harare-clock";
import { SUBSTITUTION_ROUND_INCLUDE, toSubstitutionRoundView } from "./order-substitution.service";

// D-24 manual rail: the customer needs the shop's OWN payment-receiving number to send mobile
// money to (never masked — D-17's masking is for a THIRD PARTY's view of the merchant, e.g. a
// rider's navigation card; the customer paying their own order needs the real number, exactly as
// the design source shows it — packages/design/RESTAURANTS-DECISIONS.md D-24). Falls back to the
// merchant account's own registered phone when no pickup-point contactPhone is set yet (toResponse).
/** Merchant v2 K3 (D-77): "+5 min" adds this much prep, up to the cap. */
export const PREP_EXTEND_MIN = 5;
/** Merchant v2 (D-77): how long a hand-over fallback link lives. Long enough to send it and walk to the counter. */
export const HANDOVER_LINK_TTL_S = 15 * 60;
export const PREP_MAX_MIN = 120;

export const ORDER_WITH_ITEMS_INCLUDE = {
  merchantItems: true,
  merchant: {
    select: {
      location: true,
      showPhoneToCustomers: true,
      ownerProfile: { select: { phone: true } },
      // Order flow v2 (D-59): the venue block (header, receipt "From", per-service copy).
      name: true,
      businessType: true,
      shopKind: true,
    },
  },
  // Order flow v2 (D-59): the latest substitution round (BRIEF §8) and the customer's venue rating (§11).
  substitutionRounds: { orderBy: { createdAt: "desc" }, take: 1, include: SUBSTITUTION_ROUND_INCLUDE },
  venueRating: { select: { score: true, tags: true, createdAt: true } },
  // Order flow v2 (ledger D-59, backend B): the scheduled slot, the prescription, and the D3f owed balance
  // (what this order left owed, and what earlier balance it carries).
  schedule: true,
  prescription: true,
  owedBalance: { select: { amount: true } },
  carriedBalance: { select: { amount: true } },
  // Merchant v2 (ledger D-77): the customer's first name, for the merchant's own view only (forMerchant).
  customer: { select: { firstName: true } },
  // #671: the assigned rider's public identity for the food live tracker's "rider secured" card.
  // Name lives on the Profile, everything else (plate=bike_reg, vehicle, rating, trips, KYC, photo)
  // on the Rider. Null until dispatch assigns a rider — toResponse omits the whole block then.
  rider: {
    select: {
      profileId: true,
      bikeReg: true,
      vehicleInfo: true,
      ratingAvg: true,
      ratingCount: true,
      tripsCount: true,
      kycStatus: true,
      photoUrl: true,
      // `phone` is read only by forMerchant (Merchant v2's call button, D-77); toResponse never maps it.
      profile: { select: { firstName: true, lastName: true, phone: true } },
    },
  },
} satisfies Prisma.OrderInclude;
export type OrderWithItems = Prisma.OrderGetPayload<{ include: typeof ORDER_WITH_ITEMS_INCLUDE }>;

/** No env injected (hand-built unit harnesses): both shop sections read as off. */
export const SECTIONS_OFF = { SHOPS_ENABLED: "false", PHARMACY_ENABLED: "false" } as const;

/** D-48: the statuses after the rider has the food — when the merchant may close its side. */
export const AFTER_PICKUP_STATUSES: ReadonlySet<string> = new Set(["picked_up", "en_route_dropoff", "delivered", "completed", "undelivered"]);
/** The reasons a venue itself turned the order down (G3a "{v} couldn’t take your order"). */
/** A merchant's reason, or one only the server stamps (U33: N-18's `item_approval_expired`). */
export type StampedRejectionReason = MerchantRejectionReasonCode | LyniaCancelReason;

export const VENUE_DECLINED: ReadonlySet<string> = new Set(["out_of_ingredient", "out_of_stock", "too_busy", "closing_soon", "shop_closed", "ran_out", "kitchen_problem", "other"]);

/** E2 listQueue visibility — see the doc comment on the call site. */
export const QUEUE_VISIBLE_STATUSES = ["requested", "open_for_offers", "assigned", "confirmed", "en_route_pickup"] as const;

/** Sum of `priceUsd * quantity` across lines, exact (integer cents), never float accumulation error. */
/** The pre-pickup statuses a rider holds an order in (assigned → confirmed → en route to the counter). */
export const RIDER_PRE_PICKUP_STATUSES = ["assigned", "confirmed", "en_route_pickup"] as const;

/** LB-1 (E2E 2026-10-05): the CAS filter a pickup-code reveal may rotate under, or null when the order
 *  is in neither reveal window (see `revealPickupCode`). */
export function pickupRevealWhere(
  order: Pick<OrderWithItems, "status" | "merchantPhase" | "riderId" | "pickupCodeHash">,
): Prisma.OrderWhereInput | null {
  if (order.merchantPhase === "ready_for_pickup") return { merchantPhase: "ready_for_pickup" };
  const riderHolds = (RIDER_PRE_PICKUP_STATUSES as readonly string[]).includes(order.status);
  if (riderHolds && order.merchantPhase === null && order.riderId && order.pickupCodeHash) {
    return { status: order.status, riderId: order.riderId, merchantPhase: null, pickupCodeHash: { not: null } };
  }
  return null;
}

/** U11: the D-34 no-rider hold: the food is ready, dispatch stopped after its last round, no rider has it. */
export function noRiderHeld(order: Pick<OrderWithItems, "status" | "merchantPhase" | "noRiderHoldAt" | "riderId">): boolean {
  return order.status === "requested" && order.merchantPhase === "ready_for_pickup" && order.noRiderHoldAt != null && order.riderId == null;
}

/** MJ-RM1: the kitchen phase a cooking order moves to when its food is ready: `ready_for_pickup` while
 *  dispatch is still looking (requested / a live round), null once a rider holds it (the hand-off out of
 *  the merchant-phase machine). Undefined for any other status: nothing to mark ready. */
export function readyPhaseFor(status: string): "ready_for_pickup" | null | undefined {
  if (status === "requested" || status === "open_for_offers") return "ready_for_pickup";
  if ((RIDER_PRE_PICKUP_STATUSES as readonly string[]).includes(status)) return null;
  return undefined;
}

export function lineTotal(priceUsd: Prisma.Decimal | number, quantity: number): number {
  return fromCents(toCents(Number(priceUsd)) * quantity);
}

/** A-O14 (LC-A06): fields `toResponse()` omits from the JSON payload, rather than serializing as an
 *  explicit `null`, whenever they don't apply to the order's current state. */
export const RESPONSE_NULL_OMIT_FIELDS = [
  // #671: the rider-identity block is null on every poll before a rider is assigned — omit it, since
  // the consumer reads it via `??`/truthy (same A-O14 rationale as the handshake/debt fields).
  "rider",
  // #670: the payment-prompt fields are null on every order that never used a pushed prompt (cash
  // orders, manual-reference orders, all pre-#670 orders) — omit rather than send explicit nulls.
  "paymentPromptStatus",
  "paymentPromptRail",
  "paymentPromptRef",
  "paymentPromptSentAt",
  "cashHandshakeAmount",
  "customerCashConfirmedAt",
  "riderCashConfirmedAt",
  "cashHandshakeDeadlineAt",
  "cashHandshakeFrozenAt",
  "merchantCashRule",
  "debtStatus",
  "debtAmount",
  "debtOpenedAt",
  "debtSettledAt",
  "refundReference",
  "refundAmount",
  "refundedAt",
  "deliveredAt",
  "cashDueAt",
  "merchantClosedAt",
  "merchantCloseReason",
  "kitchenConfirmedAt",
  "kitchenConfirmedBy",
  "itemsEditedAt",
  "riderAtDropoffAt",
  "restaurantPhone",
  // Brief 07 (D-97): absent unless the venue turned the order down with a note.
  "venueNote",
  // D-71: absent unless the venue funds this order's delivery.
  "merchantDeliveryShare",
  "customerDeliveryFee",
  // Order flow v2: absent unless the order is scheduled / has a prescription / owes or carries a balance.
  "scheduledFor",
  "ringsAt",
  "scheduleStartedAt",
  "prescription",
  "owedUsd",
  "previousBalanceUsd",
  "amountDueUsd",
] as const satisfies readonly (keyof MerchantOrderResponse)[];

/** Order flow v2 (ledger D-59, backend B): the additive order-read fields (scheduled, Rx, owed balance). Nulls are omitted by the
 *  A-O14 pass in toResponse. Tolerates a row read without the v2 includes (older test fixtures). */
export function orderFlowV2BFields(order: Partial<Pick<OrderWithItems, "merchant" | "schedule" | "prescription" | "owedBalance" | "carriedBalance">>): Partial<MerchantOrderResponse> {
  const rx = order.prescription;
  const carried = addMoney(0, ...(order.carriedBalance ?? []).map((b) => Number(b.amount)));
  const prescription: MerchantOrderPrescriptionView | null = rx
    ? {
        status: rx.status as MerchantOrderPrescriptionView["status"],
        patientName: rx.patientName,
        pageCount: rx.photoKeys.length,
        declineReason: (rx.declineReason as RxDeclineReason | null) ?? null,
        declineNote: rx.declineNote,
        checkedAt: rx.checkedAt?.toISOString() ?? null,
        riderSawOriginalAt: rx.riderSawOriginalAt?.toISOString() ?? null,
      }
    : null;
  return {
    scheduledFor: order.schedule?.scheduledFor.toISOString() ?? null,
    ringsAt: order.schedule?.ringsAt.toISOString() ?? null,
    scheduleStartedAt: order.schedule?.rungAt?.toISOString() ?? null,
    prescription,
    owedUsd: order.owedBalance ? Number(order.owedBalance.amount) : null,
    previousBalanceUsd: carried > 0 ? carried : null,
  };
}

/** Compact one-line rendering of a food basket — "2x Sadza · 1x Chicken" — mirrors
 *  packages/shared summarizeItems' grammar for the generic `itemDesc` column every order carries. */
export function summarizeMerchantItems(items: readonly { name: string; quantity: number }[]): string {
  return items.map((i) => `${i.quantity}x ${i.name}`).join(" · ");
}

/** N-23: true once "now" is at/after the shop's closing time for today, server-local calendar day
 *  (mirrors merchant.service.ts's endOfToday N-14 boundary). No hours set at all reads as "never
 *  auto-closes on hours" — the accept-window/item-approval sweeps still bound an order's lifetime. */
export function isPastClosingTime(hours: Record<string, { open: string; close: string }> | null): boolean {
  if (!hours) return false;
  // Harare wall clock: the API container runs in UTC, the hours are the shop's local times.
  const now = harareWallClock(new Date());
  const dayKey = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][now.getDay()]!;
  const today = hours[dayKey];
  if (!today) return false;
  const [closeH, closeM] = today.close.split(":").map(Number);
  const closeAt = new Date(now);
  closeAt.setHours(closeH ?? 23, closeM ?? 59, 59, 999);
  return now >= closeAt;
}

/** Items subtotal of the lines still on the order (`available !== false`), exact in cents. */
export function keptSubtotalOf(order: Pick<OrderWithItems, "merchantItems">): number {
  return fromCents(order.merchantItems.filter((it) => it.available !== false).reduce((c, it) => c + toCents(Number(it.priceUsd)) * it.quantity, 0));
}

/**
 * Order flow v2 (ledger D-59) additive response fields — the receipt (D1), the venue, the four-step track
 * (BRIEF §4), the out-of-stock preference (§7), the substitution round (§8) and
 * the customer's venue rating (§11). Every key is optional in the contract; an installed app ignores them.
 */
export function orderFlowV2Fields(order: OrderWithItems): Partial<MerchantOrderResponse> {
  const out: Partial<MerchantOrderResponse> = {
    shortId: orderShortId(order.id),
    track: deriveMerchantOrderTrack({ ...order, rxStatus: order.prescription?.status ?? null }),
    outOfStockPref: order.outOfStockPref === "remove" ? "remove" : "ask",
  };
  if (order.merchant?.name) {
    out.venue = { name: order.merchant.name, businessType: order.merchant.businessType, shopKind: order.merchant.shopKind ?? null };
  }
  const kept = keptSubtotalOf(order);
  if (order.merchantItems.length > 0) {
    const goods = merchantGoodsForSubtotal(kept);
    out.itemsSubtotal = goods.itemsSubtotal;
    // The fee actually charged: whatever the goods total carries above the items (a cancelled order's
    // stored total may predate its last change, so derive from the stored goods total when present).
    out.smallOrderFee =
      order.merchantGoodsTotal != null ? Math.max(0, roundToCents(Number(order.merchantGoodsTotal) - kept)) : goods.smallOrderFee;
  }
  const round = order.substitutionRounds?.[0];
  if (round) out.substitution = toSubstitutionRoundView(round, { keptSubtotal: kept });
  if (order.venueRating) {
    out.venueRating = { score: order.venueRating.score, tags: order.venueRating.tags, at: order.venueRating.createdAt.toISOString() };
  }
  return out;
}
