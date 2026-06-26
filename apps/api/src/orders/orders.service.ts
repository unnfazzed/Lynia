import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { type CreateOrderRequest, quoteFare } from "@lynia/shared";
import { OfferExpiryService } from "../matching/offer-expiry.service";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly expiry: OfferExpiryService,
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

    return {
      id: order.id,
      status: order.status,
      proposedFare: order.proposedFare.toString(),
      suggestedFare: order.suggestedFare.toString(),
      distanceKm: order.distanceKm,
    };
  }

  /**
   * Order snapshot — the REST source of truth the tracking client reads on (re)connect (ET4),
   * carrying status, last rider position, and the append-only event timeline.
   */
  async getSnapshot(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        agreedFare: true,
        proposedFare: true,
        rider: {
          select: { profileId: true, currentLat: true, currentLng: true, updatedAt: true },
        },
        events: {
          select: { status: true, lat: true, lng: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!order) throw new NotFoundException("Order not found");
    return order;
  }
}
