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
/**
 * A single row in the derived in-app notifications feed (customer-journey A·3). Notifications are
 * PUSH-ONLY (FCM) — there is no Notification table — so the feed is READ-ONLY and reconstructed from
 * the caller's own order events on read. `icon` is a mobile IconName; `at` is ISO-8601.
 */
export interface NotificationRow {
  id: string;
  orderId: string;
  icon: string;
  title: string;
  message: string;
  at: string;
  unread: boolean;
}

/**
 * How an order-status event renders as a feed row. Deliberately mirrors {@link STATUS_NOTICES} copy so
 * the in-app centre reads the same as the push the user already saw. Statuses absent here (e.g.
 * `requested`, `open_for_offers`) are silent in the feed exactly as they are for push. Icons are valid
 * mobile IconNames (see apps/mobile/src/ui/Icon.tsx). Customer-voiced — used when the viewing user is
 * the order's customer.
 */
const FEED_NOTICES: Record<string, { icon: string; title: string; message: string }> = {
  assigned: { icon: "bike", title: "Rider assigned", message: "A rider took your delivery and is confirming the details." },
  confirmed: { icon: "check", title: "Rider confirmed your items", message: "Your rider has reviewed the parcel details." },
  en_route_pickup: { icon: "bike", title: "Rider on the way", message: "Your rider is heading to the pickup point." },
  picked_up: { icon: "check", title: "Parcel collected", message: "Your rider has your parcel and is on the move." },
  en_route_dropoff: { icon: "navigation", title: "On the way to drop-off", message: "Your parcel is on the way to drop-off." },
  delivered: { icon: "check", title: "Delivered", message: "Your parcel was delivered — rate your rider." },
  completed: { icon: "check", title: "Delivery complete", message: "This trip is done. Thanks for using Lynia." },
  expired: { icon: "clock", title: "No riders yet", message: "No rider took your price yet. Try raising it and sending again." },
  undelivered: { icon: "triangle-alert", title: "Delivery couldn't be completed", message: "Your rider couldn't hand the parcel over — tap for details." },
  cancelled: { icon: "triangle-alert", title: "Order cancelled", message: "This delivery was cancelled." },
};

/**
 * Rider-voiced counterpart to {@link FEED_NOTICES}. Dual-role users (a rider's own trip history) were
 * getting the customer-voiced copy above verbatim — "A rider took your delivery", "rate your rider" —
 * about jobs they themselves ran, breaking the "mirrors the push you actually saw" contract (their real
 * push for `assigned`/`completed` is the rider copy in {@link STATUS_NOTICES}). `expired` never applies
 * to a rider view (an order only expires before any rider is assigned) so it's omitted.
 */
const FEED_NOTICES_RIDER: Record<string, { icon: string; title: string; message: string }> = {
  assigned: { icon: "bike", title: "You got the job", message: "You were selected for a delivery — confirm the parcel details." },
  confirmed: { icon: "check", title: "You confirmed the parcel", message: "You reviewed the parcel details and are heading to pickup." },
  en_route_pickup: { icon: "bike", title: "Heading to pickup", message: "You're on the way to the pickup point." },
  picked_up: { icon: "check", title: "Parcel collected", message: "You picked up the parcel and are on the move." },
  en_route_dropoff: { icon: "navigation", title: "On the way to drop-off", message: "You're on the way to the drop-off point." },
  delivered: { icon: "check", title: "Delivered", message: "You delivered the parcel — waiting on the customer's rating." },
  completed: { icon: "check", title: "Delivery complete", message: "Nice work — you're free for the next job." },
  undelivered: { icon: "triangle-alert", title: "Delivery not completed", message: "This delivery was marked undelivered — tap for details." },
  cancelled: { icon: "triangle-alert", title: "Order cancelled", message: "This delivery was cancelled." },
};

/** How recent an event must be to count as "unread" in the derived feed — a deterministic window over
 *  the event time (there is no per-user read state to persist). */
const FEED_UNREAD_WINDOW_MS = 24 * 60 * 60 * 1000;

/** How many orders back the feed reaches, and the cap on rows returned (A·3 shows the most recent). */
const FEED_ORDER_LOOKBACK = 30;
const FEED_ROW_CAP = 30;

