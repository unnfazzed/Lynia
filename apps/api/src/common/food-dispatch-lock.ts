import type { Prisma } from "@prisma/client";
import type { PrismaService } from "../prisma/prisma.service";

/**
 * C3 soft-lock: a rider currently holding a live single-rider food auto-offer (N-08, 60s countdown)
 * can't accept a parcel bid elsewhere — the kitchen's prep clock and the auto-dispatch cap both
 * assume the offered rider is deciding, not juggling two jobs. Lives in `common/` (neither
 * `merchant/` nor `matching|offers|orders/`) so BOTH sides can import it without tripping the
 * `express-no-merchant-coupling` depcruise rule (Express modules may depend on `common`, and so may
 * `merchant/food-dispatch.service.ts` — the coupling only ever points at this neutral file, never at
 * merchant code itself).
 *
 * A live offer is fully described by `dispatchOfferedRiderId` + `dispatchOfferExpiresAt` — both are
 * cleared together on accept/decline/expire (food-dispatch.service.ts), so an unexpired pair is
 * always exactly "this rider has an outstanding offer right now", no extra status/orderType filter
 * needed for correctness (kept anyway, cheap and self-documenting).
 */
export async function hasLiveFoodDispatchOffer(
  prisma: PrismaService | Prisma.TransactionClient,
  riderId: string,
): Promise<boolean> {
  const live = await prisma.order.findFirst({
    where: {
      dispatchOfferedRiderId: riderId,
      dispatchOfferExpiresAt: { gt: new Date() },
      orderType: "merchant",
      status: "open_for_offers",
    },
    select: { id: true },
  });
  return live !== null;
}
