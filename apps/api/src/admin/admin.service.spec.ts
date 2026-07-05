import { ACTIVE_RIDE_STATUSES } from "@lynia/shared";
import { describe, expect, it } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { AdminService, computeFunnel, fmtUntil } from "./admin.service";

/** Decimal-like stub — Prisma returns Decimal objects whose `.toString()`/`.toFixed()` we serialize. */
const dec = (s: string) => ({ toString: () => s, toFixed: (_n: number) => s });

describe("computeFunnel (pilot metrics §8)", () => {
  it("computes the offer-loop funnel", () => {
    const f = computeFunnel({ totalBroadcasts: 10, totalOffers: 25, ordersWithOffer: 8, expired: 2 });
    expect(f.offersPerBroadcast).toBe(2.5);
    expect(f.pctBroadcastsWithOffer).toBe(80);
    expect(f.expiryRatePct).toBe(20);
  });

  it("is zero-safe with no broadcasts", () => {
    const f = computeFunnel({ totalBroadcasts: 0, totalOffers: 0, ordersWithOffer: 0, expired: 0 });
    expect(f).toEqual({ totalBroadcasts: 0, offersPerBroadcast: 0, pctBroadcastsWithOffer: 0, expiryRatePct: 0 });
  });
});

describe("AdminService.listRiders", () => {
  const riderRow = (over: Record<string, unknown> = {}) => ({
    profileId: "r1",
    bikeReg: "ABZ 1",
    kycStatus: "pending",
    kycRef: "sess_1",
    idVerified: false,
    isOnline: false,
    ratingAvg: 0,
    ratingCount: 0,
    tripsCount: 0,
    cancelStrikes: 0,
    cooldownUntil: null,
    profile: { firstName: "Tendai", lastName: "M", phone: "+263782000001" },
    ...over,
  });

  it("filters by kyc status and MASKS the phone when the rider isn't on a live order (A-03)", async () => {
    let where: unknown;
    const prisma = {
      rider: {
        findMany: async (args: { where: unknown }) => {
          where = args.where;
          return [riderRow()];
        },
      },
      // No order in a reveal-status window ⇒ the phone must be masked.
      order: { findMany: async () => [] },
    };
    const svc = new AdminService(prisma as unknown as PrismaService);
    const rows = await svc.listRiders("pending");
    expect(where).toEqual({ kycStatus: "pending" });
    expect(rows[0]).toMatchObject({ profileId: "r1", name: "Tendai M", kycStatus: "pending" });
    // Masked: country code + last 4 kept, middle bulleted — never the full number.
    expect(rows[0]!.phone).toBe("+263•••••0001");
    expect(rows[0]!.phone).not.toContain("78200");
  });

  it("REVEALS the full phone when the rider is a party on a LIVE order right now", async () => {
    let orderWhere: { status?: { in: string[] } } = {};
    const prisma = {
      rider: { findMany: async () => [riderRow()] },
      // The rider is currently on a live order → reveal the real number for ops to call them.
      order: {
        findMany: async (args: { where: { status?: { in: string[] } } }) => {
          orderWhere = args.where;
          return [{ riderId: "r1" }];
        },
      },
    };
    const svc = new AdminService(prisma as unknown as PrismaService);
    const rows = await svc.listRiders();
    expect(rows[0]!.phone).toBe("+263782000001");
    // The reveal set MUST be live-only (ACTIVE_RIDE_STATUSES) — NOT the terminal-inclusive
    // PHONE_REVEAL_STATUSES, which would unmask any rider who ever completed one order forever (A-03).
    expect(orderWhere.status?.in).toEqual(ACTIVE_RIDE_STATUSES);
    for (const terminal of ["completed", "delivered", "undelivered"]) {
      expect(orderWhere.status?.in).not.toContain(terminal);
    }
  });

  it("returns all riders when no filter is given", async () => {
    let where: unknown = "unset";
    const prisma = {
      rider: { findMany: async (args: { where: unknown }) => { where = args.where; return []; } },
      order: { findMany: async () => [] },
    };
    const svc = new AdminService(prisma as unknown as PrismaService);
    await svc.listRiders();
    expect(where).toEqual({});
  });
});

