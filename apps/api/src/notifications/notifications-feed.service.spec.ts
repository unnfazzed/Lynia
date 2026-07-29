import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { NotificationsFeedService } from "./notifications-feed.service";

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
          { status: "assigned", createdAt: new Date("2026-07-06T10:00:00.000Z") },
          { status: "delivered", createdAt: new Date("2026-07-06T11:00:00.000Z") },
        ],
      },
    ]);

    const feed = await service.feedForUser("me", NOW);

    // Only the two mapped events surface; open_for_offers is silent (as it is for push).
    expect(feed.map((r) => r.title)).toEqual(["Delivered", "Rider assigned"]);
    expect(feed[0]).toMatchObject({ icon: "check", at: "2026-07-06T11:00:00.000Z", unread: true });
    // Each row carries a stable, unique id keyed by order + status + time.
    expect(new Set(feed.map((r) => r.id)).size).toBe(feed.length);
  });

  // UX19-03: `to` + `status` let the client (notificationRowDestination) replicate pushDestination's
  // rider-only screen routing for a feed tap — without these a rider's own "assigned"/"cancelled" row
  // always fell back to /order/:id, a dead-control detour the equivalent push doesn't take.
  it("stamps the viewer's per-order voice and the raw status on every order-status row", async () => {
    const { prisma, service } = makeDeps();
    prisma.order.findMany.mockResolvedValue([
      { id: "o1", riderId: "rider", orderType: "parcel", events: [{ status: "assigned", createdAt: new Date("2026-07-06T10:00:00.000Z") }] },
    ]);
    const custFeed = await service.feedForUser("cust", NOW);
    expect(custFeed[0]).toMatchObject({ to: "customer", status: "assigned" });

    prisma.order.findMany.mockResolvedValue([
      { id: "o1", riderId: "rider", orderType: "parcel", events: [{ status: "assigned", createdAt: new Date("2026-07-06T10:00:00.000Z") }] },
    ]);
    const riderFeed = await service.feedForUser("rider", NOW);
    expect(riderFeed[0]).toMatchObject({ to: "rider", status: "assigned" });
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
        orderType: "parcel", events: [{ status: "assigned", createdAt: new Date("2026-07-06T10:00:00.000Z") }],
      },
    ]);

    const feed = await service.feedForUser("me", NOW);

    expect(feed.find((r) => r.title === "Delivered")?.orderId).toBe("o1");
    expect(feed.find((r) => r.title === "Rider assigned")?.orderId).toBe("o2");
  });

  it("reads orders across both roles (customer OR rider), newest first, capped", async () => {
    const { prisma, service } = makeDeps();
    await service.feedForUser("me", NOW);
    const arg = prisma.order.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ OR: [{ customerId: "me" }, { riderId: "me" }] });
    expect(arg.orderBy).toEqual({ createdAt: "desc" });
    expect(arg.take).toBeGreaterThan(0);
  });

  it("marks recent events unread and old events read (deterministic recency window)", async () => {
    const { prisma, service } = makeDeps();
    prisma.order.findMany.mockResolvedValue([
      {
        id: "o1",
        orderType: "parcel", events: [
          { status: "delivered", createdAt: new Date("2026-07-06T11:30:00.000Z") }, // 30 min ago
          { status: "cancelled", createdAt: new Date("2026-07-01T00:00:00.000Z") }, // days ago
        ],
      },
    ]);
    const feed = await service.feedForUser("me", NOW);
    const byTitle = Object.fromEntries(feed.map((r) => [r.title, r.unread]));
    expect(byTitle["Delivered"]).toBe(true);
    expect(byTitle["Order cancelled"]).toBe(false);
  });

  it("returns an empty feed when the caller has no orders", async () => {
    const { service } = makeDeps();
    await expect(service.feedForUser("me", NOW)).resolves.toEqual([]);
  });

  it("caps the feed at 30 rows", async () => {
    const { prisma, service } = makeDeps();
    // One order with 60 delivered events → 60 candidate rows, capped to 30.
    prisma.order.findMany.mockResolvedValue([
      {
        id: "o1",
        orderType: "parcel", events: Array.from({ length: 60 }, (_, i) => ({
          status: "delivered",
          createdAt: new Date(NOW.getTime() - i * 60_000),
        })),
      },
    ]);
    const feed = await service.feedForUser("me", NOW);
    expect(feed).toHaveLength(30);
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
  });

  it("KB-FEED-SYNTH: synthesizes a 'New offer' row from the customer's own Offer rows, merged + sorted with the event rows", async () => {
    const { prisma, service } = makeDeps();
    prisma.order.findMany.mockResolvedValue([
      {
        id: "o1",
        riderId: null, // customer-view order
        orderType: "parcel", events: [{ status: "assigned", createdAt: new Date("2026-07-06T10:00:00.000Z") }],
      },
    ]);
    // A rider bid on o1 at 10:30 — notifyNewOffer pushed the customer, but no feed row existed before.
    prisma.offer.findMany.mockResolvedValue([{ id: "of1", orderId: "o1", createdAt: new Date("2026-07-06T10:30:00.000Z") }]);

    const feed = await service.feedForUser("me", NOW);
    const offerRow = feed.find((r) => r.title === "New offer");
    expect(offerRow).toMatchObject({ orderId: "o1", message: expect.stringContaining("compare offers"), unread: true });
    // Merged and sorted by time: the 10:30 offer sorts above the 10:00 assigned event.
    expect(feed.map((r) => r.title)).toEqual(["New offer", "Rider assigned"]);
    // Batched query over the caller's own (customer-view) order ids — not N+1.
    expect(prisma.offer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orderId: { in: ["o1"] } } }),
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
    prisma.order.findMany.mockResolvedValue([]); // the order may have long since aged out of the lookback
    prisma.issue.findMany.mockResolvedValue([
      { id: "i1", orderId: "o1", resolution: "refund", resolvedAt: new Date("2026-07-06T11:30:00.000Z") },
    ]);

    const feed = await service.feedForUser("me", NOW);
    const issueArg = prisma.issue.findMany.mock.calls[0][0];
    expect(issueArg.where).toEqual({ openedByProfileId: "me", status: "resolved" });
    expect(feed[0]).toMatchObject({
      id: "issue:i1",
      orderId: "o1",
      title: "Your report was resolved",
      message: expect.stringContaining("refund"),
      unread: true,
    });
  });

  it("UX26-03 sibling: the resolved-issue row carries to/status for a rider opener still in the order lookback, routing them to /rider/job", async () => {
    const { prisma, service } = makeDeps();
    prisma.order.findMany.mockResolvedValue([
      { id: "o1", riderId: "me", orderType: "parcel", events: [{ status: "assigned", createdAt: new Date("2026-07-06T10:00:00.000Z") }] },
    ]);
    prisma.issue.findMany.mockResolvedValue([
      { id: "i1", orderId: "o1", resolution: "close_no_action", resolvedAt: new Date("2026-07-06T11:30:00.000Z") },
    ]);

    const feed = await service.feedForUser("me", NOW);
    expect(feed.find((r) => r.id === "issue:i1")).toMatchObject({ to: "rider", status: "assigned" });
  });

  it("UX26-03 sibling: the resolved-issue row leaves to/status undefined when the order has aged out of the lookback (falls back to /order/:id)", async () => {
    const { prisma, service } = makeDeps();
    prisma.order.findMany.mockResolvedValue([]); // order outside FEED_ORDER_LOOKBACK — not in view
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
      expect.objectContaining({ where: { orderId: { in: ["o1"] }, raisedByProfileId: { not: "cust" } } }),
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
      { id: "o1", riderId: "rider", orderType: "parcel", events: [{ status: "completed", createdAt: new Date("2026-07-06T11:00:00.000Z") }] },
      { id: "o2", riderId: "rider", orderType: "parcel", events: [{ status: "completed", createdAt: new Date("2026-07-06T10:00:00.000Z") }] },
    ]);
    const custFeed = await service.feedForUser("cust", NOW);
    expect(custFeed.find((r) => r.orderId === "o1")).toMatchObject({
      title: "Delivery marked complete after review",
      message: expect.stringContaining("report a problem"),
    });
    expect(custFeed.find((r) => r.orderId === "o1")?.message).not.toMatch(/48 hours?/i);
    expect(custFeed.find((r) => r.orderId === "o2")).toMatchObject({ title: "Delivery complete" });
    // It queried the durable adjudication audit rows for the in-view orders.
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { target: { in: ["o1", "o2"] }, action: "order.adjudicate_delivered" } }),
    );

    // Rider view (riderId === viewer) — the adjudicated completion shows the rider-voiced review copy, not
    // the generic "Nice work", and (UX19-04) doesn't thank the rider for evidence that may never have been
    // submitted — proof-of-drop capture is optional and adjudicateDelivered has no evidence precondition.
    prisma.order.findMany.mockResolvedValue([
      { id: "o1", riderId: "me", orderType: "parcel", events: [{ status: "completed", createdAt: new Date("2026-07-06T11:00:00.000Z") }] },
    ]);
    const riderFeed = await service.feedForUser("me", NOW);
    expect(riderFeed[0]).toMatchObject({
      title: "Delivery confirmed",
      message: expect.stringContaining("reviewed the delivery"),
    });
    expect(riderFeed[0].message).not.toMatch(/your proof|the evidence/i);
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
      expect.objectContaining({ where: { target: { in: ["o1"] }, action: "order.fare_adjust" } }),
    );
  });

  it("UX26-03: the fare-adjust row carries the order's current status (last event), so a rider viewer routes straight to /rider/job", async () => {
    const { prisma, service } = makeDeps();
    prisma.order.findMany.mockResolvedValue([
      {
        id: "o1",
        riderId: "rider",
        agreedFare: dec("12.50"),
        orderType: "parcel", events: [
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
    // The LAST event ("confirmed"), not the first — notificationRowDestination only special-cases
    // "assigned"/"cancelled" for `to === "rider"`, so this stays on the generic /order/:id route, but the
    // field itself must reflect the order's live status, not a stale earlier one.
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
      expect.objectContaining({ where: { target: { in: ["o1"] }, action: "order.riders_available_notify" } }),
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
