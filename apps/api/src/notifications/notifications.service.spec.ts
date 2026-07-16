import { describe, expect, it, vi } from "vitest";
import type { PushAdapter, PushMessage } from "../adapters/push/push.interface";
import type { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "./notifications.service";

function makeDeps() {
  const prisma = {
    deviceToken: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      findMany: vi.fn().mockResolvedValue([]),
      // DS13-05: notifyOps checks whether the resolved ops audience has any registered device.
      count: vi.fn().mockResolvedValue(0),
    },
    order: {
      findUnique: vi.fn().mockResolvedValue(null),
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
    // DS13-05: notifyOps resolves the admin audience (role=admin) server-side.
    profile: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
  // The service fans out through the batched `sendEach`; the default mock accepts every message.
  const push: PushAdapter = {
    send: vi.fn().mockResolvedValue({ ok: true, invalidToken: false }),
    sendEach: vi.fn().mockImplementation(async (msgs: PushMessage[]) => msgs.map(() => ({ ok: true, invalidToken: false }))),
  };
  const service = new NotificationsService(prisma as unknown as PrismaService, push);
  return { prisma, push, service };
}

describe("NotificationsService — token registry", () => {
  it("registers a token, claiming it for the authenticated caller on both create and update", async () => {
    const { prisma, service } = makeDeps();
    await service.registerToken("p1", "tok-a", "android");
    expect(prisma.deviceToken.upsert).toHaveBeenCalledWith({
      where: { token: "tok-a" },
      create: { profileId: "p1", token: "tok-a", platform: "android" },
      update: { profileId: "p1", platform: "android" },
    });
  });

  it("re-homes a token previously owned by another profile (shared-device account switch)", async () => {
    const { prisma, service } = makeDeps();
    // A token last seen on p2's account is claimed by p1 signing in on the same physical device.
    prisma.deviceToken.findUnique.mockResolvedValue({ profileId: "p2" });
    await service.registerToken("p1", "tok-a", "android");
    // The upsert reassigns profileId to the authenticated caller — no ConflictException.
    expect(prisma.deviceToken.upsert).toHaveBeenCalledWith({
      where: { token: "tok-a" },
      create: { profileId: "p1", token: "tok-a", platform: "android" },
      update: { profileId: "p1", platform: "android" },
    });
  });

  it("unregister only deletes a token owned by the caller", async () => {
    const { prisma, service } = makeDeps();
    await service.unregisterToken("p1", "tok-a");
    expect(prisma.deviceToken.deleteMany).toHaveBeenCalledWith({ where: { token: "tok-a", profileId: "p1" } });
  });
});

describe("NotificationsService — order-status notices", () => {
  it("notifies the RIDER on `assigned`, to all their devices in one batch, with order data", async () => {
    const { prisma, push, service } = makeDeps();
    prisma.order.findUnique.mockResolvedValue({ customerId: "cust", riderId: "rider" });
    prisma.deviceToken.findMany.mockResolvedValue([{ token: "r1" }, { token: "r2" }]);

    await service.notifyOrderStatus("o1", "assigned");

    expect(prisma.deviceToken.findMany).toHaveBeenCalledWith({
      where: { profileId: { in: ["rider"] } },
      select: { token: true, profileId: true },
    });
    // One batched call carrying both devices (not a per-token fan-out). Data carries the recipient's
    // per-order role (`to`) so the client routes by order relationship, not global session role (Fix 3).
    expect(push.sendEach).toHaveBeenCalledOnce();
    expect(push.sendEach).toHaveBeenCalledWith([
      expect.objectContaining({ token: "r1", data: { orderId: "o1", status: "assigned", to: "rider" } }),
      expect.objectContaining({ token: "r2", data: { orderId: "o1", status: "assigned", to: "rider" } }),
    ]);
  });

  it("notifies the CUSTOMER on lifecycle steps like `delivered`", async () => {
    const { prisma, push, service } = makeDeps();
    prisma.order.findUnique.mockResolvedValue({ customerId: "cust", riderId: "rider" });
    prisma.deviceToken.findMany.mockResolvedValue([{ token: "c1" }]);

    await service.notifyOrderStatus("o1", "delivered");

    expect(prisma.deviceToken.findMany).toHaveBeenCalledWith({
      where: { profileId: { in: ["cust"] } },
      select: { token: true, profileId: true },
    });
    expect(push.sendEach).toHaveBeenCalledOnce();
  });

  it("notifies BOTH parties on `cancelled`, each stamped with their own per-order role (Fix 3)", async () => {
    const { prisma, push, service } = makeDeps();
    prisma.order.findUnique.mockResolvedValue({ customerId: "cust", riderId: "rider" });
    prisma.deviceToken.findMany.mockImplementation(async ({ where }: { where: { profileId: { in: string[] } } }) =>
      where.profileId.in.includes("cust") ? [{ token: "c1", profileId: "cust" }] : [{ token: "r1", profileId: "rider" }],
    );
    await service.notifyOrderStatus("o1", "cancelled");
    // Sent per-audience so each recipient carries its own `to` — the customer and the rider each get one.
    expect(prisma.deviceToken.findMany).toHaveBeenCalledWith({
      where: { profileId: { in: ["cust"] } },
      select: { token: true, profileId: true },
    });
    expect(prisma.deviceToken.findMany).toHaveBeenCalledWith({
      where: { profileId: { in: ["rider"] } },
      select: { token: true, profileId: true },
    });
    expect(push.sendEach).toHaveBeenCalledWith([
      expect.objectContaining({ token: "c1", data: { orderId: "o1", status: "cancelled", to: "customer" } }),
    ]);
    expect(push.sendEach).toHaveBeenCalledWith([
      expect.objectContaining({ token: "r1", data: { orderId: "o1", status: "cancelled", to: "rider" } }),
    ]);
  });

  it("notifies the CUSTOMER (only) on `undelivered` — a terminal failure they must learn about", async () => {
    const { prisma, push, service } = makeDeps();
    prisma.order.findUnique.mockResolvedValue({ customerId: "cust", riderId: "rider" });
    prisma.deviceToken.findMany.mockResolvedValue([{ token: "c1" }]);

    await service.notifyOrderStatus("o1", "undelivered");

    // Rider marked it themselves → push goes to the customer only, mirroring the in-app feed row.
    expect(prisma.deviceToken.findMany).toHaveBeenCalledWith({
      where: { profileId: { in: ["cust"] } },
      select: { token: true, profileId: true },
    });
    expect(push.sendEach).toHaveBeenCalledWith([
      expect.objectContaining({ token: "c1", data: { orderId: "o1", status: "undelivered", to: "customer" } }),
    ]);
  });

  it("stays silent for un-mapped statuses (no order lookup, no send)", async () => {
    const { prisma, push, service } = makeDeps();
    await service.notifyOrderStatus("o1", "open_for_offers");
    expect(prisma.order.findUnique).not.toHaveBeenCalled();
    expect(push.sendEach).not.toHaveBeenCalled();
  });

  it("drops a null rider audience (e.g. `completed` on an order with no rider)", async () => {
    const { prisma, push, service } = makeDeps();
    prisma.order.findUnique.mockResolvedValue({ customerId: "cust", riderId: null });
    await service.notifyOrderStatus("o1", "completed"); // → rider only, but rider is null
    expect(prisma.deviceToken.findMany).not.toHaveBeenCalled();
    expect(push.sendEach).not.toHaveBeenCalled();
  });

  it("swallows a push failure — never throws into the caller's transition", async () => {
    const { prisma, push, service } = makeDeps();
    prisma.order.findUnique.mockResolvedValue({ customerId: "cust", riderId: "rider" });
    prisma.deviceToken.findMany.mockResolvedValue([{ token: "r1" }]);
    (push.sendEach as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("fcm down"));
    await expect(service.notifyOrderStatus("o1", "assigned")).resolves.toBeUndefined();
  });
});

describe("NotificationsService — dead-token pruning", () => {
  it("deletes tokens the provider reports as permanently invalid (and only those)", async () => {
    const { prisma, push, service } = makeDeps();
    prisma.order.findUnique.mockResolvedValue({ customerId: "cust", riderId: "rider" });
    prisma.deviceToken.findMany.mockResolvedValue([{ token: "good" }, { token: "dead" }]);
    // Results align positionally with the input messages (sendEach contract).
    (push.sendEach as ReturnType<typeof vi.fn>).mockImplementation(async (msgs: PushMessage[]) =>
      msgs.map((m) => ({ ok: m.token !== "dead", invalidToken: m.token === "dead" })),
    );

    await service.notifyOrderStatus("o1", "delivered");

    expect(prisma.deviceToken.deleteMany).toHaveBeenCalledWith({ where: { token: { in: ["dead"] } } });
  });

  it("does NOT prune on a transient throw (only on an explicit invalidToken result)", async () => {
    const { prisma, push, service } = makeDeps();
    prisma.order.findUnique.mockResolvedValue({ customerId: "cust", riderId: "rider" });
    prisma.deviceToken.findMany.mockResolvedValue([{ token: "r1" }]);
    (push.sendEach as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network blip"));
    await service.notifyOrderStatus("o1", "delivered");
    expect(prisma.deviceToken.deleteMany).not.toHaveBeenCalled();
  });
});

describe("NotificationsService — notifyRidersAvailable delivery set (F-18 at-least-once)", () => {
  it("returns only the profiles the provider accepted at least one device for", async () => {
    const { prisma, push, service } = makeDeps();
    // cust-1 has a live device; cust-2's only device fails transiently (ok:false, NOT invalidToken).
    prisma.deviceToken.findMany.mockResolvedValue([
      { token: "t1", profileId: "cust-1" },
      { token: "t2", profileId: "cust-2" },
    ]);
    (push.sendEach as ReturnType<typeof vi.fn>).mockResolvedValue([
      { ok: true, invalidToken: false },
      { ok: false, invalidToken: false },
    ]);
    const delivered = await service.notifyRidersAvailable([{ profileId: "cust-1" }, { profileId: "cust-2" }]);
    // cust-2 is deliberately NOT credited → the drain leaves them queued for the next rider.
    expect([...delivered]).toEqual(["cust-1"]);
    // A transient (non-invalid) failure must never prune the token.
    expect(prisma.deviceToken.deleteMany).not.toHaveBeenCalled();
  });

  it("credits a profile once even with multiple live devices, and returns an empty set when nobody has a token", async () => {
    const { prisma, push, service } = makeDeps();
    prisma.deviceToken.findMany.mockResolvedValue([
      { token: "a", profileId: "cust-1" },
      { token: "b", profileId: "cust-1" },
    ]);
    (push.sendEach as ReturnType<typeof vi.fn>).mockResolvedValue([
      { ok: true, invalidToken: false },
      { ok: true, invalidToken: false },
    ]);
    expect([...(await service.notifyRidersAvailable([{ profileId: "cust-1" }]))]).toEqual(["cust-1"]);

    // No device tokens at all → empty set → caller leaves the waiter queued (bounded by the notify TTL).
    prisma.deviceToken.findMany.mockResolvedValue([]);
    expect((await service.notifyRidersAvailable([{ profileId: "cust-9" }])).size).toBe(0);
  });

  it("KB-NOTIFY-ORDERID: a waiter whose order is STILL open gets the live-request copy + orderId in the push data", async () => {
    const { prisma, push, service } = makeDeps();
    prisma.order.findMany.mockResolvedValue([{ id: "ord-9" }]); // ord-9 is still open_for_offers
    prisma.deviceToken.findMany.mockResolvedValue([{ token: "t1", profileId: "cust-1" }]);

    const delivered = await service.notifyRidersAvailable([{ profileId: "cust-1", orderId: "ord-9" }]);

    expect([...delivered]).toEqual(["cust-1"]);
    // Only still-open orders are looked up, and the push carries the honest live copy + the orderId.
    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ["ord-9"] }, status: "open_for_offers" } }),
    );
    const sent = (push.sendEach as ReturnType<typeof vi.fn>).mock.calls[0][0][0];
    expect(sent.data).toEqual({ kind: "riders_available", orderId: "ord-9" });
    expect(sent.body).toContain("live request");
  });

  it("KB-NOTIFY-ORDERID: a waiter whose order is NO LONGER open falls back to the generic copy with no orderId", async () => {
    const { prisma, push, service } = makeDeps();
    prisma.order.findMany.mockResolvedValue([]); // ord-9 is not open_for_offers anymore
    prisma.deviceToken.findMany.mockResolvedValue([{ token: "t1", profileId: "cust-1" }]);

    await service.notifyRidersAvailable([{ profileId: "cust-1", orderId: "ord-9" }]);

    const sent = (push.sendEach as ReturnType<typeof vi.fn>).mock.calls[0][0][0];
    expect(sent.data).toEqual({ kind: "riders_available" }); // no orderId
    expect(sent.body).toContain("send your parcel again");
  });

  it("KB-NOTIFY-ORDERID: an older waiter with NO orderId is unaffected — generic copy, no order lookup", async () => {
    const { prisma, push, service } = makeDeps();
    prisma.deviceToken.findMany.mockResolvedValue([{ token: "t1", profileId: "cust-1" }]);

    await service.notifyRidersAvailable([{ profileId: "cust-1" }]);

    // No orderId anywhere → no order lookup at all, and today's generic copy/data exactly.
    expect(prisma.order.findMany).not.toHaveBeenCalled();
    const sent = (push.sendEach as ReturnType<typeof vi.fn>).mock.calls[0][0][0];
    expect(sent.data).toEqual({ kind: "riders_available" });
    expect(sent.body).toContain("send your parcel again");
  });
});

