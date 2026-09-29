import { NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { TrackingGateway } from "../tracking/tracking.gateway";
import { resolveMerchantAccess } from "./merchant-access";

/** Shared by every merchant-facing service (`FoodOrderService`, `FoodDispatchService`,
 *  `FoodDebtService`, `MerchantService`) to resolve the business the calling profile works at — from
 *  `merchant_members` via {@link resolveMerchantAccess}, the one resolver MerchantGuard also uses (plan
 *  2026-09-29 D2). Staff and owners both resolve; owner-only routes are gated by `@OwnerOnly()`. */
export async function resolveOwnMerchantId(prisma: PrismaService, profileId: string): Promise<string> {
  const access = await resolveMerchantAccess(prisma, profileId);
  if (!access) throw new NotFoundException("Merchant not found");
  return access.merchantId;
}

/** The customer-facing visibility rule, in one place: an ops-switched-on (`pilotEnabled`) RESTAURANT.
 *  Shops never appear in restaurant reads or take food orders (plan 2026-09-29 D8), even if a row were
 *  switched on by hand — the admin go-live switch refuses shops in the first place. */
export const CUSTOMER_VISIBLE_RESTAURANT = { pilotEnabled: true, businessType: "restaurant" } as const;

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
