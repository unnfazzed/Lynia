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
          if (args.where.status === "cancelled") return [{ customerId: "c1", _count: { _all: 1 } }];
          if (args.where.status === "completed") return [{ customerId: "c1", _sum: { agreedFare: dec("42.00") } }];
          return [{ customerId: "c1", _count: { _all: 4 } }];
        },
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

  it("returns [] for a flagged filter (no ban/flag state on Profile yet)", async () => {
    const prisma = {
      profile: { findMany: async () => [profile] },
      order: { groupBy: async () => [] },
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
});
