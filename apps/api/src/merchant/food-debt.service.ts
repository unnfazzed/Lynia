import { ConflictException, Injectable, Logger, NotFoundException, type OnModuleDestroy, type OnModuleInit, Optional } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { foodOrderMoney, haversineKm, merchantAmountDueUsd, RESTAURANTS_DEBT, roundToCents } from "@lynia/shared";
import { penaltiesSuspended } from "../common/penalties";
import { merchantCustomerCopy, MERCHANT_STATUS_NOTICES, NotificationsService } from "../notifications/notifications.service";
import { OrderLifecycleService } from "../orders/order-lifecycle.service";
import { PrismaService } from "../prisma/prisma.service";
import { TrackingGateway } from "../tracking/tracking.gateway";
import { resolveOwnMerchantId } from "./merchant-lookup.util";
import { cancelAttribution } from "../common/cancel-attribution";

/**
 * C4 — food money evidence layer (docs/archive/plans/2026-07-28-restaurants-send-joint-launch-plan.md §5 Lane
 * C, packages/design/RESTAURANTS-DECISIONS.md §7 revision). Owns three things, each its own small
 * declarative machine (see order-lifecycle.transitions.ts's MERCHANT_DEBT_TRANSITIONS):
 *
 *  1. The doorstep dual-confirm handshake (R-04/R-05/N-19) for CASH food orders — customer confirms
 *     first, then the rider, and only then does the delivery code unlock (R-09, enforced in
 *     order-lifecycle.service.ts's rotateDeliveryCode/confirmDelivery, not here — this service only
 *     writes the two confirm timestamps a CASH order's code-reveal gate reads).
 *  2. The collect-and-return merchant-debt ledger (R-01/R-06/N-20/N-21) — opened at pickup (goods
 *     leave the counter unpaid), settled by the merchant's returned-cash count-confirm or a
 *     goods-only return (refusal/no-show, or a customer cancel after the rider collected — MJ-RB1).
 *     A merchant's non-return report only FLAGS the debt for support (owner decision D3, 2026-10-07):
 *     the write-off and any rider suspension are admin actions (AdminMerchantsService.writeOffDebt and
 *     the rider suspend console action), never automatic.
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
/** D3 (2026-10-07): the audit row a merchant's non-return report writes (domain-owned, see admin-audit). */
export const NON_RETURN_REPORT_ACTION = "merchant.report_non_return";

/** MJ-RB1 (2026-10-07): the goods are riding back to the venue — the order wasn't delivered, or the customer
 *  cancelled it after the rider collected it. The settle CAS of a goods-only return re-checks exactly this. */
const GOODS_RETURN_STATUS: Prisma.OrderWhereInput = {
  OR: [{ status: "undelivered" }, { status: "cancelled", collectedAt: { not: null } }],
};

/**
 * D5 (2026-10-07, U10): when an unresolved doorstep handshake freezes. The N-19 window
 * (`handshakeWindowMs`) is for counting notes at the door, so it runs from the moment both are there: from
 * the customer's confirm when the rider has already said "I'm here", else only once the rider does
 * (FoodDebtService.markAtDropoff starts it then). Until that, a confirm made on the way gets the long
 * `handshakeTripCeilingMs`, so the clock can never run out on the road; the ceiling is only reached by a
 * rider app that never stamps "I'm here" (the rider is job-locked meanwhile by the unconfirmed handshake).
 */
export function handshakeDeadline(confirmedAt: Date, riderAtDropoffAt: Date | null | undefined): Date {
  const span = riderAtDropoffAt ? RESTAURANTS_DEBT.handshakeWindowMs : RESTAURANTS_DEBT.handshakeTripCeilingMs;
  return new Date(confirmedAt.getTime() + span);
}

/**
 * D5 review (item 2): is the rider's "I'm here" plausible? Only a FRESH last ping (≤ atDropoffPingFreshMs)
 * more than atDropoffSanityRadiusM from the drop pin says no; no ping, a stale one or no pin says yes (the
 * stamp is a hint, and the rider may be offline).
 */
