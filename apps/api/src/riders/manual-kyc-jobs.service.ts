import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit, Optional } from "@nestjs/common";
import { STORAGE, type StorageAdapter } from "../adapters/storage/storage.interface";
import { isOwnedUploadKey } from "../adapters/storage/upload-kinds";
import { domainEvents } from "../common/domain-events";
import { NotificationsService } from "../notifications/notifications.service";
import { OwnerAlertsService, ownerAlertText } from "../owner-alerts/owner-alerts.service";
import { PrismaService } from "../prisma/prisma.service";
import { TrackingGateway } from "../tracking/tracking.gateway";

/** D-122: the licence reminder goes out this many days before the expiry day. */
export const LICENCE_REMINDER_DAYS = 30;
/** D-122: a finally-declined biker's document photos are deleted this many days after the decline. */
export const DECLINED_DOCS_RETENTION_DAYS = 30;

/** How often the sweep runs per instance (same cadence as the ID-expiry sweep). Every write is a CAS, so
 *  several instances sweeping at once can't double-send a push or alert. */
export const MANUAL_KYC_SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** D-122 approved copy (owner 2026-11-04), verbatim. */
export const MANUAL_KYC_PUSH = {
  licenceSoon: {
    title: "Your licence expires soon",
    body: "Add your new driving licence in Bike & documents to keep riding.",
  },
  licenceExpired: {
    title: "Your licence has expired",
    body: "You're offline until your new driving licence is approved. Add it in Bike & documents.",
  },
} as const;

export interface ManualKycSweepResult {
  reminded: number;
  expiredOffline: number;
  declinedDocsPurged: number;
}

const DAY_MS = 86_400_000;

function utcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Manual KYC sweep (ledger D-122, owner 2026-11-04). In-process every 6 h with a random start offset, the
 * same pattern as KycReconcileService's ID-expiry sweep (no new scheduler). Three steps, best-effort per rider:
 *
 *  1. Licence reminder: a verified biker whose licence expires within 30 days, not yet reminded, gets one push.
 *  2. Licence expired: an online biker whose licence expired is taken offline (the go-online gate already
 *     refuses `licence_expired`), told by push, and the owner hears on Telegram. Their licence photo is
 *     cleared so Bike & documents asks for the new one.
 *  3. Retention: a biker finally declined (locked, >= 2 strikes) more than 30 days ago has their ID-document
 *     photos deleted from storage and the keys nulled.
 */
@Injectable()
export class ManualKycJobsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ManualKycJobsService.name);
  private timer?: ReturnType<typeof setInterval>;
  private startTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly gateway: TrackingGateway,
    @Optional() private readonly ownerAlerts?: OwnerAlertsService,
    @Optional() @Inject(STORAGE) private readonly storage?: StorageAdapter,
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === "test") return;
    const run = () =>
      void this.sweep().catch((err: unknown) => this.logger.error(`Manual KYC sweep failed: ${(err as Error).message}`));
    this.startTimer = setTimeout(run, Math.floor(Math.random() * 60_000));
    this.startTimer.unref?.();
    this.timer = setInterval(run, MANUAL_KYC_SWEEP_INTERVAL_MS);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.startTimer) clearTimeout(this.startTimer);
  }

  async sweep(now: Date = new Date()): Promise<ManualKycSweepResult> {
    const today = utcDay(now);
    return {
      reminded: await this.remindSoon(today),
      expiredOffline: await this.expire(today),
      declinedDocsPurged: await this.purgeDeclined(now),
    };
  }

  private async remindSoon(today: Date): Promise<number> {
    const horizon = new Date(today.getTime() + LICENCE_REMINDER_DAYS * DAY_MS);
    const due = await this.prisma.rider.findMany({
      where: { kycStatus: "verified", licenceRemindedAt: null, licenceExpiresOn: { gte: today, lte: horizon } },
      select: { profileId: true },
      take: 500,
    });
    let n = 0;
    for (const { profileId } of due) {
      // Stamp first (CAS on the null) so a re-run never double-sends.
      const claimed = await this.prisma.rider.updateMany({
        where: { profileId, licenceRemindedAt: null },
        data: { licenceRemindedAt: new Date() },
      });
      if (claimed.count === 0) continue;
      await this.notifications.notifyProfiles([profileId], { ...MANUAL_KYC_PUSH.licenceSoon, data: { type: "licence_soon" } });
      n++;
    }
    return n;
  }

  private async expire(today: Date): Promise<number> {
    const expired = await this.prisma.rider.findMany({
      where: { licenceExpiresOn: { lt: today }, kycLicenceKey: { not: null } },
      select: { profileId: true, isOnline: true, kycLicenceKey: true, profile: { select: { firstName: true } } },
      take: 500,
    });
    let n = 0;
    for (const r of expired) {
      const claimed = await this.prisma.$transaction(async (tx) => {
        // CAS on the photo key: one instance claims each expiry; a concurrent sweep matches 0 rows.
        const res = await tx.rider.updateMany({
          where: { profileId: r.profileId, kycLicenceKey: r.kycLicenceKey },
          // The expired licence photo no longer proves anything: clear it so the row asks for the new one.
          data: { isOnline: false, kycLicenceKey: null },
        });
        if (res.count > 0 && r.isOnline) {
          await domainEvents.riderOffline(tx, r.profileId, "licence_expired", { actorId: null, actorRole: "system" });
        }
        return res.count > 0;
      });
      if (!claimed) continue;
      if (r.isOnline) void this.gateway.evictRiderFromSupply(r.profileId);
      await this.deleteKey(r.profileId, r.kycLicenceKey);
      await this.notifications.notifyProfiles([r.profileId], { ...MANUAL_KYC_PUSH.licenceExpired, data: { type: "licence_expired" } });
      this.ownerAlerts?.notify(ownerAlertText.bikerLicenceExpired({ firstName: r.profile.firstName }));
      n++;
    }
    return n;
  }

  private async purgeDeclined(now: Date): Promise<number> {
    const cutoff = new Date(now.getTime() - DECLINED_DOCS_RETENTION_DAYS * DAY_MS);
    const rows = await this.prisma.rider.findMany({
      where: {
        kycStatus: "failed",
        kycAttempts: { gte: 2 },
        kycResolvedAt: { lt: cutoff },
        OR: [{ kycIdFrontKey: { not: null } }, { kycLicenceKey: { not: null } }, { kycSelfieIdKey: { not: null } }],
      },
      select: { profileId: true, kycIdFrontKey: true, kycLicenceKey: true, kycSelfieIdKey: true },
      take: 500,
    });
    for (const r of rows) {
      await this.prisma.rider.updateMany({
        where: { profileId: r.profileId },
        data: { kycIdFrontKey: null, kycLicenceKey: null, kycSelfieIdKey: null },
      });
      for (const key of [r.kycIdFrontKey, r.kycLicenceKey, r.kycSelfieIdKey]) await this.deleteKey(r.profileId, key);
    }
    return rows.length;
  }

  private async deleteKey(profileId: string, key: string | null): Promise<void> {
    if (!key || !this.storage || !isOwnedUploadKey("kyc", profileId, key)) return;
    try {
      await this.storage.deleteObject(key);
    } catch (err) {
      this.logger.warn(`Couldn't delete a document photo for ${profileId}: ${(err as Error).message}`);
    }
  }
}
