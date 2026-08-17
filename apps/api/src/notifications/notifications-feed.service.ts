import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/**
 * A single row in the derived in-app notifications feed (customer-journey A·3). Notifications are
 * PUSH-ONLY (FCM) — there is no Notification table — so the feed is READ-ONLY and reconstructed from
 * the caller's own order events on read. `icon` is a mobile IconName; `at` is ISO-8601.
 */
export interface NotificationRow {
  id: string;
  // Nullable since KB-FEED-SYNTH: account-status rows (KYC / standing changes) are account-level, not
  // order-level, so they carry no orderId; the client routes those to the rider home instead.
  orderId: string | null;
  // BH-18: which account this orderId-less row is about — set on account-status rows (KYC/standing
  // changes are almost always the RIDER's own; `customer.hold`/`customer.lift` are the one class that's
  // about the viewing CUSTOMER). Mirrors the `to` field pushes already stamp on dual-audience events
  // (see notifications.service.ts `Audience`).
  // UX19-03: also set on order-status rows, to the VIEWER's per-order role (the same voice FEED_NOTICES
  // vs. FEED_NOTICES_RIDER was already chosen for) — lets the client replicate `pushDestination`'s
  // rider-only screen routing (`notificationRowDestination`) instead of always falling back to /order/:id.
  to?: "customer" | "rider";
  // UX19-03: the raw order-status this row is about (undefined for offer/account rows, which don't need
  // status-aware routing). Mirrors the `status` field `pushDestination` already branches on.
  status?: string;
  icon: string;
  title: string;
  message: string;
  at: string;
  unread: boolean;
}

/**
 * How an order-status event renders as a feed row. Deliberately mirrors NotificationsService's
 * STATUS_NOTICES copy so the in-app centre reads the same as the push the user already saw. Statuses
 * absent here (e.g. `requested`, `open_for_offers`) are silent in the feed exactly as they are for
 * push. Icons are valid mobile IconNames (see apps/mobile/src/ui/Icon.tsx). Customer-voiced — used
 * when the viewing user is the order's customer.
 */
const FEED_NOTICES: Record<string, { icon: string; title: string; message: string }> = {
  assigned: { icon: "bike", title: "Rider assigned", message: "A rider took your delivery and is confirming the details." },
  confirmed: { icon: "check", title: "Rider confirmed your items", message: "Your rider has reviewed the parcel details." },
  en_route_pickup: { icon: "bike", title: "Rider on the way", message: "Your rider is heading to the pickup point." },
  picked_up: { icon: "check", title: "Parcel collected", message: "Your rider has your parcel and is on the move." },
  en_route_dropoff: { icon: "navigation", title: "On the way to drop-off", message: "Your parcel is on the way to drop-off." },
  delivered: { icon: "check", title: "Delivered", message: "Your parcel was delivered — rate your rider." },
  completed: { icon: "check", title: "Delivery complete", message: "This trip is done. Thanks for using LyniaGo." },
  expired: { icon: "clock", title: "No riders yet", message: "No rider took your price yet. Try raising it and sending again." },
  undelivered: { icon: "triangle-alert", title: "Delivery couldn't be completed", message: "Your rider couldn't hand the parcel over — tap for details." },
  cancelled: { icon: "triangle-alert", title: "Order cancelled", message: "This delivery was cancelled." },
};

/**
 * Rider-voiced counterpart to {@link FEED_NOTICES}. Dual-role users (a rider's own trip history) were
 * getting the customer-voiced copy above verbatim — "A rider took your delivery", "rate your rider" —
 * about jobs they themselves ran, breaking the "mirrors the push you actually saw" contract (their real
 * push for `assigned`/`completed` is the rider copy in NotificationsService's STATUS_NOTICES). `expired`
 * never applies to a rider view (an order only expires before any rider is assigned) so it's omitted.
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

/**
 * STREAMLINE-01 (owner decision 2026-08-17): which AUDIENCE each order-status row is for — a verbatim
 * mirror of the `to` arrays in NotificationsService's {@link STATUS_NOTICES}, which is the table that
 * decides who actually receives the push.
 *
 * The feed's founding contract is "the in-app centre reads the same as the push the user already saw"
 * (see FEED_NOTICES above). It never held: the synthesizer rendered EVERY mapped status to BOTH parties
 * in their own voice, while the push table sends 6 of the 10 statuses to ONE party only. A rider was
 * shown seven rows per job (`assigned` → `completed`) having been pushed two; a customer was shown
 * `assigned`/`completed` rows for pushes that only ever went to the rider. That gap was the single
 * largest source of feed volume, and it is why a couple of trips could evict every account-level row.
 *
 * Gating the feed on the same audience the push uses closes it. The table is duplicated rather than
 * imported-and-mapped so the two can be diffed as data; `notifications-feed.service.spec.ts` asserts
 * key-for-key + audience-for-audience equality with STATUS_NOTICES, so the next status added to one
 * table without the other fails at test time (the same write-time-guard idiom FEED_READ_ACTIONS uses).
 */
const FEED_AUDIENCE: Record<string, readonly ("customer" | "rider")[]> = {
  assigned: ["rider"],
  confirmed: ["customer"],
  en_route_pickup: ["customer"],
  picked_up: ["customer"],
  en_route_dropoff: ["customer"],
  delivered: ["customer"],
  completed: ["rider"],
  expired: ["customer"],
  undelivered: ["customer"],
  cancelled: ["customer", "rider"],
};

