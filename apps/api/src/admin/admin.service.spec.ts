import { describe, expect, it } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { AdminService } from "./admin.service";

/** Decimal-like stub — Prisma returns Decimal objects the service serializes via toString(). */
const dec = (s: string) => ({ toString: () => s });

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
          if (w.deliveredAt) return 9; // deliveredToday
          if (w.undeliveredAt) return 1; // undeliveredToday
          if (w.status && typeof w.status === "object" && w.updatedAt) return 2; // stuck (in-flight + stale)
          return 0;
        },
        aggregate: async () => ({ _sum: { agreedFare: dec("86.40") } }),
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

    const out = await new AdminService(prisma as unknown as PrismaService).overview();

    // Today throughput drives the two headline KPIs the kit design shows.
    expect(out.today).toEqual({ completed: 9, completionRatePct: 90, fares: "86.40" });
    // Needs-attention signals for the overview queue.
    expect(out.attention).toEqual({ kycPending: 3, openIssues: 2, stuckOrders: 2, stuckOrderId: "stuck-1" });
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
    const out = await new AdminService(prisma as unknown as PrismaService).overview();
    expect(out.today.completionRatePct).toBeNull();
    expect(out.today.fares).toBe("0");
    expect(out.attention.stuckOrderId).toBeNull();
  });
});
