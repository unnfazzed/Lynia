import { ConflictException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ACTIVE_RIDE_STATUSES } from "@lynia/shared";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Data-retention + right-to-erasure enforcement (LR8 / CDPA — docs/DATA-RETENTION.md).
 *
 * Erasure ANONYMISES in place rather than hard-deleting: a profile is referenced by orders, ratings,
 * and the audit log (rows kept for the financial/dispute/compliance record), so we scrub the PII and
 * keep the (now anonymous) row + its id so those references stay intact.
 */
@Injectable()
export class PrivacyService {
  private readonly logger = new Logger(PrivacyService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Right to erasure. Anonymises the caller's profile + scrubs their PII; keeps the order/audit ledger. */
  async eraseAccount(profileId: string): Promise<{ erased: true }> {
    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
      select: { id: true, phone: true },
    });
    if (!profile) throw new NotFoundException("Profile not found");

    // Never strand a live delivery: a customer with an open/active order or a rider mid-ride must
    // finish or cancel first. (Erasing mid-ride would break the counterparty's in-flight delivery.)
    const activeRide = await this.prisma.order.findFirst({
      where: {
        status: { in: ACTIVE_RIDE_STATUSES },
        OR: [{ customerId: profileId }, { riderId: profileId }],
      },
      select: { id: true },
    });
    if (activeRide) {
      throw new ConflictException("Finish or cancel your active delivery before deleting your account");
    }

    // Idempotent: an already-erased profile carries the tombstone phone — re-running is a no-op.
    if (profile.phone.startsWith("erased:")) return { erased: true };

    await this.prisma.$transaction(async (tx) => {
      // Anonymise the profile. phone is UNIQUE + NOT NULL, so it becomes a non-dialable tombstone
      // (frees the real number for a genuine re-signup, which mints a fresh profile).
      await tx.profile.update({
        where: { id: profileId },
        data: {
          firstName: "Deleted",
          lastName: "User",
          email: null,
          idNumber: null,
          idNumberHash: null,
          photoUrl: null,
          phone: `erased:${profileId}`,
        },
      });

      // Scrub rider PII if this profile is a rider; keep the row for the ledger.
      await tx.rider.updateMany({
        where: { profileId },
        data: {
          bikeReg: "",
          vehicleInfo: null,
          photoUrl: "",
          kycRef: null,
          kycDeclineReason: null,
          suspendReason: null,
          currentLat: null,
          currentLng: null,
          isOnline: false,
        },
      });

      // Remove the standalone PII stores + log every device out.
      await tx.address.deleteMany({ where: { profileId } });
      await tx.deviceToken.deleteMany({ where: { profileId } });
      await tx.session.deleteMany({ where: { profileId } });

      // Scrub the GPS trail on every order this user was part of (keep the status events themselves).
      await tx.orderEvent.updateMany({
        where: { order: { OR: [{ customerId: profileId }, { riderId: profileId }] } },
        data: { lat: null, lng: null },
      });
    });

    this.logger.log(`Account ${profileId} erased (anonymised in place)`);
    return { erased: true };
  }

  /** Retention sweep — drop expired GPS coords + lapsed sessions. Driven by Cloud Scheduler daily. */
  async purgeExpiredData(now: Date = new Date()): Promise<{ gpsScrubbed: number; sessionsPurged: number }> {
    const gpsCutoff = new Date(now.getTime() - this.env.GPS_RETENTION_DAYS * 86_400_000);
    const sessionCutoff = new Date(now.getTime() - this.env.SESSION_RETENTION_DAYS * 86_400_000);

    // Coords older than the window have no operational use (live position lives in Redis / rider row).
    const gps = await this.prisma.orderEvent.updateMany({
      where: { createdAt: { lt: gpsCutoff }, NOT: { lat: null } },
      data: { lat: null, lng: null },
    });

    // Sessions that lapsed more than the window ago are dead auth artifacts.
    const sessions = await this.prisma.session.deleteMany({
      where: { expiresAt: { lt: sessionCutoff } },
    });

    this.logger.log(`Retention sweep: scrubbed ${gps.count} GPS events, purged ${sessions.count} expired sessions`);
    return { gpsScrubbed: gps.count, sessionsPurged: sessions.count };
  }
}
