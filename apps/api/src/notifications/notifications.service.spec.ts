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
      // notifyRidersAvailable (KB-NOTIFY-ORDERID) checks which referenced orders are still open.
      findMany: vi.fn().mockResolvedValue([]),
    },
    // DS13-05: notifyOps resolves the admin audience (role=admin) server-side.
    profile: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    // UX21-02: notifyRidersAvailable's durable feed-fallback audit write.
    auditLog: {
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
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
    prisma.order.findUnique.mockResolvedValue({ customerId: "cust", orderType: "parcel", riderId: "rider" });
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
    prisma.order.findUnique.mockResolvedValue({ customerId: "cust", orderType: "parcel", riderId: "rider" });
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
    prisma.order.findUnique.mockResolvedValue({ customerId: "cust", orderType: "parcel", riderId: "rider" });
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
    prisma.order.findUnique.mockResolvedValue({ customerId: "cust", orderType: "parcel", riderId: "rider" });
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
    prisma.order.findUnique.mockResolvedValue({ customerId: "cust", orderType: "parcel", riderId: null });
    await service.notifyOrderStatus("o1", "completed"); // → rider only, but rider is null
    expect(prisma.deviceToken.findMany).not.toHaveBeenCalled();
    expect(push.sendEach).not.toHaveBeenCalled();
  });

  it("swallows a push failure — never throws into the caller's transition", async () => {
    const { prisma, push, service } = makeDeps();
    prisma.order.findUnique.mockResolvedValue({ customerId: "cust", orderType: "parcel", riderId: "rider" });
    prisma.deviceToken.findMany.mockResolvedValue([{ token: "r1" }]);
    (push.sendEach as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("fcm down"));
    await expect(service.notifyOrderStatus("o1", "assigned")).resolves.toBeUndefined();
  });
});

describe("NotificationsService — dead-token pruning", () => {
  it("deletes tokens the provider reports as permanently invalid (and only those)", async () => {
    const { prisma, push, service } = makeDeps();
    prisma.order.findUnique.mockResolvedValue({ customerId: "cust", orderType: "parcel", riderId: "rider" });
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
    prisma.order.findUnique.mockResolvedValue({ customerId: "cust", orderType: "parcel", riderId: "rider" });
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

  it("DS17-01: sizes the live-order push TTL to the order's REMAINING window, not a flat 90s from send time", async () => {
    const { prisma, push, service } = makeDeps();
    // ord-9 is still open but was created 60s ago → ~30s of its own 90s window is left. The live push's TTL
    // must track that (≈30s), not the flat OFFER_WINDOW default — otherwise a push sent late in the window
    // outlives the auction it points the customer back at.
    prisma.order.findMany.mockResolvedValue([{ id: "ord-9", createdAt: new Date(Date.now() - 60_000) }]);
    prisma.deviceToken.findMany.mockResolvedValue([{ token: "t1", profileId: "cust-1" }]);

    await service.notifyRidersAvailable([{ profileId: "cust-1", orderId: "ord-9" }]);

    const sent = (push.sendEach as ReturnType<typeof vi.fn>).mock.calls[0][0][0];
    expect(sent.ttlSeconds).toBeGreaterThan(25);
    expect(sent.ttlSeconds).toBeLessThanOrEqual(31); // ≈30
    expect(sent.ttlSeconds).toBeLessThan(90); // strictly smaller than the flat send-time default
  });

  it("DS17-01: skips a live-order waiter whose 90s window has already elapsed (no stale dead-reference push)", async () => {
    const { prisma, push, service } = makeDeps();
    // ord-9 is still 'open_for_offers' in the query but its own 90s window elapsed 30s ago (created 120s
    // ago). Pushing "tap to follow the offers" for it would land the customer on a dead auction, so it is
    // skipped entirely — not pushed with a stale flat TTL, and (since the order IS open) not down-graded to
    // the generic branch either. The only waiter is skipped → nothing is sent, the waiter stays queued.
    prisma.order.findMany.mockResolvedValue([{ id: "ord-9", createdAt: new Date(Date.now() - 120_000) }]);
    prisma.deviceToken.findMany.mockResolvedValue([{ token: "t1", profileId: "cust-1" }]);

    const delivered = await service.notifyRidersAvailable([{ profileId: "cust-1", orderId: "ord-9" }]);

    expect(push.sendEach).not.toHaveBeenCalled();
    expect(delivered.size).toBe(0);
  });
});

describe("NotificationsService — notifyRidersAvailable durable feed fallback (UX21-02)", () => {
  it("writes an order-targeted audit row for a live-order waiter, independent of push delivery", async () => {
    const { prisma, push, service } = makeDeps();
    prisma.order.findMany.mockResolvedValue([{ id: "ord-9", createdAt: new Date() }]);
    prisma.deviceToken.findMany.mockResolvedValue([]); // no device — push delivers to nobody

    await service.notifyRidersAvailable([{ profileId: "cust-1", orderId: "ord-9" }]);

    expect(push.sendEach).not.toHaveBeenCalled();
    expect(prisma.auditLog.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ action: "order.riders_available_notify", target: "ord-9" })],
    });
  });

  it("writes a profile-targeted audit row for a generic (no live order) waiter", async () => {
    const { prisma, service } = makeDeps();
    prisma.deviceToken.findMany.mockResolvedValue([]);

    await service.notifyRidersAvailable([{ profileId: "cust-1" }]);

    expect(prisma.auditLog.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ action: "customer.riders_available_notify", target: "cust-1" })],
    });
  });

  it("still sends the push when the audit write itself fails (best-effort, never blocks delivery)", async () => {
    const { prisma, push, service } = makeDeps();
    prisma.auditLog.createMany.mockRejectedValue(new Error("db blip"));
    prisma.deviceToken.findMany.mockResolvedValue([{ token: "t1", profileId: "cust-1" }]);

    const delivered = await service.notifyRidersAvailable([{ profileId: "cust-1" }]);

    expect([...delivered]).toEqual(["cust-1"]);
    expect(push.sendEach).toHaveBeenCalled();
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

describe("NotificationsService — issue-resolved notice (UX26-03)", () => {
  it("carries no status/to when the opener is the customer (riderOrderStatus omitted)", async () => {
    const { prisma, push, service } = makeDeps();
    prisma.deviceToken.findMany.mockResolvedValue([{ token: "c1" }]);
    await service.notifyIssueResolved("cust", "o1", "refund");
    expect(push.sendEach).toHaveBeenCalledWith([
      expect.objectContaining({ token: "c1", data: { orderId: "o1", kind: "issue" } }),
    ]);
  });

  it("stamps status + to:'rider' when the opener is the rider, so a rider still on the job routes straight there", async () => {
    const { prisma, push, service } = makeDeps();
    prisma.deviceToken.findMany.mockResolvedValue([{ token: "r1" }]);
    await service.notifyIssueResolved("rider-1", "o1", "close_no_action", "assigned");
    expect(push.sendEach).toHaveBeenCalledWith([
      expect.objectContaining({ token: "r1", data: { orderId: "o1", kind: "issue", status: "assigned", to: "rider" } }),
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
