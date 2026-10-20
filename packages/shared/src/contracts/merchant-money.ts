/**
 * Contracts: merchant money (C4 evidence layer, E3 statement and day summary, KPIs). Re-exported by
 * ../contracts.ts (the front door).
 */
import { z } from "zod";
import { MerchantPaymentMethod } from "./food-order";
import { MerchantRejectionReasonCode } from "./order-flow-v2";

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
    /**
     * Own bikers (D-117, E7): the branch's fleet rides this week and the owner's fleet bills, in the same
     * statement area. Absent for a business without Own bikers (and on older servers). Inlined, as the Own
     * bikers schemas are declared further down this file.
     */
    fleet: z
      .object({
        rides: z.object({ weekStart: z.string(), weekEnd: z.string(), rides: z.number().int(), total: z.string() }),
        unpaid: z.string(),
        overdueBills: z.number().int(),
      })
      .strict()
      .optional(),
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
    /** MJ-RM7: the day as a Harare calendar date, `YYYY-MM-DD` — what a client keys and labels the day by
     *  (`date` is the instant Harare's day starts, which a browser in another zone reads as the day before).
     *  Additive: an older API omits it. */
    dateKey: z.string().optional(),
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
          /** Merchant v2 T2 (D-77): the rider's number, for the late-cash card's Call button. */
          riderPhone: z.string().optional(),
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
          /** Merchant v2 T2 (D-77), delivered orders: the cash is back in, on its way, late, or none comes back. */
          cash: z.enum(["in", "due", "late", "none"]).optional(),
          /** Merchant v2 follow-ups T2 (D-77): when cash still owed is due back ("back by 13:05"). */
          dueAt: z.string().optional(),
          /** Merchant v2 follow-ups T2 (D-77), rejected rows: why ("You couldn't take it · Too busy"), or
           *  `shop_closed` / `kitchen_unconfirmed` for one nobody answered ("Missed · no answer in time"). */
          reason: MerchantRejectionReasonCode.optional(),
          amount: z.number(),
        }),
      )
      .optional(),
  })
  .strict();
export type MerchantEndOfDaySummaryResponse = z.infer<typeof MerchantEndOfDaySummaryResponse>;

/** `GET /merchant/summary/today?fields=kpis` — MJ-RL27: the Orders top card's strip (Orders · Sales · Cash
 *  due), refreshed every half minute, without the Money screen's `lines` and `overdue` rows. Every field
 *  means what it does in {@link MerchantEndOfDaySummaryResponse} and is a subset of it, so a client that
 *  asks an older API (which ignores `fields`) and gets the full summary reads it the same way. */
export const MerchantTodayKpisResponse = z
  .object({
    date: z.string(),
    dateKey: z.string().optional(),
    orders: z.number().int(),
    sales: z.number(),
    cashDue: z.number(),
    cashOverdue: z.number(),
  })
  .strict();
export type MerchantTodayKpisResponse = z.infer<typeof MerchantTodayKpisResponse>;

/** `GET /merchant/summary/week` — Merchant v2 follow-ups T2b (D-77): this locale week (Monday to today,
 *  server-local days, the same boundary as the Today summary), one row per day so far, oldest first. */
export const MerchantWeekSummaryResponse = z
  .object({
    /** Monday 00:00 of this week (Harare). */
    start: z.string(),
    /** MJ-RM7: that Monday as a Harare calendar date, `YYYY-MM-DD` — what a client derives the week's bars
     *  and range from (never from `start` with local getters). Additive: an older API omits it. */
    startKey: z.string().optional(),
    orders: z.number().int(),
    sales: z.number(),
    days: z.array(
      z.object({
        /** The day, `YYYY-MM-DD` (a Harare date, MJ-RM7) — what `GET /merchant/summary/today?date=` takes. */
        date: z.string(),
        orders: z.number().int(),
        sales: z.number(),
        /** Cash riders owe back from that day's orders and are past their due time. */
        cashLate: z.number(),
        /** Cash still on its way back, not yet late. */
        cashDue: z.number(),
        /** Orders the business never took (turned down or missed). */
        rejected: z.number().int(),
      }),
    ),
  })
  .strict();
export type MerchantWeekSummaryResponse = z.infer<typeof MerchantWeekSummaryResponse>;
