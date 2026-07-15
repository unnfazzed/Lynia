import { ForbiddenException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import {
  COMMISSION,
  type CommissionConfig,
  type CreateTopupRequest,
  isCommissionActive,
  perRideCommission,
  resolveCommissionRatePct,
  type Topup,
  TOPUP_WINDOW_MS,
  type TopupRail,
  type Wallet,
  type WalletEntry,
  type WalletEntryType,
  type WalletLedgerPage,
} from "@lynia/shared";
import { Prisma } from "@prisma/client";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";

/** Page size for the ledger history feed. */
const LEDGER_PAGE_SIZE = 25;

/** 2dp round — the same money rounding the rest of the API uses (mirrors settlements.service). */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Decimal | null → number | undefined, for the wire shape (contracts type money as plain numbers). */
function num(d: Prisma.Decimal | number | null | undefined): number | undefined {
  return d == null ? undefined : Number(d);
}

const RAIL_LABEL: Record<TopupRail, string> = {
  ecocash: "EcoCash",
  innbucks: "InnBucks",
  omari: "O'mari",
  manual: "Cash / manual credit",
};

/**
 * The prepaid commission wallet (design docs/plans/2026-rider-wallet-design.md — PR1 core).
 *
 * Owns the rider's commission float: the per-ride debit written in the completion transaction
 * ({@link chargeCommission}), the balance + append-only ledger reads, the top-up intents, and the
 * credit primitive both the (later) rail poller and the admin manual-credit path share. Money moves
 * only through {@link creditAccount}, which takes a row lock and writes one immutable ledger row per
 * balance change, so the cached `balance` is always reconstructable by summing the ledger.
 *
 * The rate is server-authoritative (design 2A): resolved ONCE from the `COMMISSION_RATE_PCT` env
 * override (the "flip"), never a hardcoded constant, and served to every client in {@link getConfig}.
 */
@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
  ) {}

  /** The resolved live commission rate (%) — the env "flip" value, clamped, or the launch default (0). */
  get ratePct(): number {
    return resolveCommissionRatePct(this.env.COMMISSION_RATE_PCT);
  }

  /** Whether the rider-facing wallet surfaces are revealed: the reveal flag, or once the rate flips. */
  get walletEnabled(): boolean {
    return this.env.WALLET_REVEAL === "true" || isCommissionActive(this.ratePct);
  }

  /** The feature flag + policy every client reads (server-authoritative — clients never hardcode a rate). */
  getConfig(): CommissionConfig {
    return {
      enabled: this.walletEnabled,
      ratePct: this.ratePct,
      floor: COMMISSION.lowBalanceBlockBelow,
      graceCredit: COMMISSION.graceCredit,
      minTopUp: COMMISSION.minTopUp,
      maxTopUp: COMMISSION.maxTopUp,
    };
  }

  /** The rider's prepaid balance. A never-touched account reads as $0 (lazily created on first credit/
   *  debit), so a pre-flip rider still gets a clean balance screen without a row existing. */
  async getWallet(riderId: string): Promise<Wallet> {
    const account = await this.prisma.commissionAccount.findUnique({
      where: { riderId },
      select: { balance: true, updatedAt: true },
    });
    return {
      balance: account ? round2(Number(account.balance)) : 0,
      currency: "USD",
      updatedAt: (account?.updatedAt ?? new Date()).toISOString(),
    };
  }

  /** Reverse-chronological ledger page. Cursor is the last entry id from the previous page. */
  async getLedger(riderId: string, cursor?: string): Promise<WalletLedgerPage> {
    const rows = await this.prisma.commissionLedger.findMany({
      where: { riderId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: LEDGER_PAGE_SIZE + 1,
      include: { topUp: { select: { rail: true, providerRef: true } } },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > LEDGER_PAGE_SIZE;
    const page = hasMore ? rows.slice(0, LEDGER_PAGE_SIZE) : rows;
    return {
      entries: page.map((r) => this.toEntry(r)),
      nextCursor: hasMore ? page[page.length - 1]!.id : undefined,
    };
  }

  /** Map a ledger row to the rider-facing receipt shape (Decimal → number; type-specific title/meta).
   *  The stored `ride_commission` enum surfaces as the contract's `commission` type. */
  private toEntry(r: {
    id: string;
    type: string;
    amount: Prisma.Decimal;
    balanceAfter: Prisma.Decimal;
    orderId: string | null;
    ratePct: Prisma.Decimal | null;
    fare: Prisma.Decimal | null;
    note: string | null;
    createdAt: Date;
    topUp?: { rail: string; providerRef: string | null } | null;
  }): WalletEntry {
    const type: WalletEntryType = r.type === "ride_commission" ? "commission" : (r.type as WalletEntryType);
    const rate = num(r.ratePct);
    const fare = num(r.fare);
    const rail = r.topUp?.rail as TopupRail | undefined;
    let title: string;
    let meta: string;
    switch (type) {
      case "commission":
        title = "Commission";
        meta = rate != null && fare != null ? `${rate}% of $${fare.toFixed(2)}` : "Per-ride commission";
        break;
      case "topup":
        title = "Top-up";
        meta = rail ? RAIL_LABEL[rail] : "Top-up";
        break;
      case "grace":
        title = "Starting credit";
        meta = r.note ?? "Added to get you started";
        break;
      case "adjustment":
        title = "Adjustment";
        meta = r.note ?? "";
        break;
      default:
        title = "Reversal";
        meta = r.note ?? "";
    }
    return {
      id: r.id,
      type,
      amount: round2(Number(r.amount)),
      balanceAfter: round2(Number(r.balanceAfter)),
      title,
      meta,
      ratePct: rate,
      fare,
      orderId: r.orderId ?? undefined,
      rail,
      ref: r.topUp?.providerRef ?? undefined,
      createdAt: r.createdAt.toISOString(),
    };
  }

  // ── The per-ride debit (called from BOTH completion paths, inside the completion transaction) ──

  /**
   * Debit the ride's commission from the rider's prepaid balance, in the SAME transaction that completes
   * the order (design eng 1A: same-transaction, unfailable-by-design). At the launch rate (0%) this
   * writes NO ledger row — only the shadow-accrual log fires. Never blocks completion; the balance may
   * cross the floor and go negative (design Premise 3) — the online-gate stops the NEXT ride.
   *
   * Idempotent under retries: a check-then-insert under the account row lock, backed by the UNIQUE
   * (riderId, orderId, ride_commission) constraint, so a replayed completion never double-charges.
   * A completed order with a null `agreedFare` is a data anomaly — it skips the debit and logs an alert
   * rather than throwing (a delivered parcel must still complete).
   */
  async chargeCommission(
    tx: Prisma.TransactionClient,
    args: { orderId: string; riderId: string; agreedFare: Prisma.Decimal | number | null },
  ): Promise<void> {
    const { orderId, riderId, agreedFare } = args;

    // Shadow accrual (OV-5A): compute the would-be commission on every completion for calibration,
    // regardless of the live rate — never a ledger row, just a measured signal during the 0% period.
    if (agreedFare != null) {
      const shadowRate = this.env.COMMISSION_SHADOW_RATE_PCT;
      const wouldCharge = perRideCommission(Number(agreedFare), shadowRate);
      this.logger.log(
        `commission_shadow orderId=${orderId} riderId=${riderId} fare=${Number(agreedFare)} shadowRatePct=${shadowRate} wouldCharge=${wouldCharge}`,
      );
    }

    const rate = this.ratePct;
    if (!isCommissionActive(rate)) return; // 0% launch — nothing is deducted, no ledger row.

    if (agreedFare == null) {
      this.logger.warn(
        `commission_skip_null_fare orderId=${orderId} riderId=${riderId} — completed order has no agreedFare; debit skipped`,
      );
      return;
    }
    const fare = Number(agreedFare);
    const amount = perRideCommission(fare, rate);
    if (amount <= 0) return;

    // Lazy-upsert the account, then lock its row so a concurrent debit/credit serialises (balance and
    // balanceAfter stay consistent). Lock order is rider → account: the completion paths already hold
    // the rider row lock before calling this.
    await tx.$executeRaw`INSERT INTO commission_accounts (rider_id) VALUES (${riderId}::uuid) ON CONFLICT (rider_id) DO NOTHING`;
    const locked = await tx.$queryRaw<Array<{ balance: string }>>`
      SELECT balance FROM commission_accounts WHERE rider_id = ${riderId}::uuid FOR UPDATE`;

    // Check-then-insert idempotency (design 1A): the unique constraint is a backstop, not control flow —
    // no unique-violation path aborts the completion transaction.
    const existing = await tx.commissionLedger.findFirst({
      where: { riderId, orderId, type: "ride_commission" },
      select: { id: true },
    });
    if (existing) return;

    const balance = Number(locked[0]?.balance ?? 0);
    const balanceAfter = round2(balance - amount);
    await tx.commissionLedger.create({
      data: {
        riderId,
        orderId,
        type: "ride_commission",
        amount: -amount,
        balanceAfter,
        ratePct: rate,
        fare,
        actor: "system",
      },
    });
    await tx.commissionAccount.update({ where: { riderId }, data: { balance: balanceAfter } });
  }

  /**
   * WD-001: correct a previously-charged `ride_commission` debit after an admin fare-adjust, inside the
   * SAME transaction as the fare change (called from `AdminOrdersService.adjustFare`). Writes a signed
   * `adjustment` ledger row for the delta (schema design: "fare-adjust deltas append here at the ride's
   * original rate"). `orderId` is intentionally left null on the row: `CommissionLedger` has a single
   * UNIQUE (riderId, orderId, type) index that would otherwise reject a SECOND adjustment on the same
   * order (Postgres treats each NULL as distinct, so this keeps the row append-only across N corrections
   * without a schema migration); the order is still identifiable via `note`. A zero-amount delta is a
   * no-op (nothing to record).
   */
  async adjustCommissionInTx(
    tx: Prisma.TransactionClient,
    args: { riderId: string; amount: number; ratePct: number; fare: number; note: string; actor: string },
  ): Promise<void> {
    const amount = round2(args.amount);
    if (amount === 0) return;
    await tx.$executeRaw`INSERT INTO commission_accounts (rider_id) VALUES (${args.riderId}::uuid) ON CONFLICT (rider_id) DO NOTHING`;
    const locked = await tx.$queryRaw<Array<{ balance: string }>>`
      SELECT balance FROM commission_accounts WHERE rider_id = ${args.riderId}::uuid FOR UPDATE`;
    const balanceAfter = round2(Number(locked[0]?.balance ?? 0) + amount);
    await tx.commissionLedger.create({
      data: {
        riderId: args.riderId,
        type: "adjustment",
        amount,
        balanceAfter,
        ratePct: args.ratePct,
        fare: args.fare,
        note: args.note,
        actor: args.actor,
      },
    });
    await tx.commissionAccount.update({ where: { riderId: args.riderId }, data: { balance: balanceAfter } });
  }

  // ── Top-ups ──

  /** Create a pending top-up intent for a self-serve rail. The amount is clamped server-side to
   *  [minTopUp, maxTopUp]. The rail prompt is pushed to the phone out of band (the live rail client is
   *  a follow-on — see the PR body); the intent expires after the 90s window, and the rider can retry. */
  async createTopup(riderId: string, body: CreateTopupRequest): Promise<Topup> {
    await this.assertRider(riderId);
    // BH-09: idempotent replay — a client-generated key lets a timeout+retry return the SAME pending
    // intent instead of opening a second one for the same attempt (mirrors OrdersService.create).
    // Checked before any other work so a replay is cheap.
    if (body.idempotencyKey) {
      const existing = await this.prisma.topUp.findFirst({ where: { riderId, idempotencyKey: body.idempotencyKey } });
      if (existing) return this.toTopup(existing);
    }
    const amount = Math.min(COMMISSION.maxTopUp, Math.max(COMMISSION.minTopUp, round2(body.amount)));
    const expiresAt = new Date(Date.now() + TOPUP_WINDOW_MS);
    try {
      const topUp = await this.prisma.topUp.create({
        data: { riderId, rail: body.rail, amount, phone: body.phone, status: "pending", expiresAt, idempotencyKey: body.idempotencyKey ?? null },
      });
      return this.toTopup(topUp);
    } catch (err) {
      // A concurrent replay of the same idempotency key raced us and won (P2002 on the partial unique
      // (rider_id, idempotency_key) index) — return their intent instead of a spurious 5xx.
      if (body.idempotencyKey && err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const winner = await this.prisma.topUp.findFirst({ where: { riderId, idempotencyKey: body.idempotencyKey } });
        if (winner) return this.toTopup(winner);
      }
      throw err;
    }
  }

  /** Poll a top-up intent. Marks it `expired` if the window elapsed while still pending (so the client
   *  sees a terminal state without a background job in this build; a late rail confirmation can still
   *  credit an expired intent exactly once via {@link creditFromTopup}). */
  async getTopup(riderId: string, id: string): Promise<Topup> {
    const topUp = await this.prisma.topUp.findUnique({ where: { id } });
    if (!topUp || topUp.riderId !== riderId) throw new NotFoundException("Top-up not found");
    if (topUp.status === "pending" && topUp.expiresAt.getTime() <= Date.now()) {
      const expired = await this.prisma.topUp.updateMany({
        where: { id, status: "pending" },
        data: { status: "expired", resolvedAt: new Date() },
      });
      if (expired.count > 0) return this.toTopup({ ...topUp, status: "expired" });
      // WD-007: count === 0 means a concurrent write already moved this row off `pending` (e.g. a
      // confirm landing at the same instant as the expiry check) — the in-memory `topUp` snapshot above
      // is now stale. Re-read instead of falling through with it, so a rider polling right at the expiry
      // boundary sees the real (already-confirmed) status instead of a falsely-reported `pending`.
      const fresh = await this.prisma.topUp.findUnique({ where: { id } });
      if (fresh) return this.toTopup(fresh);
    }
    return this.toTopup(topUp);
  }

  private toTopup(t: {
    id: string;
    status: string;
    amount: Prisma.Decimal;
    rail: string;
    phone: string | null;
    expiresAt: Date;
    initiatedAt: Date;
  }): Topup {
    // The DB stores `confirmed`; the wire contract calls a settled top-up `succeeded`.
    const status = (t.status === "confirmed" ? "succeeded" : t.status) as Topup["status"];
    return {
      id: t.id,
      status,
      amount: round2(Number(t.amount)),
      rail: t.rail as TopupRail,
      phone: t.phone ?? "",
      expiresAt: t.expiresAt.toISOString(),
      createdAt: t.initiatedAt.toISOString(),
    };
  }

  // ── The credit primitive (shared by the rail confirmation and the admin manual-credit path) ──

  /**
   * Credit a rider's balance and write one immutable ledger row, atomically and under the account row
   * lock. `idemKey` (unique) makes the write idempotent — a retry with the same key no-ops and returns
   * the existing balance. Used by manual/bulk credits; the top-up confirmation goes through
   * {@link creditFromTopup} (which additionally CAS-transitions the intent).
   */
  async creditAccount(args: {
    riderId: string;
    amount: number;
    type: Extract<WalletEntryType, "topup" | "grace" | "adjustment">;
    idemKey?: string;
    note?: string;
    actor?: string;
    topUpId?: string;
  }): Promise<{ balance: number }> {
    const amount = round2(args.amount);
    return this.prisma.$transaction(async (tx) => {
      if (args.idemKey) {
        const dup = await tx.commissionLedger.findUnique({ where: { idemKey: args.idemKey }, select: { balanceAfter: true } });
        if (dup) return { balance: round2(Number(dup.balanceAfter)) };
      }
      await tx.$executeRaw`INSERT INTO commission_accounts (rider_id) VALUES (${args.riderId}::uuid) ON CONFLICT (rider_id) DO NOTHING`;
      const locked = await tx.$queryRaw<Array<{ balance: string }>>`
        SELECT balance FROM commission_accounts WHERE rider_id = ${args.riderId}::uuid FOR UPDATE`;
      const balanceAfter = round2(Number(locked[0]?.balance ?? 0) + amount);
      await tx.commissionLedger.create({
        data: {
          riderId: args.riderId,
          type: args.type,
          amount,
          balanceAfter,
          idemKey: args.idemKey,
          note: args.note,
          actor: args.actor ?? "system",
          topUpId: args.topUpId,
        },
      });
      await tx.commissionAccount.update({ where: { riderId: args.riderId }, data: { balance: balanceAfter } });
      return { balance: balanceAfter };
    });
  }

  /**
   * Confirm a pending/expired top-up exactly once and credit the balance. The CAS on the intent's
   * status (`pending` | `expired` → `confirmed`) plus the unique `topUpId` on the ledger row make a
   * replayed confirmation a no-op: zero rows transitioned ⇒ already processed. `expired` stays
   * re-openable so a late rail confirmation still credits. This is the seam the live rail poller (PR2)
   * and the sandbox/rehearsal harness both drive.
   */
  async creditFromTopup(topUpId: string, providerRef?: string): Promise<{ balance: number } | null> {
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.topUp.updateMany({
        where: { id: topUpId, status: { in: ["pending", "expired"] } },
        data: { status: "confirmed", resolvedAt: new Date(), ...(providerRef ? { providerRef } : {}) },
      });
      if (claimed.count === 0) return null; // already confirmed/declined — exactly-once, nothing to do.
      const topUp = await tx.topUp.findUnique({ where: { id: topUpId } });
      if (!topUp) return null;
      const amount = round2(Number(topUp.amount));
      await tx.$executeRaw`INSERT INTO commission_accounts (rider_id) VALUES (${topUp.riderId}::uuid) ON CONFLICT (rider_id) DO NOTHING`;
      const locked = await tx.$queryRaw<Array<{ balance: string }>>`
        SELECT balance FROM commission_accounts WHERE rider_id = ${topUp.riderId}::uuid FOR UPDATE`;
      const balanceAfter = round2(Number(locked[0]?.balance ?? 0) + amount);
      await tx.commissionLedger.create({
        data: { riderId: topUp.riderId, type: "topup", amount, balanceAfter, topUpId, actor: "system" },
      });
      await tx.commissionAccount.update({ where: { riderId: topUp.riderId }, data: { balance: balanceAfter } });
      return { balance: balanceAfter };
    });
  }

  /**
   * Ops records an off-app payment as a confirmed manual credit (the launch rail for InnBucks/O'mari
   * and the EcoCash fallback). Creates a `manual` TopUp + a `topup` ledger row + the `AuditLog` row in
   * ONE transaction (WD-002: a money-movement admin action must be atomically audited, matching every
   * other admin mutation in the codebase — order cancel/fare-adjust, rider/customer standing changes).
   *
   * Idempotent by construction (WD-003): `idemKey` is written as `TopUp.providerRef` (`@unique`), so a
   * double-submit (double-click, client retry) hits the unique constraint and is caught below, returning
   * the already-credited balance instead of a 500. (The previous pre-check read `CommissionLedger.idemKey`,
   * a column this path never wrote — dead code that let a genuine retry 500 instead of no-op.) Amount
   * capped at `WALLET_MANUAL_CREDIT_CAP_USD` (design OV-3A).
   */
  async creditManual(args: {
    riderId: string;
    amount: number;
    rail: TopupRail;
    note?: string;
    idemKey: string;
    actorProfileId: string;
  }): Promise<{ balance: number }> {
    await this.assertRider(args.riderId);
    const cap = this.env.WALLET_MANUAL_CREDIT_CAP_USD;
    const amount = round2(args.amount);
    if (!(amount > 0) || amount > cap) {
      throw new ForbiddenException(`Manual credit must be between $0.01 and $${cap.toFixed(2)}`);
    }
    const note = args.note ?? `Manual ${RAIL_LABEL[args.rail]} credit`;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const topUp = await tx.topUp.create({
          data: {
            riderId: args.riderId,
            rail: args.rail,
            amount,
            status: "confirmed",
            providerRef: args.idemKey,
            expiresAt: new Date(Date.now() + TOPUP_WINDOW_MS),
            resolvedAt: new Date(),
          },
        });
        await tx.$executeRaw`INSERT INTO commission_accounts (rider_id) VALUES (${args.riderId}::uuid) ON CONFLICT (rider_id) DO NOTHING`;
        const locked = await tx.$queryRaw<Array<{ balance: string }>>`
          SELECT balance FROM commission_accounts WHERE rider_id = ${args.riderId}::uuid FOR UPDATE`;
        const balanceAfter = round2(Number(locked[0]?.balance ?? 0) + amount);
        await tx.commissionLedger.create({
          data: {
            riderId: args.riderId,
            type: "topup",
            amount,
            balanceAfter,
            topUpId: topUp.id,
            actor: args.actorProfileId,
            note,
          },
        });
        await tx.commissionAccount.update({ where: { riderId: args.riderId }, data: { balance: balanceAfter } });
        await tx.auditLog.create({
          data: {
            actor: args.actorProfileId,
            action: "wallet.credit",
            target: args.riderId,
            reasonCode: args.rail,
            note,
          },
        });
        return { balance: balanceAfter };
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        // The idempotency key was already used — this credit already landed (or is landing in a
        // concurrent request). Return the current balance rather than surfacing a spurious 500.
        return this.getBalanceOnly(args.riderId);
      }
      throw err;
    }
  }

  private async getBalanceOnly(riderId: string): Promise<{ balance: number }> {
    const w = await this.getWallet(riderId);
    return { balance: w.balance };
  }

  private async assertRider(riderId: string): Promise<void> {
    const rider = await this.prisma.rider.findUnique({ where: { profileId: riderId }, select: { profileId: true } });
    if (!rider) throw new ForbiddenException("Not a rider");
  }
}
