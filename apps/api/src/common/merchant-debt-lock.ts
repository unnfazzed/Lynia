import type { Prisma } from "@prisma/client";
import type { PrismaService } from "../prisma/prisma.service";
import { penaltiesSuspended } from "./penalties";

/**
 * C4 soft-lock: a rider who owes a merchant a collect-and-return cash debt (R-01), or is mid-doorstep
 * handshake awaiting their own confirm (R-04/R-05, including a frozen dispute), takes no new offers —
 * food or parcel — until it's settled (N-20). Lives in `common/` (neither `merchant/` nor
 * `matching|offers|orders/`) because BOTH sides need to import it without tripping the
 * `express-no-merchant-coupling` depcruise rule, which only ever points at this neutral file, never
 * at merchant code itself.
 *
 * One query covers both cases: `debtStatus="open"` (settled by the merchant's returned-cash/goods
 * confirm or a non-return write-off — merchant/food-debt.service.ts — and released when the merchant
 * closes its side with nothing owed, `merchantClosedAt` set: D-48 "No cash on this one" / "Mark ride
 * completed") OR a handshake that has started
 * but the rider hasn't confirmed yet (`customerCashConfirmedAt` set, `riderCashConfirmedAt` still
 * null) — frozen is a marked sub-case of the same condition, so it needs no separate check.
 */
/** The orders that hold a rider back (one query's OR arms, shared by the single and the batched read). */
export const OPEN_MERCHANT_OBLIGATION_OR: Prisma.OrderWhereInput[] = [
  { orderType: "merchant", debtStatus: "open", merchantClosedAt: null },
  // D5 review (item 3c): only on a live ride — the customer may now confirm on the way, and a
  // cancelled / undelivered order's leftover confirm must never keep the rider off new jobs.
  { orderType: "merchant", status: { in: ["picked_up", "en_route_dropoff"] }, customerCashConfirmedAt: { not: null }, riderCashConfirmedAt: null },
  // D-48 PR 4b: a shop booking's cash on delivery the rider still owes back.
  { orderType: "parcel", debtStatus: "open", merchantClosedAt: null },
];

/** The OR arms to apply right now — none while penalties are suspended (common/penalties.ts). */
export function openMerchantObligationOr(): Prisma.OrderWhereInput[] {
  return penaltiesSuspended() ? [] : OPEN_MERCHANT_OBLIGATION_OR;
}

export async function hasOpenMerchantObligation(prisma: PrismaService | Prisma.TransactionClient, riderId: string): Promise<boolean> {
  // Penalty suspension: the job lock blocks nothing; the debt itself is still tracked and settled.
  if (penaltiesSuspended()) return false;
  const stuck = await prisma.order.findFirst({
    where: { riderId, OR: OPEN_MERCHANT_OBLIGATION_OR },
    select: { id: true },
  });
  return stuck !== null;
}
