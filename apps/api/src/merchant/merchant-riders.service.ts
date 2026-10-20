import { GoneException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  MERCHANT_PREFERRED_RIDER_CAP,
  type MerchantPreferredRiderResponse,
  type MerchantRiderStatus,
  type MerchantRidersResponse,
} from "@lynia/shared";
import { maskPhone } from "../common/phone-mask";
import { PrismaService } from "../prisma/prisma.service";
import { findBookingAccountId } from "./booking-account";
import type { MerchantAccess } from "./merchant-access";

/** What a request to add a preferred biker is told now that Preferred riders is gone. */
export const PREFERRED_GONE = "Preferred riders is gone. Invite your own bikers from Own bikers.";
/** D-48 E4: a rider reads Online only while their app still heartbeats (matching's own TTL is 60s;
 *  this allows a couple of missed beats on a slow network). */
const ONLINE_FRESH_MS = 3 * 60_000;
/** The audit actions this list wrote (adds stopped when Preferred riders was retired); admin's audit log still reads both. */
export const RIDER_ADD_ACTION = "merchant.rider.add";
export const RIDER_REMOVE_ACTION = "merchant.rider.remove";

const PERSON_SELECT = {
  id: true,
  phone: true,
  firstName: true,
  lastName: true,
  photoUrl: true,
  onHold: true,
  rider: { select: { kycStatus: true, accountStatus: true, onHold: true, isOnline: true, lastHeartbeatAt: true } },
  merchantMemberships: { select: { merchantId: true } },
} satisfies Prisma.ProfileSelect;
type Person = Prisma.ProfileGetPayload<{ select: typeof PERSON_SELECT }>;

interface JobStats {
  jobs: number;
  ratingAvg: number | null;
}

/**
 * What a business may learn about a number it added (design doc L3): whether it's an approved LyniaGo
 * rider who can take jobs, one who can't right now (suspended, banned, held, or on this business's own
 * team), or not a rider yet. Never why.
 */
export function riderStatusOf(person: Person | undefined, merchantId: string): MerchantRiderStatus {
  const rider = person?.rider;
  if (!person || !rider || rider.kycStatus !== "verified") return "not_on_lyniago";
  if (rider.accountStatus !== "active" || rider.onHold || person.onHold) return "unavailable";
  if (person.merchantMemberships.some((m) => m.merchantId === merchantId)) return "unavailable";
  return "on_lyniago";
}

/** D-48 E4's Online / Offline pill: only for a rider who can take jobs, never a reason. */
export function riderOnline(person: Person | undefined, status: MerchantRiderStatus, now = Date.now()): boolean {
  const rider = person?.rider;
  if (status !== "on_lyniago" || !rider?.isOnline || !rider.lastHeartbeatAt) return false;
  return now - rider.lastHeartbeatAt.getTime() < ONLINE_FRESH_MS;
}

/**
 * Your riders (merchant web upgrade L3, plan D10): a business's own riders, kept by the phone number each
 * signs in to LyniaGo with, under the business's own label. The whole team sees the list; only the owner
 * adds or removes (the controller's @OwnerOnly).
 *
 * The list is built so it can't be used to look people up (CEO-8): at most 20 numbers, at most 10 adds a
 * day, every add and removal audit-logged, the number masked, three statuses with no reason, and the
 * rider's own name and photo only once they have done a job for this business.
 */
@Injectable()
export class MerchantRidersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(access: MerchantAccess): Promise<MerchantRidersResponse> {
    const rows = await this.prisma.merchantPreferredRider.findMany({
      where: { merchantId: access.merchantId },
      orderBy: { createdAt: "asc" },
    });
    const people = rows.length
      ? await this.prisma.profile.findMany({ where: { phone: { in: rows.map((r) => r.phone) } }, select: PERSON_SELECT })
      : [];
    const byPhone = new Map(people.map((p) => [p.phone, p]));
    const stats = await this.jobStats(
      access.merchantId,
      people.filter((p) => p.rider).map((p) => p.id),
    );
    return {
      riders: rows.map((r) => this.toResponse(r, byPhone.get(r.phone), stats, access.merchantId)),
      cap: MERCHANT_PREFERRED_RIDER_CAP,
    };
  }

  /** Own bikers T9: Preferred riders is retired (owner, 2026-10-20). The list and Remove keep working until the data
   *  is deleted (TODOS.md); nobody new is added. */
  add(): never {
    throw new GoneException({ reason: "preferred_retired", message: PREFERRED_GONE });
  }

  async remove(access: MerchantAccess, profileId: string, id: string): Promise<{ ok: true }> {
    await this.prisma.$transaction(async (tx) => {
      const gone = await tx.merchantPreferredRider.deleteMany({ where: { id, merchantId: access.merchantId } });
      // Another business's row reads as missing, never as forbidden: no oracle.
      if (gone.count === 0) throw new NotFoundException("Biker not found");
      await tx.auditLog.create({ data: { actor: profileId, action: RIDER_REMOVE_ACTION, target: access.merchantId, note: id } });
    });
    return { ok: true };
  }

  /**
   * Deliveries each rider completed for this business — its restaurant orders and its bookings (the
   * booking account's orders) — and their average rating from those jobs. One query for the whole list.
   */
  private async jobStats(merchantId: string, riderIds: string[]): Promise<Map<string, JobStats>> {
    if (riderIds.length === 0) return new Map();
    const accountId = await findBookingAccountId(this.prisma, merchantId);
    const rows = await this.prisma.$queryRaw<Array<{ rider_id: string; jobs: bigint | number; rating: number | null }>>`
      SELECT o.rider_id,
             COUNT(DISTINCT o.id) AS jobs,
             AVG(r.score)::float8 AS rating
      FROM orders o
      LEFT JOIN ratings r ON r.order_id = o.id AND r.by_profile_id <> o.rider_id
      WHERE o.rider_id = ANY(${riderIds}::uuid[])
        AND o.status IN ('delivered', 'completed')
        AND (o.merchant_id = ${merchantId}::uuid OR o.customer_id = ${accountId}::uuid)
      GROUP BY o.rider_id`;
    return new Map(
      rows.map((r) => [r.rider_id, { jobs: Number(r.jobs), ratingAvg: r.rating == null ? null : Math.round(Number(r.rating) * 10) / 10 }]),
    );
  }

  private toResponse(
    row: { id: string; label: string; phone: string; createdAt: Date },
    person: Person | undefined,
    stats: Map<string, JobStats>,
    merchantId: string,
  ): MerchantPreferredRiderResponse {
    const status = riderStatusOf(person, merchantId);
    const done = person ? stats.get(person.id) : undefined;
    const jobs = done?.jobs ?? 0;
    const name = person ? `${person.firstName} ${person.lastName}`.trim() : "";
    return {
      id: row.id,
      label: row.label,
      phoneMasked: maskPhone(row.phone),
      status,
      online: riderOnline(person, status),
      invitePhone: status === "not_on_lyniago" ? row.phone.replace(/^\+/, "") : null,
      jobs,
      ratingAvg: jobs > 0 ? (done?.ratingAvg ?? null) : null,
      // Who they are on LyniaGo stays private until they have worked for this business.
      rider: person && jobs > 0 ? { name: name || "Biker", photoUrl: person.photoUrl ?? null } : null,
      addedAt: row.createdAt.toISOString(),
    };
  }
}