describe("AdminService.listOrders", () => {
  it("filters by status and serializes fares", async () => {
    let where: unknown;
    const prisma = {
      order: {
        findMany: async (args: { where: unknown }) => {
          where = args.where;
          return [
            {
              id: "o1",
              status: "cancelled",
              proposedFare: { toString: () => "2.50" },
              agreedFare: null,
              distanceKm: 1.5,
              customerId: "c1",
              riderId: "r1",
              cancelledBy: "r1",
              cancelReason: "cannot make it",
              createdAt: new Date("2026-06-26T00:00:00Z"),
            },
          ];
        },
      },
    };
    const svc = new AdminService(prisma as unknown as PrismaService);
    const rows = await svc.listOrders("cancelled");
    expect(where).toEqual({ status: "cancelled" });
    expect(rows[0]).toMatchObject({ id: "o1", status: "cancelled", proposedFare: "2.50", agreedFare: null, cancelledByRole: "rider", cancelReason: "cannot make it" });
  });
});

describe("AdminService.recordAuditAction (A-01)", () => {
  it("persists an audit row with actor + action fields and returns the id", async () => {
    let created: unknown;
    const prisma = {
      auditLog: {
        create: async (args: { data: unknown }) => {
          created = args.data;
          return { id: "audit-1" };
        },
      },
    };
    const svc = new AdminService(prisma as unknown as PrismaService);
    const res = await svc.recordAuditAction("admin-42", {
      action: "rider.suspend",
      target: "Tendai M",
      reasonCode: "Safety report from a customer",
      note: "incident #7",
    });
    expect(res).toEqual({ id: "audit-1" });
    expect(created).toEqual({
      actor: "admin-42",
      action: "rider.suspend",
      target: "Tendai M",
      reasonCode: "Safety report from a customer",
      note: "incident #7",
    });
  });

  it("coerces missing reasonCode/note to null (nullable columns)", async () => {
    let created: { reasonCode?: unknown; note?: unknown } = {};
    const prisma = {
      auditLog: { create: async (args: { data: typeof created }) => { created = args.data; return { id: "a2" }; } },
    };
    const svc = new AdminService(prisma as unknown as PrismaService);
    await svc.recordAuditAction("admin-1", { action: "order.nudge_rider", target: "o1" });
    expect(created.reasonCode).toBeNull();
    expect(created.note).toBeNull();
  });
});

describe("AdminService.getOrderDetail (D-2)", () => {
  const baseOrder = (over: Record<string, unknown> = {}) => ({
    id: "o1",
    status: "en_route_dropoff",
    proposedFare: dec("5.00"),
    agreedFare: dec("6.00"),
    distanceKm: 3.2,
    pickup: { landmark: "Avondale shops" },
    dropoff: { landmark: "Borrowdale" },
    itemDesc: "Documents",
    items: [{ description: "Envelope", quantity: 2 }],
    cancelledBy: null,
    cancelReason: null,
    customerId: "c1",
    riderId: "r1",
    createdAt: new Date("2026-06-26T10:00:00Z"),
    updatedAt: new Date("2026-06-26T10:30:00Z"),
    customer: { firstName: "Rudo", lastName: "K", phone: "+263771112222" },
    rider: { bikeReg: "ABZ 1", profile: { firstName: "Tendai", lastName: "M", phone: "+263782000001" } },
    events: [
      { status: "open_for_offers", createdAt: new Date("2026-06-26T10:00:00Z") },
      { status: "assigned", createdAt: new Date("2026-06-26T10:05:00Z") },
      { status: "en_route_dropoff", createdAt: new Date("2026-06-26T10:20:00Z") },
    ],
    ...over,
  });

  it("returns null when the order is not found", async () => {
    const prisma = { order: { findUnique: async () => null } };
    const svc = new AdminService(prisma as unknown as PrismaService);
    expect(await svc.getOrderDetail("missing")).toBeNull();
  });

  it("builds the timeline, items, fares and REVEALS phones inside the reveal window", async () => {
    // Recent last event so the stuck heuristic (no update > 20m) does not fire → current step is "now".
    const events = [
      { status: "open_for_offers", createdAt: new Date(Date.now() - 20 * 60000) },
      { status: "assigned", createdAt: new Date(Date.now() - 15 * 60000) },
      { status: "en_route_dropoff", createdAt: new Date(Date.now() - 2 * 60000) },
    ];
    const prisma = { order: { findUnique: async () => baseOrder({ events }) } };
    const svc = new AdminService(prisma as unknown as PrismaService);
    const d = (await svc.getOrderDetail("o1"))!;
    expect(d.route).toBe("Avondale shops → Borrowdale");
    expect(d.proposed).toBe("5.00");
    expect(d.agreed).toBe("6.00");
    expect(d.km).toBe(3.2);
    expect(d.items).toEqual([{ desc: "Envelope", qty: 2 }]);
    // en_route_dropoff is step 5 → steps 0..4 done, step 5 now, later steps pending.
    expect(d.timeline![0]!.state).toBe("done");
    expect(d.timeline![5]!.state).toBe("now");
    expect(d.timeline![7]!.state).toBeUndefined();
    // en_route_dropoff is a reveal status → full numbers for ops to call.
    expect(d.customerPhone).toBe("+263771112222");
    expect(d.riderPhone).toBe("+263782000001");
  });

  it("MASKS both phones once the order is terminal (outside the reveal window, A-03)", async () => {
    const prisma = { order: { findUnique: async () => baseOrder({ status: "cancelled" }) } };
    const svc = new AdminService(prisma as unknown as PrismaService);
    const d = (await svc.getOrderDetail("o1"))!;
    expect(d.customerPhone).toBe("+263•••••2222");
    expect(d.riderPhone).toBe("+263•••••0001");
    // Off-path terminal → only the broadcast step is marked done, no "now".
    expect(d.timeline![0]!.state).toBe("done");
    expect(d.timeline!.some((s) => s.state === "now")).toBe(false);
  });
});

