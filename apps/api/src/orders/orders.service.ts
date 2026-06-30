import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { ACTIVE_RIDE_STATUSES, type CreateOrderRequest, PHONE_REVEAL_STATUSES, quoteFare, type Waypoint } from "@lynia/shared";
import { OfferExpiryService } from "../matching/offer-expiry.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { TrackingService } from "../tracking/tracking.service";

const REVEAL = new Set<string>(PHONE_REVEAL_STATUSES);

/** Radius (metres) for the new-order push to nearby online riders (CONCEPT §3.10). Harare-corridor
 *  scale; the REST nearby endpoint defaults to the same neighbourhood. */
const BROADCAST_RADIUS_M = 5000;

/** Strip a stored Waypoint down to what a browsing rider may see — point + landmark, no contactPhone. */
function publicWaypoint(w: Prisma.JsonValue): { point: unknown; landmark: unknown } {
  const o = (w ?? {}) as { point?: unknown; landmark?: unknown };
  return { point: o.point ?? null, landmark: o.landmark ?? null };
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly expiry: OfferExpiryService,
    private readonly tracking: TrackingService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Customer creates a delivery and broadcasts it: it opens for offers immediately. */
  async create(input: CreateOrderRequest, customerId: string) {
    // Distance-based anchor the customer sees alongside their own proposal (CONCEPT §1).
    const { distanceKm, suggestedFare } = quoteFare(input.pickup.point, input.dropoff.point);

    const order = await this.prisma.order.create({
      data: {
        customerId,
        orderType: "parcel",
        pickup: input.pickup as unknown as Prisma.InputJsonValue,
        dropoff: input.dropoff as unknown as Prisma.InputJsonValue,
        itemDesc: input.itemDescription,
        note: input.note ?? null,
        itemPhotoUrl: input.itemPhotoUrl ?? null,
        declaredValue: input.declaredValue,
        distanceKm,
        suggestedFare,
        proposedFare: input.proposedFare,
        status: "open_for_offers",
        events: { create: { status: "open_for_offers" } },
      },
      select: { id: true, status: true, proposedFare: true, suggestedFare: true, distanceKm: true },
    });

    // Server-side window expiry (ET1). No-op if Redis isn't configured.
    await this.expiry.schedule(order.id);

    // Post-commit, best-effort: push the broadcast to nearby online riders (CONCEPT §3.10 — push is
    // the primary new-order channel for riders, alongside the WS board). Never blocks the create.
    void this.broadcastToNearbyRiders(order.id, input.pickup, order.proposedFare.toString());

    return {
      id: order.id,
      status: order.status,
      proposedFare: order.proposedFare.toString(),
      suggestedFare: order.suggestedFare.toString(),
      distanceKm: order.distanceKm,
    };
  }

  /**
   * Resolve the online riders within {@link BROADCAST_RADIUS_M} of the pickup (PostGIS ST_DWithin, ET6)
   * and push them the new order. Fully best-effort: any failure here — no nearby riders, a geo-query
   * error, a push outage — is swallowed so it can never affect the order the customer just created.
   */
  private async broadcastToNearbyRiders(orderId: string, pickup: Waypoint, fare: string): Promise<void> {
    try {
      const nearby = await this.tracking.nearbyRiders(pickup.point.lat, pickup.point.lng, BROADCAST_RADIUS_M);
      if (nearby.length === 0) return;
      await this.notifications.notifyNewBroadcast(
        orderId,
        nearby.map((r) => r.profileId),
        { pickup: pickup.landmark, fare },
      );
    } catch {
      /* best-effort: a broadcast-push failure never affects the created order */
    }
  }

  /** Open orders a rider can bid on. The rider app sorts/filters by distance (haversine) client-side. */
  async listOpen() {
    const orders = await this.prisma.order.findMany({
      where: { status: "open_for_offers" },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        pickup: true,
        dropoff: true,
        itemDesc: true,
        suggestedFare: true,
        proposedFare: true,
        distanceKm: true,
        createdAt: true,
      },
    });
    return orders.map((o) => ({
      id: o.id,
      // Redact contactPhone — a pre-assignment rider has no business with the customer's/recipient's
      // phone. That's exactly what the OTP-gated §5d reveal window (getSnapshot) controls.
      pickup: publicWaypoint(o.pickup),
      dropoff: publicWaypoint(o.dropoff),
      itemDesc: o.itemDesc,
      suggestedFare: o.suggestedFare.toString(),
      proposedFare: o.proposedFare.toString(),
      distanceKm: o.distanceKm,
      createdAt: o.createdAt.toISOString(),
    }));
  }

  /** The rider's current active job (assigned through en_route_dropoff), or null — so they can find
   *  and drive it after assignment or an app restart. Returns the same snapshot shape as getSnapshot. */
  async activeForRider(riderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { riderId, status: { in: ACTIVE_RIDE_STATUSES } },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    });
    if (!order) return null;
    return this.getSnapshot(order.id, riderId);
  }

  /** A caller's order history across both roles (any order where they're the customer or the rider),
   *  newest first — feeds the trip-history screen. Redacts contactPhone like listOpen and never carries
   *  a counterparty phone; only the counterparty's display name + the rating on the order. */
  async historyForUser(userId: string) {
    const orders = await this.prisma.order.findMany({
      where: { OR: [{ customerId: userId }, { riderId: userId }] },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        customerId: true,
        riderId: true,
        pickup: true,
        dropoff: true,
        itemDesc: true,
        proposedFare: true,
        agreedFare: true,
        status: true,
        createdAt: true,
        rating: { select: { score: true, comment: true } },
        customer: { select: { firstName: true, lastName: true } },
        rider: { select: { profile: { select: { firstName: true, lastName: true } } } },
      },
    });
    return orders.map((o) => {
      const isCustomer = o.customerId === userId;
      const counterparty = isCustomer ? o.rider?.profile : o.customer;
      const counterpartyName = counterparty ? `${counterparty.firstName} ${counterparty.lastName}`.trim() || null : null;
      return {
        id: o.id,
        role: isCustomer ? "customer" : "rider",
        pickup: publicWaypoint(o.pickup),
        dropoff: publicWaypoint(o.dropoff),
        itemDesc: o.itemDesc,
        proposedFare: o.proposedFare.toString(),
        agreedFare: o.agreedFare ? o.agreedFare.toString() : null,
        status: o.status,
        createdAt: o.createdAt.toISOString(),
        rating: o.rating ? { score: o.rating.score, comment: o.rating.comment } : null,
        counterpartyName,
      };
    });
  }

  /**
   * Order snapshot — the REST source of truth the tracking client reads on (re)connect (ET4),
   * carrying status, last rider position, and the append-only event timeline. The counterparty's
   * real phone is revealed only to a party on the order and only inside the reveal window (§5d).
   */
  async getSnapshot(orderId: string, callerId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        agreedFare: true,
        proposedFare: true,
        customerId: true,
        riderId: true,
        pickup: true,
        dropoff: true,
        customer: { select: { phone: true } },
        rider: {
          select: {
            profileId: true,
            currentLat: true,
            currentLng: true,
            updatedAt: true,
            profile: { select: { phone: true } },
          },
        },
        events: {
          select: { status: true, lat: true, lng: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!order) throw new NotFoundException("Order not found");

    const isCustomer = order.customerId === callerId;
    const isRider = order.riderId === callerId;
    const revealed = REVEAL.has(order.status);
    // Only a party on the order, only during the active window, sees the other side's phone.
    let counterpartyPhone: string | null = null;
    if (revealed && isCustomer) counterpartyPhone = order.rider?.profile.phone ?? null;
    else if (revealed && isRider) counterpartyPhone = order.customer.phone;

    return {
      id: order.id,
      status: order.status,
      agreedFare: order.agreedFare,
      proposedFare: order.proposedFare,
      // Map context for the tracker — point + landmark only; contactPhone stays redacted (it's gated
      // separately by `counterpartyPhone` and the reveal window).
      pickup: publicWaypoint(order.pickup),
      dropoff: publicWaypoint(order.dropoff),
      rider: order.rider
        ? {
            profileId: order.rider.profileId,
            currentLat: order.rider.currentLat,
            currentLng: order.rider.currentLng,
            updatedAt: order.rider.updatedAt,
          }
        : null,
      events: order.events,
      counterpartyPhone,
    };
  }
}
