import { describe, expect, it, vi } from "vitest";
import type { Env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { AdminService } from "./admin.service";
import type { OrderHealthService } from "./order-health";

/** Decimal-like stub — Prisma returns Decimal objects the service serializes via toString(). */
const dec = (s: string) => ({ toString: () => s });
const envStub = (COMMISSION_RATE_PCT?: string) => ({ COMMISSION_RATE_PCT } as unknown as Env);
/** The per-step late rule (order-health.ts), stubbed: its own spec covers the rule itself. */
type LateSummary = Awaited<ReturnType<OrderHealthService["lateSummary"]>>;
const healthStub = (late: LateSummary = { count: 0, oldest: null }) =>
  ({ lateSummary: vi.fn(async () => late) }) as unknown as OrderHealthService;

describe("AdminService.overview", () => {
  it("adds today throughput, needs-attention signals, and enriched recent orders", async () => {
    const prisma = {
      order: {
        groupBy: async () => [
          { status: "open_for_offers", _count: { _all: 3 } },
          { status: "assigned", _count: { _all: 5 } },
        ],
        // Distinguish the several count() calls by their where clause.
        count: async (args?: { where?: Record<string, unknown> }) => {
          const w = args?.where ?? {};
          if (w.status === "expired") return 10; // expired
          if (w.status === "completed" && w.completedAt) return 9; // completedToday
          if (w.status === "undelivered" && w.undeliveredAt) return 1; // undeliveredToday
          // LC-D-T1: this used to be `if (Object.keys(w).length === 0) return 100`, which never
          // matches the real `{ orderType: "parcel" }` where clause below — totalBroadcasts silently
          // evaluated to 0 and nothing caught it because nothing asserted on `metrics` before.
          if (w.orderType === "parcel") return 100; // totalOrders / totalBroadcasts
          return 0;
        },
        aggregate: async (args?: { where?: Record<string, unknown> }) => {
          const w = args?.where ?? {};
          if (w.status === "completed" && w.completedAt && w.orderType === "parcel") return { _sum: { agreedFare: dec("86.40") } };
          if (w.status === "completed" && w.completedAt && w.orderType === "merchant") return { _sum: { deliveryFee: dec("3.60") } };
          return { _sum: { agreedFare: null } };
        },
        findMany: async () => [
          {
            id: "ord_1",
            status: "en_route_dropoff",
            proposedFare: dec("6.00"),
            agreedFare: dec("6.50"),
            createdAt: new Date("2026-07-18T13:00:00Z"),
            pickup: { landmark: "Avondale" },
            dropoff: { landmark: "Borrowdale" },
            rider: { profile: { firstName: "Tendai", lastName: "M" } },
          },
        ],
      },
      offer: {
        count: async () => 24,
      },
      rider: {
        count: async (args?: { where?: Record<string, unknown> }) => {
          const w = args?.where ?? {};
          if (Object.keys(w).length === 0) return 46; // total
          if (w.isOnline) return 12; // online
          if (w.kycStatus === "verified") return 38;
          if (w.kycStatus === "pending") return 3; // kyc backlog
          return 0;
        },
      },
      issue: { count: async () => 2 }, // open + investigating disputes
      // LC-D-T1: ordersWithOffer is now a bounded COUNT(DISTINCT order_id), not an unbounded findMany.
      $queryRaw: async () => [{ count: 1 }],
    };

    const health = healthStub({ count: 2, oldest: { id: "stuck-1", stageLabel: "No biker yet", limitMs: 6 * 60_000 } });
    const out = await new AdminService(prisma as unknown as PrismaService, envStub("10"), health).overview();

    // Today throughput drives the two headline KPIs the kit design shows.
    // Fares = parcel agreed fares + merchant delivery fees.
    expect(out.today).toEqual({ completed: 9, completionRatePct: 90, fares: "90.00" });
    // Needs-attention signals for the overview queue.
    // QA-B02: the late-order signal is the per-step rule's summary, the same one the alert strip counts.
    expect(out.attention).toEqual({
      kycPending: 3,
      openIssues: 2,
      stuckOrders: 2,
      stuckOrderId: "stuck-1",
      stuckOrderStage: { label: "No biker yet", limitMinutes: 6 },
    });
    // QA-B03: not-ended orders (open_for_offers 3 + assigned 5), the Live page's "Active orders" number.
    expect(out.activeOrders).toBe(8);
    // UX20-02: the live commission rate, resolved from env — the console's needs-attention "Commission
    // is 0%" row must read this instead of a hardcoded literal.
    expect(out.commissionRatePct).toBe(10);
    // Recent orders carry the route + rider name for the design's table.
    expect(out.recentOrders[0]).toMatchObject({
      id: "ord_1",
      route: "Avondale → Borrowdale",
      rider: "Tendai M",
      agreedFare: "6.50",
    });
    // Existing shape preserved (back-compat).
    expect(out.riders).toEqual({ total: 46, online: 12, verified: 38 });
    expect(out.ordersByStatus).toMatchObject({ open_for_offers: 3, assigned: 5 });
    // LC-D-T1: pctBroadcastsWithOffer now comes from the bounded $queryRaw count (stubbed to 1) divided
    // by totalBroadcasts (100), not from counting rows returned by an unbounded findMany.
    expect(out.metrics).toMatchObject({ totalBroadcasts: 100, pctBroadcastsWithOffer: 1, expiryRatePct: 10 });
  });

  // LC-D-T1: `ordersWithOffer` used to be `this.prisma.offer.findMany({ distinct: ["orderId"] })` — no
  // `where`, no `take` — a full-table scan whose only purpose was `.length`. Every other query feeding
  // this same Promise.all is a bounded count()/aggregate() or a capped take:20 findMany; this one grew
  // unboundedly with the pilot's lifetime offer volume. Fixed with a single DB-side
  // `COUNT(DISTINCT order_id)`. Proves the correct count still flows into the funnel math AND that the
  // old unbounded path is gone — the mock's `offer.findMany` would throw if the code called it, since
  // production code no longer does.
  it("LC-D-T1: derives ordersWithOffer from a bounded COUNT(DISTINCT order_id) query, not an unbounded findMany", async () => {
    const prisma = {
      order: {
        groupBy: async () => [],
        count: async (args?: { where?: Record<string, unknown> }) => {
          const w = args?.where ?? {};
          if (w.orderType === "parcel") return 10; // totalOrders / totalBroadcasts
          return 0;
        },
        aggregate: async () => ({ _sum: { agreedFare: null } }),
        findFirst: async () => null,
        findMany: async () => [],
      },
      offer: { count: async () => 0 },
      rider: { count: async () => 0 },
      issue: { count: async () => 0 },
      $queryRaw: async () => [{ count: 7 }],
    };

    const out = await new AdminService(prisma as unknown as PrismaService, envStub(), healthStub()).overview();
    expect(out.metrics.pctBroadcastsWithOffer).toBe(70); // round(7 / 10 * 100)
  });

  it("reports a null completion rate when no trip reached a terminal today", async () => {
    const prisma = {
      order: {
        groupBy: async () => [],
        count: async () => 0,
        aggregate: async () => ({ _sum: { agreedFare: null } }),
        findFirst: async () => null,
        findMany: async () => [],
      },
      offer: { count: async () => 0 },
      rider: { count: async () => 0 },
      issue: { count: async () => 0 },
      $queryRaw: async () => [{ count: 0 }],
    };
    const out = await new AdminService(prisma as unknown as PrismaService, envStub(), healthStub()).overview();
    expect(out.today.completionRatePct).toBeNull();
    expect(out.today.fares).toBe("0.00");
    expect(out.attention.stuckOrderId).toBeNull();
  });

  // WD-024/WD-026: the "Completed today"/"Fares today" KPIs used to key off the `deliveredAt` timestamp
  // alone, which (a) stays set forever on an order the ops console later admin-cancels post-delivery
  // (`delivered` is deliberately non-terminal so a dispute/fraud cancel can still land on it — WD-024),
  // and (b) is never stamped by `adjudicateDelivered`'s force-complete of a disputed `undelivered` order,
  // permanently excluding a genuinely commissioned completion from both KPIs while leaving it forever
  // double-counted as a failure via the never-cleared `undeliveredAt` (WD-026). Asserting the exact
  // `where` shape proves both counts/aggregate now gate on the order's CURRENT `status`, not a timestamp
  // that can outlive it.
  it("gates completed/fares/undelivered-today on the order's CURRENT status, not a stale timestamp", async () => {
    const seenCountWheres: Record<string, unknown>[] = [];
    const seenAggregateWheres: Record<string, unknown>[] = [];
    const prisma = {
      order: {
        groupBy: async () => [],
        count: async (args?: { where?: Record<string, unknown> }) => {
          seenCountWheres.push(args?.where ?? {});
          return 0;
        },
        aggregate: async (args?: { where?: Record<string, unknown> }) => {
          seenAggregateWheres.push(args?.where ?? {});
          return { _sum: { agreedFare: null } };
        },
        findFirst: async () => null,
        findMany: async () => [],
      },
      offer: { count: async () => 0 },
      rider: { count: async () => 0 },
      issue: { count: async () => 0 },
      $queryRaw: async () => [{ count: 0 }],
    };

    await new AdminService(prisma as unknown as PrismaService, envStub(), healthStub()).overview();

    // A cancelled-post-delivery order (status "cancelled", deliveredAt still set from before the cancel)
    // must NOT satisfy the completed-today where-clause — it has to require the CURRENT status too.
    const completedToday = seenCountWheres.find((w) => "completedAt" in w);
    expect(completedToday).toMatchObject({ status: "completed" });
    // Same gate on the fares-today aggregate.
    // A-9: parcel fares on agreedFare, merchant jobs on their delivery fee — both gated on status.
    expect(seenAggregateWheres).toEqual([
      { status: "completed", completedAt: expect.anything(), orderType: "parcel" },
      { status: "completed", completedAt: expect.anything(), orderType: "merchant" },
    ]);
    // An adjudicated order (status flipped "undelivered" -> "completed", undeliveredAt never cleared)
    // must NOT satisfy the undelivered-today where-clause either.
    const undeliveredToday = seenCountWheres.find((w) => "undeliveredAt" in w);
    expect(undeliveredToday).toMatchObject({ status: "undelivered" });
  });

  // LC-B-SIB-4: "Completed today", its completion rate and "Fares today" cover the same orders — every
  // type now. A merchant job counts toward the fares on its delivery fee (the biker's fare), never its
  // goods + delivery agreedFare.
  it("counts merchant orders in completed/undelivered/fares-today, merchant fares on the delivery fee", async () => {
    const seenCountWheres: Record<string, unknown>[] = [];
    const seenAggregates: Array<{ _sum?: Record<string, unknown>; where?: Record<string, unknown> }> = [];
    const prisma = {
      order: {
        groupBy: async () => [],
        count: async (args?: { where?: Record<string, unknown> }) => {
          const w = args?.where ?? {};
          seenCountWheres.push(w);
          if (w.status === "completed" && w.completedAt) return 7;
          if (w.status === "undelivered" && w.undeliveredAt) return 3;
          return 0;
        },
        aggregate: async (args: { _sum?: Record<string, unknown>; where?: Record<string, unknown> }) => {
          seenAggregates.push(args);
          return args.where?.orderType === "merchant"
            ? { _sum: { deliveryFee: dec("4.50") } }
            : { _sum: { agreedFare: dec("30.00") } };
        },
        findFirst: async () => null,
        findMany: async () => [],
      },
      offer: { count: async () => 0 },
      rider: { count: async () => 0 },
      issue: { count: async () => 0 },
      $queryRaw: async () => [{ count: 0 }],
    };

    const out = await new AdminService(prisma as unknown as PrismaService, envStub(), healthStub()).overview();

    expect(out.today).toEqual({ completed: 7, completionRatePct: 70, fares: "34.50" });
    expect(seenCountWheres.find((w) => "completedAt" in w)).not.toHaveProperty("orderType");
    expect(seenCountWheres.find((w) => "undeliveredAt" in w)).not.toHaveProperty("orderType");
    expect(seenAggregates.find((a) => a.where?.orderType === "merchant")?._sum).toEqual({ deliveryFee: true });
    expect(seenAggregates.find((a) => a.where?.orderType === "parcel")?._sum).toEqual({ agreedFare: true });
  });

  it("starts 'today' at 00:00 Harare (22:00 UTC the day before), not UTC midnight", async () => {
    const seenCountWheres: Record<string, unknown>[] = [];
    const prisma = {
      order: {
        groupBy: async () => [],
        count: async (args?: { where?: Record<string, unknown> }) => {
          seenCountWheres.push(args?.where ?? {});
          return 0;
        },
        aggregate: async () => ({ _sum: { agreedFare: null } }),
        findFirst: async () => null,
        findMany: async () => [],
      },
      offer: { count: async () => 0 },
      rider: { count: async () => 0 },
      issue: { count: async () => 0 },
      $queryRaw: async () => [{ count: 0 }],
    };
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      // 23:30 UTC on the 12th is 01:30 Harare on the 13th.
      vi.setSystemTime(new Date("2026-10-12T23:30:00Z"));
      await new AdminService(prisma as unknown as PrismaService, envStub(), healthStub()).overview();
    } finally {
      vi.useRealTimers();
    }
    const completed = seenCountWheres.find((w) => "completedAt" in w) as { completedAt: { gte: Date } };
    expect(completed.completedAt.gte.toISOString()).toBe("2026-10-12T22:00:00.000Z");
  });

  // QA-B02: the card used a flat 20-minute updatedAt rule over in-flight statuses, so a food order with no biker was
  // "past the time limit" in the alert strip and missing here. It now reads the shared per-step rule and runs no
  // updatedAt query of its own.
  it("reads the late orders from the shared per-step rule, not a flat updatedAt cutoff", async () => {
    const seenCountWheres: Record<string, unknown>[] = [];
    const prisma = {
      order: {
        groupBy: async () => [],
        count: async (args?: { where?: Record<string, unknown> }) => {
          seenCountWheres.push(args?.where ?? {});
          return 0;
        },
        aggregate: async () => ({ _sum: { agreedFare: null } }),
        findMany: async () => [],
      },
      offer: { count: async () => 0 },
      rider: { count: async () => 0 },
      issue: { count: async () => 0 },
      $queryRaw: async () => [{ count: 0 }],
    };
    const health = healthStub({ count: 1, oldest: { id: "food-1", stageLabel: "No biker yet", limitMs: 6 * 60_000 } });

    const out = await new AdminService(prisma as unknown as PrismaService, envStub(), health).overview();

    expect(health.lateSummary).toHaveBeenCalledTimes(1);
    expect(seenCountWheres.some((w) => "updatedAt" in w)).toBe(false);
    expect(out.attention.stuckOrders).toBe(1);
    expect(out.attention.stuckOrderId).toBe("food-1");
  });
});

