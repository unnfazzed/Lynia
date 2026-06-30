import { Inject, Injectable, Logger } from "@nestjs/common";
import { PUSH, type PushAdapter } from "../adapters/push/push.interface";
import { PrismaService } from "../prisma/prisma.service";

type Audience = "customer" | "rider";
interface Notice {
  to: Audience[];
  title: string;
  body: string;
}

/**
 * Which order-status transitions fire a push, who hears about it, and the copy. Statuses not listed
 * (e.g. `requested`, `open_for_offers`) are intentionally silent. The customer is the §5c "initiator"
 * watching the trip; the rider hears about being hired and being freed.
 */
const STATUS_NOTICES: Record<string, Notice> = {
  assigned: { to: ["rider"], title: "You got the job", body: "You've been selected for a delivery — open it to confirm the details." },
  confirmed: { to: ["customer"], title: "Rider confirmed your items", body: "Your rider has reviewed the parcel details." },
  en_route_pickup: { to: ["customer"], title: "Rider on the way", body: "Your rider is heading to the pickup point." },
  picked_up: { to: ["customer"], title: "Parcel collected", body: "Your rider has your parcel and is on the move." },
  en_route_dropoff: { to: ["customer"], title: "On the way to drop-off", body: "Your parcel is en route to the destination." },
  delivered: { to: ["customer"], title: "Delivered", body: "Your parcel was delivered — tap to rate your rider." },
  completed: { to: ["rider"], title: "Delivery complete", body: "Nice work — you're free for the next job." },
  expired: { to: ["customer"], title: "No riders yet", body: "No rider took your price. Nudge it up and re-broadcast." },
  cancelled: { to: ["customer", "rider"], title: "Order cancelled", body: "This delivery was cancelled." },
};

/**
 * Sends push notifications and manages device tokens. Every public `notify*` method is best-effort and
 * swallows all errors (the FCM adapter already never throws) so a caller can fire it with `void` after a
 * committed transition — a push failure can never roll back or fail the offer-loop / lifecycle write.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PUSH) private readonly push: PushAdapter,
  ) {}

  /** Register (or re-home) a device token to the calling profile. Idempotent per token. */
  async registerToken(profileId: string, token: string, platform?: string): Promise<{ ok: true }> {
    await this.prisma.deviceToken.upsert({
      where: { token },
      create: { profileId, token, platform: platform ?? null },
      update: { profileId, platform: platform ?? null },
    });
    return { ok: true };
  }

  /** Drop a token for this profile (sign-out / disabled notifications). No-op if not owned. */
  async unregisterToken(profileId: string, token: string): Promise<{ ok: true }> {
    await this.prisma.deviceToken.deleteMany({ where: { token, profileId } });
    return { ok: true };
  }

  /** Notify the relevant party(ies) of an order-status transition. Best-effort, never throws. */
  async notifyOrderStatus(orderId: string, status: string, data: Record<string, string> = {}): Promise<void> {
    try {
      const notice = STATUS_NOTICES[status];
      if (!notice) return;
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        select: { customerId: true, riderId: true },
      });
      if (!order) return;
      const ids = notice.to
        .map((aud) => (aud === "customer" ? order.customerId : order.riderId))
        .filter((id): id is string => !!id);
      await this.send(ids, { title: notice.title, body: notice.body, data: { orderId, status, ...data } });
    } catch (err) {
      this.logger.warn(`notifyOrderStatus(${orderId}, ${status}) failed: ${(err as Error).message}`);
    }
  }

  /** Notify a customer that a rider has responded to their broadcast. Best-effort, never throws. */
  async notifyNewOffer(orderId: string, customerId: string): Promise<void> {
    try {
      await this.send([customerId], {
        title: "New offer",
        body: "A rider responded to your delivery — tap to compare offers.",
        data: { orderId, kind: "offer" },
      });
    } catch (err) {
      this.logger.warn(`notifyNewOffer(${orderId}) failed: ${(err as Error).message}`);
    }
  }

  /**
   * Tell nearby online riders that a new delivery is open for offers (CONCEPT §3.10 — for riders
   * "push is the primary channel" for fast new-order alerts, alongside the WS board). The caller
   * supplies the already-resolved nearby-rider profile IDs (a PostGIS radius query, ET6).
   * Best-effort, never throws.
   */
  async notifyNewBroadcast(
    orderId: string,
    riderProfileIds: string[],
    info: { pickup: string; fare: string },
  ): Promise<void> {
    try {
      await this.send(riderProfileIds, {
        title: "New delivery nearby",
        body: `Pickup at ${info.pickup} · asking $${info.fare} — tap to bid before it's taken.`,
        data: { orderId, kind: "broadcast" },
      });
    } catch (err) {
      this.logger.warn(`notifyNewBroadcast(${orderId}) failed: ${(err as Error).message}`);
    }
  }

  /** Fan a message out to every device of the given profiles, and prune any token the provider
   *  reports as permanently dead. Private; all callers pre-wrap in try/catch. */
  private async send(
    profileIds: string[],
    msg: { title: string; body: string; data?: Record<string, string> },
  ): Promise<void> {
    if (profileIds.length === 0) return;
    const tokens = await this.prisma.deviceToken.findMany({
      where: { profileId: { in: profileIds } },
      select: { token: true },
    });
    if (tokens.length === 0) return;

    // One batched provider call (FCM sendEach, chunked ≤500) instead of a per-token round-trip fan-out.
    // Results align with `tokens` order, so a dead token is pruned by position.
    const results = await this.push.sendEach(
      tokens.map((t) => ({ token: t.token, title: msg.title, body: msg.body, data: msg.data })),
    );

    // Drop tokens the provider says are unregistered/invalid so the table doesn't grow unbounded and
    // we stop sending to dead devices (a token FCM later reassigns won't keep delivering to the wrong user).
    const dead = tokens.filter((_, i) => results[i]?.invalidToken).map((t) => t.token);
    if (dead.length > 0) {
      await this.prisma.deviceToken.deleteMany({ where: { token: { in: dead } } });
      this.logger.log(`pruned ${dead.length} dead device token(s)`);
    }
  }
}