/** Exported for the colocated audience-agreement guardrail (see {@link FEED_AUDIENCE}). */
export const FEED_STATUS_AUDIENCE = FEED_AUDIENCE;

/**
 * KB-FEED-SYNTH: account-status feed rows, synthesized from the generic `AuditLog` (no Notification
 * table). Keyed by the exact `auditData(...)` action strings the admin standing changes
 * (admin-riders.service) and KYC decisions (rider.service adminSetKyc / applyKycResult) already write,
 * with copy MIRRORING the actual push the user received for each (the feed↔push contract). `expire`/
 * `reset` KYC actions are deliberately silent (no push), so they're absent here. These rows carry no
 * orderId (account-level). `rider.ban` has no rider-facing push, so its copy is honest account language.
 */
const ACCOUNT_FEED_COPY: Record<string, { icon: string; title: string; message: string }> = {
  "rider.kyc_approve": { icon: "id-card", title: "You're verified", message: "You're verified — go online to start taking deliveries." },
  "rider.kyc_decline": { icon: "triangle-alert", title: "ID check needs another look", message: "We couldn't verify your ID — open the app to see why and try again." },
  "rider.suspend": { icon: "triangle-alert", title: "Account paused", message: "Your account was paused — open the app for details." },
  "rider.ban": { icon: "triangle-alert", title: "Account blocked", message: "Your account was blocked — contact support for details." },
  "rider.lift": { icon: "check", title: "Account restored", message: "Your account is back in good standing — you can go online again." },
  "rider.clear_hold": { icon: "check", title: "Account restored", message: "Your account is back in good standing — you can go online again." },
  // UX18-04: customer.hold/lift previously sent zero push AND zero feed row (AdminCustomersService had
  // no NotificationsService dependency at all) — a held customer's only signal was a 403 the next time
  // they tried to broadcast. Copy mirrors the push now sent alongside the audit write.
  "customer.hold": { icon: "triangle-alert", title: "Account paused", message: "Your account was paused — open the app for details." },
  "customer.lift": { icon: "check", title: "Account restored", message: "Your account is back in good standing — you can place orders again." },
  // UX18-04 sibling: a manual wallet credit (creditManual) previously sent zero push AND zero feed row
  // either — the rider's balance changed with no proactive signal of any kind. Copy mirrors the push.
  "wallet.credit": { icon: "banknote", title: "Wallet credited", message: "Your wallet balance was credited — open the app to see the new balance." },
  // UX21-02: the generic (no-live-order) half of "notify me when a rider's online" had no feed fallback
  // either — there's no specific order left to reference by the time riders come back online, so this is
  // an account-level row (orderId: null) like the standing/KYC rows above. Copy mirrors the push.
  "customer.riders_available_notify": {
    icon: "bike",
    title: "A rider's online near you",
    message: "Riders are back near your pickup — send your parcel again to get offers.",
  },
};
const ACCOUNT_FEED_ACTIONS = Object.keys(ACCOUNT_FEED_COPY);

/**
 * DS21-02: every `AuditLog.action` string this feed synthesizer reads back to render a row — the union of
 * {@link ACCOUNT_FEED_COPY}'s profile-targeted account actions and the order-targeted inline literals used
 * in the `where: { action: … }` reads inside {@link NotificationsFeedService.feedForUser}. Each of these is
 * trusted to synthesize a feed row from a bare `AuditLog` entry, so EVERY one must also be reserved in
 * admin-audit.service's `RESERVED_AUDIT_ACTIONS` — otherwise the free-text `POST /admin/audit-actions` path
 * could forge a compliance-audit row that renders as a real feed notification with no underlying mutation.
 * This is the audit-forgery class WD-023 fixed once for the KYC strings and UX21-02 silently reopened for
 * the two `riders_available_notify` actions. A colocated unit test (`admin-audit.service.spec`) asserts
 * `FEED_READ_ACTIONS ⊆ RESERVED_AUDIT_ACTIONS`, so the next feed-read action added here without reserving
 * it fails at test time — converting this recurring drift into a write-time guard so it can't recur again.
 * NOTE: keep this in sync when adding any new `action:` read to `feedForUser` (the test enforces it).
 */
export const FEED_READ_ACTIONS: readonly string[] = [
  ...ACCOUNT_FEED_ACTIONS,
  "order.adjudicate_delivered",
  "order.rider_standing_notice",
  "order.rider_standing_resolved",
  "order.fare_adjust",
  "order.riders_available_notify",
];

/**
 * UX-2026-07-16: feed copy for a resolved "get help with this trip" issue, mirroring
 * `notifyIssueResolved`'s push copy word-for-word (the feed↔push contract every other push type already
 * has). Before this, a resolved issue had a best-effort push and nothing else — if the push was missed
 * (the order is usually long-completed and off-screen by resolution time, so the opener has likely
 * backgrounded/force-quit), there was zero durable trace anywhere that the report was ever resolved.
 */
const ISSUE_RESOLUTION_FEED_COPY: Record<"refund" | "rider_strike" | "close_no_action", { title: string; message: string }> = {
  refund: { title: "Your report was resolved", message: "We've recorded a refund for this trip — tap for details." },
  rider_strike: { title: "Your report was resolved", message: "We've taken action on this trip — thanks for flagging it." },
  close_no_action: { title: "Your report was resolved", message: "We looked into this trip and closed it out — tap for details." },
};

