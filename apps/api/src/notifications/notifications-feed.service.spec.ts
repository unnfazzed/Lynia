import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { FEED_STATUS_AUDIENCE, NotificationsFeedService } from "./notifications-feed.service";
import { STATUS_NOTICES } from "./notifications.service";

/** Decimal-like stub — Prisma returns Decimal objects the service reads via Number(). */
const dec = (s: string) => ({ toString: () => s, valueOf: () => Number(s) });

function makeDeps() {
  const prisma = {
    order: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    // Fix 1: feedForUser recomputes "did any rider bid" over the durable offer rows for expired orders.
    // KB-FEED-SYNTH also queries these to synthesize "New offer" feed rows.
    offer: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    // KB-FEED-SYNTH: feedForUser synthesizes account-status rows from AuditLog (KYC + standing changes).
    auditLog: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    // UX-2026-07-16: feedForUser synthesizes resolved-issue rows from Issue (durable fallback for a
    // missed notifyIssueResolved push).
    issue: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    // UX17-01: feedForUser synthesizes SOS counterparty rows from SosEvent (durable fallback for a missed
    // "SOS on your delivery" push), scoped to the viewer's own orders they did NOT raise.
    sosEvent: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    // STREAMLINE-01: `unread` is now a real per-user watermark read off the Profile, not a recency proxy.
    // Default: never opened the centre (null) → everything still in the window reads as unread.
    profile: {
      findUnique: vi.fn().mockResolvedValue({ notificationsReadAt: null }),
      update: vi.fn().mockResolvedValue({}),
    },
    // STREAMLINE-01: rows the viewer has swiped away, filtered out of every subsequent read.
    notificationDismissal: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const service = new NotificationsFeedService(prisma as unknown as PrismaService);
  return { prisma, service };
}

describe("NotificationsFeedService — derived in-app feed (A·3)", () => {
  const NOW = new Date("2026-07-06T12:00:00.000Z");

  it("maps recognised order events to feed rows, newest first, and skips silent statuses", async () => {
    const { prisma, service } = makeDeps();
    prisma.order.findMany.mockResolvedValue([
      {
        id: "o1",
        orderType: "parcel", events: [
          { status: "open_for_offers", createdAt: new Date("2026-07-06T09:00:00.000Z") }, // silent → skipped
          { status: "confirmed", createdAt: new Date("2026-07-06T10:00:00.000Z") },
          { status: "delivered", createdAt: new Date("2026-07-06T11:00:00.000Z") },
        ],
      },
    ]);

    const feed = await service.feedForUser("me", NOW);

    // open_for_offers is silent (as it is for push); `confirmed` and `delivered` are both customer-voiced,
    // so STREAMLINE-01's collapse keeps only the LATEST of them — the order's current news for this viewer.
    expect(feed.map((r) => r.title)).toEqual(["Delivered"]);
    expect(feed[0]).toMatchObject({ icon: "check", at: "2026-07-06T11:00:00.000Z", unread: true });
    // Each row carries a stable, unique id keyed by order + status + time.
    expect(new Set(feed.map((r) => r.id)).size).toBe(feed.length);
  });

  // STREAMLINE-01: the feed's founding promise is that it reads like the pushes you got. It never held —
  // every mapped status was rendered to BOTH parties, so a rider saw seven rows per job having been pushed
  // two. FEED_AUDIENCE now gates rows on the same `to` the push table uses.
  it("STREAMLINE-01: renders a status row only for the audience the push table addresses", async () => {
    const { prisma, service } = makeDeps();
    const order = {
      id: "o1",
      riderId: "rider",
      orderType: "parcel",
      events: [
        // Every beat of a happy-path trip, in order.
        { status: "assigned", createdAt: new Date("2026-07-06T10:00:00.000Z") },
        { status: "confirmed", createdAt: new Date("2026-07-06T10:05:00.000Z") },
        { status: "en_route_pickup", createdAt: new Date("2026-07-06T10:10:00.000Z") },
        { status: "picked_up", createdAt: new Date("2026-07-06T10:20:00.000Z") },
        { status: "en_route_dropoff", createdAt: new Date("2026-07-06T10:30:00.000Z") },
        { status: "delivered", createdAt: new Date("2026-07-06T11:00:00.000Z") },
      ],
    };

    // The CUSTOMER is pushed the transit beats and the delivery; collapse leaves the newest of them.
    prisma.order.findMany.mockResolvedValue([order]);
    const custFeed = await service.feedForUser("cust", NOW);
    expect(custFeed.map((r) => r.title)).toEqual(["Delivered"]);

    // The RIDER is pushed `assigned` (and later `completed`) — never the beats they performed themselves.
    // Before this change they got all six of the rows above, in rider voice, for two pushes.
    prisma.order.findMany.mockResolvedValue([order]);
    const riderFeed = await service.feedForUser("rider", NOW);
    expect(riderFeed.map((r) => r.title)).toEqual(["You got the job"]);
  });

  // The two tables are duplicated (one is push copy + audience, one is audience only) so that they can be
  // diffed as data. This is the write-time guard that keeps them from drifting: add a status to one without
  // the other and this reddens, the same way FEED_READ_ACTIONS ⊆ RESERVED_AUDIT_ACTIONS is enforced.
  it("STREAMLINE-01: FEED_AUDIENCE agrees key-for-key with the push table's `to` arrays", () => {
    expect(Object.keys(FEED_STATUS_AUDIENCE).sort()).toEqual(Object.keys(STATUS_NOTICES).sort());
    for (const [status, notice] of Object.entries(STATUS_NOTICES)) {
      expect([...(FEED_STATUS_AUDIENCE[status] ?? [])].sort()).toEqual([...notice.to].sort());
    }
  });

  // UX19-03: `to` + `status` let the client (notificationRowDestination) replicate pushDestination's
  // rider-only screen routing for a feed tap — without these a rider's own "assigned"/"cancelled" row
  // always fell back to /order/:id, a dead-control detour the equivalent push doesn't take.
  it("stamps the viewer's per-order voice and the raw status on every order-status row", async () => {
    const { prisma, service } = makeDeps();
    // `cancelled` is the one status the push table addresses to BOTH parties, so it is the status that can
    // show the same event rendered in each voice (STREAMLINE-01 gates every other one to a single audience).
    const order = {
      id: "o1",
      riderId: "rider",
      cancelledBy: "admin", // neither viewer is the actor, so no actor-suppression
      orderType: "parcel",
      events: [{ status: "cancelled", createdAt: new Date("2026-07-06T10:00:00.000Z") }],
    };
    prisma.order.findMany.mockResolvedValue([order]);
    const custFeed = await service.feedForUser("cust", NOW);
    expect(custFeed[0]).toMatchObject({ to: "customer", status: "cancelled" });

    prisma.order.findMany.mockResolvedValue([order]);
    const riderFeed = await service.feedForUser("rider", NOW);
    expect(riderFeed[0]).toMatchObject({ to: "rider", status: "cancelled" });
  });

  it("carries the parent orderId on every row, so the client can navigate a tapped notification", async () => {
    const { prisma, service } = makeDeps();
    prisma.order.findMany.mockResolvedValue([
      {
        id: "o1",
        orderType: "parcel", events: [{ status: "delivered", createdAt: new Date("2026-07-06T11:00:00.000Z") }],
      },
      {
        id: "o2",
        orderType: "parcel", events: [{ status: "en_route_pickup", createdAt: new Date("2026-07-06T10:00:00.000Z") }],
      },
    ]);

    const feed = await service.feedForUser("me", NOW);

    expect(feed.find((r) => r.title === "Delivered")?.orderId).toBe("o1");
    expect(feed.find((r) => r.title === "Rider on the way")?.orderId).toBe("o2");
  });

  it("reads orders across both roles (customer OR rider), newest first, capped", async () => {
    const { prisma, service } = makeDeps();
    await service.feedForUser("me", NOW);
    const arg = prisma.order.findMany.mock.calls[0][0];
    expect(arg.where.OR).toEqual([{ customerId: "me" }, { riderId: "me" }]);
    expect(arg.orderBy).toEqual({ createdAt: "desc" });
    expect(arg.take).toBeGreaterThan(0);
  });

  // STREAMLINE-01: retention is ONE DAY of wall-clock, replacing the old count-based reach (30 most recent
  // orders / 30 rows). The old model made a row's lifetime a function of the viewer's own order volume: a
  // busy rider saw days, a once-a-year customer saw rows from last January, neither predictably.
  it("STREAMLINE-01: bounds every row SOURCE to the one-day retention window", async () => {
    const { prisma, service } = makeDeps();
    prisma.order.findMany.mockResolvedValue([{ id: "o1", riderId: null, orderType: "parcel", status: "expired", events: [] }]);
    await service.feedForUser("me", NOW);
    const cutoff = new Date(NOW.getTime() - 24 * 60 * 60 * 1000);

    // Orders are in view only if something HAPPENED on them inside the window (event time, not order age —
    // a week-old order delivered an hour ago is correctly still in view), and events are filtered to it.
    const orderArg = prisma.order.findMany.mock.calls[0][0];
    expect(orderArg.where.events).toEqual({ some: { createdAt: { gte: cutoff } } });
    expect(orderArg.select.events.where).toEqual({ createdAt: { gte: cutoff } });

    // The user-scoped row sources carry the same bound.
    expect(prisma.auditLog.findMany.mock.calls[0][0].where.createdAt).toEqual({ gte: cutoff });
    expect(prisma.issue.findMany.mock.calls[0][0].where.resolvedAt).toEqual({ gte: cutoff });
    expect(prisma.notificationDismissal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { profileId: "me", createdAt: { gte: cutoff } } }),
    );

    // …but a read that merely QUALIFIES an in-window row is deliberately NOT time-bounded: the "did this
    // expired order attract bids" lookup must still find offers however old, or the honest "window closed"
    // copy silently degrades back to the dishonest "raise your price" nudge.
    const qualifier = prisma.offer.findMany.mock.calls
      .map((c: unknown[]) => c[0] as { distinct?: string[]; where: { createdAt?: unknown } })
      .find((arg) => arg.distinct !== undefined);
    expect(qualifier?.where.createdAt).toBeUndefined();
  });

  it("STREAMLINE-01: the order's CURRENT status is read from the column, not the cutoff-filtered event tail", async () => {
    const { prisma, service } = makeDeps();
    // The order is long-since `completed`, but only a recent fare-adjust is inside the window — so `events`
    // comes back empty and the old `events.at(-1)` derivation would have left `status` undefined.
    prisma.order.findMany.mockResolvedValue([
      { id: "o1", riderId: "rider", status: "completed", agreedFare: dec("9.00"), orderType: "parcel", events: [] },
    ]);
    prisma.auditLog.findMany.mockImplementation(async ({ where }: { where: { action?: string } }) =>
      where.action === "order.fare_adjust" ? [{ id: "au1", target: "o1", createdAt: new Date("2026-07-06T11:00:00.000Z") }] : [],
    );
    const feed = await service.feedForUser("cust", NOW);
    expect(feed.find((r) => r.id === "fare-adjust:au1")?.status).toBe("completed");
  });

  // STREAMLINE-01: `unread` was `now - eventTime < 24h` — a recency proxy that reading could not clear and
  // that silently marked a never-seen row read at the 24h mark. It is now a real per-user watermark.
  it("STREAMLINE-01: derives unread from the read watermark, not from the row's age", async () => {
    const { prisma, service } = makeDeps();
    const orders = [
      { id: "o1", orderType: "parcel", status: "delivered", events: [{ status: "delivered", createdAt: new Date("2026-07-06T11:30:00.000Z") }] },
      { id: "o2", orderType: "parcel", status: "delivered", events: [{ status: "delivered", createdAt: new Date("2026-07-06T09:00:00.000Z") }] },
    ];

    // Never opened the centre → everything in the window is unread, however old (the old proxy would have
    // marked a >24h row read even though the user had never seen it).
    prisma.order.findMany.mockResolvedValue(orders);
    expect((await service.feedForUser("me", NOW)).map((r) => r.unread)).toEqual([true, true]);

    // Opened at 10:00 → the 11:30 row is still unread; the 09:00 row was seen.
    prisma.order.findMany.mockResolvedValue(orders);
    prisma.profile.findUnique.mockResolvedValue({ notificationsReadAt: new Date("2026-07-06T10:00:00.000Z") });
    const feed = await service.feedForUser("me", NOW);
    expect(feed.find((r) => r.orderId === "o1")?.unread).toBe(true);
    expect(feed.find((r) => r.orderId === "o2")?.unread).toBe(false);
  });

  it("STREAMLINE-01: markRead stamps the watermark, and unreadCountForUser counts only unread rows", async () => {
    const { prisma, service } = makeDeps();
    prisma.order.findMany.mockResolvedValue([
      { id: "o1", orderType: "parcel", status: "delivered", events: [{ status: "delivered", createdAt: new Date("2026-07-06T11:30:00.000Z") }] },
      { id: "o2", orderType: "parcel", status: "delivered", events: [{ status: "delivered", createdAt: new Date("2026-07-06T09:00:00.000Z") }] },
    ]);
    prisma.profile.findUnique.mockResolvedValue({ notificationsReadAt: new Date("2026-07-06T10:00:00.000Z") });
    expect(await service.unreadCountForUser("me", NOW)).toBe(1);

    const res = await service.markRead("me", NOW);
    expect(res).toEqual({ readAt: NOW.toISOString() });
    expect(prisma.profile.update).toHaveBeenCalledWith({ where: { id: "me" }, data: { notificationsReadAt: NOW } });
  });

  // STREAMLINE-01: dismissal. The feed is derived, so there is no row to delete — the swipe is recorded
  // against the row's stable synthetic id and filtered out of every later read.
  it("STREAMLINE-01: filters dismissed rows out of the feed and its unread count", async () => {
    const { prisma, service } = makeDeps();
    const orders = [
      { id: "o1", orderType: "parcel", status: "delivered", events: [{ status: "delivered", createdAt: new Date("2026-07-06T11:30:00.000Z") }] },
      { id: "o2", orderType: "parcel", status: "delivered", events: [{ status: "delivered", createdAt: new Date("2026-07-06T09:00:00.000Z") }] },
    ];
    prisma.order.findMany.mockResolvedValue(orders);
    prisma.notificationDismissal.findMany.mockResolvedValue([{ rowId: "o1:delivered:2026-07-06T11:30:00.000Z" }]);

    const feed = await service.feedForUser("me", NOW);
    expect(feed.map((r) => r.orderId)).toEqual(["o2"]);

    // A dismissed row cannot keep inflating the "N new" hint on the Account row either.
    prisma.order.findMany.mockResolvedValue(orders);
    expect(await service.unreadCountForUser("me", NOW)).toBe(1);
  });

  it("STREAMLINE-01: dismiss upserts (so a double-swipe is a no-op) and prunes dismissals past the window", async () => {
    const { prisma, service } = makeDeps();
    await service.dismiss("me", "offers:of1", NOW);
    expect(prisma.notificationDismissal.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { profileId_rowId: { profileId: "me", rowId: "offers:of1" } } }),
    );
    // Nothing in the feed outlives the window, so a dismissal older than it can never match again —
    // pruning on write is what keeps the table self-maintaining with no sweeper to own.
    expect(prisma.notificationDismissal.deleteMany).toHaveBeenCalledWith({
      where: { profileId: "me", createdAt: { lt: new Date(NOW.getTime() - 24 * 60 * 60 * 1000) } },
    });
  });

  it("returns an empty feed when the caller has no orders", async () => {
    const { service } = makeDeps();
    await expect(service.feedForUser("me", NOW)).resolves.toEqual([]);
  });

  it("caps the feed at 50 rows", async () => {
    const { prisma, service } = makeDeps();
    // 60 distinct orders, each with one customer-addressed event → 60 candidate rows, capped to 50.
    prisma.order.findMany.mockResolvedValue(
      Array.from({ length: 60 }, (_, i) => ({
        id: `o${i}`,
        orderType: "parcel",
        status: "delivered",
        events: [{ status: "delivered", createdAt: new Date(NOW.getTime() - i * 60_000) }],
      })),
    );
    const feed = await service.feedForUser("me", NOW);
    expect(feed).toHaveLength(50);
  });

  // STREAMLINE-01: the volume fix. One completed parcel order with three bids used to emit TEN rows (three
  // "New offer" + seven status beats), so three orders could evict every account-level row from a 30-row
  // feed. Collapsed, the same order emits two — and the offer read is no longer unbounded.
  it("STREAMLINE-01: collapses a whole trip to one status row and one offer row", async () => {
    const { prisma, service } = makeDeps();
    prisma.order.findMany.mockResolvedValue([
      {
        id: "o1",
        riderId: "rider",
        orderType: "parcel",
        status: "delivered",
        events: [
          { status: "assigned", createdAt: new Date("2026-07-06T10:00:00.000Z") },
          { status: "confirmed", createdAt: new Date("2026-07-06T10:05:00.000Z") },
          { status: "en_route_pickup", createdAt: new Date("2026-07-06T10:10:00.000Z") },
          { status: "picked_up", createdAt: new Date("2026-07-06T10:20:00.000Z") },
          { status: "en_route_dropoff", createdAt: new Date("2026-07-06T10:30:00.000Z") },
          { status: "delivered", createdAt: new Date("2026-07-06T11:00:00.000Z") },
        ],
      },
    ]);
    prisma.offer.findMany.mockResolvedValue([
      { id: "of1", orderId: "o1", createdAt: new Date("2026-07-06T09:50:00.000Z") },
      { id: "of2", orderId: "o1", createdAt: new Date("2026-07-06T09:52:00.000Z") },
      { id: "of3", orderId: "o1", createdAt: new Date("2026-07-06T09:55:00.000Z") },
    ]);

    const feed = await service.feedForUser("cust", NOW);
    expect(feed.map((r) => r.title)).toEqual(["Delivered", "New offer"]);
    // The offer row states the count instead of repeating the singular line three times, and is keyed +
    // timed by the NEWEST bid — so a later bid produces a NEW id, re-sorting it up and surviving an
    // earlier dismissal.
    const offerRow = feed.find((r) => r.title === "New offer")!;
    expect(offerRow.message).toBe("3 riders responded to your delivery — tap to compare offers.");
    expect(offerRow.id).toBe("offers:of3");
    expect(offerRow.at).toBe("2026-07-06T09:55:00.000Z");
  });

  it("rewrites a rider-bail cancel to the honest re-sent copy and points the tap at the live clone", async () => {
    const { prisma, service } = makeDeps();
    // The rider (r1) bailed on o1; the clone o2 (rebroadcastOfId=o1) is back on the board. Viewer is the
    // customer (not the rider on o1). Both rows are in the take-30 window (the clone is newer, sorts first).
    prisma.order.findMany.mockResolvedValue([
      {
        id: "o2",
        riderId: null,
        rebroadcastOfId: "o1",
        orderType: "parcel", events: [{ status: "open_for_offers", createdAt: new Date("2026-07-06T11:05:00.000Z") }], // silent
      },
      {
        id: "o1",
        riderId: "r1",
        cancelledBy: "r1", // the rider cancelled — not the viewer, so not suppressed
        orderType: "parcel", events: [{ status: "cancelled", createdAt: new Date("2026-07-06T11:00:00.000Z") }],
      },
    ]);
    const feed = await service.feedForUser("me", NOW);
    const row = feed.find((r) => r.title === "Your rider had to cancel");
    expect(row).toBeDefined();
    expect(row?.message).toContain("sent your request back out");
    // Tap routes to the LIVE clone, not the dead original…
    expect(row?.orderId).toBe("o2");
    // …but the stable row id still keys off the ORIGINAL order.
    expect(row?.id).toBe(`o1:cancelled:2026-07-06T11:00:00.000Z`);
    // No plain "Order cancelled" row leaks through.
    expect(feed.some((r) => r.title === "Order cancelled")).toBe(false);
  });

  it("suppresses the cancelled row for the rider who bailed (a row about your own action is noise)", async () => {
    const { prisma, service } = makeDeps();
    // Viewer is the rider on o1 AND the one who cancelled it (cancelledBy is the canceller's profile id).
    prisma.order.findMany.mockResolvedValue([
      {
        id: "o1",
        riderId: "me",
        cancelledBy: "me",
        orderType: "parcel", events: [{ status: "cancelled", createdAt: new Date("2026-07-06T11:00:00.000Z") }],
      },
    ]);
    const feed = await service.feedForUser("me", NOW);
    expect(feed).toEqual([]);
  });

  it("suppresses a customer's self-cancel row, but the assigned rider still sees it", async () => {
    const { prisma, service } = makeDeps();
    const orderRows = [
      {
        id: "o1",
        customerId: "cust",
        riderId: "rider",
        cancelledBy: "cust", // the customer cancelled
        orderType: "parcel", events: [{ status: "cancelled", createdAt: new Date("2026-07-06T11:00:00.000Z") }],
      },
    ];
    // The customer (actor) gets no row…
    prisma.order.findMany.mockResolvedValue(orderRows);
    expect(await service.feedForUser("cust", NOW)).toEqual([]);
    // …but the assigned rider (not the actor) still gets a cancelled row (rider voice).
    prisma.order.findMany.mockResolvedValue(orderRows);
    const riderFeed = await service.feedForUser("rider", NOW);
    expect(riderFeed.map((r) => r.title)).toEqual(["Order cancelled"]);
    expect(riderFeed[0].orderId).toBe("o1");
  });

  it("tells the customer nobody was online on a no-supply expiry, else the default raise-the-price nudge", async () => {
    const { prisma, service } = makeDeps();
    prisma.order.findMany.mockResolvedValue([
      {
        id: "o1",
        riderId: null,
        expiryNoSupply: true,
        orderType: "parcel", events: [{ status: "expired", createdAt: new Date("2026-07-06T11:00:00.000Z") }],
      },
    ]);
    expect((await service.feedForUser("me", NOW))[0]).toMatchObject({ title: "No riders online nearby", icon: "bike" });

    // A normal expiry (had riders / not flagged) keeps the default "No riders yet" copy.
    prisma.order.findMany.mockResolvedValue([
      {
        id: "o2",
        riderId: null,
        expiryNoSupply: false,
        orderType: "parcel", events: [{ status: "expired", createdAt: new Date("2026-07-06T11:00:00.000Z") }],
      },
    ]);
    expect((await service.feedForUser("me", NOW))[0]).toMatchObject({ title: "No riders yet", icon: "clock" });
  });

  it("Fix 1: an expired order that DID attract bids gets the honest 'window closed' copy, not 'raise your price'", async () => {
    const { prisma, service } = makeDeps();
    prisma.order.findMany.mockResolvedValue([
      {
        id: "o1",
        riderId: null,
        expiryNoSupply: false, // riders WERE around — not a no-supply expiry
        orderType: "parcel", events: [{ status: "expired", createdAt: new Date("2026-07-06T11:00:00.000Z") }],
      },
    ]);
    // Durable offer rows recover "a rider bid" on this cold read even though the offers are now `expired`.
    // (Full offer shape so the KB-FEED-SYNTH "New offer" synthesis — same findMany mock — can build a row.)
    prisma.offer.findMany.mockResolvedValue([{ id: "of1", orderId: "o1", createdAt: new Date("2026-07-06T10:59:00.000Z") }]);

    // The expired "window closed" row (11:00) still sorts above the synthesized offer row (10:59).
    const row = (await service.feedForUser("me", NOW))[0];
    expect(row).toMatchObject({ title: "The window closed" });
    expect(row.message).toContain("no need to raise the price");
    // It queried the durable offer rows for the expired order(s) in view.
    expect(prisma.offer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orderId: { in: ["o1"] } }, distinct: ["orderId"] }),
    );
    // …and the offer row synthesized from the same bid keeps the singular push copy verbatim.
    expect((await service.feedForUser("me", NOW)).find((r) => r.title === "New offer")?.message).toBe(
      "A rider responded to your delivery — tap to compare offers.",
    );
  });

  it("KB-FEED-SYNTH: synthesizes a 'New offer' row from the customer's own Offer rows, merged + sorted with the event rows", async () => {
    const { prisma, service } = makeDeps();
    prisma.order.findMany.mockResolvedValue([
      {
        id: "o1",
        riderId: null, // customer-view order
        orderType: "parcel",
        status: "confirmed",
        events: [{ status: "confirmed", createdAt: new Date("2026-07-06T10:00:00.000Z") }],
      },
    ]);
    // A rider bid on o1 at 10:30 — notifyNewOffer pushed the customer, but no feed row existed before.
    prisma.offer.findMany.mockResolvedValue([{ id: "of1", orderId: "o1", createdAt: new Date("2026-07-06T10:30:00.000Z") }]);

    const feed = await service.feedForUser("me", NOW);
    const offerRow = feed.find((r) => r.title === "New offer");
    expect(offerRow).toMatchObject({ orderId: "o1", message: expect.stringContaining("compare offers"), unread: true });
    // Merged and sorted by time: the 10:30 offer sorts above the 10:00 confirmed event.
    expect(feed.map((r) => r.title)).toEqual(["New offer", "Rider confirmed your items"]);
    // Batched query over the caller's own (customer-view) order ids — not N+1.
    expect(prisma.offer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ orderId: { in: ["o1"] } }) }),
    );
  });

  it("KB-FEED-SYNTH: synthesizes an account-status row from AuditLog, with orderId null and copy mirroring the push", async () => {
    const { prisma, service } = makeDeps();
    prisma.order.findMany.mockResolvedValue([]); // no orders — the account row must still appear
    prisma.auditLog.findMany.mockResolvedValue([
      { id: "a1", action: "rider.kyc_approve", createdAt: new Date("2026-07-06T11:30:00.000Z") },
      { id: "a2", action: "rider.suspend", createdAt: new Date("2026-07-05T09:00:00.000Z") },
    ]);

    const feed = await service.feedForUser("me", NOW);
    // Queried the standing/KYC audit actions for this user, newest first.
    const auditArg = prisma.auditLog.findMany.mock.calls[0][0];
    expect(auditArg.where.target).toBe("me");
    expect(auditArg.where.action.in).toEqual(expect.arrayContaining(["rider.kyc_approve", "rider.kyc_decline", "rider.suspend", "rider.ban", "rider.lift", "rider.clear_hold"]));
    // Both rows appear, account-level (orderId null), newest first, copy mirroring the actual pushes.
    expect(feed.map((r) => r.title)).toEqual(["You're verified", "Account paused"]);
    expect(feed.every((r) => r.orderId === null)).toBe(true);
    expect(feed[0]).toMatchObject({ message: expect.stringContaining("go online"), unread: true });
  });

  it("UX-2026-07-16: synthesizes a resolved-issue row from Issue, mirroring notifyIssueResolved's push copy, as a durable fallback for a missed push", async () => {
    const { prisma, service } = makeDeps();
    prisma.order.findMany.mockResolvedValue([]); // the order itself may have had no activity in the window
    prisma.issue.findMany.mockResolvedValue([
      { id: "i1", orderId: "o1", resolution: "refund", resolvedAt: new Date("2026-07-06T11:30:00.000Z") },
    ]);

    const feed = await service.feedForUser("me", NOW);
    const issueArg = prisma.issue.findMany.mock.calls[0][0];
    expect(issueArg.where.openedByProfileId).toBe("me");
    expect(issueArg.where.status).toBe("resolved");
    expect(feed[0]).toMatchObject({
      id: "issue:i1",
      orderId: "o1",
      title: "Your report was resolved",
      message: expect.stringContaining("refund"),
      unread: true,
    });
  });

  it("UX26-03 sibling: the resolved-issue row carries to/status for a rider opener whose order is still in the retention window, routing them to /rider/job", async () => {
    const { prisma, service } = makeDeps();
    prisma.order.findMany.mockResolvedValue([
      { id: "o1", riderId: "me", orderType: "parcel", status: "assigned", events: [{ status: "assigned", createdAt: new Date("2026-07-06T10:00:00.000Z") }] },
    ]);
    prisma.issue.findMany.mockResolvedValue([
      { id: "i1", orderId: "o1", resolution: "close_no_action", resolvedAt: new Date("2026-07-06T11:30:00.000Z") },
    ]);

    const feed = await service.feedForUser("me", NOW);
    expect(feed.find((r) => r.id === "issue:i1")).toMatchObject({ to: "rider", status: "assigned" });
  });

  it("UX26-03 sibling: the resolved-issue row leaves to/status undefined when the order had no activity in the window (falls back to /order/:id)", async () => {
    const { prisma, service } = makeDeps();
    prisma.order.findMany.mockResolvedValue([]); // nothing happened on the order inside the window
    prisma.issue.findMany.mockResolvedValue([
      { id: "i1", orderId: "o1", resolution: "close_no_action", resolvedAt: new Date("2026-07-06T11:30:00.000Z") },
    ]);

    const feed = await service.feedForUser("me", NOW);
    const row = feed.find((r) => r.id === "issue:i1");
    expect(row?.to).toBeUndefined();
    expect(row?.status).toBeUndefined();
  });

  it("UX-2026-07-16: resolved-issue row copy branches on resolution, matching notifyIssueResolved", async () => {
    const { prisma, service } = makeDeps();
    prisma.order.findMany.mockResolvedValue([]);
    prisma.issue.findMany.mockResolvedValue([
      { id: "i1", orderId: "o1", resolution: "rider_strike", resolvedAt: new Date("2026-07-06T11:00:00.000Z") },
      { id: "i2", orderId: "o2", resolution: "close_no_action", resolvedAt: new Date("2026-07-05T09:00:00.000Z") },
    ]);

    const feed = await service.feedForUser("me", NOW);
    expect(feed.find((r) => r.id === "issue:i1")?.message).toContain("taken action");
    expect(feed.find((r) => r.id === "issue:i2")?.message).toContain("closed it out");
  });

  it("UX17-01: synthesizes an SOS row for the COUNTERPARTY (not the raiser), mirroring the push copy", async () => {
    const { prisma, service } = makeDeps();
    // One shared order both parties are on; the RIDER raised the SOS on it.
    prisma.order.findMany.mockResolvedValue([
      { id: "o1", orderType: "parcel", events: [{ status: "assigned", createdAt: new Date("2026-07-06T10:00:00.000Z") }] },
    ]);
    // Simulate the DB-level `raisedByProfileId: { not: viewer }` filter — only events NOT raised by the
    // viewer come back, so the raiser (rider) never sees their own SOS while the counterparty (cust) does.
    const allSos = [{ id: "s1", orderId: "o1", raisedByProfileId: "rider", createdAt: new Date("2026-07-06T11:00:00.000Z") }];
    prisma.sosEvent.findMany.mockImplementation(async ({ where }: { where: { raisedByProfileId: { not: string } } }) =>
      allSos
        .filter((e) => e.raisedByProfileId !== where.raisedByProfileId.not)
        .map((e) => ({ id: e.id, orderId: e.orderId, createdAt: e.createdAt })),
    );

    // The COUNTERPARTY (customer) sees the durable SOS row with copy verbatim-mirroring the push.
    const custFeed = await service.feedForUser("cust", NOW);
    const sosRow = custFeed.find((r) => r.title === "SOS on your delivery");
    expect(sosRow).toMatchObject({
      id: "sos:s1",
      orderId: "o1",
      icon: "triangle-alert",
      message: "The other party raised an SOS on this trip. Stay safe — LyniaGo's safety team has been alerted.",
      unread: true,
    });
    // The query excludes events the viewer raised (counterparty-only, mirroring the push's target).
    expect(prisma.sosEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ orderId: { in: ["o1"] }, raisedByProfileId: { not: "cust" } }),
      }),
    );

    // The RAISER (rider) never sees an SOS row for the trip they raised it on.
    prisma.order.findMany.mockResolvedValue([
      { id: "o1", orderType: "parcel", events: [{ status: "assigned", createdAt: new Date("2026-07-06T10:00:00.000Z") }] },
    ]);
    const riderFeed = await service.feedForUser("rider", NOW);
    expect(riderFeed.some((r) => r.title === "SOS on your delivery")).toBe(false);
  });

  it("UX17-02: synthesizes a rider-standing-notice row for the affected CUSTOMER (not the rider)", async () => {
    const { prisma, service } = makeDeps();
    // The customer's own order (riderId != viewer → customer view).
    prisma.order.findMany.mockResolvedValue([
      { id: "o1", riderId: "rider", orderType: "parcel", events: [{ status: "assigned", createdAt: new Date("2026-07-06T10:00:00.000Z") }] },
    ]);
    // The standing-notice audit is targeted at the ORDER id; the account-status query (target=userId) is
    // separate and returns nothing here. Branch the shared auditLog.findMany mock on the queried action.
    prisma.auditLog.findMany.mockImplementation(async ({ where }: { where: { action?: string } }) =>
      where.action === "order.rider_standing_notice"
        ? [{ id: "au1", target: "o1", createdAt: new Date("2026-07-06T11:00:00.000Z") }]
        : [],
    );

    // The CUSTOMER sees the durable fallback row, copy verbatim-mirroring the push.
    const custFeed = await service.feedForUser("cust", NOW);
    const row = custFeed.find((r) => r.title === "An update on your delivery");
    expect(row).toMatchObject({
      id: "rider-standing:au1",
      orderId: "o1",
      icon: "triangle-alert",
      message: "There's a change with your assigned rider — our team is reviewing this trip.",
      unread: true,
    });

    // The RIDER viewing their OWN order (riderId === viewer) is NOT a customer-view order, so the notice is
    // not shown to them — they get their own rider.suspend/ban account row via ACCOUNT_FEED_ACTIONS instead.
    prisma.order.findMany.mockResolvedValue([
      { id: "o1", riderId: "rider", orderType: "parcel", events: [{ status: "assigned", createdAt: new Date("2026-07-06T10:00:00.000Z") }] },
    ]);
    const riderFeed = await service.feedForUser("rider", NOW);
    expect(riderFeed.some((r) => r.title === "An update on your delivery")).toBe(false);
  });

  it("UX18-04: synthesizes account rows for customer.hold/lift and wallet.credit — previously missing from ACCOUNT_FEED_COPY entirely", async () => {
    const { prisma, service } = makeDeps();
    prisma.order.findMany.mockResolvedValue([]); // account-level rows need no orders
    prisma.auditLog.findMany.mockResolvedValue([
      { id: "a1", action: "wallet.credit", createdAt: new Date("2026-07-06T11:30:00.000Z") },
      { id: "a2", action: "customer.hold", createdAt: new Date("2026-07-06T11:00:00.000Z") },
      { id: "a3", action: "customer.lift", createdAt: new Date("2026-07-05T09:00:00.000Z") },
    ]);

    const feed = await service.feedForUser("me", NOW);
    const auditArg = prisma.auditLog.findMany.mock.calls[0][0];
    expect(auditArg.where.action.in).toEqual(expect.arrayContaining(["customer.hold", "customer.lift", "wallet.credit"]));
    expect(feed.map((r) => r.title)).toEqual(["Wallet credited", "Account paused", "Account restored"]);
    expect(feed.every((r) => r.orderId === null)).toBe(true);
  });

  // BH-18: `to` distinguishes a `customer.hold`/`customer.lift` row (about the viewing CUSTOMER) from
  // every other account-status row (about the viewing RIDER) — the client uses it to avoid routing a
  // tap on a customer's own hold/lift notice to the rider-onboarding screen (the push.ts sibling fix).
  it("BH-18: tags customer.hold/lift rows to:'customer' and every other account row to:'rider'", async () => {
    const { prisma, service } = makeDeps();
    prisma.order.findMany.mockResolvedValue([]);
    prisma.auditLog.findMany.mockResolvedValue([
      { id: "a1", action: "wallet.credit", createdAt: new Date("2026-07-06T11:30:00.000Z") },
      { id: "a2", action: "customer.hold", createdAt: new Date("2026-07-06T11:00:00.000Z") },
      { id: "a3", action: "customer.lift", createdAt: new Date("2026-07-05T09:00:00.000Z") },
      { id: "a4", action: "rider.suspend", createdAt: new Date("2026-07-05T08:00:00.000Z") },
    ]);

    const feed = await service.feedForUser("me", NOW);
    // customer.hold and rider.suspend share the "Account paused" title, so assert via the raw row ids.
    expect(feed.find((r) => r.id === "account:a1")?.to).toBe("rider");
    expect(feed.find((r) => r.id === "account:a2")?.to).toBe("customer");
    expect(feed.find((r) => r.id === "account:a3")?.to).toBe("customer");
    expect(feed.find((r) => r.id === "account:a4")?.to).toBe("rider");
  });

  it("UX18-05: synthesizes a 'delivery is back on track' row when liftRider resolves a rider-standing notice", async () => {
    const { prisma, service } = makeDeps();
    // The customer's own order (riderId != viewer → customer view).
    prisma.order.findMany.mockResolvedValue([
      { id: "o1", riderId: "rider", orderType: "parcel", events: [{ status: "assigned", createdAt: new Date("2026-07-06T10:00:00.000Z") }] },
    ]);
    prisma.auditLog.findMany.mockImplementation(async ({ where }: { where: { action?: string } }) =>
      where.action === "order.rider_standing_resolved"
        ? [{ id: "au2", target: "o1", createdAt: new Date("2026-07-06T11:30:00.000Z") }]
        : [],
    );

    const custFeed = await service.feedForUser("cust", NOW);
    const row = custFeed.find((r) => r.title === "Your delivery is back on track");
    expect(row).toMatchObject({
      id: "rider-standing-resolved:au2",
      orderId: "o1",
      icon: "check",
      message: "The review of your assigned rider is complete — your delivery is continuing as normal.",
      unread: true,
    });
  });

  it("UX17-03: an adjudicated `completed` shows the ops-override copy (customer + rider), a plain completion stays generic", async () => {
    const { prisma, service } = makeDeps();
    // o1 was ops-adjudicated to complete; o2 is an ordinary completion.
    prisma.auditLog.findMany.mockImplementation(async ({ where }: { where: { action?: string } }) =>
      where.action === "order.adjudicate_delivered" ? [{ target: "o1" }] : [],
    );

    // Customer view (riderId != viewer) — adjudicated order shows the review copy (UX19-02: no fabricated
    // deadline — `IssuesService.raise` has no time-based gating); the ordinary completion keeps the
    // generic FEED_NOTICES.completed copy.
    prisma.order.findMany.mockResolvedValue([
      { id: "o1", riderId: "rider", orderType: "parcel", status: "completed", events: [{ status: "completed", createdAt: new Date("2026-07-06T11:00:00.000Z") }] },
      { id: "o2", riderId: "rider", orderType: "parcel", status: "completed", events: [{ status: "completed", createdAt: new Date("2026-07-06T10:00:00.000Z") }] },
    ]);
    const custFeed = await service.feedForUser("cust", NOW);
    expect(custFeed.find((r) => r.orderId === "o1")).toMatchObject({
      title: "Delivery marked complete after review",
      message: expect.stringContaining("report a problem"),
    });
    expect(custFeed.find((r) => r.orderId === "o1")?.message).not.toMatch(/48 hours?/i);
    // STREAMLINE-01: the ORDINARY completion gives the customer no row at all — `completed` is written when
    // the customer themselves rates the trip, and the push table addresses it to the rider only. The
    // adjudicated one above is the deliberate carve-out: `adjudicateDelivered` bypasses notifyOrderStatus
    // and pushes BOTH parties directly, so gating it on the table would have dropped a row for a push the
    // customer really did receive — on the one completion they are most likely to want a record of.
    expect(custFeed.find((r) => r.orderId === "o2")).toBeUndefined();
    // It queried the durable adjudication audit rows for the in-view orders.
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { target: { in: ["o1", "o2"] }, action: "order.adjudicate_delivered" } }),
    );

    // Rider view (riderId === viewer) — the adjudicated completion shows the rider-voiced review copy, not
    // the generic "Nice work", and (UX19-04) doesn't thank the rider for evidence that may never have been
    // submitted — proof-of-drop capture is optional and adjudicateDelivered has no evidence precondition.
    prisma.order.findMany.mockResolvedValue([
      { id: "o1", riderId: "me", orderType: "parcel", status: "completed", events: [{ status: "completed", createdAt: new Date("2026-07-06T11:00:00.000Z") }] },
      { id: "o2", riderId: "me", orderType: "parcel", status: "completed", events: [{ status: "completed", createdAt: new Date("2026-07-06T10:00:00.000Z") }] },
    ]);
    const riderFeed = await service.feedForUser("me", NOW);
    expect(riderFeed.find((r) => r.orderId === "o1")).toMatchObject({
      title: "Delivery confirmed",
      message: expect.stringContaining("reviewed the delivery"),
    });
    expect(riderFeed.find((r) => r.orderId === "o1")?.message).not.toMatch(/your proof|the evidence/i);
    // …and the rider — who IS the audience for an ordinary completion — still gets the generic copy.
    expect(riderFeed.find((r) => r.orderId === "o2")).toMatchObject({ title: "Delivery complete" });
  });

  it("UX20-04: synthesizes a fare-updated row for BOTH parties from order.fare_adjust — adjustFare's push had no durable feed fallback", async () => {
    const { prisma, service } = makeDeps();
    prisma.order.findMany.mockResolvedValue([
      { id: "o1", riderId: "rider", agreedFare: dec("12.50"), orderType: "parcel", events: [] },
    ]);
    prisma.auditLog.findMany.mockImplementation(async ({ where }: { where: { action?: string } }) =>
      where.action === "order.fare_adjust"
        ? [{ id: "au1", target: "o1", createdAt: new Date("2026-07-06T11:00:00.000Z") }]
        : [],
    );

    // Customer view (riderId != viewer): "Your fare was corrected to $12.50 by our team."
    const custFeed = await service.feedForUser("cust", NOW);
    expect(custFeed.find((r) => r.id === "fare-adjust:au1")).toMatchObject({
      orderId: "o1",
      to: "customer",
      icon: "banknote",
      title: "Fare updated",
      message: "Your fare was corrected to $12.50 by our team.",
      unread: true,
    });

    // Rider view (riderId === viewer) of the SAME audit row: rider-voiced copy.
    const riderFeed = await service.feedForUser("rider", NOW);
    expect(riderFeed.find((r) => r.id === "fare-adjust:au1")).toMatchObject({
      orderId: "o1",
      to: "rider",
      title: "Fare updated",
      message: "The fare for this delivery was corrected to $12.50 by our team.",
    });

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ target: { in: ["o1"] }, action: "order.fare_adjust" }) }),
    );
  });

  it("UX26-03: the fare-adjust row carries the order's current status, so a rider viewer routes straight to /rider/job", async () => {
    const { prisma, service } = makeDeps();
    prisma.order.findMany.mockResolvedValue([
      {
        id: "o1",
        riderId: "rider",
        agreedFare: dec("12.50"),
        orderType: "parcel",
        status: "confirmed",
        events: [
          { status: "assigned", createdAt: new Date("2026-07-06T10:00:00.000Z") },
          { status: "confirmed", createdAt: new Date("2026-07-06T10:05:00.000Z") },
        ],
      },
    ]);
    prisma.auditLog.findMany.mockImplementation(async ({ where }: { where: { action?: string } }) =>
      where.action === "order.fare_adjust"
        ? [{ id: "au1", target: "o1", createdAt: new Date("2026-07-06T11:00:00.000Z") }]
        : [],
    );

    const riderFeed = await service.feedForUser("rider", NOW);
    // The order's CURRENT status ("confirmed"), not a stale earlier beat — notificationRowDestination only
    // special-cases "assigned"/"cancelled" for `to === "rider"`, so this stays on the generic /order/:id
    // route, but the field itself must reflect the live status. STREAMLINE-01 reads it off the column, so
    // it stays right even when the cutoff filters every event out of view.
    expect(riderFeed.find((r) => r.id === "fare-adjust:au1")).toMatchObject({ to: "rider", status: "confirmed" });

    const custFeed = await service.feedForUser("cust", NOW);
    expect(custFeed.find((r) => r.id === "fare-adjust:au1")).toMatchObject({ to: "customer", status: "confirmed" });
  });

  it("UX21-02: synthesizes a customer-voiced row from order.riders_available_notify — the live-order 'notify me' push had no durable feed fallback", async () => {
    const { prisma, service } = makeDeps();
    prisma.order.findMany.mockResolvedValue([{ id: "o1", riderId: null, orderType: "parcel", events: [] }]);
    prisma.auditLog.findMany.mockImplementation(async ({ where }: { where: { action?: string } }) =>
      where.action === "order.riders_available_notify"
        ? [{ id: "au1", target: "o1", createdAt: new Date("2026-07-06T11:00:00.000Z") }]
        : [],
    );

    const custFeed = await service.feedForUser("cust", NOW);

    expect(custFeed.find((r) => r.id === "riders-available:au1")).toMatchObject({
      orderId: "o1",
      to: "customer",
      icon: "bike",
      title: "A rider's online near you",
      message: "Riders are being pinged on your live request — tap to follow the offers.",
      unread: true,
    });
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ target: { in: ["o1"] }, action: "order.riders_available_notify" }) }),
    );
  });

  it("UX21-02: synthesizes an account-level row from customer.riders_available_notify — the generic (no-live-order) 'notify me' push had no durable feed fallback", async () => {
    const { prisma, service } = makeDeps();
    prisma.auditLog.findMany.mockImplementation(async ({ where }: { where: { action?: { in: string[] } } }) =>
      where.action && "in" in where.action && where.action.in.includes("customer.riders_available_notify")
        ? [{ id: "au2", action: "customer.riders_available_notify", createdAt: new Date("2026-07-06T11:00:00.000Z") }]
        : [],
    );

    const feed = await service.feedForUser("cust", NOW);

    expect(feed.find((r) => r.id === "account:au2")).toMatchObject({
      orderId: null,
      to: "customer",
      icon: "bike",
      title: "A rider's online near you",
      message: "Riders are back near your pickup — send your parcel again to get offers.",
      unread: true,
    });
  });
});
