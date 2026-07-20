import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import type { MetricsService } from "../observability/metrics.service";
import type { PrismaService } from "../prisma/prisma.service";
import { WalletIntegrityService } from "./wallet-integrity.service";

const dec = (n: string | number) => new Prisma.Decimal(n);

/** Build a WalletIntegrityService over a stub prisma + a spy metrics. `p` supplies just the query
 *  results each test needs; commissionLedger.findMany is dispatched by its `where` (two call sites). */
function build(p: {
  accounts?: Array<{ riderId: string; balance: Prisma.Decimal }>;
  sums?: Array<{ riderId: string; _sum: { amount: Prisma.Decimal | null } }>;
  confirmedTopUps?: number;
  uncredited?: Array<{ id: string; riderId: string; amount: Prisma.Decimal }>;
  missingReceipt?: Array<{ id: string; orderId: string | null }>;
  orphanCredits?: Array<{ id: string; topUpId: string | null }>;
}) {
  const metrics = {
    recordWalletIntegrityRun: vi.fn(),
    recordWalletIntegrityDrift: vi.fn(),
  } as unknown as MetricsService;

  const prisma = {
    commissionAccount: {
      findMany: vi.fn().mockResolvedValue(p.accounts ?? []),
    },
    commissionLedger: {
      groupBy: vi.fn().mockResolvedValue(p.sums ?? []),
      findMany: vi.fn((args: { where?: { type?: string } }) =>
        // The receipt sweep filters on type=ride_commission; the orphan sweep filters on topUpId.
        Promise.resolve(args?.where?.type === "ride_commission" ? (p.missingReceipt ?? []) : (p.orphanCredits ?? [])),
      ),
    },
    topUp: {
      count: vi.fn().mockResolvedValue(p.confirmedTopUps ?? 0),
      findMany: vi.fn().mockResolvedValue(p.uncredited ?? []),
    },
  } as unknown as PrismaService;

  return { svc: new WalletIntegrityService(prisma, metrics), metrics };
}

describe("WalletIntegrityService.runIntegrityCheck", () => {
  it("reports ok on a consistent ledger and still records a run (the alert denominator)", async () => {
    const { svc, metrics } = build({
      accounts: [{ riderId: "r1", balance: dec("10.00") }],
      sums: [{ riderId: "r1", _sum: { amount: dec("10.00") } }],
      confirmedTopUps: 3,
    });
    const report = await svc.runIntegrityCheck();
    expect(report.ok).toBe(true);
    expect(report.accountsChecked).toBe(1);
    expect(report.violations).toHaveLength(0);
    expect(metrics.recordWalletIntegrityRun).toHaveBeenCalledOnce();
    // The service reports every kind's count to the metric (which itself drops zeros); a clean run
    // therefore reports 0 for each kind — the emit-suppression is asserted in the MetricsService unit.
    expect(metrics.recordWalletIntegrityDrift).toHaveBeenCalledWith("balance_mismatch", 0);
  });

  it("treats a sub-half-cent difference as rounding noise, not drift", async () => {
    const { svc } = build({
      accounts: [{ riderId: "r1", balance: dec("10.00") }],
      sums: [{ riderId: "r1", _sum: { amount: dec("10.004") } }],
    });
    expect((await svc.runIntegrityCheck()).ok).toBe(true);
  });

  it("flags balance_mismatch when cached balance diverges from the ledger sum", async () => {
    const { svc, metrics } = build({
      accounts: [{ riderId: "r1", balance: dec("10.00") }],
      sums: [{ riderId: "r1", _sum: { amount: dec("7.50") } }],
    });
    const report = await svc.runIntegrityCheck();
    expect(report.ok).toBe(false);
    expect(report.driftByKind.balance_mismatch).toBe(1);
    expect(report.violations[0]).toMatchObject({ kind: "balance_mismatch", ref: "r1" });
    expect(metrics.recordWalletIntegrityDrift).toHaveBeenCalledWith("balance_mismatch", 1);
  });

  it("checks an account with zero ledger rows against a zero balance", async () => {
    const { svc } = build({
      accounts: [
        { riderId: "clean", balance: dec("0") },
        { riderId: "bad", balance: dec("5.00") }, // no ledger rows but nonzero balance → drift
      ],
      sums: [],
    });
    const report = await svc.runIntegrityCheck();
    expect(report.driftByKind.balance_mismatch).toBe(1);
    expect(report.violations[0].ref).toBe("bad");
  });

  it("flags a confirmed top-up with no ledger credit (the missing-credit direction)", async () => {
    const { svc } = build({
      accounts: [],
      confirmedTopUps: 2,
      uncredited: [{ id: "t1", riderId: "r1", amount: dec("5.00") }],
    });
    const report = await svc.runIntegrityCheck();
    expect(report.ok).toBe(false);
    expect(report.driftByKind.missing_topup_credit).toBe(1);
    expect(report.confirmedTopUps).toBe(2);
  });

  it("flags a ride_commission debit missing its receipt fields", async () => {
    const { svc } = build({
      accounts: [],
      missingReceipt: [{ id: "l1", orderId: "o1" }],
    });
    const report = await svc.runIntegrityCheck();
    expect(report.driftByKind.missing_receipt).toBe(1);
  });

  it("flags a ledger credit tied to a non-confirmed top-up", async () => {
    const { svc } = build({
      accounts: [],
      orphanCredits: [{ id: "l9", topUpId: "t9" }],
    });
    const report = await svc.runIntegrityCheck();
    expect(report.driftByKind.orphan_topup_credit).toBe(1);
  });
});
