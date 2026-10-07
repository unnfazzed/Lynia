import { describe, expect, it, vi } from "vitest";
import type { PushAdapter, PushMessage } from "../adapters/push/push.interface";
import type { PrismaService } from "../prisma/prisma.service";
import { merchantCustomerCopy, NotificationsService } from "./notifications.service";

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
      select: { token: true, profileId: true, platform: true },
    });
    // One batched call carrying both devices (not a per-token fan-out). Data carries the recipient's
    // per-order role (`to`) so the client routes by order relationship, not global session role (Fix 3).
    expect(push.sendEach).toHaveBeenCalledOnce();
    expect(push.sendEach).toHaveBeenCalledWith([
      expect.objectContaining({ token: "r1", data: { orderId: "o1", status: "assigned", to: "rider", orderType: "parcel" } }),
      expect.objectContaining({ token: "r2", data: { orderId: "o1", status: "assigned", to: "rider", orderType: "parcel" } }),
    ]);
  });

  it("stamps a per-order-status collapseKey (D-O3) so a retried/duplicated send replaces the same tray entry instead of stacking a second one", async () => {
    const { prisma, push, service } = makeDeps();
    prisma.order.findUnique.mockResolvedValue({ customerId: "cust", orderType: "parcel", riderId: "rider" });
    prisma.deviceToken.findMany.mockResolvedValue([{ token: "r1" }]);

    await service.notifyOrderStatus("o1", "assigned");

    expect(push.sendEach).toHaveBeenCalledWith([expect.objectContaining({ collapseKey: "order:o1:assigned" })]);
  });

  it("notifies the CUSTOMER on lifecycle steps like `delivered`", async () => {
    const { prisma, push, service } = makeDeps();
    prisma.order.findUnique.mockResolvedValue({ customerId: "cust", orderType: "parcel", riderId: "rider" });
    prisma.deviceToken.findMany.mockResolvedValue([{ token: "c1" }]);

    await service.notifyOrderStatus("o1", "delivered");

    expect(prisma.deviceToken.findMany).toHaveBeenCalledWith({
      where: { profileId: { in: ["cust"] } },
      select: { token: true, profileId: true, platform: true },
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
      select: { token: true, profileId: true, platform: true },
    });
    expect(prisma.deviceToken.findMany).toHaveBeenCalledWith({
      where: { profileId: { in: ["rider"] } },
      select: { token: true, profileId: true, platform: true },
    });
    expect(push.sendEach).toHaveBeenCalledWith([
      expect.objectContaining({ token: "c1", data: { orderId: "o1", status: "cancelled", to: "customer", orderType: "parcel" } }),
    ]);
    expect(push.sendEach).toHaveBeenCalledWith([
      expect.objectContaining({ token: "r1", data: { orderId: "o1", status: "cancelled", to: "rider", orderType: "parcel" } }),
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
      select: { token: true, profileId: true, platform: true },
    });
    expect(push.sendEach).toHaveBeenCalledWith([
      expect.objectContaining({ token: "c1", data: { orderId: "o1", status: "undelivered", to: "customer", orderType: "parcel" } }),
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

  // U12 (2026-10-07): `en_route_dropoff` fires right after pickup (the rider app steps on to it at once),
  // so a food order's "{n} is at your door · Have $X cash ready" reached the customer ~20 min early.
  it("U12: sends NO push for a food order's `en_route_dropoff` — the rider has only just collected", async () => {
    const { prisma, push, service } = makeDeps();
    prisma.order.findUnique.mockResolvedValue({ customerId: "cust", orderType: "merchant", riderId: "rider" });
    prisma.deviceToken.findMany.mockResolvedValue([{ token: "c1" }]);

    await service.notifyOrderStatus("o1", "en_route_dropoff");

    expect(push.sendEach).not.toHaveBeenCalled();
  });

  it("U12: a parcel's `en_route_dropoff` push is unchanged ('On the way to drop-off', never an arrival)", async () => {
    const { prisma, push, service } = makeDeps();
    prisma.order.findUnique.mockResolvedValue({ customerId: "cust", orderType: "parcel", riderId: "rider" });
    prisma.deviceToken.findMany.mockResolvedValue([{ token: "c1" }]);

    await service.notifyOrderStatus("o1", "en_route_dropoff");

    expect(push.sendEach).toHaveBeenCalledWith([
      expect.objectContaining({ token: "c1", title: "On the way to drop-off", data: { orderId: "o1", status: "en_route_dropoff", to: "customer", orderType: "parcel" } }),
    ]);
  });

  it("C5: stays silent for a food order on a status with no curated food notice (e.g. `assigned` — sent directly by FoodDispatchService instead)", async () => {
    const { prisma, push, service } = makeDeps();
    prisma.order.findUnique.mockResolvedValue({ customerId: "cust", orderType: "merchant", riderId: "rider" });

    await service.notifyOrderStatus("o1", "assigned");

    expect(push.sendEach).not.toHaveBeenCalled();
  });

  it("stays silent for a food order on a parcel-only status (e.g. `delivered` — no MERCHANT_STATUS_NOTICES entry)", async () => {
    const { prisma, push, service } = makeDeps();
    prisma.order.findUnique.mockResolvedValue({ customerId: "cust", orderType: "merchant", riderId: "rider" });

    await service.notifyOrderStatus("o1", "delivered");

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

describe("NotificationsService — notifyOrderExpired copy (after-send v2 \"No match\")", () => {
  it("names the closed price and the one-tap resend at +$0.50 when the auction had bids", async () => {
    const { prisma, push, service } = makeDeps();
    prisma.order.findUnique.mockResolvedValue({ customerId: "cust", proposedFare: "3.36" });
    prisma.deviceToken.findMany.mockResolvedValue([{ token: "c1" }]);

    await service.notifyOrderExpired("o1", false, true);

    const sent = (push.sendEach as ReturnType<typeof vi.fn>).mock.calls[0][0][0];
    expect(sent).toMatchObject({ title: "No rider took $3.36", body: "Send again at $3.86 in one tap.", data: { orderId: "o1", status: "expired" } });
  });

  it("uses the same copy with no bids (supply present or unknown)", async () => {
    const { prisma, push, service } = makeDeps();
    prisma.order.findUnique.mockResolvedValue({ customerId: "cust", proposedFare: 3 });
    prisma.deviceToken.findMany.mockResolvedValue([{ token: "c1" }]);

    await service.notifyOrderExpired("o1", false, false);

    const sent = (push.sendEach as ReturnType<typeof vi.fn>).mock.calls[0][0][0];
    expect(sent).toMatchObject({ title: "No rider took $3.00", body: "Send again at $3.50 in one tap." });
  });

  it("falls back to the static notice when the price can't be read", async () => {
    const { prisma, push, service } = makeDeps();
    prisma.order.findUnique.mockResolvedValue({ customerId: "cust" });
    prisma.deviceToken.findMany.mockResolvedValue([{ token: "c1" }]);

    await service.notifyOrderExpired("o1", false, false);

    const sent = (push.sendEach as ReturnType<typeof vi.fn>).mock.calls[0][0][0];
    expect(sent.title).toBe("No riders yet");
  });

  it("no-supply keeps its honest 'nobody was online' copy", async () => {
    const { prisma, push, service } = makeDeps();
    prisma.order.findUnique.mockResolvedValue({ customerId: "cust", proposedFare: "3.36" });
    prisma.deviceToken.findMany.mockResolvedValue([{ token: "c1" }]);

    await service.notifyOrderExpired("o1", true, false);

    const sent = (push.sendEach as ReturnType<typeof vi.fn>).mock.calls[0][0][0];
    expect(sent.title).toBe("No riders online nearby");
  });
});

describe("NotificationsService — new-offer notice", () => {
  const offerRow = (fare: string, eta: number, firstName: string | null, lastName: string | null) => ({
    offeredFare: fare,
    etaMinutes: eta,
    rider: { profile: { firstName, lastName } },
  });

  it("notifies the customer with the order id and an `offer` kind, collapsed per order", async () => {
    const { prisma, push, service } = makeDeps();
    prisma.deviceToken.findMany.mockResolvedValue([{ token: "c1" }]);
    await service.notifyNewOffer("o1", "cust");
    expect(push.sendEach).toHaveBeenCalledWith([
      expect.objectContaining({ token: "c1", data: { orderId: "o1", kind: "offer" }, collapseKey: "order:o1:offers" }),
    ]);
  });

  it("the first offer names the rider (first name + initial), the price and their pickup ETA", async () => {
    const { prisma, push, service } = makeDeps();
    Object.assign(prisma, { offer: { findMany: vi.fn().mockResolvedValue([offerRow("3", 6, "Tendai", "Moyo")]), count: vi.fn() } });
    prisma.deviceToken.findMany.mockResolvedValue([{ token: "c1" }]);
    await service.notifyNewOffer("o1", "cust");
    const sent = (push.sendEach as ReturnType<typeof vi.fn>).mock.calls[0][0][0];
    expect(sent).toMatchObject({ title: "New offer: $3.00", body: "Tendai M. can pick up in 6 min. Choose before the timer ends." });
  });

  it("two or more pending offers become a count", async () => {
    const { prisma, push, service } = makeDeps();
    Object.assign(prisma, {
      offer: {
        findMany: vi.fn().mockResolvedValue([offerRow("3.5", 4, "Rudo", "Chari"), offerRow("3", 6, "Tendai", "Moyo")]),
        count: vi.fn().mockResolvedValue(3),
      },
    });
    prisma.deviceToken.findMany.mockResolvedValue([{ token: "c1" }]);
    await service.notifyNewOffer("o1", "cust");
    const sent = (push.sendEach as ReturnType<typeof vi.fn>).mock.calls[0][0][0];
    expect(sent).toMatchObject({ title: "3 offers for your parcel", body: "Choose a rider before the timer ends." });
  });

  it("still pushes (generic copy) when the offer lookup fails", async () => {
    const { prisma, push, service } = makeDeps();
    Object.assign(prisma, { offer: { findMany: vi.fn().mockRejectedValue(new Error("db blip")), count: vi.fn() } });
    prisma.deviceToken.findMany.mockResolvedValue([{ token: "c1" }]);
    await service.notifyNewOffer("o1", "cust");
    const sent = (push.sendEach as ReturnType<typeof vi.fn>).mock.calls[0][0][0];
    expect(sent).toMatchObject({ title: "New offer for your parcel", data: { orderId: "o1", kind: "offer" } });
  });
});

describe("NotificationsService — parcel customer stage copy (after-send v2)", () => {
  const parcel = (over: Record<string, unknown> = {}) => ({
    customerId: "cust",
    riderId: "rider",
    orderType: "parcel",
    dropoff: { point: { lat: -17.8, lng: 31.05 }, landmark: "14 Glenara Ave" },
    deliveredAt: new Date("2026-09-30T07:31:00Z"), // 09:31 in Harare (UTC+2)
    undeliveredReason: "unreachable",
    rider: { profile: { firstName: "Tendai" } },
    ...over,
  });
  async function sentFor(status: string, order: Record<string, unknown>) {
    const { prisma, push, service } = makeDeps();
    prisma.order.findUnique.mockResolvedValue(order);
    prisma.deviceToken.findMany.mockImplementation(async ({ where }: { where: { profileId: { in: string[] } } }) =>
      where.profileId.in.map((id) => ({ token: `${id}-tok`, profileId: id })),
    );
    await service.notifyOrderStatus("o1", status);
    return (push.sendEach as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0][0] as PushMessage);
  }

  it.each([
    ["en_route_pickup", "Tendai is on the way to pickup", "Open to see your delivery code."],
    ["picked_up", "Tendai has your parcel", "On the way to 14 Glenara Ave."],
    ["delivered", "Parcel delivered", "Handed over at 09:31. Tap to rate Tendai."],
    ["undelivered", "Tendai couldn't deliver your parcel", "Recipient didn't answer. Call Tendai to sort it out."],
  ])("%s → the named copy, deep-linked to the order", async (status, title, body) => {
    const [sent] = await sentFor(status, parcel());
    expect(sent).toMatchObject({ token: "cust-tok", title, body, data: { orderId: "o1", status, to: "customer", orderType: "parcel" } });
  });

  it("falls back to 'your rider' / 'the drop-off' / no time when the names and stamps are missing", async () => {
    const bare = parcel({ rider: null, dropoff: { point: { lat: 0, lng: 0 } }, deliveredAt: null, undeliveredReason: null });
    expect((await sentFor("en_route_pickup", bare))[0]).toMatchObject({ title: "Your rider is on the way to pickup" });
    expect((await sentFor("picked_up", bare))[0]).toMatchObject({ title: "Your rider has your parcel", body: "On the way to the drop-off." });
    expect((await sentFor("delivered", bare))[0]).toMatchObject({ body: "Tap to rate your rider." });
    expect((await sentFor("undelivered", bare))[0]).toMatchObject({ body: "Call your rider to sort it out." });
  });

  it("cancelled: the customer gets 'Your order was cancelled', the rider keeps the rider copy", async () => {
    const sent = await sentFor("cancelled", parcel());
    expect(sent.find((m) => m.token === "cust-tok")).toMatchObject({ title: "Your order was cancelled", body: "Open to see why. Nothing to pay." });
    expect(sent.find((m) => m.token === "rider-tok")).toMatchObject({ title: "Order cancelled", body: "This delivery was cancelled." });
  });

  it("no push carries the delivery code", async () => {
    for (const status of ["assigned", "confirmed", "en_route_pickup", "picked_up", "en_route_dropoff", "delivered", "undelivered", "cancelled"]) {
      for (const m of await sentFor(status, parcel())) {
        expect(JSON.stringify(m)).not.toMatch(/\b\d{4,6}\b/);
      }
    }
  });

  it("leaves the food-order copy alone (a merchant order speaks O.g.push, not the parcel copy)", async () => {
    const [sent] = await sentFor("picked_up", parcel({ orderType: "merchant", agreedFare: "16.50", merchant: { name: "Gava’s Kitchen" } }));
    expect(sent).toMatchObject({ title: "Tendai has your order", body: "On the way." });
    // U12: the at-door beat is no longer pushed on `en_route_dropoff`; its words stay for the feed's step.
    expect(await sentFor("en_route_dropoff", parcel({ orderType: "merchant", agreedFare: "16.50", merchant: { name: "Gava’s Kitchen" } }))).toEqual([]);
    expect(merchantCustomerCopy("en_route_dropoff", { agreedFare: "16.50", rider: { profile: { firstName: "Tendai" } } })).toEqual({
      title: "Tendai is at your door",
      body: "Have $16.50 cash ready.",
    });
  });

  // Order flow v2 G3a (ledger D-59): a merchant order's customer stage pushes, O.g.push.c verbatim with the
  // order's own names. No ETA exists server-side, so the "Arrives …" sentence is dropped, never invented.
  it.each([
    ["picked_up", "Tendai has your order", "On the way."],
    ["delivered", "Delivered", "Enjoy! Tap to rate Gava’s Kitchen and Tendai."],
    ["undelivered", "Your order wasn’t delivered", "Tendai couldn’t reach you. Nothing was charged."],
  ])("merchant %s → O.g.push.c", async (status, title, body) => {
    const [sent] = await sentFor(status, parcel({ orderType: "merchant", agreedFare: "16.50", merchant: { name: "Gava’s Kitchen" } }));
    expect(sent).toMatchObject({ token: "cust-tok", title, body, data: { orderId: "o1", status, to: "customer", orderType: "merchant" } });
  });

  it("merchant: an undelivered order not caused by an unreachable customer doesn't say so; no code in any push", async () => {
    const [sent] = await sentFor("undelivered", parcel({ orderType: "merchant", undeliveredReason: "breakdown", merchant: { name: "Gava’s Kitchen" } }));
    expect(sent).toMatchObject({ title: "Your order wasn’t delivered", body: "Nothing was charged." });
    for (const status of ["picked_up", "en_route_dropoff", "delivered", "undelivered"]) {
      for (const m of await sentFor(status, parcel({ orderType: "merchant", agreedFare: "16.50", merchant: { name: "Gava’s Kitchen" } }))) {
        expect(`${m.title} ${m.body}`).not.toMatch(/\b\d{3}\s?\d{3}\b/);
      }
    }
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
      select: { token: true, profileId: true, platform: true },
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
