import { describe, expect, it } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { AdminCustomersService } from "./admin-customers.service";

/** Decimal-like stub — Prisma returns Decimal objects whose `.toString()`/`.toFixed()` we serialize. */
const dec = (s: string) => ({ toString: () => s, toFixed: (_n: number) => s });

describe("AdminCustomersService.listCustomers + getCustomerDetail (D-2)", () => {
  const profile = { id: "c1", firstName: "Rudo", lastName: "K", phone: "+263771112222", createdAt: new Date("2026-02-01T00:00:00Z") };

  it("aggregates orders/spend/cancel-rate/flags and MASKS the phone", async () => {
    const prisma = {
      profile: { findMany: async () => [profile] },
      order: {
        groupBy: async (args: { where: { status?: string }; _sum?: unknown }) => {
          if (args.where.status === "completed") return [{ customerId: "c1", _sum: { agreedFare: dec("42.00") } }];
          return [{ customerId: "c1", _count: { _all: 4 } }];
        },
        // NEW-3: cancelled orders are fetched raw (customerId + cancelledBy) and aggregated in JS so only
        // the customer's OWN cancels count. This customer has 1 cancel, self-cancelled.
        findMany: async () => [{ customerId: "c1", cancelledBy: "c1" }],
      },
      // Two riders have reported this customer — the directory surfaces the real count (A-05).
      report: { groupBy: async () => [{ subjectProfileId: "c1", _count: { _all: 2 } }] },
    };
    const svc = new AdminCustomersService(prisma as unknown as PrismaService);
    const rows = await svc.listCustomers();
    expect(rows[0]).toMatchObject({
      id: "c1",
      name: "Rudo K",
      phoneMasked: "+263•••••2222",
      orders: 4,
      spend: "42.00",
      cancelRatePct: 25,
      flags: 2,
      status: "active",
      joined: "2026-02-01",
    });
    expect(rows[0]!.phoneMasked).not.toContain("111");
  });

  it("NEW-3: a cancel the RIDER (or admin) made doesn't count toward the customer's own cancel rate", async () => {
    const prisma = {
      profile: { findMany: async () => [profile] },
      order: {
        groupBy: async (args: { where: { status?: string } }) => {
          if (args.where.status === "completed") return [];
          return [{ customerId: "c1", _count: { _all: 4 } }];
        },
        // 2 orders on this customer went terminal `cancelled`, but BOTH were cancelled by someone else
        // (a rider bailing, an ops cancel) — cancelledBy !== customerId for either row.
        findMany: async () => [
          { customerId: "c1", cancelledBy: "rider-9" },
          { customerId: "c1", cancelledBy: "admin-1" },
        ],
      },
      report: { groupBy: async () => [] },
    };
    const svc = new AdminCustomersService(prisma as unknown as PrismaService);
    const rows = await svc.listCustomers();
    expect(rows[0]!.cancelRatePct).toBe(0);
  });

  it("returns [] for a flagged filter (no ban/flag state on Profile yet)", async () => {
    const prisma = {
      profile: { findMany: async () => [profile] },
      order: { groupBy: async () => [], findMany: async () => [] },
      report: { groupBy: async () => [] },
    };
    const svc = new AdminCustomersService(prisma as unknown as PrismaService);
    expect(await svc.listCustomers("flagged")).toEqual([]);
  });

  it("detail returns null when the id isn't a customer", async () => {
    const svc = new AdminCustomersService({ profile: { findFirst: async () => null } } as unknown as PrismaService);
    expect(await svc.getCustomerDetail("nope")).toBeNull();
  });

  const customerOrders = {
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
  };

  it("NEW-3: detail's cancelled count filters on cancelledBy=id — only the customer's own cancels", async () => {
    let cancelledWhere: Record<string, unknown> | undefined;
    const prisma = {
      profile: { findFirst: async () => profile },
      report: { count: async () => 0, findMany: async () => [] },
      order: {
        ...customerOrders,
        count: async (args: { where: Record<string, unknown> }) => {
          if (args.where.status === "cancelled") cancelledWhere = args.where;
          return args.where.status === "cancelled" ? 0 : 2;
        },
      },
    };
    const svc = new AdminCustomersService(prisma as unknown as PrismaService);
    await svc.getCustomerDetail("c1");
    expect(cancelledWhere).toMatchObject({ customerId: "c1", status: "cancelled", cancelledBy: "c1" });
  });

  it("detail adds publicName, empty flagLog and the recent-orders trail", async () => {
    const prisma = {
      profile: { findFirst: async () => profile },
      report: { count: async () => 0, findMany: async () => [] },
      order: customerOrders,
    };
    const svc = new AdminCustomersService(prisma as unknown as PrismaService);
    const c = (await svc.getCustomerDetail("c1"))!;
    expect(c.publicName).toBe("Rudo");
    expect(c.flagLog).toEqual([]);
    expect(c.flags).toBe(0);
    expect(c.orders).toBe(2);
    expect(c.spend).toBe("10.00");
    expect(c.cancelRatePct).toBe(0);
    expect(c.trail[0]).toMatchObject({ id: "o1", route: "A → B", fare: "5.00" });
  });

  it("detail surfaces the customer's Report count in `flags` and the rows in `flagLog`", async () => {
    const reports = [
      { id: "rep9", reason: "fraud", note: "chargeback scam", createdAt: new Date("2026-03-05T00:00:00Z") },
    ];
    const prisma = {
      profile: { findFirst: async () => profile },
      report: { count: async () => reports.length, findMany: async () => reports },
      order: customerOrders,
    };
    const svc = new AdminCustomersService(prisma as unknown as PrismaService);
    const c = (await svc.getCustomerDetail("c1"))!;
    expect(c.flags).toBe(1);
    expect(c.flagLog).toEqual([{ date: "2026-03-05", text: "Fraud or scam — chargeback scam", issueId: "rep9" }]);
  });

  it("projects a held customer as status=on_hold with the recorded reason", async () => {
    const held = { ...profile, onHold: true, holdReason: "Payment dispute open" };
    const prisma = {
      profile: { findFirst: async () => held },
      report: { count: async () => 0, findMany: async () => [] },
      order: customerOrders,
    };
    const svc = new AdminCustomersService(prisma as unknown as PrismaService);
    const c = (await svc.getCustomerDetail("c1"))!;
    expect(c.status).toBe("on_hold");
    expect(c.holdReason).toBe("Payment dispute open");
  });
});

