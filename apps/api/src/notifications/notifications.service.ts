import { Inject, Injectable, Logger } from "@nestjs/common";
import { OFFER_WINDOW_MS } from "@lynia/shared";
import { androidChannelFor, PUSH, type PushAdapter } from "../adapters/push/push.interface";
import { PrismaService } from "../prisma/prisma.service";
import { auditData } from "../admin/admin.shared";
import { pushCopy, pushMoney, PUSH_C } from "./merchant-order-push";

/**
 * TTL (seconds) for time-critical broadcast/rebroadcast/riders-available pushes: the offer window. A
 * "new delivery nearby" (or "a rider's online near you") is worthless once the auction window it refers
 * to has closed, so the provider drops it rather than delivering it hours later when a dead-zone rider
 * comes back online. Derived from the shared OFFER_WINDOW_MS — not a new magic number.
 */
const BROADCAST_PUSH_TTL_SECONDS = Math.ceil(OFFER_WINDOW_MS / 1000);

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
export const STATUS_NOTICES: Record<string, Notice> = {
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

/** The suggested resend step after a closed window (after-send v2 "Send again at $X" = last price + $0.50). */
const RESEND_STEP = 0.5;

/** "$3.36" — a fare as the after-send copy writes it. */
function money(value: unknown): string {
  return `$${(Math.round(Number(value) * 100) / 100).toFixed(2)}`;
}

/** "09:31" in Harare time — the delivered push's hand-over time. */
function harareTime(at: Date): string {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Africa/Harare" }).format(at);
}

/** Why a hand-off failed, in the not-delivered sheet's own words (after-send v2 "REASON FROM YOUR RIDER"). */
const UNDELIVERED_REASON_COPY: Record<string, string> = {
  unreachable: "Recipient didn't answer.",
  refused: "Recipient refused the parcel.",
  wrong_address: "The address was wrong.",
  breakdown: "The bike broke down.",
};

interface ParcelCopyOrder {
  dropoff?: unknown;
  deliveredAt?: Date | null;
  undeliveredReason?: string | null;
  rider?: { profile?: { firstName?: string | null } | null } | null;
}

/**
 * After-send v2: the parcel CUSTOMER's stage-push copy, named and placed off the order. Null for a status
 * whose copy is the static STATUS_NOTICES entry. No server-side ETA exists for a leg, so the design's
 * "Arriving in about N min" / "About N min" clauses are dropped rather than invented, and no push names
 * the delivery code. `en_route_dropoff` keeps the static copy: it fires when the rider LEAVES the pickup,
 * so the design's "is at the drop-off" (an arrival the server never observes) would be false there.
 */
function parcelCustomerCopy(status: string, order: ParcelCopyOrder): { title: string; body: string } | null {
  const first = order.rider?.profile?.firstName?.trim() || null;
  switch (status) {
    case "en_route_pickup":
      return { title: `${first ?? "Your rider"} is on the way to pickup`, body: "Open to see your delivery code." };
    case "picked_up": {
      const landmark = (order.dropoff as { landmark?: unknown } | null | undefined)?.landmark;
      const where = typeof landmark === "string" && landmark.trim() ? landmark.trim() : "the drop-off";
      return { title: `${first ?? "Your rider"} has your parcel`, body: `On the way to ${where}.` };
    }
    case "delivered": {
      const rate = `Tap to rate ${first ?? "your rider"}.`;
      return { title: "Parcel delivered", body: order.deliveredAt ? `Handed over at ${harareTime(new Date(order.deliveredAt))}. ${rate}` : rate };
    }
    case "undelivered": {
      const reason = (order.undeliveredReason && UNDELIVERED_REASON_COPY[order.undeliveredReason]) || null;
      const call = `Call ${first ?? "your rider"} to sort it out.`;
      return { title: `${first ?? "Your rider"} couldn't deliver your parcel`, body: reason ? `${reason} ${call}` : call };
    }
    // The customer is excluded from a cancel they made, and a rider's cancel sends the rebroadcast
    // notice instead (OrderLifecycleService.cancel) — so the customer hears this when LyniaGo cancels.
    case "cancelled":
      return { title: "Your order was cancelled", body: "Open to see why. Nothing to pay." };
    default:
      return null;
  }
}

/**
 * C5: a food order's own curated push contract (packages/design/RESTAURANTS-DECISIONS.md §3
 * "Customer notifications" — "No push for step changes in between, the tracker is enough"). Only
 * `en_route_dropoff` ("rider is at your door") is generic-status-driven; the other two named pushes
 * (accepted-pay-now, rider-secured) are sent directly by FoodOrderService/FoodDispatchService at
 * their own call sites, since they carry richer action-button/persistence data than a plain status
 * notice. Deliberately NOT merged into STATUS_NOTICES — that table is parcel-voiced copy and a food
 * order rides the same `en_route_dropoff` edge with different words for a different audience.
 */
export const MERCHANT_STATUS_NOTICES: Partial<Record<string, Notice>> = {
  // Order flow v2 G3a (ledger D-59, BRIEF §15 "push follows the stage"): collected, at the door,
  // delivered and not delivered, in `O.g.push.c`'s words (merchantCustomerCopy fills the names). The
  // static title/body here is the no-name fallback.
  picked_up: { to: ["customer"], title: "Your rider has your order", body: "On the way." },
  // A food order's `en_route_dropoff` is the rider ARRIVING at the door (the cash handshake opens on it).
  en_route_dropoff: { to: ["customer"], title: "Your rider is at your door", body: "Have your cash ready." },
  delivered: { to: ["customer"], title: "Delivered", body: "Enjoy!" },
  undelivered: { to: ["customer"], title: "Your order wasn’t delivered", body: "Nothing was charged." },
};

interface MerchantCopyOrder {
  agreedFare?: unknown;
  undeliveredReason?: string | null;
  merchant?: { name?: string | null } | null;
  rider?: { profile?: { firstName?: string | null } | null } | null;
}

/**
 * Order flow v2 G3a: a merchant order's customer stage push, named (`O.g.push.c` via merchant-order-push).
 * Never a code; the server has no arrival estimate, so the ETA sentence is dropped.
 */
export function merchantCustomerCopy(status: string, order: MerchantCopyOrder): { title: string; body: string } | null {
  const n = order.rider?.profile?.firstName?.trim() || null;
  const v = order.merchant?.name?.trim() || null;
  const fallback = { n: "Your rider" };
  switch (status) {
    case "picked_up":
      return pushCopy(PUSH_C.collected, { n }, fallback);
    case "en_route_dropoff":
      return pushCopy(PUSH_C.atDoor, { n, p: order.agreedFare == null ? null : pushMoney(order.agreedFare) }, fallback);
    case "delivered":
      // "Tap to rate {v} and {n}." needs both names; without them the push is just "Delivered · Enjoy!".
      return pushCopy(PUSH_C.delivered, v && n ? { v, n } : {});
    case "undelivered":
      // "{n} couldn’t reach you." only when that is why.
      return pushCopy(PUSH_C.notDelivered, order.undeliveredReason === "unreachable" ? { n } : {});
    default:
      return null;
  }
}

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
      // Cheap pre-check so a status in neither table (e.g. `open_for_offers`) skips the order lookup
      // entirely, same as before this method knew about two tables instead of one.
      if (!(status in STATUS_NOTICES) && !(status in MERCHANT_STATUS_NOTICES)) return;
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        select: {
          customerId: true,
          riderId: true,
          orderType: true,
          // parcelCustomerCopy's inputs. Never the delivery code — no push carries it.
          dropoff: true,
          deliveredAt: true,
          undeliveredReason: true,
          rider: { select: { profile: { select: { firstName: true } } } },
          // Order flow v2 G3a: the venue and the cash amount for a merchant order's stage push.
          agreedFare: true,
          merchant: { select: { name: true } },
        },
      });
      if (!order) return;
      // A-6 (status-keyed-query-audit): STATUS_NOTICES is parcel-voiced copy ("Your parcel was
      // delivered"); a food order gets its own smaller, food-voiced table (MERCHANT_STATUS_NOTICES,
      // C5) rather than the full parcel set — silently no-op on any status not in that curated list
      // rather than send a customer misleading Express copy about their food order.
      const notice = order.orderType === "merchant" ? MERCHANT_STATUS_NOTICES[status] : order.orderType === "parcel" ? STATUS_NOTICES[status] : undefined;
      if (!notice) return;
      // Fix 3: stamp each recipient's PER-ORDER role (`to`) onto the push so the client routes by the
      // order relationship, not the account's global session role — a rider-role account acting as the
      // customer on THIS order must open /order/:id, not /rider/job. Sent per-audience so each carries
      // its own `to` (only multi-audience statuses like `cancelled` produce more than one send). The
      // field is additive on the wire; older clients ignore it and fall back to the session role.
      for (const aud of notice.to) {
        const id = aud === "customer" ? order.customerId : order.riderId;
        if (!id || id === excludeProfileId) continue;
        // After-send v2: a parcel customer's stage pushes name the rider and the place/time.
        const copy =
          (aud === "customer" && order.orderType === "parcel" && parcelCustomerCopy(status, order)) ||
          (aud === "customer" && order.orderType === "merchant" && merchantCustomerCopy(status, order)) ||
          notice;
        // D-O3: a caller retrying/duplicating the same order+status transition (no idempotency key
        // upstream) must replace this recipient's still-undelivered tray entry, not stack a second one.
        await this.send([id], {
          title: copy.title,
          body: copy.body,
          // Stamp the order type so the client opens the right tracker on tap: a food (merchant) order
          // must land on /food/order/:id, not the parcel-voiced /order/:id. Additive on the wire —
          // older clients ignore it and fall back to /order/:id (the prior, food-mis-routing behaviour).
          data: { orderId, status, to: aud, orderType: order.orderType, ...data },
          collapseKey: `order:${orderId}:${status}`,
        });
      }
    } catch (err) {
      this.logger.warn(`notifyOrderStatus(${orderId}, ${status}) failed: ${(err as Error).message}`);
    }
  }

  /**
   * Auction-expiry notice to the customer (§5c), in two variants:
   *  - `noSupply` (zero bids AND nobody online near the pickup) — "raise it" would be a lie, so the
   *    customer hears that nobody was online to take it.
   *  - otherwise — after-send v2's "No rider took $3.36 / Send again at $3.86 in one tap.", with or
   *    without bids (`hadOffers` no longer changes the copy; kept for the caller's signature).
   * Best-effort, never throws.
   */
  async notifyOrderExpired(orderId: string, noSupply: boolean, _hadOffers = false): Promise<void> {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        select: { customerId: true, proposedFare: true },
      });
      if (!order) return;
      // After-send v2 "No match": the closed price, and the one-tap resend at the suggested price (the
      // last price + RESEND_STEP, the same suggestion the No-match sheet draws). Applies whether or not
      // riders bid — either way nobody took it in time. Without a readable price, the static notice.
      const fare = order.proposedFare == null ? NaN : Number(order.proposedFare);
      const msg = noSupply
        ? {
            title: "No riders online nearby",
            body: "Nobody was online near your pickup just now — tap to get pinged when a rider comes online.",
          }
        : Number.isFinite(fare)
          ? { title: `No rider took ${money(fare)}`, body: `Send again at ${money(fare + RESEND_STEP)} in one tap.` }
          : { title: STATUS_NOTICES.expired.title, body: STATUS_NOTICES.expired.body };
      await this.send([order.customerId], { ...msg, data: { orderId, status: "expired" } });
    } catch (err) {
      this.logger.warn(`notifyOrderExpired(${orderId}) failed: ${(err as Error).message}`);
    }
  }

  /**
   * Notify a customer that a rider has responded to their broadcast. Best-effort, never throws.
   * After-send v2 copy: the FIRST pending offer names the rider, the price and their pickup ETA; once
   * two or more are pending it's a count. One collapse key per order, so the tray keeps only the
   * latest ("3 offers for your parcel" replaces "New offer: $3.00").
   */
  async notifyNewOffer(orderId: string, customerId: string): Promise<void> {
    try {
      await this.send([customerId], {
        ...(await this.newOfferCopy(orderId)),
        data: { orderId, kind: "offer" },
        collapseKey: `order:${orderId}:offers`,
      });
    } catch (err) {
      this.logger.warn(`notifyNewOffer(${orderId}) failed: ${(err as Error).message}`);
    }
  }

  /** The new-offer copy off the order's live pending offers. A lookup failure falls back to the count
   *  copy's wording, so the push still goes out. */
  private async newOfferCopy(orderId: string): Promise<{ title: string; body: string }> {
    const fallback = { title: "New offer for your parcel", body: "Choose a rider before the timer ends." };
    try {
      const pending = await this.prisma.offer.findMany({
        where: { orderId, status: "pending" },
        orderBy: { createdAt: "desc" },
        take: 2,
        select: {
          offeredFare: true,
          etaMinutes: true,
          rider: { select: { profile: { select: { firstName: true, lastName: true } } } },
        },
      });
      if (pending.length === 0) return fallback;
      if (pending.length > 1) {
        const count = await this.prisma.offer.count({ where: { orderId, status: "pending" } });
        return { title: `${count} offers for your parcel`, body: "Choose a rider before the timer ends." };
      }
      const [offer] = pending;
      const profile = offer.rider?.profile;
      const first = profile?.firstName?.trim();
      const initial = profile?.lastName?.trim().charAt(0);
      const who = first ? (initial ? `${first} ${initial.toUpperCase()}.` : first) : "A rider";
      return {
        title: `New offer: ${money(offer.offeredFare)}`,
        body: `${who} can pick up in ${offer.etaMinutes} min. Choose before the timer ends.`,
      };
    } catch {
      return fallback;
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
    // DS17-01: the create-time broadcast fires at t≈0 so the flat OFFER_WINDOW-long default TTL is
    // correct for it. The WIDENING rebroadcast (MatchingService.expandBroadcast) fires MID-window, so it
    // passes the order's ACTUAL remaining life here instead — otherwise a 90s TTL computed from SEND time
    // outlives the order's own 90s auction window and a reconnecting dead-zone rider could tap a push for
    // an already-expired/assigned order. Default preserved so every OTHER caller is unaffected.
    ttlSeconds: number = BROADCAST_PUSH_TTL_SECONDS,
  ): Promise<void> {
    try {
      await this.send(riderProfileIds, {
        title: "New delivery nearby",
        body: `Pickup at ${info.pickup} · asking $${info.fare} — tap to bid before it's taken.`,
        data: { orderId, kind: "broadcast" },
        // Fix 5: drop the push once the auction window has passed — a stale "new delivery nearby" landing
        // hours later (rider was in a dead zone) is pure noise. DS17-01: for the widening rebroadcast the
        // caller passes the order's remaining window here so the TTL tracks order age, not send time.
        ttlSeconds,
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
  async notifyRidersAvailable(waiters: Array<{ profileId: string; orderId?: string }>): Promise<Set<string>> {
    if (waiters.length === 0) return new Set();
    try {
      // KB-NOTIFY-ORDERID: for waiters whose ORIGINAL auction is still open, "your auction died, send
      // again" would be a lie — riders are being pinged on their live request right now. Resolve which
      // referenced orders are still open_for_offers in ONE batched query, then branch the copy: a live
      // order gets honest "we're pinging riders on your live request" copy + its orderId (the tap lands
      // back on that auction); everything else keeps today's generic re-broadcast nudge with no orderId.
      const orderIds = [...new Set(waiters.map((w) => w.orderId).filter((id): id is string => !!id))];
      const openIds = new Set<string>();
      // DS17-01: alongside "is this order still open" also capture its createdAt, so the live-order push
      // below can compute how much of THAT order's own 90s window is left and set a TTL that tracks order
      // age rather than send time — a flat OFFER_WINDOW TTL on a push sent late in the window outlives the
      // auction it points at.
      const createdAtByOrder = new Map<string, Date>();
      if (orderIds.length > 0) {
        const openOrders = await this.prisma.order.findMany({
          where: { id: { in: orderIds }, status: "open_for_offers" },
          select: { id: true, createdAt: true },
        });
        for (const o of openOrders) {
          openIds.add(o.id);
          createdAtByOrder.set(o.id, o.createdAt);
        }
      }

      // Returns the set actually delivered to (F-18): the caller clears only those from the waiting
      // list and leaves the rest queued for the next nearby rider — so a no-token/transient-FCM miss
      // never silently drops a customer who asked to be told.
      const delivered = new Set<string>();

      // UX21-02: this push (unlike every other single-recipient push type — offers, account/standing
      // changes, fare-adjust, issue-resolved, SOS) had no KB-FEED-SYNTH durable feed fallback, so a
      // customer who missed it (backgrounded app, cleared OS tray, a different device) could never learn
      // a rider came online near them. Written for every waiter processed here, independent of push
      // delivery (mirroring adjustFare's audit-then-best-effort-push shape), in its own try/catch so a
      // transient DB hiccup can never block the push sends below. Live-order waiters key the row to the
      // order (`order.riders_available_notify`, synthesized in notifications-feed.service.ts alongside
      // `order.fare_adjust`); everyone else keys it to their own profile (`customer.riders_available_notify`,
      // an ACCOUNT_FEED_COPY entry — there's no specific order left to reference).
      try {
        const auditRows = waiters.map((w) =>
          w.orderId && openIds.has(w.orderId)
            ? auditData("system:notify-riders-available", "order.riders_available_notify", w.orderId)
            : auditData("system:notify-riders-available", "customer.riders_available_notify", w.profileId),
        );
        if (auditRows.length > 0) await this.prisma.auditLog.createMany({ data: auditRows });
      } catch (err) {
        this.logger.warn(`notifyRidersAvailable feed-fallback audit write failed: ${(err as Error).message}`);
      }

      // Live-order waiters: one push each (each carries its own orderId). A customer has at most one
      // waiter and an order has one customer, so there's no batching to share here.
      for (const w of waiters) {
        if (!w.orderId || !openIds.has(w.orderId)) continue;
        // DS17-01: size the TTL to the order's ACTUAL remaining life, not a flat OFFER_WINDOW from send
        // time. A push sent late in the window with a full-window TTL stays valid in the provider past the
        // moment the order's auction closes; if the window has already elapsed, don't push a dead reference
        // at all (the waiter stays queued for the next nearby rider — F-18 at-least-once).
        const createdAt = createdAtByOrder.get(w.orderId);
        const remainingMs = createdAt ? createdAt.getTime() + OFFER_WINDOW_MS - Date.now() : BROADCAST_PUSH_TTL_SECONDS * 1000;
        if (remainingMs <= 0) continue;
        const got = await this.send([w.profileId], {
          title: "A rider's online near you",
          body: "Riders are being pinged on your live request — tap to follow the offers.",
          data: { kind: "riders_available", orderId: w.orderId },
          // Fix 5: time-critical — a rider being online is a fleeting signal, so a push that lands long
          // after the window is stale (they may be offline again). Drop it rather than deliver it late.
          ttlSeconds: Math.max(1, Math.ceil(remainingMs / 1000)),
        });
        for (const id of got) delivered.add(id);
      }

      // Everyone else — no orderId, or the order is no longer open — keeps today's copy/data exactly.
      const genericIds = waiters.filter((w) => !w.orderId || !openIds.has(w.orderId)).map((w) => w.profileId);
      if (genericIds.length > 0) {
        const got = await this.send(genericIds, {
          title: "A rider's online near you",
          body: "Riders are back near your pickup — send your parcel again to get offers.",
          data: { kind: "riders_available" },
          ttlSeconds: BROADCAST_PUSH_TTL_SECONDS,
        });
        for (const id of got) delivered.add(id);
      }
      return delivered;
    } catch (err) {
      this.logger.warn(`notifyRidersAvailable failed: ${(err as Error).message}`);
      return new Set();
    }
  }

  /**
   * UX-2026-07-15: tell the opener of a "get help with this trip" issue how it was resolved. Before
   * this, `IssuesService.resolve` wrote the resolution + a refund/strike side-effect + an audit row, but
   * never told the customer/rider who raised it — the opener had no push, no feed row, and no status
   * endpoint to check, so a real problem could silently vanish from their view forever. Mirrors the
   * `raise()` escalation's best-effort/never-throws shape. `orderId` rides along so the tap lands back on
   * the trip (kind: "issue" is a routable non-status push, same pattern as "offer"/"broadcast").
   */
  async notifyIssueResolved(
    profileId: string,
    orderId: string,
    resolution: "refund" | "rider_strike" | "close_no_action",
    riderOrderStatus?: string,
  ): Promise<void> {
    try {
      const copy =
        resolution === "refund"
          ? { title: "Your report was resolved", body: "We've recorded a refund for this trip — tap for details." }
          : resolution === "rider_strike"
            ? { title: "Your report was resolved", body: "We've taken action on this trip — thanks for flagging it." }
            : { title: "Your report was resolved", body: "We looked into this trip and closed it out — tap for details." };
      // UX26-03 sibling: `riderOrderStatus` is only ever passed when the opener IS the rider (see
      // IssuesService.resolve) — see AdminOrdersService.adjustFare for why this must stay scoped to the
      // rider's own push and never stamped on a customer's.
      const data: Record<string, string> = { orderId, kind: "issue" };
      if (riderOrderStatus !== undefined) {
        data.status = riderOrderStatus;
        data.to = "rider";
      }
      await this.send([profileId], { ...copy, data });
    } catch (err) {
      this.logger.warn(`notifyIssueResolved(${orderId}) failed: ${(err as Error).message}`);
    }
  }

  /**
   * Best-effort push to an explicit set of profiles (trust & safety fan-outs — e.g. the SOS
   * counterparty alert). Empty/duplicate ids are handled by `send`. Never throws.
   */
  async notifyProfiles(
    profileIds: string[],
    msg: { title: string; body: string; data?: Record<string, string>; collapseKey?: string; silent?: boolean },
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
      const adminIds = admins.map((a) => a.id);
      // DS13-05: this push is the SOLE escalation channel for a raised SOS, and it swallows failures. If it
      // fans out to ZERO recipients — no admin profile, or (far more likely) no admin has a registered
      // DeviceToken because the admin WEB console registers none — the safety event vanishes silently while
      // the counterparty is told "the safety team has been alerted". Emit a loud error so a token-less ops
      // audience is observable in the logs/alerting. Delivery behaviour is unchanged (send still runs below).
      const tokenCount =
        adminIds.length === 0 ? 0 : await this.prisma.deviceToken.count({ where: { profileId: { in: adminIds } } });
      if (tokenCount === 0) {
        this.logger.error(
          `notifyOps reached ZERO recipients (admins=${adminIds.length}, deviceTokens=0) for "${msg.title}" — ops has no registered device; the escalation was not delivered. data=${JSON.stringify(msg.data ?? {})}`,
        );
      }
      await this.send(adminIds, msg);
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
    msg: { title: string; body: string; data?: Record<string, string>; ttlSeconds?: number; collapseKey?: string; silent?: boolean },
  ): Promise<Set<string>> {
    if (profileIds.length === 0) return new Set();
    const tokens = await this.prisma.deviceToken.findMany({
      where: { profileId: { in: profileIds } },
      // `platform` routes each device to its transport — iOS tokens are raw APNs tokens (PlatformRoutedPush).
      select: { token: true, profileId: true, platform: true },
    });
    if (tokens.length === 0) return new Set();

    // One batched provider call (FCM sendEach, chunked ≤500) instead of a per-token round-trip fan-out.
    // Results align with `tokens` order, so a dead token is pruned — and a delivery credited — by position.
    // `ttlSeconds`/`collapseKey` (when set by the caller) ride through to the adapter's provider fields.
    // Rider job pings and food-offer alarms post on the `job-alerts` Android channel (D-81 P12).
    const channelId = androidChannelFor(msg.data);
    const results = await this.push.sendEach(
      tokens.map((t) => ({
        token: t.token,
        platform: t.platform,
        title: msg.title,
        body: msg.body,
        data: msg.data,
        ttlSeconds: msg.ttlSeconds,
        collapseKey: msg.collapseKey,
        ...(channelId ? { channelId } : {}),
        ...(msg.silent ? { silent: true } : {}),
      })),
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
