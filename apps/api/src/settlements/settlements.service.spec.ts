import { COMMISSION, perRideCommission } from "@lynia/shared";
import { describe, expect, it } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { SettlementsService } from "./settlements.service";

/**
 * A Prisma double for the commission overview: `order.findMany` returns the individual completed rides
 * (the service now sums commission per ride, not off a groupBy aggregate) and `profile.findMany`
 * resolves rider names. Each input group `{riderId, fares, rides}` is expanded into `rides` orders whose
 * fares are split evenly so they sum to `fares`, each given a stable `o<riderId>-<i>` id. `captured`
 * records the findMany `where` so we can assert the trailing-7-day window. `ledgerRows` (WD-006) lets a
 * test simulate actual `CommissionLedger` charges — defaults to none (today's 0%-launch-rate reality,
 * where the console falls back to the fare × rate projection for every order). WD-015: this fake ignores
 * the real `where: { orderId: { in: [...] } } }` filter `commissionOverview` applies — it returns exactly
 * the rows a test passes in — so these fixtures only exercise the JS aggregation, not whether Postgres
 * would actually hand back an `adjustment` row. Before WD-015, `adjustCommissionInTx` wrote every
 * adjustment row with `orderId: null`, which an `IN (...)` filter never matches — so the "nets a
 * fare-adjust" test below was asserting behavior against a fixture the real DB could never have produced.
 * `adjustCommissionInTx` now writes the real orderId (see wallet.service.spec.ts's WD-015 case), closing
 * that gap between the fake and reality.
 */
function overviewPrisma(
  groups: Array<{ riderId: string | null; fares: number; rides: number }>,
  profiles: Array<{ id: string; firstName: string; lastName: string }>,
  ledgerRows: Array<{ orderId: string; amount: number }> = [],
) {
  const captured: { where: Record<string, unknown> | null } = { where: null };
  const orders = groups.flatMap((g, gi) =>
    Array.from({ length: g.rides }, (_, i) => ({ id: `o${gi}-${i}`, riderId: g.riderId, agreedFare: g.fares / g.rides })),
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
    commissionLedger: {
      findMany: async () => ledgerRows,
    },
  };
  return { prisma, captured, orders };
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

  it("windows on the last 7 calendar days INCLUDING the current day, and only counts completed rides", async () => {
    const { prisma, captured } = overviewPrisma([], []);
    const svc = new SettlementsService(prisma as unknown as PrismaService);
    const view = await svc.commissionOverview(new Date("2026-07-06T12:00:00Z"));

    // The current (partial) day is covered — a ride completed this morning must show up — and the
    // label's inclusive last day matches what the query covers (exclusive end = start of tomorrow).
    expect(view.periodLabel).toBe("2026-06-30 – 2026-07-06");
    expect(captured.where).toMatchObject({ status: "completed", riderId: { not: null } });
    const range = captured.where!.completedAt as { gte: Date; lt: Date };
    expect(range.gte.toISOString()).toBe("2026-06-30T00:00:00.000Z");
    expect(range.lt.toISOString()).toBe("2026-07-07T00:00:00.000Z");
  });

  it("window month-boundary: a ref early in the month reaches back into the previous month", async () => {
    const { prisma, captured } = overviewPrisma([], []);
    const svc = new SettlementsService(prisma as unknown as PrismaService);
    const view = await svc.commissionOverview(new Date("2026-07-02T08:00:00Z"));
    expect(view.periodLabel).toBe("2026-06-26 – 2026-07-02");
    const range = captured.where!.completedAt as { gte: Date; lt: Date };
    expect(range.gte.toISOString()).toBe("2026-06-26T00:00:00.000Z");
    expect(range.lt.toISOString()).toBe("2026-07-03T00:00:00.000Z");
  });

  it("returns an empty overview (no riders, zeroed KPIs) when nothing completed in the window", async () => {
    const { prisma } = overviewPrisma([], []);
    const svc = new SettlementsService(prisma as unknown as PrismaService);
    const view = await svc.commissionOverview(new Date("2026-07-06T00:00:00Z"));
    expect(view.rows).toEqual([]);
    expect(view.kpis).toMatchObject({ rides: 0, fares: "0.00", commission: "0.00" });
  });

  it("WD-006: prefers the actual ledger charge over the current-rate projection, so a rate change mid-window doesn't re-price an already-charged ride", async () => {
    // Order o0-0 ($50 fare) was charged $5.00 commission (10% — the rate AT THE TIME). The live rate has
    // since moved to 20%; without the ledger reconciliation this order would be re-priced to $10.00 here,
    // silently drifting from what was actually debited from the rider's wallet.
    const { prisma, orders } = overviewPrisma(
      [{ riderId: "r1", fares: 50, rides: 1 }],
      [{ id: "r1", firstName: "Tendai", lastName: "M" }],
      [{ orderId: "o0-0", amount: -5 }],
    );
    expect(orders[0]!.id).toBe("o0-0");
    const svc = new SettlementsService(prisma as unknown as PrismaService);
    const view = await svc.commissionOverview(new Date("2026-07-06T00:00:00Z"), 20);
    expect(view.rows[0]).toMatchObject({ riderId: "r1", fares: "50.00", commission: "5.00" });
    expect(view.kpis.commission).toBe("5.00");
  });

  it("WD-006: nets a fare-adjust's compensating adjustment row into the reconciled figure", async () => {
    // Charged $5.00 (ride_commission), then corrected down by $1.00 (adjustment credit) — the console
    // must show the NET $4.00 actually collected, not the original pre-correction $5.00.
    const { prisma } = overviewPrisma(
      [{ riderId: "r1", fares: 50, rides: 1 }],
      [{ id: "r1", firstName: "Tendai", lastName: "M" }],
      [
        { orderId: "o0-0", amount: -5 },
        { orderId: "o0-0", amount: 1 },
      ],
    );
    const svc = new SettlementsService(prisma as unknown as PrismaService);
    const view = await svc.commissionOverview(new Date("2026-07-06T00:00:00Z"), 10);
    expect(view.rows[0]!.commission).toBe("4.00");
  });

  it("WD-006: falls back to the current-rate projection for an order with no ledger row (the 0% launch period)", async () => {
    const { prisma } = overviewPrisma(
      [{ riderId: "r1", fares: 100, rides: 1 }],
      [{ id: "r1", firstName: "Tendai", lastName: "M" }],
      [], // no ledger rows — chargeCommission writes none at 0%
    );
    const svc = new SettlementsService(prisma as unknown as PrismaService);
    const view = await svc.commissionOverview(new Date("2026-07-06T00:00:00Z"), 10);
    expect(view.rows[0]!.commission).toBe(perRideCommission(100, 10).toFixed(2));
  });
});
