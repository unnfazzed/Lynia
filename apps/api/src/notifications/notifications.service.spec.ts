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
    },
    order: {
      findUnique: vi.fn().mockResolvedValue(null),
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
  it("registers a new/own token without ever reassigning profileId (no silent re-home)", async () => {
    const { prisma, service } = makeDeps();
    await service.registerToken("p1", "tok-a", "android");
    expect(prisma.deviceToken.upsert).toHaveBeenCalledWith({
      where: { token: "tok-a" },
      create: { profileId: "p1", token: "tok-a", platform: "android" },
      update: { platform: "android" },
    });
  });

  it("rejects registering a token already owned by another profile (no re-home)", async () => {
    const { prisma, service } = makeDeps();
    prisma.deviceToken.findUnique.mockResolvedValue({ profileId: "p2" });
    await expect(service.registerToken("p1", "tok-a", "android")).rejects.toThrow(/another account/i);
    expect(prisma.deviceToken.upsert).not.toHaveBeenCalled();
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
      select: { token: true },
    });
    // One batched call carrying both devices (not a per-token fan-out).
    expect(push.sendEach).toHaveBeenCalledOnce();
    expect(push.sendEach).toHaveBeenCalledWith([
      expect.objectContaining({ token: "r1", data: { orderId: "o1", status: "assigned" } }),
      expect.objectContaining({ token: "r2", data: { orderId: "o1", status: "assigned" } }),
    ]);
  });

  it("notifies the CUSTOMER on lifecycle steps like `delivered`", async () => {
    const { prisma, push, service } = makeDeps();
    prisma.order.findUnique.mockResolvedValue({ customerId: "cust", riderId: "rider" });
    prisma.deviceToken.findMany.mockResolvedValue([{ token: "c1" }]);

    await service.notifyOrderStatus("o1", "delivered");

    expect(prisma.deviceToken.findMany).toHaveBeenCalledWith({
      where: { profileId: { in: ["cust"] } },
      select: { token: true },
    });
    expect(push.sendEach).toHaveBeenCalledOnce();
  });

  it("notifies BOTH parties on `cancelled`", async () => {
    const { prisma, service } = makeDeps();
    prisma.order.findUnique.mockResolvedValue({ customerId: "cust", riderId: "rider" });
    await service.notifyOrderStatus("o1", "cancelled");
    expect(prisma.deviceToken.findMany).toHaveBeenCalledWith({
      where: { profileId: { in: ["cust", "rider"] } },
      select: { token: true },
    });
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
      select: { token: true },
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