describe("AdminService.getRiderDetail (D-2)", () => {
  const riderRow = (over: Record<string, unknown> = {}) => ({
    profileId: "r1",
    bikeReg: "ABZ 1",
    kycStatus: "verified",
    isOnline: true,
    ratingAvg: 4.75,
    ratingCount: 12,
    tripsCount: 30,
    cancelStrikes: 1,
    cooldownUntil: null,
    profile: { firstName: "Tendai", lastName: "M", phone: "+263782000001", createdAt: new Date("2026-01-15T00:00:00Z") },
    ...over,
  });
  const prismaFor = (rider: unknown, liveCount: number) => ({
    rider: { findUnique: async () => rider },
    order: {
      count: async () => liveCount,
      groupBy: async () => [
        { status: "completed", _count: { _all: 24 } },
        { status: "cancelled", _count: { _all: 6 } },
      ],
      findMany: async () => [
        {
          id: "o9",
          status: "completed",
          proposedFare: dec("4.00"),
          agreedFare: dec("4.50"),
          pickup: { landmark: "CBD" },
          dropoff: { landmark: "Mount Pleasant" },
          createdAt: new Date("2026-06-20T00:00:00Z"),
        },
      ],
    },
  });

  it("returns null when the id isn't a rider", async () => {
    const svc = new AdminService({ rider: { findUnique: async () => null } } as unknown as PrismaService);
    expect(await svc.getRiderDetail("nope")).toBeNull();
  });

  it("MASKS the phone off a live order and projects stats + trail (A-03)", async () => {
    const svc = new AdminService(prismaFor(riderRow(), 0) as unknown as PrismaService);
    const r = (await svc.getRiderDetail("r1"))!;
    expect(r.phone).toBe("+263•••••0001");
    expect(r.rating).toBe("4.8");
    expect(r.trips).toBe(30);
    expect(r.strikes).toBe(1);
    expect(r.status).toBe("online");
    expect(r.completion).toBe("80%"); // 24 completed / 30 total
    expect(r.trail[0]).toMatchObject({ id: "o9", route: "CBD → Mount Pleasant", fare: "4.50", when: "2026-06-20" });
  });

  it("REVEALS the phone when the rider is on a live order, and reports cooldown", async () => {
    const cooldownUntil = new Date(Date.now() + 90 * 60 * 1000);
    const svc = new AdminService(prismaFor(riderRow({ isOnline: false, cooldownUntil }), 1) as unknown as PrismaService);
    const r = (await svc.getRiderDetail("r1"))!;
    expect(r.phone).toBe("+263782000001");
    expect(r.status).toBe("cooldown");
    expect(r.cooldown).toMatch(/h .*m|m$/);
  });
});

