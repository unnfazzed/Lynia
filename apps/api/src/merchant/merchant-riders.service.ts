import { BadRequestException, ConflictException, HttpException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  type AddMerchantRiderRequest,
  MERCHANT_PREFERRED_RIDER_CAP,
  MERCHANT_PREFERRED_RIDER_DAILY_ADDS,
  type MerchantPreferredRiderResponse,
  type MerchantRiderStatus,
  type MerchantRidersResponse,
  normalizePhone,
} from "@lynia/shared";
import { maskPhone } from "../common/phone-mask";
import { PrismaService } from "../prisma/prisma.service";
import { findBookingAccountId } from "./booking-account";
import type { MerchantAccess } from "./merchant-access";

const DAY_MS = 24 * 60 * 60 * 1000;
/** The audit actions this list writes; the daily add limit counts the first. */
export const RIDER_ADD_ACTION = "merchant.rider.add";
export const RIDER_REMOVE_ACTION = "merchant.rider.remove";

const PERSON_SELECT = {
  id: true,
  phone: true,
  firstName: true,
  lastName: true,
  photoUrl: true,
  onHold: true,
  rider: { select: { kycStatus: true, accountStatus: true, onHold: true } },
  merchantMembership: { select: { merchantId: true } },
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
  if (person.merchantMembership?.merchantId === merchantId) return "unavailable";
  return "on_lyniago";
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

  async add(access: MerchantAccess, profileId: string, body: AddMerchantRiderRequest): Promise<MerchantPreferredRiderResponse> {
    const phone = normalizePhone(body.phone);
    if (!phone) throw new BadRequestException({ reason: "bad_phone", message: "Enter the number the rider signs in with, like 0771234567." });
    const onTeam = await this.prisma.merchantMember.count({ where: { merchantId: access.merchantId, profile: { phone } } });
    if (onTeam > 0) {
      throw new ConflictException({ reason: "team_member", message: "That number is on your team, so it can't be one of your riders." });
    }

    let id: string;
    try {
      id = await this.prisma.$transaction(async (tx) => {
        // One add at a time per business, so two at once can't both slip under the cap or the daily limit.
        await tx.$executeRaw`SELECT 1 FROM merchants WHERE id = ${access.merchantId}::uuid FOR UPDATE`;
        const kept = await tx.merchantPreferredRider.count({ where: { merchantId: access.merchantId } });
        if (kept >= MERCHANT_PREFERRED_RIDER_CAP) {
          throw new ConflictException({
            reason: "cap_reached",
            message: `You can keep up to ${MERCHANT_PREFERRED_RIDER_CAP} riders. Remove one to add another.`,
          });
        }
        const addedToday = await tx.auditLog.count({
          where: { action: RIDER_ADD_ACTION, target: access.merchantId, createdAt: { gte: new Date(Date.now() - DAY_MS) } },
        });
        if (addedToday >= MERCHANT_PREFERRED_RIDER_DAILY_ADDS) {
          throw new HttpException(
            { statusCode: 429, reason: "too_many_adds", message: `You've added ${MERCHANT_PREFERRED_RIDER_DAILY_ADDS} riders today. Add more tomorrow.` },
            429,
          );
        }
        const row = await tx.merchantPreferredRider.create({
          data: { merchantId: access.merchantId, phone, label: body.label, addedByProfileId: profileId },
          select: { id: true },
        });
        await tx.auditLog.create({ data: { actor: profileId, action: RIDER_ADD_ACTION, target: access.merchantId, note: row.id } });
        return row.id;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictException({ reason: "already_added", message: "That number is already one of your riders." });
      }
      throw err;
    }
    const added = (await this.list(access)).riders.find((r) => r.id === id);
    if (!added) throw new NotFoundException("Rider not found");
    return added;
  }

  async remove(access: MerchantAccess, profileId: string, id: string): Promise<{ ok: true }> {
    await this.prisma.$transaction(async (tx) => {
      const gone = await tx.merchantPreferredRider.deleteMany({ where: { id, merchantId: access.merchantId } });
      // Another business's row reads as missing, never as forbidden: no oracle.
      if (gone.count === 0) throw new NotFoundException("Rider not found");
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
      invitePhone: status === "not_on_lyniago" ? row.phone.replace(/^\+/, "") : null,
      jobs,
      ratingAvg: jobs > 0 ? (done?.ratingAvg ?? null) : null,
      // Who they are on LyniaGo stays private until they have worked for this business.
      rider: person && jobs > 0 ? { name: name || "Rider", photoUrl: person.photoUrl ?? null } : null,
      addedAt: row.createdAt.toISOString(),
    };
  }
}