const STATUS_NOTICES: Record<string, Notice> = {
  assigned: { to: ["rider"], title: "You got the job", body: "You've been selected for a delivery — open it to confirm the details." },
  confirmed: { to: ["customer"], title: "Rider confirmed your items", body: "Your rider has reviewed the parcel details." },
  en_route_pickup: { to: ["customer"], title: "Rider on the way", body: "Your rider is heading to the pickup point." },
  picked_up: { to: ["customer"], title: "Parcel collected", body: "Your rider has your parcel and is on the move." },
  en_route_dropoff: { to: ["customer"], title: "On the way to drop-off", body: "Your parcel is on the way to drop-off." },
  delivered: { to: ["customer"], title: "Delivered", body: "Your parcel was delivered — tap to rate your rider." },
  completed: { to: ["rider"], title: "Delivery complete", body: "Nice work — you're free for the next job." },
  expired: { to: ["customer"], title: "No riders yet", body: "No rider took your price yet. Try raising it and sending again." },
  // Terminal hand-off failure (C6/F-02): the RIDER marked it (they already know), so this pushes the
  // CUSTOMER only — the party who must learn their parcel wasn't delivered. Mirrors the FEED_NOTICES
  // `undelivered` copy so the in-app feed row matches the push the customer saw (the feed↔push contract).
  undelivered: { to: ["customer"], title: "Delivery couldn't be completed", body: "Your rider couldn't hand the parcel over — tap for details." },
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

  /**
   * The caller's in-app notifications feed (customer-journey A·3) — a READ-ONLY view derived from the
   * events of their own recent orders (across both roles), newest first and capped at
   * {@link FEED_ROW_CAP}. There is no Notification table: this reconstructs the same lifecycle beats
   * the user was pushed. `now` is injectable so unread-recency is deterministic under test.
   */
  async feedForUser(userId: string, now: Date = new Date()): Promise<NotificationRow[]> {
    const orders = await this.prisma.order.findMany({
      where: { OR: [{ customerId: userId }, { riderId: userId }] },
      orderBy: { createdAt: "desc" },
      take: FEED_ORDER_LOOKBACK,
      select: {
        id: true,
        riderId: true,
        events: {
          select: { status: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    const rows: NotificationRow[] = [];
    for (const order of orders) {
      // Pick the voice matching what this viewer actually experienced on THIS order — a dual-role user
      // can be the rider on one trip and the customer on another, so the role is per-order, not per-user.
      const notices = order.riderId === userId ? FEED_NOTICES_RIDER : FEED_NOTICES;
      for (const event of order.events) {
        const notice = notices[event.status];
        if (!notice) continue; // silent statuses (requested/open_for_offers) never surface, as with push
        const at = event.createdAt.toISOString();
        rows.push({
          // Stable per (order, status, time): an order can revisit a status, so the timestamp keys it.
          id: `${order.id}:${event.status}:${at}`,
          orderId: order.id,
          icon: notice.icon,
          title: notice.title,
          message: notice.message,
          at,
          unread: now.getTime() - event.createdAt.getTime() < FEED_UNREAD_WINDOW_MS,
        });
      }
    }

    // Newest first. ISO-8601 UTC strings sort lexicographically in time order.
    rows.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    return rows.slice(0, FEED_ROW_CAP);
  }

  /** Register a device token to the calling profile, re-homing it if it was owned by someone else.
   *  An FCM token is per physical install, so on a SHARED device (common in-market) user A signs out
   *  and user B signs in on the same token — B must claim it, or B gets no pushes AND A's private
   *  notifications keep flowing to what is now B's phone. Re-homing is safe here because the request is
   *  authenticated as the claimant (a valid session for B proves possession of the device) and the FCM
   *  token itself is an unguessable per-install secret — so this is not the "post a victim's token"
   *  hijack the old conflict-throw guarded against; it just moves delivery to the account currently
   *  signed in on the device, which is exactly what we want. */
  async registerToken(profileId: string, token: string, platform?: string): Promise<{ ok: true }> {
    // Upsert keyed on the token; on an existing row reassign it to the authenticated caller. `platform`
    // is optional on refresh — only overwrite it when the client actually sent one, so a token refresh
    // that omits platform doesn't blank a previously-recorded value.
    await this.prisma.deviceToken.upsert({
      where: { token },
      create: { profileId, token, platform: platform ?? null },
      update: { profileId, ...(platform !== undefined ? { platform } : {}) },
    });
    return { ok: true };
  }

  /** Drop a token for this profile (sign-out / disabled notifications). No-op if not owned. */
  async unregisterToken(profileId: string, token: string): Promise<{ ok: true }> {
    await this.prisma.deviceToken.deleteMany({ where: { token, profileId } });
    return { ok: true };
  }

  /** Notify the relevant party(ies) of an order-status transition. Best-effort, never throws.
   *  `excludeProfileId` drops one recipient — used to suppress a "cancelled" push to whoever just
   *  performed the cancel (a push about your own action is noise). */
  async notifyOrderStatus(
    orderId: string,
    status: string,
    data: Record<string, string> = {},
    excludeProfileId?: string,
  ): Promise<void> {
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
        .filter((id): id is string => !!id)
        .filter((id) => id !== excludeProfileId);
      await this.send(ids, { title: notice.title, body: notice.body, data: { orderId, status, ...data } });
    } catch (err) {
      this.logger.warn(`notifyOrderStatus(${orderId}, ${status}) failed: ${(err as Error).message}`);
    }
  }

  /**
   * Auction-expiry notice to the customer (§5c), in two honest variants. The default nudges the price
   * ("no rider took your price — try raising it"). But when the window closed with ZERO bids AND zero
   * riders online nearby (`noSupply`), "raise it" is misleading — the price was never the problem — so
   * the customer instead hears that nobody was online to take it. Best-effort, never throws.
   */
  async notifyOrderExpired(orderId: string, noSupply: boolean): Promise<void> {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        select: { customerId: true },
      });
      if (!order) return;
      const msg = noSupply
        ? {
            title: "No riders online nearby",
            body: "Nobody was online near your pickup just now — tap to get pinged when a rider comes online.",
          }
        : { title: STATUS_NOTICES.expired.title, body: STATUS_NOTICES.expired.body };
      await this.send([order.customerId], { ...msg, data: { orderId, status: "expired" } });
    } catch (err) {
      this.logger.warn(`notifyOrderExpired(${orderId}) failed: ${(err as Error).message}`);
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

  /**
   * 2·b1: ping customers who asked to be told when a rider comes online near their pickup (the
   * "notify me" on the no-riders-online auction state). Fan-out to the drained waiting list; the deep
   * link brings them back to re-broadcast. Best-effort, never throws.
   */
  async notifyRidersAvailable(customerProfileIds: string[]): Promise<Set<string>> {
    if (customerProfileIds.length === 0) return new Set();
    try {
      // Returns the set actually delivered to (F-18): the caller clears only those from the waiting
      // list and leaves the rest queued for the next nearby rider — so a no-token/transient-FCM miss
      // never silently drops a customer who asked to be told.
      return await this.send(customerProfileIds, {
        title: "A rider's online near you",
        body: "Riders are back near your pickup — send your parcel again to get offers.",
        data: { kind: "riders_available" },
      });
    } catch (err) {
      this.logger.warn(`notifyRidersAvailable failed: ${(err as Error).message}`);
      return new Set();
    }
  }

  /**
   * Best-effort push to an explicit set of profiles (trust & safety fan-outs — e.g. the SOS
   * counterparty alert). Empty/duplicate ids are handled by `send`. Never throws.
   */
  async notifyProfiles(
    profileIds: string[],
    msg: { title: string; body: string; data?: Record<string, string> },
  ): Promise<void> {
    try {
      await this.send(profileIds, msg);
    } catch (err) {
      this.logger.warn(`notifyProfiles failed: ${(err as Error).message}`);
    }
  }

  /**
   * Best-effort escalation push to every ops/admin profile (trust & safety: a raised issue, an SOS).
   * Resolves the admin audience server-side (role=admin) so callers never carry an ops recipient list.
   * Never throws — an ops-push failure can't roll back the safety event that triggered it.
   */
  async notifyOps(msg: { title: string; body: string; data?: Record<string, string> }): Promise<void> {
    try {
      const admins = await this.prisma.profile.findMany({ where: { role: "admin" }, select: { id: true } });
      await this.send(admins.map((a) => a.id), msg);
    } catch (err) {
      this.logger.warn(`notifyOps failed: ${(err as Error).message}`);
    }
  }

  /** Fan a message out to every device of the given profiles, and prune any token the provider
   *  reports as permanently dead. Returns the set of profile ids the provider ACCEPTED at least one
   *  device for (used by the F-18 "notify me" at-least-once drain to clear only delivered waiters; other
   *  callers ignore it). Private; all callers pre-wrap in try/catch. */
  private async send(
    profileIds: string[],
    msg: { title: string; body: string; data?: Record<string, string> },
  ): Promise<Set<string>> {
    if (profileIds.length === 0) return new Set();
    const tokens = await this.prisma.deviceToken.findMany({
      where: { profileId: { in: profileIds } },
      select: { token: true, profileId: true },
    });
    if (tokens.length === 0) return new Set();

    // One batched provider call (FCM sendEach, chunked ≤500) instead of a per-token round-trip fan-out.
    // Results align with `tokens` order, so a dead token is pruned — and a delivery credited — by position.
    const results = await this.push.sendEach(
      tokens.map((t) => ({ token: t.token, title: msg.title, body: msg.body, data: msg.data })),
    );

    // A profile counts as delivered if the provider accepted at least one of its devices (`ok`). A
    // transient whole-batch failure resolves every result to `ok:false` → nobody is credited → the F-18
    // caller re-queues them for the next rider.
    const delivered = new Set<string>();
    tokens.forEach((t, i) => {
      if (results[i]?.ok) delivered.add(t.profileId);
    });

    // Drop tokens the provider says are unregistered/invalid so the table doesn't grow unbounded and
    // we stop sending to dead devices (a token FCM later reassigns won't keep delivering to the wrong user).
    const dead = tokens.filter((_, i) => results[i]?.invalidToken).map((t) => t.token);
    if (dead.length > 0) {
      await this.prisma.deviceToken.deleteMany({ where: { token: { in: dead } } });
      this.logger.log(`pruned ${dead.length} dead device token(s)`);
    }
    return delivered;
  }
}
