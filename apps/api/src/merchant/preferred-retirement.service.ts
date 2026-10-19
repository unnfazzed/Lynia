import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { preferredRetired } from "../common/preferred-retired";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";

/** Audit marker: this business's owners were told Preferred riders is gone (one per business, ever). */
export const PREFERRED_RETIRED_NOTE_ACTION = "merchant.preferred.retired_note";
/** How often the note sweep looks for businesses not yet told (hourly: the flag flips once). */
export const PREFERRED_NOTE_INTERVAL_MS = 60 * 60 * 1000;

/**
 * The note (own-bikers.md "Distribution Plan", approved plan copy). The handoff draws no screen for it: the merchant
 * app shows it as a notification, and the add refusal reads its body. Lane B replaces it if the owner redraws it.
 */
export const PREFERRED_RETIRED_NOTE = {
  title: "Preferred riders is gone",
  body: "Orders now go to the nearest biker. Running your own bikers? Ask us about Own bikers.",
} as const;

/**
 * Own bikers T9: once `PREFERRED_RETIRED` is on, every business that kept preferred riders tells its owners, once,
 * the same day. Idempotent per business (an audit marker written before the push), and one instance at a time (a
 * transaction-scoped advisory lock), so several API instances never send it twice.
 */
@Injectable()
export class PreferredRetirementService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PreferredRetirementService.name);
  private timer?: ReturnType<typeof setInterval>;
  private startTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    this.startTimer = setTimeout(() => void this.run(), 30_000 + Math.floor(Math.random() * 60_000));
    this.startTimer.unref?.();
    this.timer = setInterval(() => void this.run(), PREFERRED_NOTE_INTERVAL_MS);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.startTimer) clearTimeout(this.startTimer);
    if (this.timer) clearInterval(this.timer);
  }

  private async run(): Promise<void> {
    try {
      await this.sendNotes();
    } catch (err) {
      this.logger.error(`preferred retirement note failed: ${(err as Error).message}`);
    }
  }

  /** Tell the owners of each business with preferred riders that hasn't been told yet. Nothing while the flag is off. */
  async sendNotes(): Promise<{ businesses: number; owners: number }> {
    if (!preferredRetired()) return { businesses: 0, owners: 0 };
    const recipients = await this.prisma.$transaction(async (tx) => {
      const [{ locked }] = await tx.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_xact_lock(hashtext(${PREFERRED_RETIRED_NOTE_ACTION})) AS locked`;
      if (!locked) return null;
      const told = await tx.auditLog.findMany({ where: { action: PREFERRED_RETIRED_NOTE_ACTION }, select: { target: true } });
      const done = new Set(told.map((t) => t.target));
      const kept = await tx.merchantPreferredRider.findMany({ distinct: ["merchantId"], select: { merchantId: true } });
      const due = kept.map((k) => k.merchantId).filter((id) => !done.has(id));
      if (due.length === 0) return { businesses: 0, owners: [] as string[] };
      const [merchants, owners] = await Promise.all([
        tx.merchant.findMany({ where: { id: { in: due } }, select: { id: true, ownerProfileId: true } }),
        tx.merchantMember.findMany({ where: { merchantId: { in: due }, role: "owner" }, select: { profileId: true } }),
      ]);
      await tx.auditLog.createMany({ data: due.map((target) => ({ actor: "system", action: PREFERRED_RETIRED_NOTE_ACTION, target })) });
      const to = new Set([...merchants.flatMap((m) => (m.ownerProfileId ? [m.ownerProfileId] : [])), ...owners.map((o) => o.profileId)]);
      return { businesses: due.length, owners: [...to] };
    });
    if (!recipients || recipients.owners.length === 0) return { businesses: recipients?.businesses ?? 0, owners: 0 };
    void this.notifications.notifyProfiles(recipients.owners, {
      ...PREFERRED_RETIRED_NOTE,
      data: { kind: "preferred_retired" },
      collapseKey: "preferred_retired",
    });
    this.logger.log(`preferred retirement note: ${recipients.businesses} businesses, ${recipients.owners.length} owners`);
    return { businesses: recipients.businesses, owners: recipients.owners.length };
  }
}