describe("NotificationsService — derived in-app feed (A·3)", () => {
  const NOW = new Date("2026-07-06T12:00:00.000Z");

  it("maps recognised order events to feed rows, newest first, and skips silent statuses", async () => {
    const { prisma, service } = makeDeps();
    prisma.order.findMany.mockResolvedValue([
      {
        id: "o1",
        events: [
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

  it("carries the parent orderId on every row, so the client can navigate a tapped notification", async () => {
    const { prisma, service } = makeDeps();
    prisma.order.findMany.mockResolvedValue([
      {
        id: "o1",
        events: [{ status: "delivered", createdAt: new Date("2026-07-06T11:00:00.000Z") }],
      },
      {
        id: "o2",
        events: [{ status: "assigned", createdAt: new Date("2026-07-06T10:00:00.000Z") }],
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
        events: [
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
        events: Array.from({ length: 60 }, (_, i) => ({
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
        events: [{ status: "open_for_offers", createdAt: new Date("2026-07-06T11:05:00.000Z") }], // silent
      },
      {
        id: "o1",
        riderId: "r1",
        cancelledBy: "r1", // the rider cancelled — not the viewer, so not suppressed
        events: [{ status: "cancelled", createdAt: new Date("2026-07-06T11:00:00.000Z") }],
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
        events: [{ status: "cancelled", createdAt: new Date("2026-07-06T11:00:00.000Z") }],
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
        events: [{ status: "cancelled", createdAt: new Date("2026-07-06T11:00:00.000Z") }],
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
        events: [{ status: "expired", createdAt: new Date("2026-07-06T11:00:00.000Z") }],
      },
    ]);
    expect((await service.feedForUser("me", NOW))[0]).toMatchObject({ title: "No riders online nearby", icon: "bike" });

    // A normal expiry (had riders / not flagged) keeps the default "No riders yet" copy.
    prisma.order.findMany.mockResolvedValue([
      {
        id: "o2",
        riderId: null,
        expiryNoSupply: false,
        events: [{ status: "expired", createdAt: new Date("2026-07-06T11:00:00.000Z") }],
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
        events: [{ status: "expired", createdAt: new Date("2026-07-06T11:00:00.000Z") }],
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
        events: [{ status: "assigned", createdAt: new Date("2026-07-06T10:00:00.000Z") }],
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
});

describe("NotificationsService — notifyOrderExpired copy branches (Fix 1)", () => {
  it("uses the honest 'riders offered' copy when the auction had bids (not 'raise your price')", async () => {
    const { prisma, push, service } = makeDeps();
    prisma.order.findUnique.mockResolvedValue({ customerId: "cust" });
    prisma.deviceToken.findMany.mockResolvedValue([{ token: "c1" }]);

    await service.notifyOrderExpired("o1", false, true);

    const sent = (push.sendEach as ReturnType<typeof vi.fn>).mock.calls[0][0][0];
    expect(sent.title).toBe("The window closed");
    expect(sent.body).toContain("no need to raise the price");
  });

  it("keeps the default raise-the-price nudge when there were no bids and supply was unknown", async () => {
    const { prisma, push, service } = makeDeps();
    prisma.order.findUnique.mockResolvedValue({ customerId: "cust" });
    prisma.deviceToken.findMany.mockResolvedValue([{ token: "c1" }]);

    await service.notifyOrderExpired("o1", false, false);

    const sent = (push.sendEach as ReturnType<typeof vi.fn>).mock.calls[0][0][0];
    expect(sent.body).toContain("raising it");
  });

  it("no-supply takes precedence over hadOffers (only ever computed when there were no bids)", async () => {
    const { prisma, push, service } = makeDeps();
    prisma.order.findUnique.mockResolvedValue({ customerId: "cust" });
    prisma.deviceToken.findMany.mockResolvedValue([{ token: "c1" }]);

    await service.notifyOrderExpired("o1", true, false);

    const sent = (push.sendEach as ReturnType<typeof vi.fn>).mock.calls[0][0][0];
    expect(sent.title).toBe("No riders online nearby");
  });
});

describe("NotificationsService — new-offer notice", () => {
  it("notifies the customer with the order id and an `offer` kind", async () => {
    const { prisma, push, service } = makeDeps();
    prisma.deviceToken.findMany.mockResolvedValue([{ token: "c1" }]);
    await service.notifyNewOffer("o1", "cust");
    expect(push.sendEach).toHaveBeenCalledWith([
      expect.objectContaining({ token: "c1", data: { orderId: "o1", kind: "offer" } }),
    ]);
  });
});

describe("NotificationsService — new-broadcast notice (rider primary channel, CONCEPT §3.10)", () => {
  it("pushes the new order to every supplied nearby rider, batched, with a `broadcast` kind", async () => {
    const { prisma, push, service } = makeDeps();
    prisma.deviceToken.findMany.mockResolvedValue([{ token: "ra" }, { token: "rb" }]);
    await service.notifyNewBroadcast("o1", ["riderA", "riderB"], { pickup: "Avondale shops", fare: "4.50" });
    expect(prisma.deviceToken.findMany).toHaveBeenCalledWith({
      where: { profileId: { in: ["riderA", "riderB"] } },
      select: { token: true, profileId: true },
    });
    expect(push.sendEach).toHaveBeenCalledWith([
      expect.objectContaining({ token: "ra", data: { orderId: "o1", kind: "broadcast" } }),
      expect.objectContaining({ token: "rb", data: { orderId: "o1", kind: "broadcast" } }),
    ]);
  });

  it("is a no-op (no token lookup, no send) when no riders are nearby", async () => {
    const { prisma, push, service } = makeDeps();
    await service.notifyNewBroadcast("o1", [], { pickup: "Avondale shops", fare: "4.50" });
    expect(prisma.deviceToken.findMany).not.toHaveBeenCalled();
    expect(push.sendEach).not.toHaveBeenCalled();
  });

  it("swallows failures — a broadcast push can never affect the created order", async () => {
    const { prisma, push, service } = makeDeps();
    prisma.deviceToken.findMany.mockResolvedValue([{ token: "ra" }]);
    (push.sendEach as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("fcm down"));
    await expect(
      service.notifyNewBroadcast("o1", ["riderA"], { pickup: "Avondale shops", fare: "4.50" }),
    ).resolves.toBeUndefined();
  });
});

describe("NotificationsService — notifyOps zero-recipient visibility (DS13-05)", () => {
  const loggerOf = (service: NotificationsService) =>
    (service as unknown as { logger: { error: (m: string) => void } }).logger;

  it("logs a loud error when the ops escalation resolves to ZERO recipients (no admin device token)", async () => {
    const { prisma, service } = makeDeps();
    // An admin profile exists, but nobody has registered a device (the admin WEB console registers none).
    prisma.profile.findMany.mockResolvedValue([{ id: "admin-1" }]);
    prisma.deviceToken.count.mockResolvedValue(0);
    const errSpy = vi.spyOn(loggerOf(service), "error").mockImplementation(() => {});

    await service.notifyOps({ title: "SOS raised on a live trip", body: "respond now", data: { kind: "sos" } });

    expect(prisma.deviceToken.count).toHaveBeenCalledWith({ where: { profileId: { in: ["admin-1"] } } });
    expect(errSpy).toHaveBeenCalledTimes(1);
    expect(String(errSpy.mock.calls[0]![0])).toMatch(/zero recipients/i);
  });

  it("does NOT log an error when the ops audience has a registered device (delivery proceeds)", async () => {
    const { prisma, service } = makeDeps();
    prisma.profile.findMany.mockResolvedValue([{ id: "admin-1" }]);
    prisma.deviceToken.count.mockResolvedValue(1);
    prisma.deviceToken.findMany.mockResolvedValue([{ token: "t1", profileId: "admin-1" }]);
    const errSpy = vi.spyOn(loggerOf(service), "error").mockImplementation(() => {});

    await service.notifyOps({ title: "SOS raised on a live trip", body: "respond now" });

    expect(errSpy).not.toHaveBeenCalled();
  });
});