describe("AdminService.listCustomers + getCustomerDetail (D-2)", () => {
  const profile = { id: "c1", firstName: "Rudo", lastName: "K", phone: "+263771112222", createdAt: new Date("2026-02-01T00:00:00Z") };

  it("aggregates orders/spend/cancel-rate and MASKS the phone", async () => {
    const prisma = {
      profile: { findMany: async () => [profile] },
      order: {
        groupBy: async (args: { where: { status?: string }; _sum?: unknown }) => {
          if (args.where.status === "cancelled") return [{ customerId: "c1", _count: { _all: 1 } }];
          if (args.where.status === "completed") return [{ customerId: "c1", _sum: { agreedFare: dec("42.00") } }];
          return [{ customerId: "c1", _count: { _all: 4 } }];
        },
      },
    };
    const svc = new AdminService(prisma as unknown as PrismaService);
    const rows = await svc.listCustomers();
    expect(rows[0]).toMatchObject({
      id: "c1",
      name: "Rudo K",
      phoneMasked: "+263•••••2222",
      orders: 4,
      spend: "42.00",
      cancelRatePct: 25,
      flags: 0,
      status: "active",
      joined: "2026-02-01",
    });
    expect(rows[0]!.phoneMasked).not.toContain("111");
  });

  it("returns [] for a flagged filter (no ban/flag model yet)", async () => {
    const prisma = {
      profile: { findMany: async () => [profile] },
      order: { groupBy: async () => [] },
    };
    const svc = new AdminService(prisma as unknown as PrismaService);
    expect(await svc.listCustomers("flagged")).toEqual([]);
  });

  it("detail returns null when the id isn't a customer", async () => {
    const svc = new AdminService({ profile: { findFirst: async () => null } } as unknown as PrismaService);
    expect(await svc.getCustomerDetail("nope")).toBeNull();
  });

  it("detail adds publicName, empty flagLog and the recent-orders trail", async () => {
    const prisma = {
      profile: { findFirst: async () => profile },
      order: {
        count: async (args: { where: { status?: string } }) => (args.where.status === "cancelled" ? 0 : 2),
        aggregate: async () => ({ _sum: { agreedFare: dec("10.00") } }),
        findMany: async () => [
          {
            id: "o1",
            status: "completed",
            proposedFare: dec("5.00"),
            agreedFare: dec("5.00"),
            pickup: { landmark: "A" },
            dropoff: { landmark: "B" },
            createdAt: new Date("2026-03-03T00:00:00Z"),
          },
        ],
      },
    };
    const svc = new AdminService(prisma as unknown as PrismaService);
    const c = (await svc.getCustomerDetail("c1"))!;
    expect(c.publicName).toBe("Rudo");
    expect(c.flagLog).toEqual([]);
    expect(c.orders).toBe(2);
    expect(c.spend).toBe("10.00");
    expect(c.cancelRatePct).toBe(0);
    expect(c.trail[0]).toMatchObject({ id: "o1", route: "A → B", fare: "5.00" });
  });
});

