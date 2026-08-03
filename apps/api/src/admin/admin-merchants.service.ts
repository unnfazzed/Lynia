import { ConflictException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { RESTAURANTS_DEBT } from "@lynia/shared";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { auditData, fmtDate, routeOf } from "./admin.shared";

/**
 * X1 — admin alignment for the merchant vertical (docs/plans/2026-07-28-restaurants-send-joint-launch-plan.md
 * §5 Cross-cutting). Owns three surfaces the console had zero visibility into before this:
 *
 *  1. Merchant directory + detail (list/detail, open-debt total, recent orders, debt ledger).
 *  2. The support dispute queue: R-05 frozen doorstep handshakes (customer confirmed, rider didn't —
 *     the trip is frozen and the rider is locked out of new jobs until this is resolved, a gap the
 *     C4 plan text explicitly named as "X1 owns the admin dispute-resolution surface") plus N-12's 2h
 *     refund-SLA visibility (Q6 mocked default: escalate to support, no penalty — LyniaGo never holds
 *     the money, so this is visibility only, never an automated money movement).
 *  3. `resolveHandshake` — the one admin-initiated mutation this file owns: releases a frozen
 *     handshake's rider job-lock (common/merchant-debt-lock.ts:hasOpenMerchantObligation gates purely
 *     on `riderCashConfirmedAt`, so setting it is the same release valve the rider's own confirm uses)
 *     and reveals the delivery code (order-lifecycle.service.ts's rotateDeliveryCode/confirmDelivery
 *     gate on the same two timestamps). `cashHandshakeFrozenAt` is left in place as a permanent
 *     "this WAS frozen" marker — the dispute queue itself excludes it once riderCashConfirmedAt is set,
 *     so no extra write or field is needed to drop it off the queue.
 *
 * Merchant has no `accountStatus`/suspend field in the schema (unlike Rider) — "cash-ban/suspension
 * actions" in the plan's one-liner is the customer cash-ban (R-08, admin-customers.service.ts) and the
 * rider suspension C4's `reportNonReturn` already writes (`rider.suspend_food_debt`, reused verbatim via
 * the existing rider suspend/lift console actions) — both surfaced here via the debt ledger + dispute
 * queue, not a new merchant-standing state machine (flagged as a scope cut, not silently decided).
 */
@Injectable()
export class AdminMerchantsService {
  constructor(
    private readonly prisma: PrismaService,
    // Optional so unit tests can construct with just Prisma — its module is @Global in the app, so no
    // import wiring is needed to inject this (mirrors admin-customers.service.ts).
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  /** Merchant directory: order volume + open-debt total per merchant, batched (mirrors
   *  admin-customers.service.ts's listCustomers aggregation shape). */
  async listMerchants() {
    const merchants = await this.prisma.merchant.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, name: true, cashRule: true, pilotEnabled: true, busyMode: true, cuisineTags: true, createdAt: true },
    });
    const ids = merchants.map((m) => m.id);
    const [orderCounts, openDebt] = await Promise.all([
      this.prisma.order.groupBy({ by: ["merchantId"], where: { merchantId: { in: ids } }, _count: { _all: true } }),
      this.prisma.order.groupBy({
        by: ["merchantId"],
        where: { merchantId: { in: ids }, debtStatus: "open" },
        _sum: { debtAmount: true },
        _count: { _all: true },
      }),
    ]);
    const ordersBy = new Map(orderCounts.map((r) => [r.merchantId, r._count._all]));
    const debtBy = new Map(openDebt.map((r) => [r.merchantId, { amount: r._sum.debtAmount, count: r._count._all }]));
    return merchants.map((m) => this.toMerchant(m, ordersBy.get(m.id) ?? 0, debtBy.get(m.id)));
  }

  /** Single merchant detail: directory fields + recent orders + a page of the merchant's own
   *  debt-ledger trail (append-only, so this is the full audit history of every debt this merchant
   *  has opened/settled). Returns null when the id isn't a merchant.
   *
   *  LC-D-T1: this used to hard-cap the ledger at `take: 30` with no `nextCursor` and no disclosure —
   *  the same "money ledger silently stops, no way to page back" shape D-D0f/LC-D07 fixed for the
   *  rider wallet ledger, just on the merchant debt ledger the fix hadn't reached. Mirrors
   *  `AdminRidersService.walletView`'s cursor pattern exactly: fetch PAGE_SIZE+1 to detect `hasMore`
   *  without a separate count query, cursor-paginate by id (stable under concurrent inserts). */
  async getMerchantDetail(id: string, debtCursor?: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        description: true,
        cashRule: true,
        pilotEnabled: true,
        busyMode: true,
        cuisineTags: true,
        priceLevel: true,
        createdAt: true,
      },
    });
    if (!merchant) return null;

    const DEBT_LEDGER_PAGE_SIZE = 30;
    const [orderCount, openDebt, recentOrders, ledgerRows] = await Promise.all([
      this.prisma.order.count({ where: { merchantId: id } }),
      this.prisma.order.aggregate({ where: { merchantId: id, debtStatus: "open" }, _sum: { debtAmount: true }, _count: { _all: true } }),
      this.prisma.order.findMany({
        where: { merchantId: id },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, status: true, agreedFare: true, proposedFare: true, pickup: true, dropoff: true, createdAt: true },
      }),
      this.prisma.merchantDebtLedger.findMany({
        where: { merchantId: id },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: DEBT_LEDGER_PAGE_SIZE + 1,
        ...(debtCursor ? { cursor: { id: debtCursor }, skip: 1 } : {}),
        select: { id: true, orderId: true, riderId: true, type: true, amount: true, note: true, actor: true, createdAt: true },
      }),
    ]);

    const debtLedgerHasMore = ledgerRows.length > DEBT_LEDGER_PAGE_SIZE;
    const ledger = debtLedgerHasMore ? ledgerRows.slice(0, DEBT_LEDGER_PAGE_SIZE) : ledgerRows;

    const base = this.toMerchant(merchant, orderCount, { amount: openDebt._sum.debtAmount, count: openDebt._count._all });
    return {
      ...base,
      description: merchant.description,
      priceLevel: merchant.priceLevel,
      trail: recentOrders.map((o) => ({
        id: o.id,
        route: routeOf(o.pickup, o.dropoff),
        status: o.status,
        fare: (o.agreedFare ?? o.proposedFare).toString(),
        when: fmtDate(o.createdAt),
      })),
      debtLedger: ledger.map((l) => ({
        id: l.id,
        orderId: l.orderId,
        riderId: l.riderId,
        type: l.type,
        amount: l.amount.toString(),
        note: l.note,
        actor: l.actor,
        at: l.createdAt.toISOString(),
      })),
      debtLedgerNextCursor: debtLedgerHasMore ? ledger[ledger.length - 1]!.id : null,
    };
  }

  /**
   * The support dispute queue: R-05 frozen doorstep handshakes (needs the resolveHandshake action
   * below) and N-12 refund-overdue orders (visibility only — LyniaGo never holds the money, Q6's
   * mocked default is escalate-to-support-no-penalty, so nothing here moves money automatically).
   */
  async listDisputes() {
    const [frozen, refundCandidates] = await Promise.all([
      this.prisma.order.findMany({
        where: { orderType: "merchant", cashHandshakeFrozenAt: { not: null }, riderCashConfirmedAt: null },
        orderBy: { cashHandshakeFrozenAt: "asc" },
        take: 100,
        select: {
          id: true,
          cashHandshakeFrozenAt: true,
          cashHandshakeAmount: true,
          customerCashConfirmedAt: true,
          merchant: { select: { name: true } },
          customer: { select: { firstName: true, lastName: true } },
          rider: { select: { profile: { select: { firstName: true, lastName: true } } } },
        },
      }),
      // Any wallet-paid merchant order where the customer already paid the merchant's own rail
      // (LyniaGo never holds it, §4) but the order ended in a terminal failure with no refund on
      // record. Refund-SLA overdue-ness is computed in JS below from RESTAURANTS_DEBT.refundSlaMs —
      // no schema field needed since this is a derived, read-only view.
      this.prisma.order.findMany({
        where: {
          orderType: "merchant",
          merchantPaymentMethod: "wallet",
          merchantPaymentConfirmedAt: { not: null },
          status: { in: ["cancelled", "undelivered"] },
          refundedAt: null,
        },
        orderBy: { updatedAt: "desc" },
        take: 100,
        select: {
          id: true,
          merchantGoodsTotal: true,
          cancelledAt: true,
          undeliveredAt: true,
          updatedAt: true,
          merchant: { select: { name: true } },
          customer: { select: { firstName: true, lastName: true } },
        },
      }),
    ]);

    const now = Date.now();
    const handshakeDisputes = frozen.map((o) => ({
      orderId: o.id,
      merchant: o.merchant?.name ?? "—",
      customer: `${o.customer.firstName} ${o.customer.lastName}`.trim(),
      rider: o.rider ? `${o.rider.profile.firstName} ${o.rider.profile.lastName}`.trim() : null,
      amount: o.cashHandshakeAmount?.toString() ?? null,
      customerConfirmedAt: o.customerCashConfirmedAt?.toISOString() ?? null,
      frozenAt: o.cashHandshakeFrozenAt!.toISOString(),
    }));
    const refundsOverdue = refundCandidates.map((o) => {
      const terminalAt = o.cancelledAt ?? o.undeliveredAt ?? o.updatedAt;
      const overdueMs = now - terminalAt.getTime();
      return {
        orderId: o.id,
        merchant: o.merchant?.name ?? "—",
        customer: `${o.customer.firstName} ${o.customer.lastName}`.trim(),
        amount: o.merchantGoodsTotal?.toString() ?? null,
        terminalAt: terminalAt.toISOString(),
        overdue: overdueMs >= RESTAURANTS_DEBT.refundSlaMs,
        overdueMinutes: Math.max(0, Math.round(overdueMs / 60000)),
      };
    });
    return { handshakeDisputes, refundsOverdue };
  }

  /**
   * R-05 admin dispute resolution — the only lever out of a frozen doorstep handshake (the rider's own
   * `confirmRiderCash` refuses once `cashHandshakeFrozenAt` is set). Mirrors the rider-suspend CAS
   * shape: guarded on both the observed frozen timestamp AND `riderCashConfirmedAt: null`, mutation +
   * audit row in one transaction. Setting `riderCashConfirmedAt` is deliberately the SAME release valve
   * the rider's own confirm uses — it clears `common/merchant-debt-lock.ts:hasOpenMerchantObligation`
   * and unlocks the delivery-code reveal (order-lifecycle.service.ts), so support doesn't need a second,
   * parallel unlock path. Reason required — an override of a money mismatch is always justified in the
   * audit trail. 404s when the order isn't a merchant order; 409s when it isn't actually frozen (or was
   * already resolved) so a stale queue row can't be double-actioned.
   */
  async resolveHandshake(actor: string, orderId: string, input: { reason: string; note?: string | null }) {
    const result = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: { orderType: true, cashHandshakeFrozenAt: true, riderCashConfirmedAt: true, customerId: true, riderId: true },
      });
      if (!order || order.orderType !== "merchant") throw new NotFoundException("Order not found");
      if (!order.cashHandshakeFrozenAt) throw new ConflictException("This order's handshake isn't frozen");
      if (order.riderCashConfirmedAt) throw new ConflictException("This dispute was already resolved");
      const claimed = await tx.order.updateMany({
        where: { id: orderId, cashHandshakeFrozenAt: order.cashHandshakeFrozenAt, riderCashConfirmedAt: null },
        data: { riderCashConfirmedAt: new Date() },
      });
      if (claimed.count === 0) throw new ConflictException("Order changed — refresh and try again");
      const audit = await tx.auditLog.create({
        data: auditData(actor, "order.handshake_resolve", orderId, input.reason, input.note),
        select: { id: true },
      });
      return { id: orderId, resolved: true as const, auditId: audit.id, customerId: order.customerId, riderId: order.riderId };
    });
    // Best-effort, post-commit: tell both parties the freeze is over — mirrors sweepFrozenHandshakes'
    // freeze notification pair in food-debt.service.ts. Never affects the already-committed resolve.
    if (result.riderId) {
      void this.notifications?.notifyProfiles([result.riderId], {
        title: "Support resolved the payment dispute",
        body: "You can take new deliveries again.",
        data: { orderId: result.id, kind: "cash_handshake_resolved" },
      });
    }
    void this.notifications?.notifyProfiles([result.customerId], {
      title: "Your delivery code is ready",
      body: "Support resolved the payment mismatch at the door.",
      data: { orderId: result.id, kind: "cash_handshake_resolved" },
    });
    return { id: result.id, resolved: result.resolved, auditId: result.auditId };
  }

  /** Shared Merchant projection for the directory + detail. */
  private toMerchant(
    m: {
      id: string;
      name: string;
      cashRule: string;
      pilotEnabled: boolean;
      busyMode: boolean;
      cuisineTags: string[];
      createdAt: Date;
    },
    orders: number,
    openDebt?: { amount: { toString: () => string } | null; count: number },
  ) {
    return {
      id: m.id,
      name: m.name,
      cashRule: m.cashRule,
      pilotEnabled: m.pilotEnabled,
      busyMode: m.busyMode,
      cuisineTags: m.cuisineTags,
      orders,
      openDebtAmount: openDebt?.amount ? openDebt.amount.toString() : "0.00",
      openDebtCount: openDebt?.count ?? 0,
      joined: fmtDate(m.createdAt),
    };
  }
}
