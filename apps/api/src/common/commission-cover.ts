import { ForbiddenException } from "@nestjs/common";
import { canCoverJobCommission, COMMISSION_RATE_PCT_ENV, jobCommissionBasis, perRideCommission, resolveCommissionRatePct } from "@lynia/shared";
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

/** Each rider's completed-job count and wallet balance (a never-touched wallet reads $0). */
async function walletStates(db: Db, riderIds: string[]): Promise<Map<string, { tripsCount: number; balance: number }>> {
  const [riders, accounts] = await Promise.all([
    db.rider.findMany({ where: { profileId: { in: riderIds } }, select: { profileId: true, tripsCount: true } }),
    db.commissionAccount.findMany({ where: { riderId: { in: riderIds } }, select: { riderId: true, balance: true } }),
  ]);
  const balance = new Map(accounts.map((a) => [a.riderId, Number(a.balance)]));
  return new Map(riders.map((r) => [r.profileId, { tripsCount: r.tripsCount, balance: balance.get(r.profileId) ?? 0 }]));
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
  const states = await walletStates(db, riderIds);
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
