import { NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { TrackingGateway } from "../tracking/tracking.gateway";

/** Shared by every merchant-facing service (`FoodOrderService`, `FoodDispatchService`,
 *  `FoodDebtService`, `MerchantService`) to resolve the calling profile's own merchant row —
 *  previously four byte-identical copies of this lookup. */
export async function resolveOwnMerchantId(prisma: PrismaService, profileId: string): Promise<string> {
  const merchant = await prisma.merchant.findUnique({ where: { ownerProfileId: profileId }, select: { id: true } });
  if (!merchant) throw new NotFoundException("Merchant not found");
  return merchant.id;
}

/** Shared by `FoodOrderService` and `FoodDispatchService` — pushes the kitchen-queue-changed socket
 *  event, best-effort (never load-bearing for the mutation that already committed). */
export function notifyFoodQueueChanged(gateway: TrackingGateway, merchantId: string | null | undefined, orderId: string): void {
  if (merchantId) gateway.emitFoodQueueChanged(merchantId, orderId);
}

/** Shared by `FoodOrderService` and `MerchantService` — a dish is out of stock exactly while its
 *  `outOfStockUntil` timestamp is set and still in the future. */
export function isDishOutOfStock(dish: { outOfStockUntil: Date | null }): boolean {
  return !!dish.outOfStockUntil && dish.outOfStockUntil > new Date();
}
