import { NotFoundException } from "@nestjs/common";
import type { ShopService } from "@lynia/shared";
import type { Prisma } from "@prisma/client";
import type { Env } from "../config/env";
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
 *  Shops never appear in restaurant reads or take food orders (plan 2026-09-29 D8), even when switched
 *  on: they are listed by their own rule, {@link customerVisibleShop}. */
export const CUSTOMER_VISIBLE_RESTAURANT = { pilotEnabled: true, businessType: "restaurant" } as const;

/** The customer-facing visibility rule for shops (ledger D-58): ops-switched-on (`pilotEnabled`, the
 *  same go-live switch restaurants use) SHOPS, narrowed to the sections that are switched on. Pharmacy
 *  is the `pharmacy` kind; Shops is every other kind. `service` narrows to one section. */
export function customerVisibleShop(env: Pick<Env, "SHOPS_ENABLED" | "PHARMACY_ENABLED">, service?: ShopService): Prisma.MerchantWhereInput {
  const shops = env.SHOPS_ENABLED === "true" && service !== "pharmacy";
  const pharmacy = env.PHARMACY_ENABLED === "true" && service !== "shops";
  const base = { pilotEnabled: true, businessType: "shop" as const };
  if (shops && pharmacy) return { ...base, shopKind: { not: null } };
  if (shops) return { ...base, shopKind: { not: "pharmacy" } };
  if (pharmacy) return { ...base, shopKind: "pharmacy" };
  // Neither section is on: match nothing (the controller answers 503 before this; a backstop).
  return { ...base, shopKind: { in: [] } };
}

/** Is this section switched on? (`service` omitted: is either?) */
export function shopServiceEnabled(env: Pick<Env, "SHOPS_ENABLED" | "PHARMACY_ENABLED">, service?: ShopService): boolean {
  if (service === "shops") return env.SHOPS_ENABLED === "true";
  if (service === "pharmacy") return env.PHARMACY_ENABLED === "true";
  return env.SHOPS_ENABLED === "true" || env.PHARMACY_ENABLED === "true";
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
