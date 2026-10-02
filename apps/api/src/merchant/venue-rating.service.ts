import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { RateVenueRequest, VenueRatingView } from "@lynia/shared";
import { RATE_LATE_WINDOW_MS } from "../orders/order-lifecycle.constants";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Order flow v2 venue rating (BRIEF §11, handoff D1/D1b; ledger D-59): "How was {venue}?" — stars + quick
 * tags, the first row of the done screen's rating card. The rider row stays `POST /orders/:id/rate`
 * (which also completes the order); this one never changes the order's status.
 *
 *  - Only the customer, only once the order was delivered (status delivered/completed), and within the
 *    same 7-day window the late rider rating uses (RATE_LATE_WINDOW_MS).
 *  - Idempotent: one row per order (`venue_ratings.order_id` unique). A repeat — a retry, or the older
 *    `RateRequest.foodScore` path having rated it first — returns the rating that stands.
 *  - The venue's star rating (`merchants.food_rating_avg/count`, served as `ratingAvg`/`ratingCount` on
 *    the restaurant/shop list) moves only on the write that created the row, so the two paths can never
 *    double-count (see {@link recordVenueRating}).
 *  - "Undo" (D1b) is the client's: like the rider rating, the app holds the send for its undo window.
 */
@Injectable()
export class VenueRatingService {
  constructor(private readonly prisma: PrismaService) {}

  async rate(orderId: string, customerId: string, body: RateVenueRequest): Promise<VenueRatingView> {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: { customerId: true, orderType: true, merchantId: true, status: true, deliveredAt: true, completedAt: true },
      });
      if (!order || order.orderType !== "merchant") throw new NotFoundException("Order not found");
      if (order.customerId !== customerId) throw new ForbiddenException("Not your order");
      if (order.status !== "delivered" && order.status !== "completed") {
        throw new ConflictException({ reason: "not_delivered", message: "You can rate the order once it's delivered." });
      }
      const existing = await tx.venueRating.findUnique({ where: { orderId } });
      if (existing) return toView(existing);
      const deliveredAt = order.deliveredAt ?? order.completedAt;
      if (deliveredAt && Date.now() - deliveredAt.getTime() > RATE_LATE_WINDOW_MS) {
        throw new ConflictException({ reason: "too_late", message: "It's too late to rate this order." });
      }
      await recordVenueRating(tx, { orderId, merchantId: order.merchantId!, customerId, score: body.score, tags: body.tags ?? [] });
      const row = await tx.venueRating.findUnique({ where: { orderId } });
      return toView(row!);
    });
  }
}

function toView(r: { score: number; tags: string[]; createdAt: Date }): VenueRatingView {
  return { score: r.score, tags: r.tags, at: r.createdAt.toISOString() };
}

/**
 * The one writer of a venue rating + its aggregate, inside the caller's transaction. `ON CONFLICT DO
 * NOTHING` (createMany skipDuplicates) instead of catching a unique violation — a violation would abort
 * the surrounding Postgres transaction. The aggregate update is a single atomic UPDATE (no read-modify-
 * write race between two venues' raters). Returns whether this call created the rating.
 */
export async function recordVenueRating(
  tx: Prisma.TransactionClient,
  r: { orderId: string; merchantId: string; customerId: string; score: number; tags: readonly string[] },
): Promise<boolean> {
  const { count } = await tx.venueRating.createMany({
    data: [{ orderId: r.orderId, merchantId: r.merchantId, customerId: r.customerId, score: r.score, tags: [...r.tags] }],
    skipDuplicates: true,
  });
  if (count === 0) return false;
  await tx.$executeRaw`UPDATE merchants SET food_rating_avg = (food_rating_avg * food_rating_count + ${r.score}) / (food_rating_count + 1), food_rating_count = food_rating_count + 1 WHERE id = ${r.merchantId}::uuid`;
  return true;
}
