import { Injectable } from "@nestjs/common";
import { ACTIVE_RIDE_STATUSES } from "@lynia/shared";
import { PrismaService } from "../prisma/prisma.service";

export interface NearbyRider {
  profileId: string;
  distanceM: number;
}

const ACTIVE = ACTIVE_RIDE_STATUSES as string[];

@Injectable()
export class TrackingService {
  constructor(private readonly prisma: PrismaService) {}

  /** Customer who created the order, or its assigned rider, may watch it. */
  async canAccessOrder(userId: string, orderId: string): Promise<boolean> {
    const o = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { customerId: true, riderId: true },
    });
    return !!o && (o.customerId === userId || o.riderId === userId);
  }

  /** Only the assigned rider on an active ride may stream position for an order. */
  async isAssignedRider(userId: string, orderId: string): Promise<boolean> {
    const o = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { riderId: true, status: true },
    });
    return !!o && o.riderId === userId && ACTIVE.includes(o.status);
  }

  /** Persist the rider's position so a reconnecting client's REST snapshot (ET4) is fresh. */
  async updateRiderLocation(riderId: string, lat: number, lng: number): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE riders
      SET current_lat = ${lat},
          current_lng = ${lng},
          geog = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
          last_heartbeat_at = now(),
          updated_at = now()
      WHERE profile_id = ${riderId}::uuid`;
  }

  /** Nearby online riders for a broadcast (ET6 — ST_DWithin uses the GiST geog index). */
  async nearbyRiders(lat: number, lng: number, radiusM: number): Promise<NearbyRider[]> {
    const rows = await this.prisma.$queryRaw<Array<{ profile_id: string; distance_m: number }>>`
      SELECT profile_id,
             ST_Distance(geog, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography) AS distance_m
      FROM riders
      WHERE is_online = true
        AND geog IS NOT NULL
        AND ST_DWithin(geog, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${radiusM})
      ORDER BY distance_m ASC
      LIMIT 50`;
    return rows.map((r) => ({ profileId: r.profile_id, distanceM: Number(r.distance_m) }));
  }
}
