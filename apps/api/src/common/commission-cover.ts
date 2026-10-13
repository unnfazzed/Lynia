import { ForbiddenException } from "@nestjs/common";
import { addMoney, canCoverJobCommission, COMMISSION_RATE_PCT_ENV, freeJobsLeft, jobCommissionBasis, perRideCommission, resolveCommissionRatePct, subMoney } from "@lynia/shared";
import type { Prisma } from "@prisma/client";
import type { PrismaService } from "../prisma/prisma.service";
import { REFUSAL_MESSAGE } from "../riders/online-gate";

/**
 * Owner rule (2026-10-12): a rider can't take a job whose commission is more than their wallet balance.
 * There is no minimum balance to go online; this is checked per job — when a rider bids on a parcel
 * (offers), when the customer picks them (matching), and when a food/shop dispatch is offered and accepted
 * (food-dispatch). The rider's commission-free first jobs skip it (`canCoverJobCommission`).
 *
 * Lives in `common/` (like merchant-debt-lock) so the parcel and merchant sides both import it without
 * importing each other. The rate is read from `process.env` at the point of use (the penalties pattern):
 * the same `COMMISSION_RATE_PCT` override WalletService resolves, through the same resolver.
 */
export function liveCommissionRatePct(): number {
  return resolveCommissionRatePct(process.env[COMMISSION_RATE_PCT_ENV]);
}

type Db = PrismaService | Prisma.TransactionClient;
type MoneyLike = Prisma.Decimal | number | string | null | undefined;

const toNum = (v: MoneyLike): number | null => (v == null ? null : Number(v));

/** The commission a job would be charged at `ratePct` (0 when the basis is unknown). */
export function jobCommission(
  job: { orderType: string; agreedFare?: MoneyLike; suggestedFare?: MoneyLike; deliveryFee?: MoneyLike },
  ratePct: number = liveCommissionRatePct(),
): number {
  const basis = jobCommissionBasis({
    orderType: job.orderType,
    agreedFare: toNum(job.agreedFare),
    suggestedFare: toNum(job.suggestedFare),
    deliveryFee: toNum(job.deliveryFee),
  });
  return basis == null ? 0 : perRideCommission(basis, ratePct);
}

/**
 * Each rider's completed-job count and wallet balance (a never-touched wallet reads $0), adjusted for
 * jobs already `delivered` but not yet closed: their commission is only debited at completion
 * (WalletService.chargeCommission), so it is still owed against the balance, and each of them will use
 * up one of the rider's free first jobs. Which pending job closes first isn't known, so the free slots
 * are taken to cover the cheapest ones and the dearest are counted as owed.
 */
async function walletStates(db: Db, riderIds: string[], ratePct: number): Promise<Map<string, { tripsCount: number; balance: number }>> {
  const [riders, accounts, delivered] = await Promise.all([
    db.rider.findMany({ where: { profileId: { in: riderIds } }, select: { profileId: true, tripsCount: true } }),
    db.commissionAccount.findMany({ where: { riderId: { in: riderIds } }, select: { riderId: true, balance: true } }),
    db.order.findMany({
      where: { riderId: { in: riderIds }, status: "delivered" },
      select: { riderId: true, orderType: true, agreedFare: true, suggestedFare: true, deliveryFee: true },
    }),
  ]);
  const balance = new Map(accounts.map((a) => [a.riderId, Number(a.balance)]));
  const pending = new Map<string, number[]>();
  for (const o of delivered) {
    if (!o.riderId) continue;
    const list = pending.get(o.riderId) ?? [];
    list.push(jobCommission(o, ratePct));
    pending.set(o.riderId, list);
  }
  return new Map(
    riders.map((r) => {
      const owedJobs = (pending.get(r.profileId) ?? []).sort((a, b) => b - a);
      const charged = Math.max(0, owedJobs.length - freeJobsLeft(r.tripsCount));
      const owed = owedJobs.slice(0, charged).reduce((sum, c) => addMoney(sum, c), 0);
      return [r.profileId, { tripsCount: r.tripsCount + owedJobs.length, balance: subMoney(balance.get(r.profileId) ?? 0, owed) }];
    }),
  );
}

/**
 * The riders in `riderIds` who can take a job, given what it would charge each of them (one figure for
 * all, or per rider — a parcel's commission follows each rider's own offered fare). Nothing is read
 * while commission is off.
 */
export async function ridersWhoCoverCommission(
  db: Db,
  riderIds: string[],
  commission: number | ((riderId: string) => number),
  ratePct: number = liveCommissionRatePct(),
): Promise<Set<string>> {
  if (riderIds.length === 0 || ratePct <= 0) return new Set(riderIds);
  const states = await walletStates(db, riderIds, ratePct);
  return new Set(
    riderIds.filter((id) => {
      const s = states.get(id);
      if (!s) return false;
      const owed = typeof commission === "number" ? commission : commission(id);
      return canCoverJobCommission({ ratePct, tripsCount: s.tripsCount, balance: s.balance, commission: owed });
    }),
  );
}

/** Throw the `commission_low_balance` refusal when the rider can't cover `commission`. */
export async function assertRiderCoversCommission(db: Db, riderId: string, commission: number, ratePct: number = liveCommissionRatePct()): Promise<void> {
  const ok = await ridersWhoCoverCommission(db, [riderId], commission, ratePct);
  if (!ok.has(riderId)) {
    throw new ForbiddenException({ reason: "commission_low_balance", message: REFUSAL_MESSAGE.commission_low_balance, commission });
  }
}
