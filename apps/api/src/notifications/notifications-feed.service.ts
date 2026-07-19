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
};
const ACCOUNT_FEED_ACTIONS = Object.keys(ACCOUNT_FEED_COPY);

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

/** How recent an event must be to count as "unread" in the derived feed — a deterministic window over
 *  the event time (there is no per-user read state to persist). */
const FEED_UNREAD_WINDOW_MS = 24 * 60 * 60 * 1000;

/** How many orders back the feed reaches, and the cap on rows returned (A·3 shows the most recent). */
const FEED_ORDER_LOOKBACK = 30;
const FEED_ROW_CAP = 30;

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
        // `rebroadcastOfId` links a rider-bail clone back to the order it replaced; `expiryNoSupply`
        // flags a genuine "nobody was online" expiry; `cancelledBy` is the canceller's profile id (used
        // for actor-suppression below — a row about your OWN action is noise, mirroring the push).
        rebroadcastOfId: true,
        expiryNoSupply: true,
        cancelledBy: true,
        events: {
          select: { status: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    // Map an original (cancelled) order id → the fresh clone auto-broadcast in its place (F-01). The
    // clone shares the customer and is strictly newer than the original, so whenever the cancelled
    // original is inside the take-30 (newest-first) window the clone — sorting above it — is too; this
    // in-memory map is therefore complete without a second query.
    const cloneByOriginal = new Map<string, string>();
    for (const order of orders) {
      if (order.rebroadcastOfId) cloneByOriginal.set(order.rebroadcastOfId, order.id);
    }

    // Fix 1: for expired orders the customer is viewing, distinguish "riders bid but you didn't pick in
    // time" from the default "raise your price" nudge. Offer rows are never deleted on expiry (only
    // flipped to `expired`), so a plain count over the durable rows recovers "did any rider ever bid"
    // on a cold read, long after the window closed. One batched query for all expired orders in view.
    const expiredOrderIds = orders
      .filter((o) => o.riderId !== userId && o.events.some((e) => e.status === "expired"))
      .map((o) => o.id);
    const orderIdsWithOffers = new Set<string>();
    if (expiredOrderIds.length > 0) {
      const withOffers = await this.prisma.offer.findMany({
        where: { orderId: { in: expiredOrderIds } },
        select: { orderId: true },
        distinct: ["orderId"],
      });
      for (const o of withOffers) orderIdsWithOffers.add(o.orderId);
    }

    // UX17-03: an ops "adjudicate delivered" override writes a plain `completed` OrderEvent
    // (indistinguishable from an ordinary completion) but pushes bespoke copy — "marked complete after
    // review" (customer) and "delivery confirmed" (rider). Without this, a missed push leaves the generic
    // FEED_NOTICES.completed row, omitting the one fact that matters (this was an ops override, not a
    // normal completion). The action is durably recorded as an AuditLog row targeted at the order id, so
    // one batched query over the in-view orders recovers the set on a cold read; the per-order loop below
    // swaps in role-appropriate copy for a `completed` event on these.
    const orderIds = orders.map((o) => o.id);
    const adjudicatedOrderIds = new Set<string>();
    if (orderIds.length > 0) {
      const adjudicated = await this.prisma.auditLog.findMany({
        where: { target: { in: orderIds }, action: "order.adjudicate_delivered" },
        select: { target: true },
      });
      for (const a of adjudicated) adjudicatedOrderIds.add(a.target);
    }

    const rows: NotificationRow[] = [];
    for (const order of orders) {
      // Pick the voice matching what this viewer actually experienced on THIS order — a dual-role user
      // can be the rider on one trip and the customer on another, so the role is per-order, not per-user.
      const isCustomerView = order.riderId !== userId;
      const notices = isCustomerView ? FEED_NOTICES : FEED_NOTICES_RIDER;
      for (const event of order.events) {
        let notice = notices[event.status];
        if (!notice) continue; // silent statuses (requested/open_for_offers) never surface, as with push

        // Actor suppression (both voices): drop the `cancelled` row when the viewer is the one who
        // cancelled — a row about your own action is noise. `cancelledBy` is the canceller's profile
        // id, so a direct id match identifies the actor. Mirrors the push's excludeProfileId exclusion.
        if (event.status === "cancelled" && order.cancelledBy === userId) continue;

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
          id: `${order.id}:${event.status}:${at}`,
          orderId,
          // UX19-03: the raw status routes the tap (see notificationRowDestination); `to` carries the
          // SAME per-order voice used to pick FEED_NOTICES vs. FEED_NOTICES_RIDER above, not the
          // (possibly redirected) `orderId` — a rider viewing their own `assigned`/`cancelled` row must
          // route to /rider/job exactly like the push does, matching event.status, not any copy override.
          to: isCustomerView ? "customer" : "rider",
          status: event.status,
          icon: notice.icon,
          title: notice.title,
          message: notice.message,
          at,
          unread: now.getTime() - event.createdAt.getTime() < FEED_UNREAD_WINDOW_MS,
        });
      }
    }

    // KB-FEED-SYNTH: "New offer" rows. notifyNewOffer pushes the customer when a rider bids on their
    // order, but that push never produced a feed row (the feed was derived from order-status events
    // only). Recover it from the durable Offer rows on the caller's own (customer-view) orders — ONE
    // batched query. An offer and its order's own status events are DIFFERENT events, so no dedup is
    // needed. Copy mirrors notifyNewOffer's push (the feed↔push contract).
    const customerViewOrderIds = orders.filter((o) => o.riderId !== userId).map((o) => o.id);
    if (customerViewOrderIds.length > 0) {
      const offers = await this.prisma.offer.findMany({
        where: { orderId: { in: customerViewOrderIds } },
        select: { id: true, orderId: true, createdAt: true },
      });
      for (const offer of offers) {
        const at = offer.createdAt.toISOString();
        rows.push({
          id: `offer:${offer.id}`,
          orderId: offer.orderId,
          icon: "banknote",
          title: "New offer",
          message: "A rider responded to your delivery — tap to compare offers.",
          at,
          unread: now.getTime() - offer.createdAt.getTime() < FEED_UNREAD_WINDOW_MS,
        });
      }
    }

    // KB-FEED-SYNTH: account-status rows (KYC decision + admin standing changes). Those pushes
    // (notifyKycDecision, suspend/lift/ban/clearHold) never produced a feed row either. Both the manual
    // admin path and the automated KYC webhook write an AuditLog row keyed by target=profileId, so
    // synthesize from those — no Notification table. Account-level, so orderId is null.
    const accountAudits = await this.prisma.auditLog.findMany({
      where: { target: userId, action: { in: ACCOUNT_FEED_ACTIONS } },
      orderBy: { createdAt: "desc" },
      take: FEED_ROW_CAP,
      select: { id: true, action: true, createdAt: true },
    });
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
        unread: now.getTime() - a.createdAt.getTime() < FEED_UNREAD_WINDOW_MS,
      });
    }

    // UX17-01: SOS counterparty feed fallback. When a party raises an SOS on a live trip, `raise()` writes
    // a durable SosEvent and best-effort pushes only the COUNTERPARTY ("SOS on your delivery"). feedForUser
    // never read SosEvent, so a missed push left the counterparty with zero trace their delivery partner
    // raised an SOS — a safety-critical gap. Recover it from the durable SosEvent rows on the viewer's own
    // orders that the viewer did NOT raise (mirroring the push's counterparty-only target — the raiser
    // already knows they raised it). ONE batched query over the orders already in view. Copy is a verbatim
    // mirror of the push (the feed↔push contract).
    if (orderIds.length > 0) {
      const sosEvents = await this.prisma.sosEvent.findMany({
        where: { orderId: { in: orderIds }, raisedByProfileId: { not: userId } },
        select: { id: true, orderId: true, createdAt: true },
      });
      for (const event of sosEvents) {
        const at = event.createdAt.toISOString();
        rows.push({
          id: `sos:${event.id}`,
          orderId: event.orderId,
          icon: "triangle-alert",
          title: "SOS on your delivery",
          message: "The other party raised an SOS on this trip. Stay safe — LyniaGo's safety team has been alerted.",
          at,
          unread: now.getTime() - event.createdAt.getTime() < FEED_UNREAD_WINDOW_MS,
        });
      }
    }

    // UX17-02: rider-standing-change feed fallback for the affected customer. suspend/ban fire a best-effort
    // push to every customer on the rider's active orders ("An update on your delivery"), but the durable
    // audit for the underlying action (rider.suspend/ban) is targeted at the RIDER's id, so the existing
    // ACCOUNT_FEED_ACTIONS query never matches for the customer. notifyCustomersOfRiderStandingChange now
    // ALSO writes an `order.rider_standing_notice` AuditLog row targeted at the ORDER id, so recover it from
    // those on the viewer's own CUSTOMER-view orders (customerViewOrderIds is exactly order.riderId !== userId
    // — the rider gets their own rider.suspend/ban account row via ACCOUNT_FEED_ACTIONS, so this must not
    // also show to the rider). ONE batched query; copy is a verbatim mirror of the push.
    if (customerViewOrderIds.length > 0) {
      const standingNotices = await this.prisma.auditLog.findMany({
        where: { target: { in: customerViewOrderIds }, action: "order.rider_standing_notice" },
        select: { id: true, target: true, createdAt: true },
      });
      for (const a of standingNotices) {
        const at = a.createdAt.toISOString();
        rows.push({
          id: `rider-standing:${a.id}`,
          orderId: a.target,
          icon: "triangle-alert",
          title: "An update on your delivery",
          message: "There's a change with your assigned rider — our team is reviewing this trip.",
          at,
          unread: now.getTime() - a.createdAt.getTime() < FEED_UNREAD_WINDOW_MS,
        });
      }

      // UX18-05: liftRider — the direct undo of a suspension, most likely to fire while the SAME rider is
      // still assigned to the SAME active order — never told the customer the "we're reviewing this trip"
      // notice above was resolved, leaving it permanently unresolved in their feed. notifyCustomersOfRider
      // StandingChange(profileId, resolved=true) now also writes this durable fallback, mirroring the
      // notice row above.
      const standingResolved = await this.prisma.auditLog.findMany({
        where: { target: { in: customerViewOrderIds }, action: "order.rider_standing_resolved" },
        select: { id: true, target: true, createdAt: true },
      });
      for (const a of standingResolved) {
        const at = a.createdAt.toISOString();
        rows.push({
          id: `rider-standing-resolved:${a.id}`,
          orderId: a.target,
          icon: "check",
          title: "Your delivery is back on track",
          message: "The review of your assigned rider is complete — your delivery is continuing as normal.",
          at,
          unread: now.getTime() - a.createdAt.getTime() < FEED_UNREAD_WINDOW_MS,
        });
      }
    }

    // UX-2026-07-16: resolved-issue rows, mirroring the KB-FEED-SYNTH pattern above. `notifyIssueResolved`
    // is best-effort and can be missed; this is the durable fallback so "did anyone act on my problem" is
    // always answerable from the feed, not just a push that may never have landed. Not scoped to the
    // order-lookback window (like the account rows above) since a resolution can land long after the
    // order itself ages out of FEED_ORDER_LOOKBACK.
    const resolvedIssues = await this.prisma.issue.findMany({
      where: { openedByProfileId: userId, status: "resolved" },
      orderBy: { resolvedAt: "desc" },
      take: FEED_ROW_CAP,
      select: { id: true, orderId: true, resolution: true, resolvedAt: true },
    });
    for (const issue of resolvedIssues) {
      if (!issue.resolution || !issue.resolvedAt) continue; // defensive: resolved rows always carry both
      const copy = ISSUE_RESOLUTION_FEED_COPY[issue.resolution];
      const at = issue.resolvedAt.toISOString();
      rows.push({
        id: `issue:${issue.id}`,
        orderId: issue.orderId,
        icon: "check",
        title: copy.title,
        message: copy.message,
        at,
        unread: now.getTime() - issue.resolvedAt.getTime() < FEED_UNREAD_WINDOW_MS,
      });
    }

    // Newest first. ISO-8601 UTC strings sort lexicographically in time order. The synthesized offer/
    // account rows merge with the order-event rows here and the shared cap applies to the whole set.
    rows.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    return rows.slice(0, FEED_ROW_CAP);
  }
}
