import type { Prisma } from "@prisma/client";
import type { PrismaService } from "../prisma/prisma.service";

/**
 * C4 soft-lock: a rider who owes a merchant a collect-and-return cash debt (R-01), or is mid-doorstep
 * handshake awaiting their own confirm (R-04/R-05, including a frozen dispute), takes no new offers —
 * food or parcel — until it's settled (N-20). Lives in `common/` (neither `merchant/` nor
 * `matching|offers|orders/`) for the same reason as {@link ../merchant/food-dispatch-lock}
 * `hasLiveFoodDispatchOffer`: BOTH sides need to import it without tripping the
 * `express-no-merchant-coupling` depcruise rule, which only ever points at this neutral file, never
 * at merchant code itself.
 *
 * One query covers both cases: `debtStatus="open"` (settled by the merchant's returned-cash/goods
 * confirm or a non-return write-off — merchant/food-debt.service.ts) OR a handshake that has started
 * but the rider hasn't confirmed yet (`customerCashConfirmedAt` set, `riderCashConfirmedAt` still
 * null) — frozen is a marked sub-case of the same condition, so it needs no separate check.
 */
export async function hasOpenMerchantObligation(prisma: PrismaService | Prisma.TransactionClient, riderId: string): Promise<boolean> {
  const stuck = await prisma.order.findFirst({
    where: {
      riderId,
      orderType: "merchant",
      OR: [{ debtStatus: "open" }, { customerCashConfirmedAt: { not: null }, riderCashConfirmedAt: null }],
    },
    select: { id: true },
  });
  return stuck !== null;
}