/**
 * STREAMLINE-01 (owner decision 2026-08-17): **notifications live for exactly one day.**
 *
 * The previous model had no time-based retention at all — a row's life was implied by two COUNT caps
 * (30 most recent orders, 30 merged rows), which made retention a function of the viewer's own order
 * volume rather than of time: a busy rider saw five days, a once-a-year customer saw rows from last
 * January, and neither could predict which. This is the single window that replaces both reaches, and
 * it is applied UNIFORMLY — there are deliberately no long-lived carve-outs, so an account-standing or
 * resolved-issue row ages out at 24h like everything else. Those states all have a durable home of
 * their own (account standing on the Account/rider screens, KYC on Bike & documents, money in Money,
 * trips in Orders); the feed is the "what happened since yesterday" inbox, not the archive.
 *
 * Because nothing in the feed outlives the window, a dismissal never has to outlive it either — see
 * {@link NotificationsFeedService.dismiss}, which prunes on write against this same constant.
 */
const FEED_RETENTION_MS = 24 * 60 * 60 * 1000;

/**
 * How many of the caller's recent orders the synthesizer scans, and the cap on rows returned.
 *
 * The order scan is now a SAFETY bound, not the retention mechanism: the query also requires at least
 * one in-window event, so on real data it returns far fewer than this. The row cap rises from 30 to 50
 * because the collapse rules below (one status row per order, one offer row per order) cut rows per
 * order from as many as ten to two — the visible list gets shorter, not longer, despite the bigger cap.
 */
const FEED_ORDER_SCAN_CAP = 50;
const FEED_ROW_CAP = 50;

/**
 * The caller's read-only, derived in-app notifications feed (customer-journey A·3). Split out of
 * NotificationsService (which owns the write-path push sends) since the feed is a pure read model over
 * the same order/audit/offer/issue/SOS data, with no dependency on the push adapter.
 */
