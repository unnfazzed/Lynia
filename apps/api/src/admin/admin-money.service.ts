import { ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { addMoney, freeJobsLeft, isCommissionActive, isFreeJob, jobCommissionBasis, perRideCommission, roundToCents } from "@lynia/shared";
import type { Prisma } from "@prisma/client";
import { domainEvents } from "../common/domain-events";
import { PrismaService } from "../prisma/prisma.service";
import { WalletService } from "../wallet/wallet.service";

/**
 * Admin console v2 §6 (docs/plans/2026-10-13-admin-console-v2.md): commission ↔ wallet ↔ top-ups, for ops.
 *
 * The ledger is the single truth. Everything here READS the ledger, the top-up intents and the domain events,
 * except the three top-up actions, which go through {@link WalletService} (its row locks, its exactly-once
 * credit) or write only a domain event + audit row. Nothing here moves money on its own.
 */

/** Rows per page of the top-ups list. */
export const TOPUP_PAGE_SIZE = 50;
/** Rows per page of a biker's statement (unchanged from the old wallet view). */
export const STATEMENT_PAGE_SIZE = 20;
/** The newest anomaly rows one anomaly filter looks through. A pilot sees a handful; this only bounds a flood. */
const ANOMALY_SCAN_LIMIT = 1000;
/** The negative-balance list's ceiling (oldest owed first, so the cut drops the most recent). */
const OWED_LIMIT = 500;
/** Ops' clock. Harare has no daylight saving (UTC+2 all year). */
const OPS_TZ = "Africa/Harare";

export const TOPUP_STATUS_FILTERS = ["pending", "confirmed", "declined", "expired"] as const;
export const TOPUP_ANOMALY_FILTERS = ["short_paid", "paid_on_declined"] as const;
export type TopupAnomalyKind = (typeof TOPUP_ANOMALY_FILTERS)[number];
export type TopupFilter = (typeof TOPUP_STATUS_FILTERS)[number] | TopupAnomalyKind;
export const TOPUP_FILTERS: readonly TopupFilter[] = [...TOPUP_STATUS_FILTERS, ...TOPUP_ANOMALY_FILTERS];

export interface AdminTopupRow {
  id: string;
  riderId: string;
  riderName: string;
  /** What the biker asked to add to the balance. */
  amount: string;
  /** The top-up fee (charged − what reached the balance), when one was charged. */
  fee: string | null;
  /** What the biker paid (or will pay): amount + fee, or Paynow's own figure once reported. */
  charged: string | null;
  rail: string;
  /** Paynow's reference. Null for a manual credit (its key is an admin idempotency key, not a receipt). */
  providerRef: string | null;
  status: string;
  declineReason: string | null;
  initiatedAt: string;
  resolvedAt: string | null;
  /** What the ledger credited for it (null until credited). */
  credited: string | null;
  /** An ops-recorded manual credit, not a Paynow intent. */
  manual: boolean;
  /** The latest anomaly Paynow raised on it, if any, and whether ops closed it. */
  anomaly: { kind: TopupAnomalyKind; paid: number | null; at: string; resolved: boolean } | null;
}

export interface AdminTopupsPage {
  rows: AdminTopupRow[];
  page: number;
  pageSize: number;
  hasMore: boolean;
  /** Chip counts: every status, and the anomalies still open (not credited, not marked resolved). */
  counts: Record<TopupFilter, number>;
}

/** An admin top-up action's body: the ConfirmModal reason code and optional note. */
export interface ReasonBody {
  reason: string;
  note?: string | null;
}

const money2 = (n: number): string => roundToCents(n).toFixed(2);
const dec = (d: Prisma.Decimal | null | undefined): number | null => (d == null ? null : Number(d));
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** YYYY-MM-DD in Harare. */
export function harareDay(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: OPS_TZ });
}

function isAnomalyKind(v: unknown): v is TopupAnomalyKind {
  return v === "short_paid" || v === "paid_on_declined";
}

function nameOf(p: { firstName: string; lastName: string } | null | undefined): string {
  return p ? `${p.firstName} ${p.lastName}`.trim() || "Unnamed biker" : "Unknown biker";
}

/** The money panel's day row. Every figure is a 2dp string; reversals and receivable are amounts (positive). */
export interface MoneyDay {
  day: string;
  topupsIn: string;
  fees: string;
  commission: string;
  manualCredits: string;
  reversals: string;
  freeJobs: number;
}

