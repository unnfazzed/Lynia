import type { Prisma } from "@prisma/client";
import type { PrismaService } from "../prisma/prisma.service";

type Db = PrismaService | Prisma.TransactionClient;

/**
 * Own bikers (docs/designs/own-bikers.md "Commission and billing", ledger D-117, CEO C1), T5: the business's
 * fleet bill. A ride an Own biker made for their business is written to `merchant_fleet_ledger` INSIDE the
 * transaction that ends the order, at the fee snapshotted on the order (`fleet_fee`), so a bill can never miss a
 * ride or count one twice:
 *  - completed, or reported undelivered (the ride happened): billed;
 *  - cancelled after pickup: billed (the biker carried it);
 *  - cancelled before pickup, converted to Any biker (the tag is gone), or carried by a public biker: never.
 *
 * Idempotent on the order: the partial unique index on `order_id` for non-adjustment rows (migration 0108) makes
 * a second write a no-op (ON CONFLICT DO NOTHING), so an undelivered order later adjudicated delivered, or the
 * reconciliation catching up, never bills twice. Lives in `common/` because the order lifecycle and the admin
 * console both end orders and neither may import the merchant module.
 */

/**
 * Statuses at which a fleet ride is billed (with `cancelled` only once the biker had collected it). Not
 * `delivered`: a delivered ride is billed when it completes (rated, or auto-closed within hours), the same
 * transaction that settles the biker's side.
 */
export const FLEET_BILLABLE_STATUSES = ["completed", "undelivered"] as const;

/** Write the ride's ledger row when the order is a billable fleet ride. Returns whether a row was written. */
export async function recordFleetRide(db: Db, orderId: string): Promise<boolean> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      status: true,
      riderId: true,
      orderType: true,
      collectedAt: true,
      fleetMerchantId: true,
      fleetFee: true,
      fleetMerchant: { select: { ownerProfileId: true } },
    },
  });
  if (!order?.fleetMerchantId || order.fleetFee == null || !order.riderId || !order.fleetMerchant?.ownerProfileId) return false;
  const billable =
    (FLEET_BILLABLE_STATUSES as readonly string[]).includes(order.status) || (order.status === "cancelled" && order.collectedAt != null);
  if (!billable) return false;
  const written = await db.merchantFleetLedger.createMany({
    data: [
      {
        ownerProfileId: order.fleetMerchant.ownerProfileId,
        merchantId: order.fleetMerchantId,
        orderId,
        riderId: order.riderId,
        // A phone booking bills the commission rate × its suggested fare; the business's own app order bills the rate
        // × its delivery fee (OV5). Both are what was snapshotted into `fleet_fee` when the job became a fleet job.
        kind: order.orderType === "merchant" ? "marketplace" : "booking",
        fee: order.fleetFee,
      },
    ],
    skipDuplicates: true,
  });
  return written.count > 0;
}