@Injectable()
export class NotificationsFeedService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The caller's in-app notifications feed (customer-journey A·3) — a READ-ONLY view derived from the
   * events of their own recent orders (across both roles), newest first and capped at
   * {@link FEED_ROW_CAP}. There is no Notification table: this reconstructs the same lifecycle beats
   * the user was pushed. `now` is injectable so the retention cutoff is deterministic under test.
   *
   * STREAMLINE-01 shapes the output three ways on top of the synthesis itself:
   *  - **retention** — every row SOURCE is bounded to {@link FEED_RETENTION_MS} (one day). Reads that
   *    merely look a FACT up about an in-window row (did this expired order have offers? was this
   *    completion an ops adjudication?) are deliberately NOT time-bounded: they qualify a row that is
   *    already in window rather than producing one.
   *  - **collapse** — at most one order-status row and one offer row per order (see below).
   *  - **read state** — `unread` is now a real per-user watermark (`Profile.notificationsReadAt`),
   *    not the old "younger than 24h" recency proxy, which could neither be cleared by reading nor
   *    kept for something never seen.
   *
   * Dismissed rows (see {@link dismiss}) are filtered out at the end, after the merge.
   */
  async feedForUser(userId: string, now: Date = new Date()): Promise<NotificationRow[]> {
    const cutoff = new Date(now.getTime() - FEED_RETENTION_MS);

    // Wave-2 perf: this method synthesizes the feed from ~9 reads that used to run strictly
    // sequentially — nine serial DB round-trips per open. They form exactly two dependency levels:
    // the USER-scoped ones (orders, account audits, resolved issues, plus STREAMLINE-01's read
    // watermark and dismissal set) run together right here; the ones that need only the id lists
    // derived from `orders` run together next. The final newest-first sort + cap make append order
    // irrelevant to the output.
    const [orders, accountAudits, resolvedIssues, profile, dismissals] = await Promise.all([
      this.prisma.order.findMany({
        // STREAMLINE-01: `events.some` is the retention reach. The old query took the 30 most recent
        // orders regardless of age, so a dormant account's year-old orders still furnished rows; now an
        // order is in view only if something actually HAPPENED on it inside the window. Note this keys
        // off event time, not order age — a week-old order delivered an hour ago is correctly in view.
        where: {
          OR: [{ customerId: userId }, { riderId: userId }],
          events: { some: { createdAt: { gte: cutoff } } },
        },
        orderBy: { createdAt: "desc" },
        take: FEED_ORDER_SCAN_CAP,
        select: {
          id: true,
          riderId: true,
          orderType: true,
          // The order's CURRENT status, used to stamp `status` on the non-status rows (fare-adjust,
          // resolved-issue) that need it for routing. Read from the column rather than the last element
          // of `events` — that list is now cutoff-filtered, so its tail is the newest RECENT event, not
          // necessarily the order's actual state.
          status: true,
          // `rebroadcastOfId` links a rider-bail clone back to the order it replaced; `expiryNoSupply`
          // flags a genuine "nobody was online" expiry; `cancelledBy` is the canceller's profile id (used
          // for actor-suppression below — a row about your OWN action is noise, mirroring the push).
          rebroadcastOfId: true,
          expiryNoSupply: true,
          cancelledBy: true,
          // UX20-04: the current agreed fare, so a fare-adjust feed row can quote the corrected amount
          // exactly like the push does.
          agreedFare: true,
          events: {
            where: { createdAt: { gte: cutoff } },
            select: { status: true, createdAt: true },
            orderBy: { createdAt: "asc" },
          },
        },
      }),
      // KB-FEED-SYNTH account-status rows (KYC decision + admin standing changes) — consumed by the
      // account loop below; user-scoped, so it needs nothing from `orders`.
      this.prisma.auditLog.findMany({
        where: { target: userId, action: { in: ACCOUNT_FEED_ACTIONS }, createdAt: { gte: cutoff } },
        orderBy: { createdAt: "desc" },
        take: FEED_ROW_CAP,
        select: { id: true, action: true, createdAt: true },
      }),
      // UX-2026-07-16 resolved-issue rows — consumed by the issues loop below; also user-scoped.
      // STREAMLINE-01: this read used to be deliberately UNBOUNDED by the order lookback so a late
      // resolution still surfaced. Under a wall-clock window that special case disappears — the row is
      // in view for a day after `resolvedAt` however old the order is, which is what that exemption was
      // reaching for in the first place.
      this.prisma.issue.findMany({
        where: { openedByProfileId: userId, status: "resolved", resolvedAt: { gte: cutoff } },
        orderBy: { resolvedAt: "desc" },
        take: FEED_ROW_CAP,
        select: { id: true, orderId: true, resolution: true, resolvedAt: true },
      }),
      // STREAMLINE-01 read watermark: the last time this profile OPENED the notifications centre.
      // `unread` is derived from it below.
      this.prisma.profile.findUnique({ where: { id: userId }, select: { notificationsReadAt: true } }),
      // STREAMLINE-01 dismissals: rows this profile swiped away. Bounded by the same window as the rows
      // themselves — a dismissal for a row that has already aged out can never match anything again.
      this.prisma.notificationDismissal.findMany({
        where: { profileId: userId, createdAt: { gte: cutoff } },
        select: { rowId: true },
      }),
    ]);

    const readAt = profile?.notificationsReadAt ?? null;
    const dismissed = new Set<string>(dismissals.map((d) => d.rowId));
    /** A row is unread until the viewer has opened the centre at or after the row's own time. */
    const isUnread = (at: Date): boolean => readAt === null || at.getTime() > readAt.getTime();

    // Map an original (cancelled) order id → the fresh clone auto-broadcast in its place (F-01). The
    // clone shares the customer and is strictly newer than the original; both sides of a rider-bail
    // rebroadcast emit an event at the moment of the bail, so whenever the cancelled original is in the
    // retention window the clone is too — this in-memory map is complete without a second query.
    const cloneByOriginal = new Map<string, string>();
    for (const order of orders) {
      if (order.rebroadcastOfId) cloneByOriginal.set(order.rebroadcastOfId, order.id);
    }

    // Every id list the order-scoped reads key on derives from `orders` in plain code — so the six
    // remaining reads share ONE parallel level. Empty id lists short-circuit to [] without a query.
    const expiredOrderIds = orders
      .filter((o) => o.riderId !== userId && o.events.some((e) => e.status === "expired"))
      .map((o) => o.id);
    const orderIds = orders.map((o) => o.id);
    const customerViewOrderIds = orders.filter((o) => o.riderId !== userId).map((o) => o.id);

    const [withOffers, adjudicated, offers, sosEvents, standingNotices, standingResolved, fareAdjustments, ridersAvailableNotices] = await Promise.all([
      // Fix 1: for expired orders the customer is viewing, distinguish "riders bid but you didn't pick
      // in time" from the default "raise your price" nudge. Offer rows are never deleted on expiry
      // (only flipped to `expired`), so a plain count over the durable rows recovers "did any rider
      // ever bid" on a cold read, long after the window closed. NOT time-bounded: this QUALIFIES an
      // in-window expiry row (the offers precede it by seconds anyway), it never produces a row.
      expiredOrderIds.length > 0
        ? this.prisma.offer.findMany({
            where: { orderId: { in: expiredOrderIds } },
            select: { orderId: true },
            distinct: ["orderId"],
          })
        : [],
      // UX17-03: an ops "adjudicate delivered" override writes a plain `completed` OrderEvent
      // (indistinguishable from an ordinary completion) but pushes bespoke copy — "marked complete
      // after review" (customer) and "delivery confirmed" (rider). The action is durably recorded as
      // an AuditLog row targeted at the order id; the per-order loop below swaps in role-appropriate
      // copy for a `completed` event on these. Also a qualifier, so also not time-bounded.
      orderIds.length > 0
        ? this.prisma.auditLog.findMany({
            where: { target: { in: orderIds }, action: "order.adjudicate_delivered" },
            select: { target: true },
          })
        : [],
      // KB-FEED-SYNTH "New offer" rows. notifyNewOffer pushes the customer when a rider bids on their
      // order, but that push never produced a feed row (the feed was derived from order-status events
      // only). Recovered from the durable Offer rows on the caller's own (customer-view) orders.
      // STREAMLINE-01: time-bounded (a row source), and `createdAt` is now selected so the collapsed
      // row below can key off, and be timed by, the NEWEST bid.
      customerViewOrderIds.length > 0
        ? this.prisma.offer.findMany({
            where: { orderId: { in: customerViewOrderIds }, createdAt: { gte: cutoff } },
            select: { id: true, orderId: true, createdAt: true },
          })
        : [],
      // UX17-01 SOS counterparty fallback — consumed by the SOS loop below.
      orderIds.length > 0
        ? this.prisma.sosEvent.findMany({
            where: { orderId: { in: orderIds }, raisedByProfileId: { not: userId }, createdAt: { gte: cutoff } },
            select: { id: true, orderId: true, createdAt: true },
          })
        : [],
      // UX17-02 rider-standing notice fallback — consumed by the standing loop below.
      customerViewOrderIds.length > 0
        ? this.prisma.auditLog.findMany({
            where: { target: { in: customerViewOrderIds }, action: "order.rider_standing_notice", createdAt: { gte: cutoff } },
            select: { id: true, target: true, createdAt: true },
          })
        : [],
      // UX18-05 standing-resolved counterpart — consumed right after the notice loop.
      customerViewOrderIds.length > 0
        ? this.prisma.auditLog.findMany({
            where: { target: { in: customerViewOrderIds }, action: "order.rider_standing_resolved", createdAt: { gte: cutoff } },
            select: { id: true, target: true, createdAt: true },
          })
        : [],
      // UX20-04 fare-adjust fallback — consumed by the fare-adjust loop below; scoped to ALL orderIds
      // (adjustFare pushes both parties), so it belongs to this order-scoped level like the SOS read.
      orderIds.length > 0
        ? this.prisma.auditLog.findMany({
            where: { target: { in: orderIds }, action: "order.fare_adjust", createdAt: { gte: cutoff } },
            select: { id: true, target: true, createdAt: true },
          })
        : [],
      // UX21-02 "notify me" (live-order case) fallback — consumed by the loop below. Only the order's own
      // customer can ever have a notify-me waiter tied to it (DS15-09 ownership check), so this is scoped
      // to customerViewOrderIds like the standing-notice reads, not all orderIds.
      customerViewOrderIds.length > 0
        ? this.prisma.auditLog.findMany({
            where: { target: { in: customerViewOrderIds }, action: "order.riders_available_notify", createdAt: { gte: cutoff } },
            select: { id: true, target: true, createdAt: true },
          })
        : [],
    ]);
    const orderIdsWithOffers = new Set<string>(withOffers.map((o) => o.orderId));
    const adjudicatedOrderIds = new Set<string>(adjudicated.map((a) => a.target));
    // UX26-03: shared by the fare-adjust and resolved-issue rows below — both need to look an orderId
    // back up against the already-fetched, window-bounded `orders` list to derive `to`/`status`.
    const orderById = new Map(orders.map((o) => [o.id, o]));

    const rows: NotificationRow[] = [];
    for (const order of orders) {
      // A-7 (status-keyed-query-audit): FEED_NOTICES/FEED_NOTICES_RIDER are parcel-voiced copy
      // ("Your rider had to cancel", "raise your price"). Type-aware feed notices + deep links are a
      // C5 deliverable — until then, skip a food order's events entirely rather than render wrong
      // copy (mirrors notifications.service.ts's notifyOrderStatus guard, A-6).
      if (order.orderType !== "parcel") continue;
      // Pick the voice matching what this viewer actually experienced on THIS order — a dual-role user
      // can be the rider on one trip and the customer on another, so the role is per-order, not per-user.
      const isCustomerView = order.riderId !== userId;
      const audience = isCustomerView ? "customer" : "rider";
      const notices = isCustomerView ? FEED_NOTICES : FEED_NOTICES_RIDER;

      /**
       * Is this status addressed to the viewer? Normally {@link FEED_AUDIENCE} decides, mirroring the
       * push table. The ONE exception is an ops-adjudicated completion: `adjudicateDelivered` does not
       * go through `notifyOrderStatus` at all — it pushes BOTH parties directly via `notifyProfiles`
       * ("Delivery marked complete after review" to the customer, "Delivery confirmed" to the rider) —
       * so gating it on `completed: ["rider"]` would drop the customer's row for a push the customer
       * demonstrably received, on the one completion they are most likely to want a record of (a
       * disputed hand-off resolved against them). The override copy is applied further down.
       */
      const isAdjudicated = adjudicatedOrderIds.has(order.id);
      const addressesViewer = (status: string): boolean =>
        (status === "completed" && isAdjudicated) || (FEED_AUDIENCE[status]?.includes(audience) ?? false);

      // STREAMLINE-01 collapse: ONE status row per order, not one per beat. `events` is ascending, so
      // the last event that both has copy and is addressed to THIS viewer is the order's latest news
      // for them — which is exactly what the mock draws (a single live "Rider on the way" row, a single
      // terminal "Delivered" row), and what the push tray already shows after collapseKey folding.
      // Superseded intermediate beats are pure history and belong to the tracker / Orders list.
      const event = order.events
        .filter((e) => notices[e.status] !== undefined && addressesViewer(e.status))
        // Actor suppression (both voices): drop the `cancelled` row when the viewer is the one who
        // cancelled — a row about your own action is noise. `cancelledBy` is the canceller's profile
        // id, so a direct id match identifies the actor. Mirrors the push's excludeProfileId exclusion.
        .filter((e) => !(e.status === "cancelled" && order.cancelledBy === userId))
        .at(-1);
      if (event) {
        let notice = notices[event.status]!;

        // The order id this row navigates to on tap (mobile routes every row to /order/<orderId>).
        // Only the rider-bail rebroadcast below redirects it to the live clone.
        let orderId = order.id;

        if (isCustomerView) {
          // Rider bailed but the job was auto re-sent at the same price (F-01): swap the alarming
          // "Order cancelled" for the honest "your rider had to cancel — we've re-sent it" copy, and
          // point the tap at the LIVE clone so the customer lands on the running auction, not a dead
          // terminal. (The row's stable `id` still keys off the ORIGINAL order, as before.)
          if (event.status === "cancelled") {
            const cloneId = cloneByOriginal.get(order.id);
            if (cloneId) {
              notice = {
                icon: "bike",
                title: "Your rider had to cancel",
                message:
                  "We've already sent your request back out to nearby riders at the same price — tap to follow it.",
              };
              orderId = cloneId;
            }
          } else if (event.status === "expired" && order.expiryNoSupply) {
            // No-supply expiry: nobody was online near the pickup, so "raise your price" would be a lie.
            notice = {
              icon: "bike",
              title: "No riders online nearby",
              message:
                "Nobody was online near your pickup when the window closed — raising the price wasn't the problem. Try sending again in a bit.",
            };
          } else if (event.status === "expired" && orderIdsWithOffers.has(order.id)) {
            // Riders DID bid but the window closed before the customer picked — "raise your price" is
            // dishonest here (riders offered at this price), so nudge them to just re-send it (Fix 1).
            notice = {
              icon: "clock",
              title: "The window closed",
              message: "Riders offered but the window closed before you picked — send it again, no need to raise the price.",
            };
          }
        }

        // UX17-03: this `completed` event was an ops adjudication override, not an ordinary completion —
        // swap the generic "Delivery complete"/"Nice work" copy for the bespoke copy each party was
        // actually pushed. Mirrors the cancelled→rebroadcast / expired→no-supply overrides above; touches
        // only `completed` events on adjudicated orders, nothing else. Copy is a verbatim mirror of
        // adjudicateDelivered's pushes — UX19-02 dropped the fabricated "48h contest window" (`IssuesService.raise`
        // has no time-based gating) and UX19-04 dropped the unconditional "reviewed your proof"/"adding the
        // evidence" claim (proof-of-drop capture is optional; adjudicateDelivered has no evidence precondition).
        if (event.status === "completed" && adjudicatedOrderIds.has(order.id)) {
          notice = isCustomerView
            ? {
                icon: "check",
                title: "Delivery marked complete after review",
                message:
                  "Our team reviewed the delivery and marked it complete. If that's not right, open the app to report a problem.",
              }
            : {
                icon: "check",
                title: "Delivery confirmed",
                message: "Our team reviewed the delivery and confirmed it as complete.",
              };
        }

        const at = event.createdAt.toISOString();
        rows.push({
          // Stable per (order, status, time): an order can revisit a status, so the timestamp keys it.
          // The collapse above changes WHICH beat is rendered, never how a rendered beat is keyed — so
          // a dismissal stays attached to the exact beat it was made against, and the order's NEXT
          // transition surfaces as a fresh, undismissed row.
          id: `${order.id}:${event.status}:${at}`,
          orderId,
          // UX19-03: the raw status routes the tap (see notificationRowDestination); `to` carries the
          // SAME per-order voice used to pick FEED_NOTICES vs. FEED_NOTICES_RIDER above, not the
          // (possibly redirected) `orderId` — a rider viewing their own `assigned`/`cancelled` row must
          // route to /rider/job exactly like the push does, matching event.status, not any copy override.
          to: audience,
          status: event.status,
          icon: notice.icon,
          title: notice.title,
          message: notice.message,
          at,
          unread: isUnread(event.createdAt),
        });
      }
    }

    // STREAMLINE-01 collapse: ONE offer row per order. The old loop emitted a row per Offer, so a
    // popular auction alone could fill the feed with identical "New offer" rows (and the read had no
    // `take` at all, so every bid on every in-view order was materialised before the cap). The mock
    // draws a single offer row too. Keyed by the NEWEST bid so a later bid produces a NEW row id —
    // which both re-sorts it to the top and lets it survive a dismissal of the earlier state.
    const offersByOrder = new Map<string, { id: string; createdAt: Date }[]>();
    for (const offer of offers) {
      const bucket = offersByOrder.get(offer.orderId);
      if (bucket) bucket.push(offer);
      else offersByOrder.set(offer.orderId, [offer]);
    }
    for (const [orderId, bucket] of offersByOrder) {
      const newest = bucket.reduce((a, b) => (b.createdAt > a.createdAt ? b : a));
      const at = newest.createdAt.toISOString();
      rows.push({
        id: `offers:${newest.id}`,
        orderId,
        to: "customer",
        icon: "banknote",
        title: "New offer",
        // Single-bid copy is notifyNewOffer's push verbatim (the feed↔push contract); the plural form
        // states the count instead of repeating the singular line N times.
        message:
          bucket.length === 1
            ? "A rider responded to your delivery — tap to compare offers."
            : `${bucket.length} riders responded to your delivery — tap to compare offers.`,
        at,
        unread: isUnread(newest.createdAt),
      });
    }

    // UX20-04: adjustFare's post-commit push (customer "Your delivery's fare was updated" / rider "A
    // delivery's fare was updated") had no durable feed fallback — order.fare_adjust's AuditLog is
    // targeted at orderId, but adjustFare writes no OrderEvent (so it never surfaces via FEED_NOTICES
    // above) and the audit's target doesn't match ACCOUNT_FEED_ACTIONS (which key off a profileId
    // target), so a missed push left zero durable trace for either party.
    for (const a of fareAdjustments) {
      const order = orderById.get(a.target);
      if (!order) continue; // defensive: target always one of the queried orders
      const isCustomerView = order.riderId !== userId;
      const fare = order.agreedFare != null ? Number(order.agreedFare).toFixed(2) : null;
      const at = a.createdAt.toISOString();
      rows.push({
        id: `fare-adjust:${a.id}`,
        orderId: a.target,
        to: isCustomerView ? "customer" : "rider",
        // UX26-03: the order's CURRENT status, so notificationRowDestination can route a rider still on
        // the exact `assigned`/`cancelled` job straight to `/rider/job` (gated on `to === "rider"`
        // there, so this is safe to stamp unconditionally — unlike pushDestination's ungated check).
        status: order.status,
        icon: "banknote",
        title: "Fare updated",
        message:
          (isCustomerView ? "Your fare was corrected" : "The fare for this delivery was corrected") +
          (fare ? ` to $${fare}` : "") +
          " by our team.",
        at,
        unread: isUnread(a.createdAt),
      });
    }

    // UX21-02: "notify me when a rider's online" (live-order case) feed fallback. notifyRidersAvailable
    // pushes the customer "riders are being pinged on your live request", but that push never produced a
    // feed row — the durable order.riders_available_notify audit written alongside it (see
    // notifications.service.ts) recovers it here, one batched query over the orders already in view.
    // Always customer-voiced (only the order's own customer can have a waiter tied to it).
    for (const a of ridersAvailableNotices) {
      const at = a.createdAt.toISOString();
      rows.push({
        id: `riders-available:${a.id}`,
        orderId: a.target,
        to: "customer",
        icon: "bike",
        title: "A rider's online near you",
        message: "Riders are being pinged on your live request — tap to follow the offers.",
        at,
        unread: isUnread(a.createdAt),
      });
    }

    // KB-FEED-SYNTH: account-status rows (KYC decision + admin standing changes). Those pushes
    // (notifyKycDecision, suspend/lift/ban/clearHold) never produced a feed row either. Both the manual
    // admin path and the automated KYC webhook write an AuditLog row keyed by target=profileId, so
    // synthesize from those (prefetched in the user-scoped level) — no Notification table.
    // Account-level, so orderId is null.
    for (const a of accountAudits) {
      const copy = ACCOUNT_FEED_COPY[a.action];
      if (!copy) continue; // defensive: only the mapped actions were queried
      const at = a.createdAt.toISOString();
      rows.push({
        id: `account:${a.id}`,
        orderId: null,
        // BH-18: `customer.hold`/`customer.lift` are the sole ACCOUNT_FEED_ACTIONS entries about the
        // viewing customer, not the viewing rider — every other action string (`rider.*`, `wallet.credit`)
        // is rider-facing, matching the untagged pre-existing "/rider" default on the client.
        to: a.action.startsWith("customer.") ? "customer" : "rider",
        icon: copy.icon,
        title: copy.title,
        message: copy.message,
        at,
        unread: isUnread(a.createdAt),
      });
    }

    // UX17-01: SOS counterparty feed fallback. When a party raises an SOS on a live trip, `raise()` writes
    // a durable SosEvent and best-effort pushes only the COUNTERPARTY ("SOS on your delivery"). feedForUser
    // never read SosEvent, so a missed push left the counterparty with zero trace their delivery partner
    // raised an SOS — a safety-critical gap. Recover it from the durable SosEvent rows on the viewer's own
    // orders that the viewer did NOT raise (mirroring the push's counterparty-only target — the raiser
    // already knows they raised it). ONE batched query over the orders already in view. Copy is a verbatim
    // mirror of the push (the feed↔push contract).
    for (const event of sosEvents) {
      const at = event.createdAt.toISOString();
      rows.push({
        id: `sos:${event.id}`,
        orderId: event.orderId,
        icon: "triangle-alert",
        title: "SOS on your delivery",
        message: "The other party raised an SOS on this trip. Stay safe — LyniaGo's safety team has been alerted.",
        at,
        unread: isUnread(event.createdAt),
      });
    }

    // UX17-02: rider-standing-change feed fallback for the affected customer. suspend/ban fire a best-effort
    // push to every customer on the rider's active orders ("An update on your delivery"), but the durable
    // audit for the underlying action (rider.suspend/ban) is targeted at the RIDER's id, so the existing
    // ACCOUNT_FEED_ACTIONS query never matches for the customer. notifyCustomersOfRiderStandingChange now
    // ALSO writes an `order.rider_standing_notice` AuditLog row targeted at the ORDER id, so recover it from
    // those on the viewer's own CUSTOMER-view orders (customerViewOrderIds is exactly order.riderId !== userId
    // — the rider gets their own rider.suspend/ban account row via ACCOUNT_FEED_ACTIONS, so this must not
    // also show to the rider). ONE batched query; copy is a verbatim mirror of the push.
    for (const a of standingNotices) {
      const at = a.createdAt.toISOString();
      rows.push({
        id: `rider-standing:${a.id}`,
        orderId: a.target,
        icon: "triangle-alert",
        title: "An update on your delivery",
        message: "There's a change with your assigned rider — our team is reviewing this trip.",
        at,
        unread: isUnread(a.createdAt),
      });
    }

    // UX18-05: liftRider — the direct undo of a suspension, most likely to fire while the SAME rider is
    // still assigned to the SAME active order — never told the customer the "we're reviewing this trip"
    // notice above was resolved, leaving it permanently unresolved in their feed. notifyCustomersOfRider
    // StandingChange(profileId, resolved=true) now also writes this durable fallback, mirroring the
    // notice row above.
    for (const a of standingResolved) {
      const at = a.createdAt.toISOString();
      rows.push({
        id: `rider-standing-resolved:${a.id}`,
        orderId: a.target,
        icon: "check",
        title: "Your delivery is back on track",
        message: "The review of your assigned rider is complete — your delivery is continuing as normal.",
        at,
        unread: isUnread(a.createdAt),
      });
    }

    // UX-2026-07-16: resolved-issue rows, mirroring the KB-FEED-SYNTH pattern above. `notifyIssueResolved`
    // is best-effort and can be missed; this is the durable fallback so "did anyone act on my problem" is
    // answerable from the feed for a day after the resolution, whatever the age of the order itself.
    for (const issue of resolvedIssues) {
      if (!issue.resolution || !issue.resolvedAt) continue; // defensive: resolved rows always carry both
      const copy = ISSUE_RESOLUTION_FEED_COPY[issue.resolution];
      const at = issue.resolvedAt.toISOString();
      // UX26-03 sibling: the order may have had no activity inside the retention window, so it is not in
      // `orders` — `order` is undefined in that case and `to`/`status` stay unset, falling back to the
      // existing `/order/:id` routing rather than guessing.
      const order = orderById.get(issue.orderId);
      rows.push({
        id: `issue:${issue.id}`,
        orderId: issue.orderId,
        to: order ? (order.riderId === userId ? "rider" : "customer") : undefined,
        status: order ? order.status : undefined,
        icon: "check",
        title: copy.title,
        message: copy.message,
        at,
        unread: isUnread(issue.resolvedAt),
      });
    }

    // Newest first. ISO-8601 UTC strings sort lexicographically in time order. The synthesized offer/
    // account rows merge with the order-event rows here and the shared cap applies to the whole set.
    // STREAMLINE-01: dismissed rows drop out AFTER the merge and BEFORE the cap, so swiping a row
    // promotes the next one into view rather than leaving a hole at the bottom of the list.
    rows.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    return rows.filter((r) => !dismissed.has(r.id)).slice(0, FEED_ROW_CAP);
  }

  /**
   * STREAMLINE-01: how many rows the caller has not yet seen — what the Account row's "N new" hint is
   * drawn from, so unread is legible BEFORE opening the centre (it used to be invisible until you were
   * already inside, since the only unread affordance was the per-row dot).
   *
   * Deliberately derived from {@link feedForUser} rather than counted with a second, cheaper query: a
   * count that disagrees with the list it summarises is worse than no count, and the synthesis is now
   * bounded to a single day of activity. Dismissed rows are already gone from that list, so a swipe
   * lowers the count exactly as a reader would expect.
   */
  async unreadCountForUser(userId: string, now: Date = new Date()): Promise<number> {
    const feed = await this.feedForUser(userId, now);
    return feed.reduce((n, r) => n + (r.unread ? 1 : 0), 0);
  }

  /**
   * STREAMLINE-01: stamp the read watermark — called when the caller opens the notifications centre.
   * One column, not per-row read state: the feed is a single chronological list that is always read
   * top-down, so "everything up to now has been seen" is the only distinction the screen can honestly
   * make. Idempotent, and monotonic in practice (the clock only moves forward).
   */
  async markRead(userId: string, now: Date = new Date()): Promise<{ readAt: string }> {
    await this.prisma.profile.update({ where: { id: userId }, data: { notificationsReadAt: now } });
    return { readAt: now.toISOString() };
  }

  /**
   * STREAMLINE-01: dismiss one row (the swipe). The feed is derived, so there is no row to delete —
   * instead the dismissal is recorded against the row's stable synthetic id and filtered out on every
   * subsequent read. Upsert, so a double-swipe (two devices, or a retry over a flaky link) is a no-op
   * rather than a unique-constraint error.
   *
   * The write also prunes this profile's dismissals older than the retention window. Nothing in the
   * feed outlives {@link FEED_RETENTION_MS}, so a dismissal older than that can never match a row
   * again — keeping it would grow the table forever and slow the read that loads the set. Pruning here
   * (rather than in a sweeper) keeps it a self-maintaining table with no scheduled job to own.
   */
  async dismiss(userId: string, rowId: string, now: Date = new Date()): Promise<{ ok: true }> {
    const cutoff = new Date(now.getTime() - FEED_RETENTION_MS);
    await this.prisma.notificationDismissal.upsert({
      where: { profileId_rowId: { profileId: userId, rowId } },
      create: { profileId: userId, rowId, createdAt: now },
      update: {},
    });
    await this.prisma.notificationDismissal.deleteMany({
      where: { profileId: userId, createdAt: { lt: cutoff } },
    });
    return { ok: true };
  }
}
