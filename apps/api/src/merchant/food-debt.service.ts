import { ConflictException, Injectable, Logger, NotFoundException, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { RESTAURANTS_DEBT, RiderAccountStatus, roundToCents } from "@lynia/shared";
import { NotificationsService } from "../notifications/notifications.service";
import { OrderLifecycleService } from "../orders/order-lifecycle.service";
import { PrismaService } from "../prisma/prisma.service";
import { resolveOwnMerchantId } from "./merchant-lookup.util";

/**
 * C4 — food money evidence layer (docs/plans/2026-07-28-restaurants-send-joint-launch-plan.md §5 Lane
 * C, packages/design/RESTAURANTS-DECISIONS.md §7 revision). Owns three things, each its own small
 * declarative machine (see order-lifecycle.transitions.ts's MERCHANT_DEBT_TRANSITIONS):
 *
 *  1. The doorstep dual-confirm handshake (R-04/R-05/N-19) for CASH food orders — customer confirms
 *     first, then the rider, and only then does the delivery code unlock (R-09, enforced in
 *     order-lifecycle.service.ts's rotateDeliveryCode/confirmDelivery, not here — this service only
 *     writes the two confirm timestamps a CASH order's code-reveal gate reads).
 *  2. The collect-and-return merchant-debt ledger (R-01/R-06/N-20/N-21) — opened at pickup (goods
 *     leave the counter unpaid), settled by the merchant's returned-cash count-confirm or a
 *     goods-only return (refusal/no-show), or written off + the rider suspended on non-return (R-07).
 *  3. N-10 no-show / R-08 refusal at the door, both thin wrappers around
 *     OrderLifecycleService.markUndelivered (reused verbatim, never re-derived — "never a parallel
 *     state machine") plus the merchant-specific side effect each one carries.
 *
 * SCOPE CUT, flagged per §9 discipline (surfaced in the PR body too): only `merchantCashRule ===
 * "collect_and_return"` (the default, recommended rule — R-03) opens a debt. `pay_upfront` kitchens
 * still get the doorstep handshake (money changes hands at the door either way) but no debt ledger —
 * that direction is the OLD float model's mirror image (merchant owes the rider back), explicitly
 * named as surviving only for upfront kitchens (§7 "M3·1 upfront confirm... survive"), and is left as
 * an open item for a future increment rather than half-built here.
 */
@Injectable()
export class FoodDebtService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FoodDebtService.name);
  private sweep?: ReturnType<typeof setInterval>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly lifecycle: OrderLifecycleService,
  ) {}

  onModuleInit(): void {
    void this.sweepFrozenHandshakes();
    this.sweep = setInterval(() => void this.sweepFrozenHandshakes(), RESTAURANTS_DEBT.sweepIntervalMs);
    this.sweep.unref?.();
  }

  onModuleDestroy(): void {
    if (this.sweep) clearInterval(this.sweep);
  }

  // ── C2 hand-off: called from FoodOrderService.confirmPickup's OWN row-locked transaction ────────

  /** R-01: opens the debt the moment food leaves the counter unpaid. Idempotent — guarded CAS on
   *  debtStatus=null, so a transaction retry (the outer confirmPickup CAS already prevents a genuine
   *  double-call, this is defense in depth) can never double-open. No-ops for anything other than a
   *  collect-and-return CASH order (see class docstring). */
  async openDebtIfNeeded(
    tx: Prisma.TransactionClient,
    order: {
      id: string;
      merchantId: string | null;
      riderId: string | null;
      merchantPaymentMethod: string | null;
      merchantCashRule: string | null;
      merchantGoodsTotal: Prisma.Decimal | number | null;
    },
  ): Promise<void> {
    if (order.merchantPaymentMethod !== "cash" || order.merchantCashRule !== "collect_and_return") return;
    if (!order.merchantId || !order.riderId) return;
    const amount = roundToCents(Number(order.merchantGoodsTotal ?? 0));
    if (amount <= 0) return;
    const claimed = await tx.order.updateMany({
      where: { id: order.id, debtStatus: null },
      data: { debtStatus: "open", debtAmount: amount, debtOpenedAt: new Date() },
    });
    if (claimed.count === 0) return; // already opened — idempotent no-op
    try {
      await tx.merchantDebtLedger.create({
        data: { orderId: order.id, merchantId: order.merchantId, riderId: order.riderId, type: "opened", amount, actor: "system" },
      });
    } catch (err) {
      // The (orderId, type) unique index backstops the CAS above — a duplicate write here would mean
      // the CAS raced past a concurrent opener, which the CAS itself already rules out; kept as a
      // silent no-op rather than surfacing a 500 into the pickup-confirm response.
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
    }
  }

  // ── Doorstep handshake (R-04/R-05/N-19) ──────────────────────────────────────────────────────────

  /** Customer taps "I gave $X" — always first (R-04 "food first: hand the food over, customer pays,
   *  THEN the confirms"). */
  async confirmCustomerCash(orderId: string, customerId: string): Promise<{ orderId: string; customerCashConfirmedAt: string }> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, customerId, orderType: "merchant" },
      select: { status: true, merchantPaymentMethod: true, agreedFare: true, customerCashConfirmedAt: true, riderId: true },
    });
    if (!order) throw new NotFoundException("Order not found");
    if (order.merchantPaymentMethod !== "cash") throw new ConflictException("This order isn't a cash order");
    if (order.status !== "en_route_dropoff") throw new ConflictException("The rider hasn't reached you yet");
    if (order.customerCashConfirmedAt) throw new ConflictException("Already confirmed");
    const amount = roundToCents(Number(order.agreedFare ?? 0));
    const now = new Date();
    const claimed = await this.prisma.order.updateMany({
      where: { id: orderId, status: "en_route_dropoff", customerCashConfirmedAt: null },
      data: {
        customerCashConfirmedAt: now,
        cashHandshakeAmount: amount,
        cashHandshakeDeadlineAt: new Date(now.getTime() + RESTAURANTS_DEBT.handshakeWindowMs),
      },
    });
    if (claimed.count === 0) throw new ConflictException("Order changed, retry");
    if (order.riderId) {
      void this.notifications.notifyProfiles([order.riderId], {
        title: "Customer confirmed payment",
        body: `Confirm you received $${amount.toFixed(2)} to reveal the delivery code.`,
        data: { orderId, kind: "cash_handshake_customer_confirmed" },
      });
    }
    return { orderId, customerCashConfirmedAt: now.toISOString() };
  }

  /** Rider taps "I received $X" — second (R-04). This is what unlocks the code (R-09) — enforced in
   *  order-lifecycle.service.ts, which reads these two timestamps; not this method's job. */
  async confirmRiderCash(orderId: string, riderId: string): Promise<{ orderId: string; riderCashConfirmedAt: string }> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, riderId, orderType: "merchant" },
      select: { customerCashConfirmedAt: true, riderCashConfirmedAt: true, cashHandshakeFrozenAt: true, customerId: true },
    });
    if (!order) throw new NotFoundException("Order not found");
    if (!order.customerCashConfirmedAt) throw new ConflictException("Waiting on the customer's confirm first");
    if (order.cashHandshakeFrozenAt) throw new ConflictException("This handshake is frozen — support has been notified");
    if (order.riderCashConfirmedAt) throw new ConflictException("Already confirmed");
    const now = new Date();
    const claimed = await this.prisma.order.updateMany({
      where: { id: orderId, riderId, riderCashConfirmedAt: null, cashHandshakeFrozenAt: null },
      data: { riderCashConfirmedAt: now },
    });
    if (claimed.count === 0) throw new ConflictException("Order changed, retry");
    void this.notifications.notifyProfiles([order.customerId], {
      title: "Confirmed",
      body: "Your delivery code is ready.",
      data: { orderId, kind: "cash_handshake_rider_confirmed" },
    });
    return { orderId, riderCashConfirmedAt: now.toISOString() };
  }

  /** R-05: the rider's explicit "the amount doesn't match" dispute — freezes immediately rather than
   *  waiting out the full N-19 window. */
  async disputeCash(orderId: string, riderId: string): Promise<{ orderId: string; frozen: true }> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, riderId, orderType: "merchant" },
      select: { customerCashConfirmedAt: true, riderCashConfirmedAt: true },
    });
    if (!order) throw new NotFoundException("Order not found");
    if (!order.customerCashConfirmedAt || order.riderCashConfirmedAt) {
      throw new ConflictException("Nothing to dispute right now");
    }
    await this.freeze(orderId);
    return { orderId, frozen: true };
  }

  /** R-05: a missing rider confirm past N-19's 2:00 window freezes the trip — support is notified,
   *  the rider takes no new jobs (common/merchant-debt-lock.ts) until X1's dispute-resolution surface
   *  settles it. Runs every RESTAURANTS_DEBT.sweepIntervalMs from onModuleInit. */
  async sweepFrozenHandshakes(): Promise<{ frozen: number }> {
    let frozen = 0;
    const stale = await this.prisma.order.findMany({
      where: {
        orderType: "merchant",
        customerCashConfirmedAt: { not: null },
        riderCashConfirmedAt: null,
        cashHandshakeFrozenAt: null,
        cashHandshakeDeadlineAt: { lt: new Date() },
      },
      select: { id: true },
      take: 200,
    });
    for (const o of stale) {
      try {
        if (await this.freeze(o.id)) frozen++;
      } catch (err) {
        this.logger.error(`sweepFrozenHandshakes failed for order ${o.id}: ${(err as Error).message}`);
      }
    }
    return { frozen };
  }

  private async freeze(orderId: string): Promise<boolean> {
    const claimed = await this.prisma.order.updateMany({
      where: { id: orderId, cashHandshakeFrozenAt: null },
      data: { cashHandshakeFrozenAt: new Date() },
    });
    if (claimed.count === 0) return false;
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { customerId: true, riderId: true } });
    if (order) {
      const targets = order.riderId ? [order.customerId, order.riderId] : [order.customerId];
      void this.notifications.notifyProfiles(targets, {
        title: "We've flagged this order",
        body: "Something didn't match at the door — support has been notified and is looking into it.",
        data: { orderId, kind: "cash_handshake_frozen" },
      });
    }
    return true;
  }

  // ── Doorstep failure paths (N-10/R-08) — thin wrappers around markUndelivered ────────────────────

  /** N-10: a call log a rider builds up before a no-show report is accepted (mirrors
   *  FoodOrderService.logCall's shape for R-16). */
  async logDoorstepCall(orderId: string, riderId: string): Promise<{ orderId: string; callsLogged: number }> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, riderId, orderType: "merchant" },
      select: { status: true, noShowCallTimestamps: true },
    });
    if (!order) throw new NotFoundException("Order not found");
    if (order.status !== "picked_up" && order.status !== "en_route_dropoff") {
      throw new ConflictException("A call can only be logged while heading to the customer");
    }
    const timestamps = [...order.noShowCallTimestamps, new Date()];
    await this.prisma.order.update({ where: { id: orderId }, data: { noShowCallTimestamps: timestamps } });
    return { orderId, callsLogged: timestamps.length };
  }

  /** N-10: 8:00 wait + 2 logged calls, then the food rides back like any failed hand-off — reuses
   *  OrderLifecycleService.markUndelivered verbatim (reliability penalty etc. unchanged). No
   *  cash-ban: the customer just wasn't there (that's R-08's refusal-specific consequence). */
  async reportNoShow(orderId: string, riderId: string): Promise<{ orderId: string; status: "undelivered" }> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, riderId, orderType: "merchant" },
      select: { noShowCallTimestamps: true },
    });
    if (!order) throw new NotFoundException("Order not found");
    const calls = order.noShowCallTimestamps;
    if (calls.length < RESTAURANTS_DEBT.noShowMinCalls) {
      throw new ConflictException(`Log at least ${RESTAURANTS_DEBT.noShowMinCalls} calls before reporting a no-show`);
    }
    const earliest = Math.min(...calls.map((c) => c.getTime()));
    if (Date.now() - earliest < RESTAURANTS_DEBT.noShowWindowMs) {
      throw new ConflictException("Keep waiting — the no-show window hasn't elapsed yet");
    }
    await this.lifecycle.markUndelivered(orderId, riderId, "unreachable");
    return { orderId, status: "undelivered" };
  }

  /** R-08: refusal costs the customer nothing in money — everything in access. Reuses
   *  markUndelivered verbatim, then flags + cash-bans the customer (mobile-money-only from here on
   *  for food orders). The pickup-time debt (if any) stays `open`, settled once the goods physically
   *  come back (confirmGoodsReturned) — this method never touches debtStatus itself. */
  async reportCustomerRefused(orderId: string, riderId: string): Promise<{ orderId: string; status: "undelivered" }> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, riderId, orderType: "merchant" },
      select: { customerId: true, customerCashConfirmedAt: true },
    });
    if (!order) throw new NotFoundException("Order not found");
    if (order.customerCashConfirmedAt) throw new ConflictException("The customer already confirmed payment");
    await this.lifecycle.markUndelivered(orderId, riderId, "refused");
    await this.prisma.profile.updateMany({
      where: { id: order.customerId, cashBanned: false },
      data: { cashBanned: true, cashBanReason: "Refused or couldn't pay a cash food order", cashBannedAt: new Date() },
    });
    return { orderId, status: "undelivered" };
  }

  // ── Merchant debt settlement (R-06/R-07/N-20/N-21, D-06 grammar) ────────────────────────────────

  /** R-06/N-21/D-06: merchant counts the returned cash — the amount must match the recorded debt
   *  exactly; a mismatch blocks release and names the gap in dollars, never just displays it. */
  async confirmReturnedCash(profileId: string, orderId: string, amount: number): Promise<{ orderId: string; debtStatus: "settled_cash" }> {
    const merchantId = await this.ownMerchantId(profileId);
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, merchantId, orderType: "merchant" },
      select: { debtStatus: true, debtAmount: true, riderId: true },
    });
    if (!order) throw new NotFoundException("Order not found");
    if (order.debtStatus !== "open") throw new ConflictException("This order has no open debt to settle");
    const expected = Number(order.debtAmount ?? 0);
    if (Math.round(amount * 100) !== Math.round(expected * 100)) {
      throw new ConflictException(`Amount doesn't match — expected $${expected.toFixed(2)}, got $${amount.toFixed(2)}`);
    }
    await this.settleDebt(orderId, merchantId, order.riderId!, "settled_cash", expected);
    return { orderId, debtStatus: "settled_cash" };
  }

  /** For a no-cash-collected return (refusal/no-show, D-15's return leg) — the food itself is back
   *  with the merchant, so the debt nets to zero via a physical return, not cash. */
  async confirmGoodsReturned(profileId: string, orderId: string): Promise<{ orderId: string; debtStatus: "settled_goods" }> {
    const merchantId = await this.ownMerchantId(profileId);
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, merchantId, orderType: "merchant" },
      select: { debtStatus: true, debtAmount: true, riderId: true, status: true },
    });
    if (!order) throw new NotFoundException("Order not found");
    if (order.debtStatus !== "open") throw new ConflictException("This order has no open debt to settle");
    if (order.status !== "undelivered") throw new ConflictException("The goods haven't come back yet");
    await this.settleDebt(orderId, merchantId, order.riderId!, "settled_goods", Number(order.debtAmount ?? 0));
    return { orderId, debtStatus: "settled_goods" };
  }

  /** R-07: default risk sits with the merchant, by their own cashRule choice — if a rider never
   *  returns the cash, the merchant eats the loss and the rider is suspended and named (mirrors
   *  admin-riders.service.ts:suspendRider's shape: CAS on accountStatus, force offline, revoke live
   *  sessions, audit row — all in the SAME transaction as the debt write-off). */
  async reportNonReturn(profileId: string, orderId: string, note?: string): Promise<{ orderId: string; debtStatus: "written_off" }> {
    const merchantId = await this.ownMerchantId(profileId);
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, merchantId, orderType: "merchant" },
      select: { debtStatus: true, debtAmount: true, riderId: true },
    });
    if (!order) throw new NotFoundException("Order not found");
    if (order.debtStatus !== "open") throw new ConflictException("This order has no open debt to write off");
    if (!order.riderId) throw new ConflictException("No rider on this order");
    const riderId = order.riderId;
    const amount = Number(order.debtAmount ?? 0);

    await this.prisma.$transaction(async (tx) => {
      await this.settleDebt(orderId, merchantId, riderId, "written_off", amount, note, tx);
      const rider = await tx.rider.findUnique({ where: { profileId: riderId }, select: { accountStatus: true } });
      // A permanent ban outranks this — never downgrade a banned rider back to suspended (mirrors
      // admin-riders.service.ts:suspendRider's same guard).
      if (rider && rider.accountStatus !== RiderAccountStatus.BANNED) {
        const changed = await tx.rider.updateMany({
          where: { profileId: riderId, accountStatus: rider.accountStatus },
          data: { accountStatus: RiderAccountStatus.SUSPENDED, suspendReason: "food_debt_non_return", isOnline: false },
        });
        if (changed.count > 0) {
          await tx.session.updateMany({ where: { profileId: riderId, revokedAt: null }, data: { revokedAt: new Date() } });
          await tx.auditLog.create({
            data: {
              actor: profileId,
              action: "rider.suspend_food_debt",
              target: riderId,
              reasonCode: "food_debt_non_return",
              note: note ?? null,
            },
          });
        }
      }
    });
    void this.notifications.notifyProfiles([riderId], {
      title: "Your account has been suspended",
      body: "A restaurant reported you didn't return cash owed for a delivery. Contact support to resolve this.",
      data: { orderId, kind: "food_debt_suspend" },
    });
    return { orderId, debtStatus: "written_off" };
  }

  /** Guarded CAS settle (debtStatus:open → the given terminal type) + the matching append-only ledger
   *  row, `amount` always negative — nets the `opened` row's positive amount to zero. Accepts an
   *  in-flight transaction client (reportNonReturn) or runs its own (the other two callers). */
  private async settleDebt(
    orderId: string,
    merchantId: string,
    riderId: string,
    type: "settled_cash" | "settled_goods" | "written_off",
    amount: number,
    note?: string,
    txIn?: Prisma.TransactionClient,
  ): Promise<void> {
    const run = async (tx: Prisma.TransactionClient) => {
      const claimed = await tx.order.updateMany({
        where: { id: orderId, debtStatus: "open" },
        data: { debtStatus: type, debtSettledAt: new Date() },
      });
      if (claimed.count === 0) throw new ConflictException("Order changed, retry");
      try {
        await tx.merchantDebtLedger.create({
          data: { orderId, merchantId, riderId, type, amount: -amount, note: note ?? null, actor: "system" },
        });
      } catch (err) {
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
      }
    };
    if (txIn) await run(txIn);
    else await this.prisma.$transaction(run);
  }

  // ── D-12: merchant-issued refund after payment ──────────────────────────────────────────────────

  /** D-12: the merchant cannot cancel an already-WALLET-paid order without entering their own refund
   *  reference AND the exact amount first — the customer's order keeps it forever as evidence.
   *  Scoped to the window between payment-confirm and mark-ready (before dispatch/a rider is
   *  involved — a cleaner cut line than unwinding an in-flight delivery). N-12's 2h SLA escalation
   *  sweep is an open item — see the PR notes / plan §9 Q6. */
  async refundOrder(profileId: string, orderId: string, reference: string, amount: number): Promise<{ orderId: string; status: "cancelled" }> {
    const merchantId = await this.ownMerchantId(profileId);
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, merchantId, orderType: "merchant" },
      select: {
        status: true,
        merchantPhase: true,
        merchantPaymentMethod: true,
        merchantPaymentConfirmedAt: true,
        merchantGoodsTotal: true,
        customerId: true,
      },
    });
    if (!order) throw new NotFoundException("Order not found");
    if (order.merchantPaymentMethod !== "wallet" || !order.merchantPaymentConfirmedAt) {
      throw new ConflictException("Only a confirmed wallet payment can be refunded");
    }
    if (order.status !== "requested" || order.merchantPhase !== "preparing") {
      throw new ConflictException("This order can no longer be refunded here — it's already gone to dispatch");
    }
    const expected = Number(order.merchantGoodsTotal ?? 0);
    if (Math.round(amount * 100) !== Math.round(expected * 100)) {
      throw new ConflictException(`Refund amount doesn't match — expected $${expected.toFixed(2)}, got $${amount.toFixed(2)}`);
    }
    const claimed = await this.prisma.order.updateMany({
      where: { id: orderId, status: "requested", merchantPhase: "preparing" },
      data: {
        status: "cancelled",
        cancelledAt: new Date(),
        rejectionReason: "other",
        merchantPhase: null,
        refundReference: reference,
        refundAmount: amount,
        refundedAt: new Date(),
      },
    });
    if (claimed.count === 0) throw new ConflictException("Order changed, retry");
    await this.prisma.orderEvent.create({ data: { orderId, status: "cancelled" } });
    void this.notifications.notifyProfiles([order.customerId], {
      title: "Your order was cancelled and refunded",
      body: `The restaurant refunded $${amount.toFixed(2)} (ref ${reference}). Keep this reference for your records.`,
      data: { orderId, status: "cancelled", kind: "refund" },
    });
    return { orderId, status: "cancelled" };
  }

  // ── Shared lookup ─────────────────────────────────────────────────────────────────────────────────

  private async ownMerchantId(profileId: string): Promise<string> {
    return resolveOwnMerchantId(this.prisma, profileId);
  }
}