describe("AdminCustomersService hold/lift (S·2 — mutation + audit in ONE $transaction, A-01)", () => {
  interface Calls {
    update: { where: unknown; data: Record<string, unknown> } | null;
    audit: { data: Record<string, unknown> } | null;
  }
  // DS13-04: hold/lift now CAS via `updateMany` (guarded on the observed onHold) and reject on a 0-row
  // result; default to 1 row (success) and let a test force 0 to exercise the conflict path.
  function makeTx(customer: unknown = { id: "c1", onHold: false }, updateCount = 1) {
    const calls: Calls = { update: null, audit: null };
    const tx = {
      profile: {
        findFirst: async () => customer,
        updateMany: async (args: Calls["update"]) => { calls.update = args; return { count: updateCount }; },
      },
      auditLog: { create: async (args: Calls["audit"]) => { calls.audit = args; return { id: "audit-3" }; } },
    };
    const prisma = { $transaction: async (fn: (t: unknown) => unknown) => fn(tx) };
    return { prisma, calls };
  }

  it("holdCustomer sets onHold + reason AND writes the audit row atomically", async () => {
    const { prisma, calls } = makeTx();
    const svc = new AdminCustomersService(prisma as unknown as PrismaService);
    const res = await svc.holdCustomer("admin-1", "c1", { reason: "suspected fraud", note: "orders #4,#5" });
    expect(calls.update!.data).toEqual({ onHold: true, holdReason: "suspected fraud" });
    expect(calls.audit!.data).toMatchObject({ actor: "admin-1", action: "customer.hold", target: "c1", reasonCode: "suspected fraud", note: "orders #4,#5" });
    expect(res).toEqual({ id: "c1", status: "on_hold", auditId: "audit-3" });
  });

  it("liftCustomerHold clears onHold + reason and audits", async () => {
    const { prisma, calls } = makeTx();
    const svc = new AdminCustomersService(prisma as unknown as PrismaService);
    const res = await svc.liftCustomerHold("admin-1", "c1", {});
    expect(calls.update!.data).toEqual({ onHold: false, holdReason: null });
    expect(calls.audit!.data).toMatchObject({ action: "customer.lift", target: "c1", note: null });
    expect(res).toEqual({ id: "c1", status: "active", auditId: "audit-3" });
  });

  it("404s when the id isn't a customer", async () => {
    const { prisma } = makeTx(null);
    const svc = new AdminCustomersService(prisma as unknown as PrismaService);
    await expect(svc.holdCustomer("admin-1", "c1", { reason: "x" })).rejects.toThrow(/customer not found/i);
  });

  it("DS13-04: holdCustomer CAS — a concurrent hold/lift (0 rows) → 409, no audit committed", async () => {
    const { prisma, calls } = makeTx({ id: "c1", onHold: false }, 0);
    const svc = new AdminCustomersService(prisma as unknown as PrismaService);
    await expect(svc.holdCustomer("admin-1", "c1", { reason: "x" })).rejects.toThrow(/refresh and try again/i);
    expect(calls.audit).toBeNull();
  });
});