export function plausiblyAtDropoff(
  rider: { currentLat: number | null; currentLng: number | null; positionUpdatedAt: Date | null } | null | undefined,
  dropoff: unknown,
  nowMs: number,
): boolean {
  const pin = (dropoff as { point?: { lat?: unknown; lng?: unknown } } | null | undefined)?.point;
  if (!rider || rider.currentLat == null || rider.currentLng == null || !rider.positionUpdatedAt) return true;
  if (nowMs - rider.positionUpdatedAt.getTime() > RESTAURANTS_DEBT.atDropoffPingFreshMs) return true;
  if (!pin || typeof pin.lat !== "number" || typeof pin.lng !== "number") return true;
  const metres = haversineKm({ lat: rider.currentLat, lng: rider.currentLng }, { lat: pin.lat, lng: pin.lng }) * 1000;
  return metres <= RESTAURANTS_DEBT.atDropoffSanityRadiusM;
}

@Injectable()
export class FoodDebtService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FoodDebtService.name);
  private sweep?: ReturnType<typeof setInterval>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly lifecycle: OrderLifecycleService,
    @Optional() private readonly gateway?: TrackingGateway,
  ) {}

  /** P19 review (2026-10-07): the door-step writes (the rider's cash confirm, "I'm here", a freeze) change
   *  what the customer's order screen draws but no status, so nothing told an open screen to refetch — with
   *  the socket up its food read only polls as a safety net. Nudge the order room (customer + rider) with
   *  the existing `order:status` event. Best-effort and post-commit: a failed emit never touches the write. */
  private emitDoorStep(orderId: string, status: string | null | undefined): void {
    if (!status) return;
    try {
      this.gateway?.emitOrderStatus(orderId, status);
    } catch (err) {
      this.logger.warn(`status emit failed for order ${orderId}: ${(err as Error).message}`);
    }
  }

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
      deliveryFee?: Prisma.Decimal | number | null;
      merchantDeliveryShare?: Prisma.Decimal | number | null;
    },
  ): Promise<void> {
    if (order.merchantPaymentMethod !== "cash" || order.merchantCashRule !== "collect_and_return") return;
    if (!order.merchantId || !order.riderId) return;
    // D-71: on a free-delivery order the rider keeps the fee out of the goods money the customer paid, so
    // what comes back to the venue is the goods total less the venue's delivery share.
    const amount = roundToCents(
      foodOrderMoney({ goodsTotal: order.merchantGoodsTotal, deliveryFee: order.deliveryFee, merchantDeliveryShare: order.merchantDeliveryShare }).merchantNet,
    );
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
   *  THEN the confirms"). D5 (2026-10-07, U10): the customer's pay step is open for the whole ride to the
   *  door (no distance gate), so the N-19 clock only starts here when the rider has already said "I'm
   *  here"; otherwise it waits for the rider's "I'm here" ({@link markAtDropoff}) — see handshakeDeadline. */
  async confirmCustomerCash(
    orderId: string,
    customerId: string,
  ): Promise<{ orderId: string; customerCashConfirmedAt: string; cashHandshakeAmount: number; cashHandshakeDeadlineAt: string }> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, customerId, orderType: "merchant" },
      select: {
        status: true,
        merchantPaymentMethod: true,
        agreedFare: true,
        // C9: merchantAmountDueUsd's fallback when a row has no agreed fare.
        merchantGoodsTotal: true,
        deliveryFee: true,
        merchantDeliveryShare: true,
        customerCashConfirmedAt: true,
        riderId: true,
        riderAtDropoffAt: true,
        // Order flow v2 (BRIEF D3f): an earlier owed balance this order collects at the door, on top.
        carriedBalance: { select: { amount: true } },
      },
    });
    if (!order) throw new NotFoundException("Order not found");
    if (order.merchantPaymentMethod !== "cash") throw new ConflictException("This order isn't a cash order");
    if (order.status !== "en_route_dropoff") throw new ConflictException("The biker hasn't reached you yet");
    if (order.customerCashConfirmedAt) throw new ConflictException("Already confirmed");
    // C9: the one amount due (`merchantAmountDueUsd`) — the same figure the order read, the pushes and the
    // Orders history show.
    const amount = merchantAmountDueUsd(order) ?? 0;
    const now = new Date();
    // D5 review (item 4): the deadline depends on whether the rider has stamped "I'm here", read above,
    // outside the write. The CAS carries that same condition, so a stamp landing in between makes the
    // ceiling write a miss and the confirm is retried once with the stamp's (short) window.
    const confirm = (arrived: boolean) =>
      this.prisma.order.updateMany({
        where: { id: orderId, status: "en_route_dropoff", customerCashConfirmedAt: null, riderAtDropoffAt: arrived ? { not: null } : null },
        data: {
          customerCashConfirmedAt: now,
          cashHandshakeAmount: amount,
          cashHandshakeDeadlineAt: handshakeDeadline(now, arrived ? now : null),
        },
      });
    let arrived = order.riderAtDropoffAt != null;
    let claimed = await confirm(arrived);
    if (claimed.count === 0 && !arrived) {
      arrived = true;
      claimed = await confirm(true);
    }
    if (claimed.count === 0) throw new ConflictException("Order changed, retry");
    this.emitDoorStep(orderId, order.status);
    if (order.riderId) {
      void this.notifications.notifyProfiles([order.riderId], {
        title: "Customer confirmed payment",
        body: `Confirm you received $${amount.toFixed(2)} to reveal the delivery code.`,
        data: { orderId, kind: "cash_handshake_customer_confirmed" },
      });
    }
    // P22 review: the whole handshake the write stamped (additive fields), so the app can show it at once.
    return {
      orderId,
      customerCashConfirmedAt: now.toISOString(),
      cashHandshakeAmount: amount,
      cashHandshakeDeadlineAt: handshakeDeadline(now, arrived ? now : null).toISOString(),
    };
  }

  /** Rider taps "I received $X" — second (R-04). This is what unlocks the code (R-09) — enforced in
   *  order-lifecycle.service.ts, which reads these two timestamps; not this method's job. */
  async confirmRiderCash(orderId: string, riderId: string): Promise<{ orderId: string; riderCashConfirmedAt: string }> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, riderId, orderType: "merchant" },
      select: { status: true, customerCashConfirmedAt: true, riderCashConfirmedAt: true, cashHandshakeFrozenAt: true, customerId: true },
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
    // The code is unlocked: the customer's screen shows it at once rather than on its next poll.
    this.emitDoorStep(orderId, order.status ?? "en_route_dropoff");
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
    // LC-D-SIB-3: freeze() re-checks the handshake is still unresolved inside its own CAS, so a
    // concurrent confirmRiderCash landing after the read above makes this a miss, not a false freeze.
    // A miss on an already-frozen handshake (a double-tapped dispute) stays an idempotent success.
    if (!(await this.freeze(orderId))) {
      const fresh = await this.prisma.order.findUnique({ where: { id: orderId }, select: { cashHandshakeFrozenAt: true } });
      if (!fresh?.cashHandshakeFrozenAt) throw new ConflictException("Nothing to dispute right now");
    }
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
        // D5 review (item 3): only a ride still at the door can freeze — a cancelled / undelivered order's
        // handshake is closed by the lifecycle, and must never page support "something didn't match".
        status: "en_route_dropoff",
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

  /** LC-D-SIB-3: the CAS carries the whole "still unresolved" precondition both callers read outside
   *  it (customer confirmed, rider not yet) — never just `cashHandshakeFrozenAt: null` — so a rider
   *  confirm committing in the gap can't leave a resolved handshake frozen (false pushes, and an order
   *  no queue ever resurfaces). The mirror of confirmRiderCash's own CAS on `cashHandshakeFrozenAt: null`. */
  private async freeze(orderId: string): Promise<boolean> {
    const claimed = await this.prisma.order.updateMany({
      where: { id: orderId, cashHandshakeFrozenAt: null, customerCashConfirmedAt: { not: null }, riderCashConfirmedAt: null },
      data: { cashHandshakeFrozenAt: new Date() },
    });
    if (claimed.count === 0) return false;
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { customerId: true, riderId: true, status: true } });
    if (order) {
      this.emitDoorStep(orderId, order.status ?? "en_route_dropoff");
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
    // LC-D-SIB-4: an atomic DB-side append (`push`), never a JS read-modify-write of the whole array —
    // two near-simultaneous calls (a flaky-network double-tap) must both land, or a rider who genuinely
    // made N-10's minimum calls is left short of it.
    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { noShowCallTimestamps: { push: new Date() } },
      select: { noShowCallTimestamps: true },
    });
    return { orderId, callsLogged: updated.noShowCallTimestamps.length };
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
      select: { customerId: true, customerCashConfirmedAt: true, riderCashConfirmedAt: true, cashHandshakeFrozenAt: true },
    });
    if (!order) throw new NotFoundException("Order not found");
    // D5 review (item 3a): the customer can now tap "I've paid" on the way, so their confirm alone no
    // longer blocks a refusal (it would let a customer confirm early, then refuse and dodge R-08). Only the
    // RIDER's confirm (the cash really changed hands) or a frozen dispute (support has it) blocks it.
    // markUndelivered voids the customer's unresolved confirm in the same transaction as the undelivered CAS.
    if (order.riderCashConfirmedAt) throw new ConflictException("You already confirmed the cash");
    if (order.cashHandshakeFrozenAt) throw new ConflictException("This handshake is frozen — support has been notified");
    await this.lifecycle.markUndelivered(orderId, riderId, "refused");
    // Penalty suspension (common/penalties.ts): the refusal is still recorded on the order (undelivered,
    // reason "refused"), but the customer is not cash-banned.
    if (!penaltiesSuspended()) {
      await this.prisma.profile.updateMany({
        where: { id: order.customerId, cashBanned: false },
        data: { cashBanned: true, cashBanReason: "Refused or couldn't pay a cash food order", cashBannedAt: new Date() },
      });
    }
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
   *  with the merchant, so the debt nets to zero via a physical return, not cash. MJ-RB1 (2026-10-07):
   *  a customer cancel AFTER the rider collected sends the food back the same way, so a `cancelled`
   *  order with `collectedAt` set is accepted too — precisely that case, nothing wider. A merchant's
   *  earlier non-return flag (D3) needs no extra write: settling the debt takes it off the admin queue. */
  async confirmGoodsReturned(profileId: string, orderId: string): Promise<{ orderId: string; debtStatus: "settled_goods" }> {
    const merchantId = await this.ownMerchantId(profileId);
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, merchantId, orderType: "merchant" },
      select: { debtStatus: true, debtAmount: true, riderId: true, status: true, collectedAt: true },
    });
    if (!order) throw new NotFoundException("Order not found");
    if (order.debtStatus !== "open") throw new ConflictException("This order has no open debt to settle");
    const goodsComingBack = order.status === "undelivered" || (order.status === "cancelled" && order.collectedAt != null);
    if (!goodsComingBack) throw new ConflictException("The goods haven't come back yet");
    // LC-D-SIB-3 sibling: the settle CAS re-checks the same status condition, so an admin
    // adjudicateDelivered committing after the read above can't leave "goods returned" on a completed order.
    await this.settleDebt(orderId, merchantId, order.riderId!, "settled_goods", Number(order.debtAmount ?? 0), undefined, undefined, GOODS_RETURN_STATUS);
    return { orderId, debtStatus: "settled_goods" };
  }

  /**
   * Owner decision D3 (2026-10-07, MJ-RH1): "It wasn't returned" FLAGS the order for LyniaGo support —
   * exactly what the merchant's K5c sheet says ("We flag it to LyniaGo support, who follow it up with the
   * rider"). It never writes off the debt, never suspends the rider, never revokes a session and never
   * pushes the rider: the button sits next to "I got the food back" while the rider may still be riding
   * back, and the debt stays `open` so that button still settles it afterwards. An admin reads the flag in
   * the dispute queue (AdminMerchantsService.listDisputes) and decides — write-off
   * (AdminMerchantsService.writeOffDebt) and suspension (the rider console action) are admin-only.
   * Idempotent: a second report of the same order returns the first report's time.
   */
  async reportNonReturn(profileId: string, orderId: string, note?: string): Promise<{ orderId: string; debtStatus: "open"; reportedAt: string }> {
    const merchantId = await this.ownMerchantId(profileId);
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, merchantId, orderType: "merchant" },
      select: { debtStatus: true, riderId: true, debtNonReturnReportedAt: true, status: true, collectedAt: true },
    });
    if (!order) throw new NotFoundException("Order not found");
    if (order.debtStatus !== "open") throw new ConflictException("This order has no open debt to report");
    // D5 review (item 6): only once something is due back — the cash after a delivery, or the goods after a
    // failed delivery / a cancel after pickup. Never while the rider is still riding to the customer.
    const dueBack =
      order.status === "delivered" || order.status === "completed" || order.status === "undelivered" || (order.status === "cancelled" && order.collectedAt != null);
    if (!dueBack) throw new ConflictException("Nothing is due back yet — the biker is still on the way");
    if (!order.riderId) throw new ConflictException("No biker on this order");
    if (order.debtNonReturnReportedAt) return { orderId, debtStatus: "open", reportedAt: order.debtNonReturnReportedAt.toISOString() };
    const now = new Date();
    const reported = await this.prisma.$transaction(async (tx) => {
      // CAS on the debt still being open and not yet reported: a "got it back" settle committing after the
      // read above makes this a miss (nothing left to report), never a flag on a settled debt.
      const claimed = await tx.order.updateMany({
        where: { id: orderId, debtStatus: "open", debtNonReturnReportedAt: null },
        data: { debtNonReturnReportedAt: now },
      });
      if (claimed.count === 0) return false;
      await tx.auditLog.create({
        data: { actor: profileId, action: NON_RETURN_REPORT_ACTION, target: orderId, reasonCode: "food_debt_non_return", note: note ?? null },
      });
      return true;
    });
    if (!reported) {
      const fresh = await this.prisma.order.findUnique({ where: { id: orderId }, select: { debtStatus: true, debtNonReturnReportedAt: true } });
      if (fresh?.debtStatus === "open" && fresh.debtNonReturnReportedAt) return { orderId, debtStatus: "open", reportedAt: fresh.debtNonReturnReportedAt.toISOString() };
      throw new ConflictException("Order changed, retry");
    }
    return { orderId, debtStatus: "open", reportedAt: now.toISOString() };
  }

  /**
   * D5 (2026-10-07, U10): the rider's "I'm here" at the drop-off, stamped once on the server. A HINT, never
   * a gate — the customer's pay step is open for the whole ride (`en_route_dropoff`) with or without it.
   * The customer's door card and "at your door" feed step follow it, and when the customer confirmed
   * paying before the rider arrived it starts the real N-19 handshake window now (the customer's early
   * confirm only set the long trip ceiling, see handshakeDeadline). Idempotent.
   */
  async markAtDropoff(orderId: string, riderId: string): Promise<{ orderId: string; riderAtDropoffAt: string }> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, riderId, orderType: "merchant" },
      select: {
        status: true,
        riderAtDropoffAt: true,
        dropoff: true,
        customerId: true,
        agreedFare: true,
        carriedBalance: { select: { amount: true } },
        merchant: { select: { name: true } },
        rider: { select: { currentLat: true, currentLng: true, positionUpdatedAt: true, profile: { select: { firstName: true } } } },
      },
    });
    if (!order) throw new NotFoundException("Order not found");
    if (order.riderAtDropoffAt) return { orderId, riderAtDropoffAt: order.riderAtDropoffAt.toISOString() };
    // D5 review (item 2): only on the ride to the customer — the rider app steps picked_up → en_route_dropoff
    // right after collecting, so a stamp at picked_up could only be an early (mistaken) tap.
    if (order.status !== "en_route_dropoff") {
      throw new ConflictException("You can only arrive while taking the order to the customer");
    }
    // D5 review (item 2): a sanity check, not a geofence — a FRESH last ping more than ~1 km from the drop
    // pin means the tap was early (it would start the customer's handshake clock mid-ride). No fresh ping
    // (offline, GPS off): the stamp is taken on trust; it is only a hint.
    if (!plausiblyAtDropoff(order.rider, order.dropoff, Date.now())) {
      throw new ConflictException("You're not at the drop-off yet");
    }
    const now = new Date();
    const claimed = await this.prisma.order.updateMany({
      where: { id: orderId, riderId, riderAtDropoffAt: null, status: "en_route_dropoff" },
      data: { riderAtDropoffAt: now },
    });
    if (claimed.count === 0) {
      const fresh = await this.prisma.order.findUnique({ where: { id: orderId }, select: { riderAtDropoffAt: true } });
      if (fresh?.riderAtDropoffAt) return { orderId, riderAtDropoffAt: fresh.riderAtDropoffAt.toISOString() };
      throw new ConflictException("Order changed, retry");
    }
    // The customer confirmed on the way, BEFORE this stamp (D5): their confirm set only the trip ceiling, so
    // the window starts now — the longer `handshakeAfterArrivalMs` (item 1), since the customer only learns
    // the rider is here from the push below and still has to come out. Guarded on the handshake still being
    // unresolved and on the confirm predating the stamp (a confirm after it already has its own window).
    await this.prisma.order.updateMany({
      where: { id: orderId, customerCashConfirmedAt: { lt: now }, riderCashConfirmedAt: null, cashHandshakeFrozenAt: null },
      data: { cashHandshakeDeadlineAt: new Date(now.getTime() + RESTAURANTS_DEBT.handshakeAfterArrivalMs) },
    });
    // D5 review (item 1): the drawn "{n} is at your door · Have $X cash ready" push (G3a `atDoor`), sent on
    // the rider's arrival — never on the `en_route_dropoff` status, which fires right after pickup (U12,
    // MERCHANT_SILENT_PUSH). Best-effort, post-commit.
    // "At your door" (the stage the stamp drives) shows on an open screen at once.
    this.emitDoorStep(orderId, "en_route_dropoff");
    const fallback = MERCHANT_STATUS_NOTICES.en_route_dropoff!;
    const copy = merchantCustomerCopy("en_route_dropoff", order) ?? fallback;
    void this.notifications.notifyProfiles([order.customerId], {
      title: copy.title,
      body: copy.body,
      data: { orderId, status: "en_route_dropoff", to: "customer", orderType: "merchant", kind: "rider_at_dropoff" },
      collapseKey: `order:${orderId}:en_route_dropoff`,
    });
    return { orderId, riderAtDropoffAt: now.toISOString() };
  }

  /** Guarded CAS settle (debtStatus:open → the given terminal type) + the matching append-only ledger
   *  row, `amount` always negative — nets the `opened` row's positive amount to zero. Accepts an
   *  in-flight transaction client or runs its own. `requireStatus` folds the caller's own order-status
   *  precondition into the same CAS (LC-D-SIB-3). */
  private async settleDebt(
    orderId: string,
    merchantId: string,
    riderId: string,
    type: "settled_cash" | "settled_goods" | "written_off",
    amount: number,
    note?: string,
    txIn?: Prisma.TransactionClient,
    requireStatus?: Prisma.OrderWhereInput,
  ): Promise<void> {
    const run = async (tx: Prisma.TransactionClient) => {
      const claimed = await tx.order.updateMany({
        where: { id: orderId, debtStatus: "open", ...requireStatus },
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
        // Admin console v2 §3: the venue refunded a paid wallet order while cooking.
        ...cancelAttribution({ by: "merchant", status: "requested", merchantPhase: "preparing", reasonCode: "refunded" }),
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
