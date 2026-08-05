import { isMerchantOpenNow, type MerchantHours } from "@lynia/shared";
import { Injectable, Logger, NotFoundException, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";

/**
 * D1 `menu_closed` / `list_empty` — "Remind me when they open".
 *
 * A closed kitchen is otherwise a dead end: the customer sees "closed", and the only thing left to do
 * is remember to come back. The kit offers a remind-me on both the closed menu and the nothing-open
 * list; this is the machinery behind it.
 *
 * **Why a sweep and not an event.** Nothing in the system emits "merchant opened". Open-ness is
 * derived from the merchant's weekly `hours` JSON every time it's read (`isMerchantOpenNow`), so
 * there is no transition to subscribe to — only a schedule to observe. The sweep re-derives open-ness
 * on a tick and fires the reminders that just became due. The alternative (computing each merchant's
 * next opening instant and scheduling a job) buys precision this doesn't need and breaks the moment a
 * merchant edits their hours between scheduling and firing.
 *
 * **Delivery guarantee is at-most-once, deliberately.** `notifiedAt` is stamped BEFORE the push goes
 * out, so a crash mid-push loses a reminder rather than re-sending it on the next tick. For a
 * courtesy nudge, a duplicate at 07:00 is worse than a miss — and the customer can always ask again.
 */
const SWEEP_INTERVAL_MS = 60 * 1000;

/** How many pending reminders one tick will resolve. Bounds the query and the push fan-out on a
 *  morning where every kitchen in the corridor opens within the same minute. Leftovers are picked up
 *  by the next tick a minute later, which is well inside the tolerance for "they're open now". */
const SWEEP_BATCH = 500;

@Injectable()
export class RestaurantReopenService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RestaurantReopenService.name);
  private sweep?: ReturnType<typeof setInterval>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    void this.runSweep();
    this.sweep = setInterval(() => void this.runSweep(), SWEEP_INTERVAL_MS);
    // Same as every other sweep in this codebase: never hold the process open in tests/CLI.
    this.sweep.unref?.();
  }

  onModuleDestroy(): void {
    if (this.sweep) clearInterval(this.sweep);
  }

  /**
   * Ask to be told when this kitchen opens. Idempotent: asking twice is the same ask, so this upserts
   * on (profile, merchant) and re-arms a previously-fired row rather than stacking duplicates.
   *
   * Returns `{ set: false }` when the kitchen is ALREADY open — there is nothing to wait for, and
   * silently banking a reminder that only fires at tomorrow's opening would be a small lie. The client
   * reads that as "go ahead and order".
   */
  async setReminder(profileId: string, merchantId: string): Promise<{ set: boolean; alreadyOpen: boolean }> {
    const merchant = await this.prisma.merchant.findFirst({
      // Same visibility rule as the browse list: a merchant outside the pilot allowlist doesn't exist
      // to a customer, so it can't be subscribed to either.
      where: { id: merchantId, pilotEnabled: true },
      select: { id: true, hours: true },
    });
    if (!merchant) throw new NotFoundException("Restaurant not found");

    if (isMerchantOpenNow(merchant.hours as MerchantHours | null, new Date())) {
      return { set: false, alreadyOpen: true };
    }

    await this.prisma.restaurantReopenReminder.upsert({
      where: { profileId_merchantId: { profileId, merchantId } },
      create: { profileId, merchantId },
      // Re-arm: a row retired by an earlier reopen is reused, so the customer gets tomorrow's push too.
      update: { notifiedAt: null, createdAt: new Date() },
    });
    return { set: true, alreadyOpen: false };
  }

  /** Cancel a pending reminder. Idempotent — clearing one that isn't there is a no-op, not a 404. */
  async clearReminder(profileId: string, merchantId: string): Promise<{ set: boolean }> {
    await this.prisma.restaurantReopenReminder.deleteMany({ where: { profileId, merchantId } });
    return { set: false };
  }

  /** Whether this customer is currently waiting on this kitchen — drives the button's on/off state. */
  async getReminder(profileId: string, merchantId: string): Promise<{ set: boolean }> {
    const row = await this.prisma.restaurantReopenReminder.findUnique({
      where: { profileId_merchantId: { profileId, merchantId } },
      select: { notifiedAt: true },
    });
    return { set: row != null && row.notifiedAt === null };
  }

  /** One tick: fire every pending reminder whose kitchen is open as of now. Never throws. */
  async runSweep(): Promise<void> {
    try {
      const pending = await this.prisma.restaurantReopenReminder.findMany({
        where: { notifiedAt: null },
        select: { id: true, profileId: true, merchantId: true, merchant: { select: { name: true, hours: true, pilotEnabled: true } } },
        orderBy: { createdAt: "asc" },
        take: SWEEP_BATCH,
      });
      if (pending.length === 0) return;

      const now = new Date();
      // Group by merchant so one open kitchen is one push with one recipient list, rather than N
      // single-recipient sends — `notifyProfiles` already de-dupes ids and swallows failures.
      const due = new Map<string, { name: string; ids: string[]; rowIds: string[] }>();
      for (const row of pending) {
        if (!row.merchant.pilotEnabled) continue;
        if (!isMerchantOpenNow(row.merchant.hours as MerchantHours | null, now)) continue;
        const bucket = due.get(row.merchantId) ?? { name: row.merchant.name, ids: [], rowIds: [] };
        bucket.ids.push(row.profileId);
        bucket.rowIds.push(row.id);
        due.set(row.merchantId, bucket);
      }
      if (due.size === 0) return;

      for (const [merchantId, bucket] of due) {
        // Retire the rows FIRST — see the at-most-once note in the file header. A push that fails
        // after this point is a lost courtesy nudge; a push sent before this point could repeat every
        // minute for the whole opening window if the stamp then failed.
        await this.prisma.restaurantReopenReminder.updateMany({
          where: { id: { in: bucket.rowIds } },
          data: { notifiedAt: now },
        });
        await this.notifications.notifyProfiles(bucket.ids, {
          title: `${bucket.name} is open`,
          body: "They're taking orders again — tap to see the menu.",
          data: { type: "restaurant_open", merchantId },
        });
      }
    } catch (err) {
      this.logger.error(`restaurant reopen sweep failed: ${(err as Error).message}`);
    }
  }
}
