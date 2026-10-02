import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { businessBookingAccountPhone, normalizePhone, RESTAURANTS_DEBT, type Waypoint } from "@lynia/shared";
import { maskPhone } from "../common/phone-mask";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { auditData, fmtDate, routeOf } from "./admin.shared";

/** Merchant web upgrade L4: support's handover of a business, audit-logged in the same transaction. */
export const OWNER_TRANSFER_ACTION = "merchant.owner_transfer";

/** The directory/detail's shared column set (L1 added type, kind and the location for landmark + phone). */
const MERCHANT_DIRECTORY_SELECT = {
  id: true,
  name: true,
  cashRule: true,
  pilotEnabled: true,
  busyMode: true,
  cuisineTags: true,
  createdAt: true,
  businessType: true,
  shopKind: true,
  location: true,
} as const;

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
   *  admin-customers.service.ts's listCustomers aggregation shape). Newest first.
   *
   *  Merchant web upgrade L1 (plan 2026-09-29 D5): `filter=awaiting_go_live` is the ops queue —
   *  businesses that signed up and aren't switched on yet; `filter=shops` lists signed-up shops (live or
   *  not), which go live through the same switch (ledger D-58). */
  async listMerchants(filter?: string) {
    const where =
      filter === "awaiting_go_live"
        ? { pilotEnabled: false }
        : filter === "shops"
          ? { businessType: "shop" as const }
          : {};
    const merchants = await this.prisma.merchant.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      select: MERCHANT_DIRECTORY_SELECT,
    });
    const ids = merchants.map((m) => m.id);
    const [orderCounts, openDebt] = await Promise.all([
      this.prisma.order.groupBy({ by: ["merchantId"], where: { merchantId: { in: ids } }, _count: { _all: true } }),
      this.prisma.order.groupBy({
        by: ["merchantId"],
        // An order the merchant closed with nothing owed (D-48 "No cash on this one") isn't open debt.
        where: { merchantId: { in: ids }, debtStatus: "open", merchantClosedAt: null },
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
      select: { ...MERCHANT_DIRECTORY_SELECT, description: true, priceLevel: true, autoAccept: true, showPhoneToCustomers: true, freeDelivery: true },
    });
    if (!merchant) return null;

    const DEBT_LEDGER_PAGE_SIZE = 30;
    const [orderCount, openDebt, recentOrders, ledgerRows, bookingAccount] = await Promise.all([
      this.prisma.order.count({ where: { merchantId: id } }),
      this.prisma.order.aggregate({ where: { merchantId: id, debtStatus: "open", merchantClosedAt: null }, _sum: { debtAmount: true }, _count: { _all: true } }),
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
      // Merchant web upgrade L2 (R2-5): the business's booking account. Holding it (the existing
      // customer hold, on its own page) pauses every booking the business makes. Null before its first.
      this.prisma.profile.findUnique({ where: { phone: businessBookingAccountPhone(id) }, select: { id: true, onHold: true } }),
    ]);

    const debtLedgerHasMore = ledgerRows.length > DEBT_LEDGER_PAGE_SIZE;
    const ledger = debtLedgerHasMore ? ledgerRows.slice(0, DEBT_LEDGER_PAGE_SIZE) : ledgerRows;

    const base = this.toMerchant(merchant, orderCount, { amount: openDebt._sum.debtAmount, count: openDebt._count._all });
    const location = (merchant.location as Waypoint | null) ?? null;
    return {
      ...base,
      description: merchant.description,
      priceLevel: merchant.priceLevel,
      // Auto-accept (docs/plans/2026-09-30-restaurant-auto-accept.md): how the restaurant takes orders —
      // the current values behind the profile's "Taking orders" switches.
      autoAccept: merchant.autoAccept ?? false,
      showPhoneToCustomers: merchant.showPhoneToCustomers ?? false,
      // D-71: the venue pays the delivery fee on new cash orders.
      freeDelivery: merchant.freeDelivery ?? false,
      // The detail page is where ops calls a business before switching it on (go-live runbook): the
      // business contact phone is the number riders are given at pickup, so it's shown in full here
      // (the directory list keeps it masked).
      contactPhone: location?.contactPhone ?? null,
      pin: location?.point ?? null,
      bookingAccount: bookingAccount ? { id: bookingAccount.id, onHold: bookingAccount.onHold } : null,
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

  /**
   * The go-live switch (merchant web upgrade L1; RCA-MERCHANT-NOT-SET-UP-2026-08-18 fix #1) — the ONLY
   * writer of `pilotEnabled`, the flag the customer restaurant, shop and pharmacy lists filter on. The flip and its audit
   * row are one transaction. Idempotent: setting the current value writes nothing.
   *
   * Refused (409) when switching ON a business with no pickup pin (placeOrder would 409 every order,
   * and a shop's delivery fee can't be quoted) or no live, photo'd dish / item (the menu or catalogue
   * would be empty). Restaurants and shops go live the same way (ledger D-58); a live shop shows in the
   * customer Shops or Pharmacy section while that section's flag is on. The rest of the go-live checks
   * are the ops runbook's human call (docs/MERCHANT-GO-LIVE-RUNBOOK.md) — a pharmacy's licence among them.
   * Switching OFF is always allowed.
   */
  async setPilot(actor: string, id: string, input: { enabled: boolean; note?: string | null }) {
    return this.prisma.$transaction(async (tx) => {
      const merchant = await tx.merchant.findUnique({ where: { id }, select: { id: true, businessType: true, pilotEnabled: true, location: true } });
      if (!merchant) throw new NotFoundException("Merchant not found");
      if (merchant.pilotEnabled === input.enabled) return { id, pilotEnabled: merchant.pilotEnabled, auditId: null };
      if (input.enabled) {
        const noun = merchant.businessType === "shop" ? "shop" : "restaurant";
        if (!merchant.location) {
          throw new ConflictException({ reason: "no_location", message: `This ${noun} has no pickup pin yet.` });
        }
        const liveDishes = await tx.merchantDish.count({ where: { merchantId: id, isDraft: false } });
        if (liveDishes === 0) {
          throw new ConflictException({
            reason: "no_live_dishes",
            message: noun === "shop" ? "This shop has no item with a photo yet — its shop would be empty." : "This restaurant has no dish with a photo yet — its menu would be empty.",
          });
        }
      }
      await tx.merchant.update({ where: { id }, data: { pilotEnabled: input.enabled } });
      const audit = await tx.auditLog.create({
        data: auditData(actor, input.enabled ? "merchant.go_live" : "merchant.go_dormant", id, null, input.note ?? null),
        select: { id: true },
      });
      return { id, pilotEnabled: input.enabled, auditId: audit.id };
    });
  }

  /**
   * Hand a business to another person (merchant web upgrade L4, "Owner rules"): the only way ownership
   * moves, for a sale or a lost number, after support has checked identity by call or visit plus ID
   * (docs/MERCHANT-GO-LIVE-RUNBOOK.md). The note is required and goes on the audit row, which commits
   * with the change. Nobody's data is edited by hand.
   *
   * The new owner is found by the number they sign in with. They must already be on this business's team
   * or on no business at all, and in good standing (the same people who can't open a business can't be
   * handed one). The old owner stays on the team as Staff, and the new owner can remove them in Team.
   * `merchants.owner_profile_id` follows, so `ownerPhoneMasked` and the legacy resolver agree with the
   * team.
   */
  async transferOwner(actor: string, id: string, input: { phone: string; note: string }) {
    const phone = normalizePhone(input.phone);
    if (!phone) throw new BadRequestException({ reason: "bad_phone", message: "Enter the new owner's phone number, like 0771234567." });
    try {
      return await this.transferOwnerTx(actor, id, phone, input.note);
    } catch (err) {
      // The new owner joined another business in the same instant (unique member profile_id).
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictException({ reason: "member_elsewhere", message: "That number works at another business. They must leave it first." });
      }
      throw err;
    }
  }

  private async transferOwnerTx(actor: string, id: string, phone: string, note: string) {
    return this.prisma.$transaction(async (tx) => {
      // One handover at a time per business.
      await tx.$executeRaw`SELECT 1 FROM merchants WHERE id = ${id}::uuid FOR UPDATE`;
      const merchant = await tx.merchant.findUnique({ where: { id }, select: { id: true, name: true, ownerProfileId: true } });
      if (!merchant) throw new NotFoundException("Merchant not found");
      const next = await tx.profile.findUnique({
        where: { phone },
        select: { id: true, firstName: true, lastName: true, onHold: true, rider: { select: { accountStatus: true } } },
      });
      if (!next) {
        throw new NotFoundException({ reason: "no_account", message: "That number has no LyniaGo account yet. Ask them to sign in once, then try again." });
      }
      if (next.onHold || (next.rider && next.rider.accountStatus !== "active")) {
        throw new ConflictException({ reason: "account_restricted", message: "That account is on hold or restricted. Sort that out before handing it a business." });
      }
      // A handover still goes only to someone on no other business: branches are opened by their owner
      // (docs/plans/2026-09-30-multi-branch-owners.md), never assembled by support.
      const [nextMember, nextElsewhere, nextOwnsOther, currentOwner] = await Promise.all([
        tx.merchantMember.findUnique({ where: { profileId_merchantId: { profileId: next.id, merchantId: id } }, select: { id: true, role: true } }),
        tx.merchantMember.count({ where: { profileId: next.id, merchantId: { not: id } } }),
        tx.merchant.findFirst({ where: { ownerProfileId: next.id, id: { not: id } }, select: { id: true } }),
        tx.merchantMember.findFirst({ where: { merchantId: id, role: "owner" }, select: { id: true, profileId: true } }),
      ]);
      if (nextElsewhere > 0 || nextOwnsOther) {
        throw new ConflictException({ reason: "member_elsewhere", message: "That number works at another business. They must leave it first." });
      }
      if (nextMember?.role === "owner") throw new ConflictException({ reason: "already_owner", message: "That number already owns this business." });

      // The old owner steps down first: a business has exactly one owner (a partial unique index).
      const previousOwnerProfileId = currentOwner?.profileId ?? merchant.ownerProfileId;
      if (currentOwner) {
        await tx.merchantMember.update({ where: { id: currentOwner.id }, data: { role: "staff" } });
      } else if (merchant.ownerProfileId) {
        // A business whose owner row was never backfilled: the old owner still joins the team as Staff.
        const previous = await tx.profile.findUnique({ where: { id: merchant.ownerProfileId }, select: { firstName: true, lastName: true } });
        const onATeam = await tx.merchantMember.count({ where: { profileId: merchant.ownerProfileId } });
        if (previous && onATeam === 0) {
          await tx.merchantMember.create({
            data: { merchantId: id, profileId: merchant.ownerProfileId, role: "staff", displayName: personName(previous, merchant.name) },
          });
        }
      }
      if (nextMember) {
        await tx.merchantMember.update({ where: { id: nextMember.id }, data: { role: "owner" } });
      } else {
        // Not on the team yet: they join as its owner. No terms acceptance is recorded for them, because
        // support can't accept on someone's behalf (the runbook's handover steps cover the terms).
        await tx.merchantMember.create({
          data: { merchantId: id, profileId: next.id, role: "owner", displayName: personName(next, merchant.name), addedByProfileId: null },
        });
      }
      await tx.merchant.update({ where: { id }, data: { ownerProfileId: next.id } });
      // An invite to the new owner's number has nothing left to do.
      await tx.merchantInvite.deleteMany({ where: { merchantId: id, phone } });
      const audit = await tx.auditLog.create({ data: auditData(actor, OWNER_TRANSFER_ACTION, id, null, note), select: { id: true } });
      return { id, ownerProfileId: next.id, previousOwnerProfileId: previousOwnerProfileId ?? null, auditId: audit.id };
    });
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
      businessType: string;
      shopKind: string | null;
      location: unknown;
    },
    orders: number,
    openDebt?: { amount: { toString: () => string } | null; count: number },
  ) {
    const location = (m.location as Waypoint | null) ?? null;
    return {
      id: m.id,
      name: m.name,
      cashRule: m.cashRule,
      pilotEnabled: m.pilotEnabled,
      busyMode: m.busyMode,
      cuisineTags: m.cuisineTags,
      businessType: m.businessType,
      shopKind: m.shopKind,
      landmark: location?.landmark ?? null,
      contactPhoneMasked: location?.contactPhone ? maskPhone(location.contactPhone) : null,
      orders,
      openDebtAmount: openDebt?.amount ? openDebt.amount.toString() : "0.00",
      openDebtCount: openDebt?.count ?? 0,
      joined: fmtDate(m.createdAt),
    };
  }
}

/** A person's name as a team shows it: their LyniaGo profile name, or the business's when it's empty. */
function personName(p: { firstName: string; lastName: string }, fallback: string): string {
  return `${p.firstName} ${p.lastName}`.trim() || fallback;
}
