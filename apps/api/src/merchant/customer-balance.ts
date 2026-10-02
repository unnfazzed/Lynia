import { ConflictException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { addMoney, type CustomerBalanceResponse, roundToCents } from "@lynia/shared";

/**
 * Order flow v2 (ledger D-59, BRIEF §14 / D3f): what a customer owes after cancelling a merchant order
 * the rider had already collected — "You owe $16.50 — pay it on your next order".
 *
 * One `customer_balance_entries` row per such order (recorded by OrderLifecycleService.cancel). The
 * customer's next restaurant / shop / pharmacy order carries every open row (`appliedOrderId`) as its
 * own line, `previousBalanceUsd`: it's added to that order's `total` and to the doorstep cash amount
 * (FoodDebtService.confirmCustomerCash), never to `merchantGoodsTotal` / `agreedFare` — so every place
 * that re-prices the goods (item-level accept, item edits, an Rx decline, substitutions) keeps working
 * unchanged and can't drop it.
 *
 * State is derived, so no sweep or hook on every order ending is needed:
 *  - PAID      — the carrying order was delivered/completed (the cash handshake ran before delivery).
 *  - CARRIED   — the carrying order is still live; still owed, not carried a second time.
 *  - OPEN      — never carried, or the carrying order ended without delivery: free to carry again.
 *
 * Where the money goes once collected (the venue that made the food, or LyniaGo) is BRIEF open
 * question 2; the row keeps the source order, its venue and the collecting order for ops to reconcile.
 */

const PAID_STATUSES: readonly string[] = ["delivered", "completed"];
const ENDED_UNPAID_STATUSES: readonly string[] = ["cancelled", "expired", "undelivered"];

type Db = Pick<Prisma.TransactionClient, "customerBalanceEntry" | "order">;

interface EntryRow {
  id: string;
  sourceOrderId: string;
  amount: Prisma.Decimal | number;
  appliedOrderId: string | null;
  createdAt: Date;
}

async function classify(db: Db, profileId: string): Promise<Array<EntryRow & { state: "paid" | "carried" | "open" }>> {
  const rows: EntryRow[] = await db.customerBalanceEntry.findMany({
    where: { profileId },
    orderBy: { createdAt: "asc" },
    select: { id: true, sourceOrderId: true, amount: true, appliedOrderId: true, createdAt: true },
  });
  if (rows.length === 0) return [];
  const appliedIds = [...new Set(rows.map((r) => r.appliedOrderId).filter((v): v is string => !!v))];
  const carriers = appliedIds.length
    ? await db.order.findMany({ where: { id: { in: appliedIds } }, select: { id: true, status: true } })
    : [];
  const statusById = new Map(carriers.map((o) => [o.id, o.status as string]));
  return rows.map((r) => {
    if (!r.appliedOrderId) return { ...r, state: "open" as const };
    const status = statusById.get(r.appliedOrderId);
    if (status && PAID_STATUSES.includes(status)) return { ...r, state: "paid" as const };
    if (!status || ENDED_UNPAID_STATUSES.includes(status)) return { ...r, state: "open" as const };
    return { ...r, state: "carried" as const };
  });
}

/** `GET /restaurants/balance` and `/auth/me`'s `owedUsd`: everything not yet paid. */
export async function customerBalance(db: Db, profileId: string): Promise<CustomerBalanceResponse> {
  const rows = (await classify(db, profileId)).filter((r) => r.state !== "paid");
  return {
    owedUsd: roundToCents(addMoney(0, ...rows.map((r) => Number(r.amount)))),
    lines: rows.map((r) => ({
      orderId: r.sourceOrderId,
      amount: Number(r.amount),
      createdAt: r.createdAt.toISOString(),
      carriedOnOrderId: r.state === "carried" ? r.appliedOrderId : null,
    })),
  };
}

/** The open rows a new order should carry, and their total. */
export async function openBalance(db: Db, profileId: string): Promise<{ entries: Array<{ id: string; appliedOrderId: string | null }>; amount: number }> {
  const open = (await classify(db, profileId)).filter((r) => r.state === "open");
  return { entries: open.map((r) => ({ id: r.id, appliedOrderId: r.appliedOrderId })), amount: roundToCents(addMoney(0, ...open.map((r) => Number(r.amount)))) };
}

/** Attach the open rows to the new order, each by compare-and-set on the carrier it was read with, so two
 *  orders placed at once can never both carry the same row (the loser's transaction rolls back). */
export async function carryBalance(
  tx: Pick<Prisma.TransactionClient, "customerBalanceEntry">,
  entries: Array<{ id: string; appliedOrderId: string | null }>,
  orderId: string,
): Promise<void> {
  const now = new Date();
  for (const e of entries) {
    const claimed = await tx.customerBalanceEntry.updateMany({
      where: { id: e.id, appliedOrderId: e.appliedOrderId },
      data: { appliedOrderId: orderId, appliedAt: now },
    });
    if (claimed.count === 0) throw new ConflictException({ reason: "balance_changed", message: "Your balance changed — try again." });
  }
}

/** What an order carries from earlier cancels (its `previousBalanceUsd`), by order id. */
export async function carriedByOrder(db: Pick<Prisma.TransactionClient, "customerBalanceEntry">, orderIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (orderIds.length === 0) return out;
  const rows = await db.customerBalanceEntry.findMany({ where: { appliedOrderId: { in: orderIds } }, select: { appliedOrderId: true, amount: true } });
  for (const r of rows) out.set(r.appliedOrderId!, roundToCents(addMoney(out.get(r.appliedOrderId!) ?? 0, Number(r.amount))));
  return out;
}