export interface MoneyPanel {
  days: number;
  ratePct: number;
  rows: MoneyDay[];
  totals: Omit<MoneyDay, "day">;
  /** Now, not per day: money bikers hold (sum of positive balances) and money they owe (sum of negatives). */
  float: string;
  receivable: string;
  owedCount: number;
  integrity: { at: string; ok: boolean; totalDrift: number; accountsChecked: number; drift: Record<string, number> } | null;
}

@Injectable()
export class AdminMoneyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
  ) {}

  // ── Top-ups ──────────────────────────────────────────────────────────────────────────────────────────

  /** The ids of top-ups with an open anomaly of `kind`: Paynow raised it, ops hasn't marked it resolved.
   *  (A credited one drops out at the query: it is `confirmed`.) */
  private async openAnomalyIds(kind: TopupAnomalyKind): Promise<string[]> {
    const raised = await this.prisma.domainEvent.findMany({
      where: { type: "topup.anomaly", data: { path: ["kind"], equals: kind } },
      orderBy: { createdAt: "desc" },
      take: ANOMALY_SCAN_LIMIT,
      select: { subjectId: true },
    });
    const ids = [...new Set(raised.map((e) => e.subjectId))];
    if (ids.length === 0) return [];
    const resolved = await this.prisma.domainEvent.findMany({
      where: { type: "topup.anomaly_resolved", subjectId: { in: ids } },
      select: { subjectId: true, data: true },
    });
    const closed = new Set(resolved.filter((e) => (e.data as { kind?: unknown } | null)?.kind === kind).map((e) => e.subjectId));
    return ids.filter((id) => !closed.has(id));
  }

  /** Top-up anomalies still open, every kind (the console's alert strip). Same rule as the list's chips. */
  async openAnomalyCount(): Promise<number> {
    let total = 0;
    for (const kind of TOPUP_ANOMALY_FILTERS) {
      const ids = await this.openAnomalyIds(kind);
      if (ids.length) total += await this.prisma.topUp.count({ where: { id: { in: ids }, status: { not: "confirmed" } } });
    }
    return total;
  }

  private async topupCounts(): Promise<Record<TopupFilter, number>> {
    const byStatus = await this.prisma.topUp.groupBy({ by: ["status"], _count: { _all: true } });
    const counts = Object.fromEntries(TOPUP_FILTERS.map((f) => [f, 0])) as Record<TopupFilter, number>;
    for (const g of byStatus) {
      if ((TOPUP_STATUS_FILTERS as readonly string[]).includes(g.status)) counts[g.status as TopupFilter] = g._count._all;
    }
    for (const kind of TOPUP_ANOMALY_FILTERS) {
      const ids = await this.openAnomalyIds(kind);
      counts[kind] = ids.length ? await this.prisma.topUp.count({ where: { id: { in: ids }, status: { not: "confirmed" } } }) : 0;
    }
    return counts;
  }

  /** Every top-up intent (Paynow and manual), newest first, a page at a time, optionally filtered. */
  async listTopups(filter?: TopupFilter, page = 1): Promise<AdminTopupsPage> {
    const p = Math.max(1, Math.floor(page));
    let where: Prisma.TopUpWhereInput = {};
    if (filter && isAnomalyKind(filter)) {
      where = { id: { in: await this.openAnomalyIds(filter) }, status: { not: "confirmed" } };
    } else if (filter) {
      where = { status: filter };
    }
    const found = await this.prisma.topUp.findMany({
      where,
      // id breaks initiatedAt ties so a page boundary never repeats or skips a row.
      orderBy: [{ initiatedAt: "desc" }, { id: "desc" }],
      skip: (p - 1) * TOPUP_PAGE_SIZE,
      take: TOPUP_PAGE_SIZE + 1,
      select: {
        id: true,
        riderId: true,
        rail: true,
        amount: true,
        charged: true,
        phone: true,
        providerRef: true,
        status: true,
        declineReason: true,
        initiatedAt: true,
        resolvedAt: true,
        rider: { select: { profile: { select: { firstName: true, lastName: true } } } },
        ledgerEntry: { select: { amount: true } },
      },
    });
    const hasMore = found.length > TOPUP_PAGE_SIZE;
    const rows = hasMore ? found.slice(0, TOPUP_PAGE_SIZE) : found;
    const events = rows.length
      ? await this.prisma.domainEvent.findMany({
          where: { subjectId: { in: rows.map((r) => r.id) }, type: { in: ["topup.anomaly", "topup.anomaly_resolved"] } },
          orderBy: { createdAt: "asc" },
          select: { subjectId: true, type: true, data: true, createdAt: true },
        })
      : [];
    const anomalyBy = new Map<string, AdminTopupRow["anomaly"]>();
    for (const e of events) {
      const data = (e.data ?? {}) as { kind?: unknown; paid?: unknown };
      if (!isAnomalyKind(data.kind)) continue;
      if (e.type === "topup.anomaly") {
        anomalyBy.set(e.subjectId, {
          kind: data.kind,
          paid: typeof data.paid === "number" ? data.paid : null,
          at: e.createdAt.toISOString(),
          resolved: false,
        });
      } else {
        const a = anomalyBy.get(e.subjectId);
        if (a && a.kind === data.kind) a.resolved = true;
      }
    }
    return {
      rows: rows.map((t) => {
        const amount = Number(t.amount);
        const credited = dec(t.ledgerEntry?.amount);
        const charged = dec(t.charged);
        const manual = t.phone == null;
        const base = credited ?? amount;
        const fee = charged != null && Math.round(charged * 100) > Math.round(base * 100) ? charged - base : null;
        return {
          id: t.id,
          riderId: t.riderId,
          riderName: nameOf(t.rider?.profile),
          amount: money2(amount),
          fee: fee != null ? money2(fee) : null,
          charged: charged != null ? money2(charged) : null,
          rail: t.rail,
          providerRef: manual || !t.providerRef || t.providerRef.startsWith("stub_") ? null : t.providerRef,
          status: t.status,
          declineReason: t.declineReason,
          initiatedAt: t.initiatedAt.toISOString(),
          resolvedAt: t.resolvedAt?.toISOString() ?? null,
          credited: credited != null ? money2(credited) : null,
          manual,
          anomaly: anomalyBy.get(t.id) ?? null,
        };
      }),
      page: p,
      pageSize: TOPUP_PAGE_SIZE,
      hasMore,
      counts: await this.topupCounts(),
    };
  }

  /** Ask Paynow about one top-up now, through the sweep's own path (`WalletService.reconcileTopup`). */
  async repollTopup(actor: string, id: string, body: ReasonBody): Promise<{ outcome: string; status: string }> {
    const topUp = await this.prisma.topUp.findUnique({ where: { id }, select: { id: true, status: true, phone: true, riderId: true } });
    if (!topUp) throw new NotFoundException("Top-up not found");
    if (topUp.phone == null) throw new ConflictException("A manual credit isn't a Paynow payment, so there is nothing to ask Paynow.");
    if (!this.wallet.topupRailLive) throw new ConflictException("Paynow isn't switched on here (PAYMENT_RAIL), so it can't be asked.");
    let outcome: string;
    try {
      outcome = await this.wallet.reconcileTopup(id);
    } catch {
      throw new ServiceUnavailableException("Couldn't reach Paynow. Try again in a minute.");
    }
    const after = await this.prisma.topUp.findUnique({ where: { id }, select: { status: true } });
    const status = after?.status ?? topUp.status;
    await this.prisma.auditLog.create({
      data: {
        actor,
        action: "topup.repoll",
        target: id,
        targetType: "topup",
        reasonCode: body.reason,
        note: body.note ?? null,
        before: { status: topUp.status },
        after: { status, outcome },
      },
    });
    return { outcome, status };
  }

  /** Credit what Paynow reported paid on a short-paid / paid-on-declined top-up (exactly once, in WalletService). */
  creditTopupShortfall(actor: string, id: string, body: ReasonBody) {
    return this.wallet.creditTopupShortfall({ topUpId: id, actorProfileId: actor, reasonCode: body.reason, note: body.note ?? null });
  }

  /**
   * Close an open anomaly without crediting it (ops sorted it out another way). Writes a
   * `topup.anomaly_resolved` event (the list's filter reads it) and the audit row, in one transaction.
   * Idempotent: an anomaly already closed returns `alreadyResolved`.
   */
  async resolveTopupAnomaly(actor: string, id: string, body: ReasonBody): Promise<{ resolved: true; alreadyResolved: boolean }> {
    const topUp = await this.prisma.topUp.findUnique({ where: { id }, select: { id: true, riderId: true, status: true } });
    if (!topUp) throw new NotFoundException("Top-up not found");
    const events = await this.prisma.domainEvent.findMany({
      where: { subjectId: id, type: { in: ["topup.anomaly", "topup.anomaly_resolved"] } },
      orderBy: { createdAt: "desc" },
      select: { type: true, data: true },
    });
    const latest = events.find((e) => e.type === "topup.anomaly");
    const kind = (latest?.data as { kind?: unknown } | null)?.kind;
    if (!latest || !isAnomalyKind(kind)) throw new ConflictException("Paynow raised nothing on this top-up, so there is nothing to resolve.");
    const already = events.some((e) => e.type === "topup.anomaly_resolved" && (e.data as { kind?: unknown } | null)?.kind === kind);
    if (already) return { resolved: true, alreadyResolved: true };
    await this.prisma.$transaction(async (tx) => {
      await domainEvents.record(tx, {
        type: "topup.anomaly_resolved",
        actorId: actor,
        actorRole: "admin",
        subjectType: "topup",
        subjectId: id,
        data: { kind, reasonCode: body.reason, riderId: topUp.riderId },
      });
      await tx.auditLog.create({
        data: {
          actor,
          action: "topup.anomaly_resolve",
          target: id,
          targetType: "topup",
          reasonCode: body.reason,
          note: body.note ?? null,
          before: { anomaly: kind, status: topUp.status },
          after: { anomaly: null, status: topUp.status },
        },
      });
    });
    return { resolved: true, alreadyResolved: false };
  }

  // ── Biker statement ──────────────────────────────────────────────────────────────────────────────────

  /**
   * One biker's statement: the ledger (newest first, paged by cursor) with each row's order / top-up, rate and
   * basis, and who wrote it; plus a header: balance, free jobs left, the commission still to come on jobs
   * delivered but not yet closed, and the last top-up. A superset of the old wallet view (same fields kept).
   */
  async statement(riderId: string, cursor?: string) {
    const [account, rows, rider] = await Promise.all([
      this.prisma.commissionAccount.findUnique({ where: { riderId }, select: { balance: true } }),
      this.prisma.commissionLedger.findMany({
        where: { riderId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: STATEMENT_PAGE_SIZE + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
          id: true,
          type: true,
          amount: true,
          balanceAfter: true,
          note: true,
          actor: true,
          orderId: true,
          ratePct: true,
          fare: true,
          reversesId: true,
          createdAt: true,
          topUp: { select: { id: true, rail: true, providerRef: true, amount: true, charged: true, phone: true } },
        },
      }),
      this.prisma.rider.findUnique({ where: { profileId: riderId }, select: { tripsCount: true } }),
    ]);
    const hasMore = rows.length > STATEMENT_PAGE_SIZE;
    const page = hasMore ? rows.slice(0, STATEMENT_PAGE_SIZE) : rows;

    // Who wrote each row: an admin profile id reads as their name; "system" and operator emails as they are.
    const actorIds = [...new Set(page.map((l) => l.actor).filter((a): a is string => !!a && UUID_RE.test(a)))];
    const actors = actorIds.length
      ? await this.prisma.profile.findMany({ where: { id: { in: actorIds } }, select: { id: true, firstName: true, lastName: true } })
      : [];
    const actorName = new Map(actors.map((a) => [a.id, nameOf(a)]));
    // How much of each credit on this page has been reversed already (so the console can cap a new reversal).
    const creditIds = page.filter((l) => Number(l.amount) > 0 && l.type !== "reversal").map((l) => l.id);
    const reversed = creditIds.length
      ? await this.prisma.commissionLedger.groupBy({
          by: ["reversesId"],
          where: { riderId, type: "reversal", reversesId: { in: creditIds } },
          _sum: { amount: true },
        })
      : [];
    const reversedBy = new Map(reversed.map((g) => [g.reversesId, -Number(g._sum.amount ?? 0)]));

    return {
      // Always 2dp (Decimal(10,2).toString() keeps scale; the no-account fallback is an explicit "0.00").
      balance: account ? account.balance.toString() : "0.00",
      ledger: page.map((l) => {
        const t = l.topUp;
        const credited = Number(l.amount);
        const charged = dec(t?.charged);
        const fee = charged != null && Math.round(charged * 100) > Math.round(credited * 100) ? charged - credited : null;
        const manual = t ? t.phone == null : false;
        return {
          id: l.id,
          type: l.type,
          amount: l.amount.toString(),
          balanceAfter: l.balanceAfter.toString(),
          note: l.note ?? null,
          actor: l.actor ?? null,
          actorName: l.actor ? (actorName.get(l.actor) ?? l.actor) : null,
          orderId: l.orderId ?? null,
          ratePct: l.ratePct?.toString() ?? null,
          fare: l.fare?.toString() ?? null,
          reversesId: l.reversesId ?? null,
          reversed: reversedBy.has(l.id) ? money2(reversedBy.get(l.id)!) : null,
          topUp: t
            ? {
                id: t.id,
                rail: t.rail,
                manual,
                ref: manual || !t.providerRef || t.providerRef.startsWith("stub_") ? null : t.providerRef,
                charged: charged != null ? money2(charged) : null,
                fee: fee != null ? money2(fee) : null,
              }
            : null,
          at: l.createdAt.toISOString(),
        };
      }),
      nextCursor: hasMore ? page[page.length - 1]!.id : null,
      summary: await this.statementSummary(riderId, rider?.tripsCount ?? 0),
    };
  }

  /**
   * The statement header. `pendingCommission` mirrors chargeCommission: nothing while the rate is 0%; otherwise
   * each delivered-but-not-closed job, in the order it was delivered, takes the next job number, and a job
   * inside the free allowance projects $0 — the rest rate% of their basis (parcel fare, merchant delivery fee).
   */
  private async statementSummary(riderId: string, tripsCount: number) {
    const ratePct = this.wallet.ratePct;
    const [delivered, lastTopup] = await Promise.all([
      this.prisma.order.findMany({
        where: { riderId, status: "delivered" },
        orderBy: [{ deliveredAt: "asc" }, { id: "asc" }],
        take: 200,
        select: { id: true, orderType: true, agreedFare: true, suggestedFare: true, deliveryFee: true },
      }),
      this.prisma.topUp.findFirst({
        where: { riderId, status: "confirmed" },
        orderBy: [{ resolvedAt: "desc" }, { initiatedAt: "desc" }],
        select: { id: true, amount: true, rail: true, phone: true, resolvedAt: true, initiatedAt: true, ledgerEntry: { select: { amount: true } } },
      }),
    ]);
    let pending = 0;
    if (isCommissionActive(ratePct)) {
      delivered.forEach((o, i) => {
        if (isFreeJob(tripsCount + i + 1)) return;
        const basis = jobCommissionBasis({
          orderType: o.orderType,
          agreedFare: dec(o.agreedFare),
          suggestedFare: dec(o.suggestedFare),
          deliveryFee: dec(o.deliveryFee),
        });
        if (basis != null) pending = addMoney(pending, perRideCommission(basis, ratePct));
      });
    }
    return {
      ratePct,
      commissionActive: isCommissionActive(ratePct),
      tripsCount,
      freeJobsLeft: freeJobsLeft(tripsCount),
      pendingCommission: money2(pending),
      pendingJobs: delivered.length,
      lastTopup: lastTopup
        ? {
            id: lastTopup.id,
            amount: money2(Number(lastTopup.ledgerEntry?.amount ?? lastTopup.amount)),
            rail: lastTopup.rail,
            manual: lastTopup.phone == null,
            at: (lastTopup.resolvedAt ?? lastTopup.initiatedAt).toISOString(),
          }
        : null,
    };
  }

  /** An admin correction against a biker: a capped, reason-coded `reversal` (in WalletService). */
  reverse(actor: string, riderId: string, body: { amount: number; reason: string; note: string; entryId?: string | null; idempotencyKey: string }) {
    return this.wallet.reverseEntry({
      riderId,
      amount: body.amount,
      reasonCode: body.reason,
      note: body.note,
      entryId: body.entryId ?? null,
      idemKey: body.idempotencyKey,
      actorProfileId: actor,
    });
  }

  // ── Platform money panel ─────────────────────────────────────────────────────────────────────────────

  /**
   * The platform's money by Harare day over the last `days` (7 or 30), from the ledger:
   *  - top-ups in: Paynow top-up credits (an app intent, which always carries the biker's number);
   *  - fees: on those, what the biker paid on top of what reached the balance;
   *  - commission: ride_commission debits plus fare-adjust deltas on an order (sign flipped: earned is positive);
   *  - manual credits: ops-recorded credits (a manual top-up), starting credits and order-less adjustments;
   *  - reversals: admin reversals (as a positive amount taken back); free jobs: the $0 receipts.
   * Plus, as of now: the float (positive balances), the receivable (negative balances, as owed) and the last
   * integrity sweep.
   */
  async moneyPanel(days: number, ref: Date = new Date()): Promise<MoneyPanel> {
    const span = days === 30 ? 30 : 7;
    const sums = await this.prisma.$queryRaw<
      Array<{ day: string; topups_in: string; fees: string; commission: string; manual_credits: string; reversals: string; free_jobs: number }>
    >`
      SELECT to_char((l.created_at AT TIME ZONE 'Africa/Harare')::date, 'YYYY-MM-DD') AS day,
        COALESCE(SUM(l.amount) FILTER (WHERE l.type = 'topup' AND t.phone IS NOT NULL), 0)::text AS topups_in,
        COALESCE(SUM(GREATEST(t.charged - l.amount, 0)) FILTER (WHERE l.type = 'topup' AND t.phone IS NOT NULL AND t.charged IS NOT NULL), 0)::text AS fees,
        COALESCE(-SUM(l.amount) FILTER (WHERE l.type = 'ride_commission' OR (l.type = 'adjustment' AND l.order_id IS NOT NULL)), 0)::text AS commission,
        COALESCE(SUM(l.amount) FILTER (WHERE (l.type = 'topup' AND (t.id IS NULL OR t.phone IS NULL)) OR l.type = 'grace' OR (l.type = 'adjustment' AND l.order_id IS NULL)), 0)::text AS manual_credits,
        COALESCE(-SUM(l.amount) FILTER (WHERE l.type = 'reversal'), 0)::text AS reversals,
        (COUNT(*) FILTER (WHERE l.type = 'free_job'))::int AS free_jobs
      FROM commission_ledger l
      LEFT JOIN top_ups t ON t.id = l.top_up_id
      WHERE l.created_at >= ((((${ref}::timestamptz AT TIME ZONE 'Africa/Harare')::date) - ${span - 1}::int)::timestamp AT TIME ZONE 'Africa/Harare')
        AND l.created_at <= ${ref}::timestamptz
      GROUP BY 1`;
    const byDay = new Map(sums.map((s) => [s.day, s]));
    const rows: MoneyDay[] = [];
    const totals = { topupsIn: 0, fees: 0, commission: 0, manualCredits: 0, reversals: 0, freeJobs: 0 };
    for (let k = 0; k < span; k++) {
      const day = harareDay(new Date(ref.getTime() - k * 86_400_000));
      const s = byDay.get(day);
      const row = {
        topupsIn: Number(s?.topups_in ?? 0),
        fees: Number(s?.fees ?? 0),
        commission: Number(s?.commission ?? 0),
        manualCredits: Number(s?.manual_credits ?? 0),
        reversals: Number(s?.reversals ?? 0),
        freeJobs: Number(s?.free_jobs ?? 0),
      };
      totals.topupsIn = addMoney(totals.topupsIn, row.topupsIn);
      totals.fees = addMoney(totals.fees, row.fees);
      totals.commission = addMoney(totals.commission, row.commission);
      totals.manualCredits = addMoney(totals.manualCredits, row.manualCredits);
      totals.reversals = addMoney(totals.reversals, row.reversals);
      totals.freeJobs += row.freeJobs;
      rows.push({
        day,
        topupsIn: money2(row.topupsIn),
        fees: money2(row.fees),
        commission: money2(row.commission),
        manualCredits: money2(row.manualCredits),
        reversals: money2(row.reversals),
        freeJobs: row.freeJobs,
      });
    }
    const [positive, negative, lastCheck] = await Promise.all([
      this.prisma.commissionAccount.aggregate({ where: { balance: { gt: 0 } }, _sum: { balance: true } }),
      this.prisma.commissionAccount.aggregate({ where: { balance: { lt: 0 } }, _sum: { balance: true }, _count: { _all: true } }),
      this.prisma.domainEvent.findFirst({
        where: { type: "wallet.integrity_check" },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true, data: true },
      }),
    ]);
    const check = (lastCheck?.data ?? null) as Record<string, unknown> | null;
    const drift: Record<string, number> = {};
    if (check) {
      for (const [k, v] of Object.entries(check)) {
        if (!["ok", "accountsChecked", "confirmedTopUps", "totalDrift"].includes(k) && typeof v === "number") drift[k] = v;
      }
    }
    return {
      days: span,
      ratePct: this.wallet.ratePct,
      rows,
      totals: {
        topupsIn: money2(totals.topupsIn),
        fees: money2(totals.fees),
        commission: money2(totals.commission),
        manualCredits: money2(totals.manualCredits),
        reversals: money2(totals.reversals),
        freeJobs: totals.freeJobs,
      },
      float: money2(Number(positive._sum.balance ?? 0)),
      receivable: money2(-Number(negative._sum.balance ?? 0)),
      owedCount: negative._count._all,
      integrity:
        lastCheck && check
          ? {
              at: lastCheck.createdAt.toISOString(),
              ok: check.ok === true,
              totalDrift: typeof check.totalDrift === "number" ? check.totalDrift : 0,
              accountsChecked: typeof check.accountsChecked === "number" ? check.accountsChecked : 0,
              drift,
            }
          : null,
    };
  }

  /** The money panel's days as CSV (oldest day first), for a spreadsheet. */
  async moneyCsv(days: number, ref: Date = new Date()): Promise<string> {
    const panel = await this.moneyPanel(days, ref);
    const lines = ["day,top_ups_in,fees,commission,manual_credits,reversals,free_jobs"];
    for (const r of [...panel.rows].reverse()) {
      lines.push([r.day, r.topupsIn, r.fees, r.commission, r.manualCredits, r.reversals, r.freeJobs].join(","));
    }
    lines.push(["total", panel.totals.topupsIn, panel.totals.fees, panel.totals.commission, panel.totals.manualCredits, panel.totals.reversals, panel.totals.freeJobs].join(","));
    return `${lines.join("\n")}\n`;
  }

  // ── Money owed ───────────────────────────────────────────────────────────────────────────────────────

  /**
   * Bikers whose balance is below zero, the longest-owing first. "Since" is the first ledger row after the
   * last one that left the balance at or above zero (or the first row ever, for an account never in credit).
   */
  async owed() {
    const accounts = await this.prisma.$queryRaw<Array<{ rider_id: string; balance: string; negative_since: Date | null }>>`
      SELECT a.rider_id::text AS rider_id, a.balance::text AS balance,
        (SELECT min(l.created_at) FROM commission_ledger l
          WHERE l.rider_id = a.rider_id
            AND l.created_at > COALESCE(
              (SELECT max(l2.created_at) FROM commission_ledger l2 WHERE l2.rider_id = a.rider_id AND l2.balance_after >= 0),
              '-infinity'::timestamptz)) AS negative_since
      FROM commission_accounts a
      WHERE a.balance < 0
      ORDER BY negative_since ASC NULLS LAST, a.rider_id ASC
      LIMIT ${OWED_LIMIT}`;
    const ids = accounts.map((a) => a.rider_id);
    if (ids.length === 0) return { rows: [], total: "0.00" };
    const [profiles, lastJobs, lastTopups] = await Promise.all([
      this.prisma.profile.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true, phone: true } }),
      this.prisma.order.groupBy({
        by: ["riderId"],
        where: { riderId: { in: ids }, status: { in: ["delivered", "completed"] } },
        _max: { deliveredAt: true },
      }),
      this.prisma.topUp.groupBy({ by: ["riderId"], where: { riderId: { in: ids }, status: "confirmed" }, _max: { resolvedAt: true } }),
    ]);
    const profileBy = new Map(profiles.map((p) => [p.id, p]));
    const jobBy = new Map(lastJobs.map((j) => [j.riderId, j._max.deliveredAt]));
    const topupBy = new Map(lastTopups.map((t) => [t.riderId, t._max.resolvedAt]));
    let total = 0;
    const rows = accounts.map((a) => {
      const owed = -Number(a.balance);
      total = addMoney(total, owed);
      const p = profileBy.get(a.rider_id);
      return {
        riderId: a.rider_id,
        name: nameOf(p),
        phone: p?.phone ?? null,
        owed: money2(owed),
        negativeSince: a.negative_since ? new Date(a.negative_since).toISOString() : null,
        lastJobAt: jobBy.get(a.rider_id)?.toISOString() ?? null,
        lastTopupAt: topupBy.get(a.rider_id)?.toISOString() ?? null,
      };
    });
    return { rows, total: money2(total) };
  }
}
