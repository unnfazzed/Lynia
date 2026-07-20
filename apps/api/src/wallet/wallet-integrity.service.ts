import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { MetricsService, type WalletIntegrityDrift } from "../observability/metrics.service";
import { PrismaService } from "../prisma/prisma.service";

/** A single completeness violation the integrity sweep found. `ref` is a rider/top-up/ledger id kept
 *  in the structured log for operator lookup — NEVER emitted as a metric label (cardinality). */
export interface IntegrityViolation {
  kind: WalletIntegrityDrift;
  ref: string;
  detail: string;
}

/** The sweep's outcome. `ok` is the alertable summary bit; `violations` is capped in the log. */
export interface IntegrityReport {
  ok: boolean;
  accountsChecked: number;
  confirmedTopUps: number;
  driftByKind: Record<WalletIntegrityDrift, number>;
  violations: IntegrityViolation[];
}

/** Balances are Decimal(10,2); anything under half a cent is rounding noise, not drift. */
const DRIFT_EPSILON = new Prisma.Decimal("0.005");

/** Cap the violation list carried in the report/log so a systemic break can't emit a million rows. */
const MAX_REPORTED = 100;

/**
 * The nightly wallet ledger integrity job (roadmap 1.3 — implements the completeness invariant
 * docs/plans/2026-rider-wallet-design.md step 6 specifies but the wallet build never shipped).
 *
 * The ledger is the source of truth; `CommissionAccount.balance` is a cached running total. This
 * sweep asserts the ledger's *completeness*, not just that it internally balances — the Uber
 * accounting lesson ("every event must be accounted for"):
 *
 *   1. balance_mismatch     — every account's cached balance equals the sum of its ledger rows.
 *   2. missing_topup_credit — every confirmed TopUp has exactly one ledger credit (the unique
 *      `topUpId` already blocks *double* credits; this catches the *missing* direction).
 *   3. missing_receipt      — every ride_commission debit carries its ratePct + fare (the
 *      show-the-math receipt fields).
 *   4. orphan_topup_credit  — no ledger credit points at a TopUp that isn't confirmed.
 *
 * It is READ-ONLY: it never mutates money, only observes and alerts. Findings are logged with a
 * `wallet_integrity` tag and counted into `wallet_integrity_drift_total` (kind label) so 1.5's
 * alert can page on any nonzero drift. Comparisons use Prisma.Decimal, never JS floats.
 */
@Injectable()
export class WalletIntegrityService {
  private readonly logger = new Logger(WalletIntegrityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
  ) {}

  async runIntegrityCheck(): Promise<IntegrityReport> {
    const violations: IntegrityViolation[] = [];
    const driftByKind: Record<WalletIntegrityDrift, number> = {
      balance_mismatch: 0,
      missing_topup_credit: 0,
      missing_receipt: 0,
      orphan_topup_credit: 0,
    };
    const record = (kind: WalletIntegrityDrift, ref: string, detail: string) => {
      driftByKind[kind] += 1;
      if (violations.length < MAX_REPORTED) violations.push({ kind, ref, detail });
    };

    // (1) balance_mismatch — cached balance vs sum(ledger). One grouped query over the ledger, joined
    //     in memory to the accounts so a rider with zero ledger rows (sum absent) is still checked.
    const accounts = await this.prisma.commissionAccount.findMany({
      select: { riderId: true, balance: true },
    });
    const sums = await this.prisma.commissionLedger.groupBy({
      by: ["riderId"],
      _sum: { amount: true },
    });
    const sumByRider = new Map<string, Prisma.Decimal>();
    for (const row of sums) sumByRider.set(row.riderId, row._sum.amount ?? new Prisma.Decimal(0));
    for (const acct of accounts) {
      const ledgerSum = sumByRider.get(acct.riderId) ?? new Prisma.Decimal(0);
      if (acct.balance.minus(ledgerSum).abs().greaterThan(DRIFT_EPSILON)) {
        record(
          "balance_mismatch",
          acct.riderId,
          `balance=${acct.balance.toFixed(2)} ledgerSum=${ledgerSum.toFixed(2)}`,
        );
      }
    }

    // (2) missing_topup_credit — a confirmed TopUp with no ledger credit hanging off it.
    const confirmedTopUps = await this.prisma.topUp.count({ where: { status: "confirmed" } });
    const uncredited = await this.prisma.topUp.findMany({
      where: { status: "confirmed", ledgerEntry: { is: null } },
      select: { id: true, riderId: true, amount: true },
      take: MAX_REPORTED + 1,
    });
    for (const t of uncredited) {
      record("missing_topup_credit", t.id, `rider=${t.riderId} amount=${t.amount.toFixed(2)}`);
    }

    // (3) missing_receipt — a ride_commission debit without its show-the-math ratePct/fare.
    const missingReceipt = await this.prisma.commissionLedger.findMany({
      where: { type: "ride_commission", OR: [{ ratePct: null }, { fare: null }] },
      select: { id: true, orderId: true },
      take: MAX_REPORTED + 1,
    });
    for (const r of missingReceipt) {
      record("missing_receipt", r.id, `order=${r.orderId ?? "null"}`);
    }

    // (4) orphan_topup_credit — a ledger credit pointing at a TopUp that isn't confirmed.
    const orphanCredits = await this.prisma.commissionLedger.findMany({
      where: { topUpId: { not: null }, topUp: { status: { not: "confirmed" } } },
      select: { id: true, topUpId: true },
      take: MAX_REPORTED + 1,
    });
    for (const c of orphanCredits) {
      record("orphan_topup_credit", c.id, `topUp=${c.topUpId ?? "null"} not confirmed`);
    }

    const totalDrift = Object.values(driftByKind).reduce((a, b) => a + b, 0);
    const ok = totalDrift === 0;

    this.metrics.recordWalletIntegrityRun();
    for (const kind of Object.keys(driftByKind) as WalletIntegrityDrift[]) {
      this.metrics.recordWalletIntegrityDrift(kind, driftByKind[kind]);
    }

    if (ok) {
      this.logger.log(
        `wallet_integrity ok accounts=${accounts.length} confirmed_topups=${confirmedTopUps}`,
      );
    } else {
      // WARN, not throw: a drift is an alert-worthy money-visibility signal, not a request failure.
      // The scheduler treats a 200 with ok=false as success (it ran); 1.5 pages on the drift metric.
      this.logger.warn(
        `wallet_integrity DRIFT accounts=${accounts.length} confirmed_topups=${confirmedTopUps} ` +
          `drift=${JSON.stringify(driftByKind)} sample=${JSON.stringify(violations.slice(0, 10))}`,
      );
    }

    return {
      ok,
      accountsChecked: accounts.length,
      confirmedTopUps,
      driftByKind,
      violations,
    };
  }
}
