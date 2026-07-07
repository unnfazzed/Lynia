import { COMMISSION, perRideCommission } from "@lynia/shared";
import { describe, expect, it } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { SettlementsService } from "./settlements.service";

/**
 * A Prisma double for the commission overview: `order.findMany` returns the individual completed rides
 * (the service now sums commission per ride, not off a groupBy aggregate) and `profile.findMany`
 * resolves rider names. Each input group `{riderId, fares, rides}` is expanded into `rides` orders whose
 * fares are split evenly so they sum to `fares`. `captured` records the findMany `where` so we can
 * assert the trailing-7-day window.
 */
function overviewPrisma(
  groups: Array<{ riderId: string | null; fares: number; rides: number }>,
  profiles: Array<{ id: string; firstName: string; lastName: string }>,
) {
  const captured: { where: Record<string, unknown> | null } = { where: null };
  const orders = groups.flatMap((g) =>
    Array.from({ length: g.rides }, () => ({ riderId: g.riderId, agreedFare: g.fares / g.rides })),
  );
  const prisma = {
    order: {
      findMany: async (args: { where: Record<string, unknown> }) => {
        captured.where = args.where;
        return orders;
      },
    },
    profile: {
      findMany: async () => profiles,
    },
  };
  return { prisma, captured };
}

describe("SettlementsService.commissionOverview (prepaid per-ride)", () => {
  it("projects per-rider rides/fares/commission at the current rate and totals the KPIs", async () => {
    const { prisma } = overviewPrisma(
      [
        { riderId: "r1", fares: 100, rides: 5 },
        { riderId: "r2", fares: 40, rides: 2 },
      ],
      [
        { id: "r1", firstName: "Tendai", lastName: "M" },
        { id: "r2", firstName: "Rudo", lastName: "M" },
      ],
    );
    const svc = new SettlementsService(prisma as unknown as PrismaService);
    const view = await svc.commissionOverview(new Date("2026-07-06T00:00:00Z"));

    expect(view.model).toBe(COMMISSION.model);
    expect(view.ratePct).toBe(COMMISSION.ratePct);
    expect(view.rows).toHaveLength(2);
    expect(view.rows[0]).toMatchObject({
      riderId: "r1",
      name: "Tendai M",
      rides: 5,
      fares: "100.00",
      commission: perRideCommission(100).toFixed(2),
    });
    // Commission accrues at the configured rate — $0.00 while the launch rate is 0%.
    expect(view.rows[0]!.commission).toBe(COMMISSION.ratePct === 0 ? "0.00" : perRideCommission(100).toFixed(2));
    expect(view.kpis).toMatchObject({
      ratePct: COMMISSION.ratePct,
      rides: 7,
      fares: "140.00",
      commission: perRideCommission(140).toFixed(2),
    });
  });

  it("windows on the trailing 7 days ending at ref and only counts completed rides", async () => {
    const { prisma, captured } = overviewPrisma([], []);
    const svc = new SettlementsService(prisma as unknown as PrismaService);
    const view = await svc.commissionOverview(new Date("2026-07-06T12:00:00Z"));

    expect(view.periodLabel).toBe("2026-06-29 – 2026-07-06");
    expect(captured.where).toMatchObject({ status: "completed", riderId: { not: null } });
    const range = captured.where!.completedAt as { gte: Date; lt: Date };
    expect(range.gte.toISOString().slice(0, 10)).toBe("2026-06-29");
    expect(range.lt.toISOString().slice(0, 10)).toBe("2026-07-06");
  });

  it("returns an empty overview (no riders, zeroed KPIs) when nothing completed in the window", async () => {
    const { prisma } = overviewPrisma([], []);
    const svc = new SettlementsService(prisma as unknown as PrismaService);
    const view = await svc.commissionOverview(new Date("2026-07-06T00:00:00Z"));
    expect(view.rows).toEqual([]);
    expect(view.kpis).toMatchObject({ rides: 0, fares: "0.00", commission: "0.00" });
  });
});