describe("AdminService admin mutations (Item 1 — mutation + audit in ONE $transaction, A-01)", () => {
  interface Calls {
    riderUpdate: { where: unknown; data: Record<string, unknown> } | null;
    orderUpdate: { where: unknown; data: Record<string, unknown> } | null;
    orderEvent: { data: Record<string, unknown> } | null;
    audit: { data: Record<string, unknown> } | null;
  }
  // A tx whose writes are recorded; $transaction runs the service callback against THIS object, so a
  // recorded riderUpdate AND a recorded audit prove both landed inside the same transaction.
  function makeTx(over: { rider?: unknown; order?: unknown } = {}) {
    const calls: Calls = { riderUpdate: null, orderUpdate: null, orderEvent: null, audit: null };
    const tx = {
      rider: {
        findUnique: async () => ("rider" in over ? over.rider : { profileId: "r1" }),
        update: async (args: Calls["riderUpdate"]) => { calls.riderUpdate = args; return {}; },
      },
      order: {
        findUnique: async () => ("order" in over ? over.order : { id: "o1", status: "assigned" }),
        update: async (args: Calls["orderUpdate"]) => { calls.orderUpdate = args; return {}; },
      },
      orderEvent: { create: async (args: Calls["orderEvent"]) => { calls.orderEvent = args; return {}; } },
      auditLog: { create: async (args: Calls["audit"]) => { calls.audit = args; return { id: "audit-9" }; } },
    };
    const prisma = { $transaction: async (fn: (t: unknown) => unknown) => fn(tx) };
    return { prisma, calls };
  }

  it("suspendRider sets accountStatus=suspended + reason AND writes the audit row atomically", async () => {
    const { prisma, calls } = makeTx();
    const svc = new AdminService(prisma as unknown as PrismaService);
    const res = await svc.suspendRider("admin-1", "r1", { reason: "safety report", note: "incident #7" });
    expect(calls.riderUpdate!.data).toEqual({ accountStatus: "suspended", suspendReason: "safety report" });
    // The audit row committed in the SAME transaction as the state change (both non-null here).
    expect(calls.audit!.data).toMatchObject({ actor: "admin-1", action: "rider.suspend", target: "r1", reasonCode: "safety report", note: "incident #7" });
    expect(res).toEqual({ id: "r1", accountStatus: "suspended", auditId: "audit-9" });
  });

  it("banRider sets accountStatus=banned + reason and audits", async () => {
    const { prisma, calls } = makeTx();
    const svc = new AdminService(prisma as unknown as PrismaService);
    await svc.banRider("admin-1", "r1", { reason: "fraud" });
    expect(calls.riderUpdate!.data).toEqual({ accountStatus: "banned", suspendReason: "fraud" });
    expect(calls.audit!.data).toMatchObject({ action: "rider.ban", reasonCode: "fraud", note: null });
  });

  it("liftRider returns to active, CLEARS the suspend reason, audits", async () => {
    const { prisma, calls } = makeTx();
    const svc = new AdminService(prisma as unknown as PrismaService);
    await svc.liftRider("admin-1", "r1", {});
    expect(calls.riderUpdate!.data).toEqual({ accountStatus: "active", suspendReason: null });
    expect(calls.audit!.data).toMatchObject({ action: "rider.lift", reasonCode: null });
  });

  it("suspendRider 404s when the id isn't a rider and writes NOTHING", async () => {
    const { prisma, calls } = makeTx({ rider: null });
    const svc = new AdminService(prisma as unknown as PrismaService);
    await expect(svc.suspendRider("admin-1", "nope", { reason: "x" })).rejects.toThrow("Rider not found");
    expect(calls.riderUpdate).toBeNull();
    expect(calls.audit).toBeNull();
  });

  it("cancelOrder sets cancelled + cancelledBy=admin, appends an OrderEvent, and audits in one tx", async () => {
    const { prisma, calls } = makeTx();
    const svc = new AdminService(prisma as unknown as PrismaService);
    const res = await svc.cancelOrder("admin-1", "o1", { reason: "duplicate order" });
    expect(calls.orderUpdate!.data).toMatchObject({ status: "cancelled", cancelledBy: "admin-1", cancelReason: "duplicate order" });
    expect(calls.orderEvent!.data).toEqual({ orderId: "o1", status: "cancelled" });
    expect(calls.audit!.data).toMatchObject({ action: "order.cancel", target: "o1", reasonCode: "duplicate order" });
    expect(res).toMatchObject({ id: "o1", status: "cancelled", auditId: "audit-9" });
  });

  it("cancelOrder rejects an order already in a terminal state (nothing written)", async () => {
    const { prisma, calls } = makeTx({ order: { id: "o1", status: "completed" } });
    const svc = new AdminService(prisma as unknown as PrismaService);
    await expect(svc.cancelOrder("admin-1", "o1", { reason: "x" })).rejects.toThrow("terminal");
    expect(calls.orderUpdate).toBeNull();
    expect(calls.audit).toBeNull();
  });

  it("adjustFare overwrites agreedFare and audits atomically", async () => {
    const { prisma, calls } = makeTx();
    const svc = new AdminService(prisma as unknown as PrismaService);
    const res = await svc.adjustFare("admin-1", "o1", { agreedFare: 7.5, reason: "GPS overcharge" });
    expect(calls.orderUpdate!.data).toEqual({ agreedFare: 7.5 });
    expect(calls.audit!.data).toMatchObject({ action: "order.fare_adjust", target: "o1", reasonCode: "GPS overcharge" });
    expect(res).toMatchObject({ id: "o1", agreedFare: "7.50", auditId: "audit-9" });
  });
});

describe("fmtUntil", () => {
  it("formats hours+minutes and minutes-only, flooring elapsed to 0m", () => {
    const now = Date.parse("2026-07-04T00:00:00Z");
    expect(fmtUntil(new Date(now + 135 * 60000), now)).toBe("2h 15m");
    expect(fmtUntil(new Date(now + 40 * 60000), now)).toBe("40m");
    expect(fmtUntil(new Date(now - 5 * 60000), now)).toBe("0m");
  });
});