// Plan §5 C5: rides-per-active-rider, Express vs Restaurants. The raw SQL itself (the actual demand/
// supply/ratio math) is proven against a real Postgres in admin.service.int.spec.ts — $queryRaw can't
// be meaningfully faked here, so this unit layer only proves the service's own responsibilities: the
// `days` clamp/default and the Date→"YYYY-MM-DD" formatting of whatever the query returns.
describe("AdminService.utilization", () => {
  function prismaStub(capture: { days?: unknown }, rows: unknown[]) {
    return {
      $queryRaw: async (_strings: TemplateStringsArray, ...values: unknown[]) => {
        capture.days = values[0];
        return rows;
      },
    } as unknown as PrismaService;
  }

  it("defaults to a 14-day span and formats the query's Date column", async () => {
    const capture: { days?: unknown } = {};
    const row = {
      day: new Date("2026-07-31T00:00:00.000Z"),
      assignments: 3,
      express: 2,
      merchant: 1,
      activeRiders: 2,
      ridesPerActiveRider: 1.5,
      expressRidesPerActiveRider: 1,
      merchantRidesPerActiveRider: 0.5,
      heartbeatArmIncluded: true,
    };
    const out = await new AdminService(prismaStub(capture, [row]), envStub(), healthStub()).utilization();

    expect(capture.days).toBe(14);
    expect(out).toEqual([{ ...row, day: "2026-07-31" }]);
  });

  it("clamps an out-of-range or non-finite days value into [1, 90]", async () => {
    const capture: { days?: unknown } = {};
    const svc = new AdminService(prismaStub(capture, []), envStub(), healthStub());

    await svc.utilization(500);
    expect(capture.days).toBe(90);

    await svc.utilization(0);
    expect(capture.days).toBe(14);

    await svc.utilization(Number.NaN);
    expect(capture.days).toBe(14);

    await svc.utilization(7);
    expect(capture.days).toBe(7);
  });
});

