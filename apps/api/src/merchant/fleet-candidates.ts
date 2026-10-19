import { ACTIVE_RIDE_STATUSES, FLEET_DISPATCH, FleetJobOffer, foodOrderMoney } from "@lynia/shared";
import { heartbeatMaxAgeMsForPush } from "../common/broadcast-policy";
import type { Prisma } from "@prisma/client";
import { jobCommission } from "../common/commission-cover";
import { notOwedToOwner, openMerchantObligationOr } from "../common/merchant-debt-lock";
import { penaltiesSuspended } from "../common/penalties";
import { publicWaypoint } from "../orders/waypoints";
import type { PrismaService } from "../prisma/prisma.service";

/**
 * Own bikers (docs/designs/own-bikers.md, ledger D-117): who of an owner's bikers can be rung for a job right now,
 * and whether a business's fleet takes its own app orders. Shared by the "My bikers" rounds (FleetDispatchService)
 * and the fleet-first round of the business's restaurant, shop and pharmacy orders (FoodDispatchService, T9).
 */

/**
 * The owner's bikers who are online (fresh heartbeat at the push cutoff, like every dispatch), in good standing, not
 * on another job, not owing ANOTHER business cash (OV-F3: cash for their own goes back at shift end), and not in
 * `excluded`. Home branch first, then nearest; no fix yet goes last. `radiusM` null = anywhere (a booking: they
 * work for this business wherever they are); a number = within that distance of `point` (an app order, whose food
 * goes cold: the same reach as public bikers, with no slack).
 */
export async function ownBikersFor(
  prisma: PrismaService,
  args: { owner: string; homeMerchantId: string; point: { lat: number; lng: number }; radiusM: number | null; excluded: readonly string[] },
): Promise<Array<{ riderId: string }>> {
  const { owner, homeMerchantId, point, radiusM } = args;
  const excluded = [...new Set(args.excluded)];
  const cutoff = new Date(Date.now() - heartbeatMaxAgeMsForPush());
  const rows = await prisma.$queryRaw<Array<{ profile_id: string }>>`
    SELECT profile_id
    FROM riders
    WHERE fleet_owner_profile_id = ${owner}::uuid
      AND is_online = true
      AND account_status = 'active'
      AND kyc_status = 'verified'
      AND (${penaltiesSuspended()}::boolean OR (on_hold = false AND (cooldown_until IS NULL OR cooldown_until <= now())))
      AND last_heartbeat_at IS NOT NULL
      AND last_heartbeat_at >= ${cutoff}
      AND NOT (profile_id = ANY(${excluded}::uuid[]))
      AND (${radiusM}::double precision IS NULL
           OR (geog IS NOT NULL
               AND ST_DWithin(geog, ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)::geography, ${radiusM}::double precision)))
    ORDER BY (fleet_home_merchant_id = ${homeMerchantId}::uuid) DESC,
             CASE WHEN geog IS NULL THEN NULL
                  ELSE ST_Distance(geog, ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)::geography) END ASC NULLS LAST
    LIMIT ${FLEET_DISPATCH.maxRung}`;
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.profile_id);
  const obligations = openMerchantObligationOr();
  const [busy, owing] = await Promise.all([
    prisma.order.findMany({ where: { riderId: { in: ids }, status: { in: ACTIVE_RIDE_STATUSES } }, select: { riderId: true } }),
    obligations.length > 0
      ? prisma.order.findMany({ where: { riderId: { in: ids }, OR: obligations, AND: [notOwedToOwner(owner)] }, select: { riderId: true } })
      : Promise.resolve([]),
  ]);
  const out = new Set([...busy, ...owing].map((o) => o.riderId));
  return ids.filter((id) => !out.has(id)).map((riderId) => ({ riderId }));
}

/** A business whose owner runs Own bikers: who the owner is, and whether the fleet may take work now. */
export interface BusinessFleet {
  owner: string;
  /** Switched on by LyniaGo (`owner_fleets.enabled`). Paused still counts as on. */
  enabled: boolean;
  /** On and not paused: its bikers may be rung for the business's jobs. */
  active: boolean;
}

/** The fleet of the business `merchantId`'s owner, or null when the owner has none (or the business no owner). */
export async function businessFleet(prisma: PrismaService, merchantId: string | null): Promise<BusinessFleet | null> {
  if (!merchantId) return null;
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: { ownerProfileId: true },
  });
  const owner = merchant?.ownerProfileId ?? null;
  if (!owner) return null;
  const fleet = await prisma.ownerFleet.findUnique({ where: { ownerProfileId: owner }, select: { enabled: true, pausedAt: true } });
  if (!fleet) return null;
  return { owner, enabled: fleet.enabled, active: fleet.enabled && fleet.pausedAt == null };
}

/**
 * OV5 (owner D7): what LyniaGo bills the business for one of its app orders carried by its own biker, snapshotted
 * on the order at assignment: the configured commission rate × the order's delivery fee (what a public biker would
 * have paid). A phone booking is billed the owner's flat ride fee instead.
 */
export function marketplaceFleetFee(deliveryFee: Prisma.Decimal | number | null): number {
  return jobCommission({ orderType: "merchant", deliveryFee });
}

/**
 * T9: one of the business's own app orders as an Own biker's job offer (the fleet board's card, OB-R4/R5), the same
 * shape as a booking's. `collect` is what the biker takes from the customer on a cash order: everything they pay,
 * the delivery fee included, since it all goes back to the shop (OV-F5). Null on a wallet order.
 */
export function appFleetOffer(
  order: {
    id: string;
    pickup: Prisma.JsonValue;
    dropoff: Prisma.JsonValue;
    itemDesc: string;
    merchantGoodsTotal: Prisma.Decimal | null;
    deliveryFee: Prisma.Decimal | null;
    merchantDeliveryShare?: Prisma.Decimal | null;
    merchantPaymentMethod?: string | null;
    distanceKm: Prisma.Decimal | number | null;
  },
  shop: string,
  expiresAt: Date,
): FleetJobOffer {
  const cash = order.merchantPaymentMethod === "cash";
  const money = foodOrderMoney({ goodsTotal: order.merchantGoodsTotal, deliveryFee: order.deliveryFee, merchantDeliveryShare: order.merchantDeliveryShare });
  return FleetJobOffer.parse({
    orderId: order.id,
    shop,
    pickup: publicWaypoint(order.pickup),
    dropoff: publicWaypoint(order.dropoff),
    itemsSummary: order.itemDesc,
    collect: cash ? money.customerTotal.toFixed(2) : null,
    distanceKm: order.distanceKm != null ? Number(order.distanceKm) : null,
    expiresAt: expiresAt.toISOString(),
    kind: "app",
  });
}
