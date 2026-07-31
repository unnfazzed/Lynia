import { STUCK_AFTER_MINUTES } from "@lynia/shared";
import { describe, expect, it } from "vitest";
import type { Env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { AdminService } from "./admin.service";
import { STUCK_AFTER_MS } from "./admin.shared";

/** Decimal-like stub — Prisma returns Decimal objects the service serializes via toString(). */
const dec = (s: string) => ({ toString: () => s });
const envStub = (COMMISSION_RATE_PCT?: string) => ({ COMMISSION_RATE_PCT } as unknown as Env);

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
          if (Object.keys(w).length === 0) return 100; // totalOrders
          if (w.status === "expired") return 10; // expired
          if (w.status === "completed" && w.completedAt) return 9; // completedToday
          if (w.status === "undelivered" && w.undeliveredAt) return 1; // undeliveredToday
          if (w.status && typeof w.status === "object" && w.updatedAt) return 2; // stuck (in-flight + stale)
          return 0;
        },
        aggregate: async (args?: { where?: Record<string, unknown> }) => {
          const w = args?.where ?? {};
          if (w.status === "completed" && w.completedAt) return { _sum: { agreedFare: dec("86.40") } };
          return { _sum: { agreedFare: null } };
        },
        findFirst: async () => ({ id: "stuck-1" }),
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
        findMany: async () => [{ orderId: "ord_1" }],
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
    };

    const out = await new AdminService(prisma as unknown as PrismaService, envStub("10")).overview();

    // Today throughput drives the two headline KPIs the kit design shows.
    expect(out.today).toEqual({ completed: 9, completionRatePct: 90, fares: "86.40" });
    // Needs-attention signals for the overview queue.
    expect(out.attention).toEqual({ kycPending: 3, openIssues: 2, stuckOrders: 2, stuckOrderId: "stuck-1" });
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
      offer: { count: async () => 0, findMany: async () => [] },
      rider: { count: async () => 0 },
      issue: { count: async () => 0 },
    };
    const out = await new AdminService(prisma as unknown as PrismaService, envStub()).overview();
    expect(out.today.completionRatePct).toBeNull();
    expect(out.today.fares).toBe("0");
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
      offer: { count: async () => 0, findMany: async () => [] },
      rider: { count: async () => 0 },
      issue: { count: async () => 0 },
    };

    await new AdminService(prisma as unknown as PrismaService, envStub()).overview();

    // A cancelled-post-delivery order (status "cancelled", deliveredAt still set from before the cancel)
    // must NOT satisfy the completed-today where-clause — it has to require the CURRENT status too.
    const completedToday = seenCountWheres.find((w) => "completedAt" in w);
    expect(completedToday).toMatchObject({ status: "completed" });
    // Same gate on the fares-today aggregate.
    // A-9 (status-keyed-query-audit): the fares-today aggregate is now parcel-only.
    expect(seenAggregateWheres).toEqual([{ status: "completed", completedAt: expect.anything(), orderType: "parcel" }]);
    // An adjudicated order (status flipped "undelivered" -> "completed", undeliveredAt never cleared)
    // must NOT satisfy the undelivered-today where-clause either.
    const undeliveredToday = seenCountWheres.find((w) => "undeliveredAt" in w);
    expect(undeliveredToday).toMatchObject({ status: "undelivered" });
  });

  // DS20-01: the ops-dashboard stuck-order query and the per-order detail badge (admin-orders.service)
  // must be governed by ONE shared threshold. admin.service used to redeclare its own 25-min literal
  // while admin.shared exported 20 min, so the same order could read "stuck" on its detail page yet not
  // appear in the dashboard alert. Assert the dashboard's `updatedAt` cutoff is exactly `now -
  // STUCK_AFTER_MS` (the shared constant admin-orders.service also imports), proving the drift is gone.
  it("keys the stuck-order dashboard query off the SHARED STUCK_AFTER_MS threshold (no drift)", async () => {
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
      offer: { count: async () => 0, findMany: async () => [] },
      rider: { count: async () => 0 },
      issue: { count: async () => 0 },
    };

    const before = Date.now();
    await new AdminService(prisma as unknown as PrismaService, envStub()).overview();
    const after = Date.now();

    // The stuck query is the in-flight-status count that also bounds `updatedAt`.
    const stuckWhere = seenCountWheres.find((w) => "updatedAt" in w) as
      | { updatedAt: { lt: Date } }
      | undefined;
    expect(stuckWhere).toBeTruthy();
    const cutoffMs = stuckWhere!.updatedAt.lt.getTime();
    // cutoff == now - STUCK_AFTER_MS, with `now` captured somewhere in [before, after].
    expect(cutoffMs).toBeGreaterThanOrEqual(before - STUCK_AFTER_MS);
    expect(cutoffMs).toBeLessThanOrEqual(after - STUCK_AFTER_MS);
    // And the shared constant is the 20-min A-04 value, not the old 25-min drift.
    expect(STUCK_AFTER_MS).toBe(20 * 60 * 1000);
    // WD-028: STUCK_AFTER_MS derives from the SAME @lynia/shared constant the admin console's
    // needs-attention copy reads for its "N+ min" prose, so the two can't independently drift again.
    expect(STUCK_AFTER_MS).toBe(STUCK_AFTER_MINUTES * 60 * 1000);
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
    const out = await new AdminService(prismaStub(capture, [row]), envStub()).utilization();

    expect(capture.days).toBe(14);
    expect(out).toEqual([{ ...row, day: "2026-07-31" }]);
  });

  it("clamps an out-of-range or non-finite days value into [1, 90]", async () => {
    const capture: { days?: unknown } = {};
    const svc = new AdminService(prismaStub(capture, []), envStub());

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
  it("sums R-05 frozen handshakes and N-12 refund-overdue orders into one badge count", async () => {
    const counts: Record<string, unknown>[] = [];
    const prisma = {
      rider: { count: async () => 0 },
      issue: { count: async () => 0 },
      sosEvent: { count: async () => 0 },
      order: {
        count: async (args: { where: Record<string, unknown> }) => {
          counts.push(args.where);
          // Distinguish the two order.count calls by their distinctive where-clause shape.
          if ("cashHandshakeFrozenAt" in args.where) return 2; // frozen handshakes
          return 3; // refund-overdue
        },
      },
    };
    const svc = new AdminService(prisma as unknown as PrismaService, envStub());
    const out = await svc.navCounts();
    expect(out.foodDisputes).toBe(5);
    // Both order-vertical queries are scoped to merchant orders only — never mix in parcel counts.
    expect(counts.every((w) => w.orderType === "merchant")).toBe(true);
  });

  it("is 0 when nothing needs attention", async () => {
    const prisma = {
      rider: { count: async () => 0 },
      issue: { count: async () => 0 },
      sosEvent: { count: async () => 0 },
      order: { count: async () => 0 },
    };
    const svc = new AdminService(prisma as unknown as PrismaService, envStub());
    expect((await svc.navCounts()).foodDisputes).toBe(0);
  });
});