describe("AdminService.navCounts — X1 foodDisputes badge", () => {
  it("sums R-05 frozen handshakes, N-12 refund-overdue orders and D3 non-return reports into one badge count", async () => {
    const counts: Record<string, unknown>[] = [];
    const prisma = {
      rider: { count: async () => 0 },
      issue: { count: async () => 0 },
      sosEvent: { count: async () => 0 },
      merchant: { count: async () => 0 },
      order: {
        count: async (args: { where: Record<string, unknown> }) => {
          counts.push(args.where);
          // Distinguish the two order.count calls by their distinctive where-clause shape.
          if ("cashHandshakeFrozenAt" in args.where) return 2; // frozen handshakes
          if ("debtNonReturnReportedAt" in args.where) return 4; // D3: merchant non-return reports
          return 3; // refund-overdue
        },
      },
    };
    const svc = new AdminService(prisma as unknown as PrismaService, envStub(), healthStub());
    const out = await svc.navCounts();
    expect(out.foodDisputes).toBe(9);
    // Both order-vertical queries are scoped to merchant orders only — never mix in parcel counts.
    expect(counts.every((w) => w.orderType === "merchant")).toBe(true);
  });

  it("is 0 when nothing needs attention", async () => {
    const prisma = {
      rider: { count: async () => 0 },
      issue: { count: async () => 0 },
      sosEvent: { count: async () => 0 },
      merchant: { count: async () => 0 },
      order: { count: async () => 0 },
    };
    const svc = new AdminService(prisma as unknown as PrismaService, envStub(), healthStub());
    expect((await svc.navCounts()).foodDisputes).toBe(0);
  });

  it("admin console v2 §5: counts merchant applications still waiting on ops past the 24h SLA", async () => {
    let where: Record<string, unknown> | null = null;
    const prisma = {
      rider: { count: async () => 0 },
      issue: { count: async () => 0 },
      sosEvent: { count: async () => 0 },
      order: { count: async () => 0 },
      merchant: {
        count: async (args: { where: Record<string, unknown> }) => {
          where = args.where;
          return 3;
        },
      },
    };
    const svc = new AdminService(prisma as unknown as PrismaService, envStub(), healthStub());
    // Frozen clock: comparing against a second Date.now() read flaked under full-suite load.
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-10-18T12:00:00Z"));
      expect((await svc.navCounts()).merchantApplications).toBe(3);
    } finally {
      vi.useRealTimers();
    }
    const w = where as unknown as { applicationStatus: { in: string[] }; pilotEnabled: boolean; createdAt: { lt: Date } };
    expect(w.applicationStatus.in).toEqual(["applied", "reviewing"]);
    expect(w.pilotEnabled).toBe(false);
    // Exactly 24h before "now".
    expect(w.createdAt.lt.toISOString()).toBe("2026-10-17T12:00:00.000Z");
  });
});
