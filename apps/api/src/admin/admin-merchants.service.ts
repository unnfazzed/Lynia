import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { businessBookingAccountPhone, normalizePhone, RESTAURANTS_DEBT, type Waypoint } from "@lynia/shared";
import { currentThumbKey } from "../adapters/storage/photo-thumbnail";
import { STORAGE, type StorageAdapter } from "../adapters/storage/storage.interface";
import { maskPhone } from "../common/phone-mask";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { AdminMerchantApplicationService } from "./admin-merchant-application.service";
import { auditData, fmtDate, routeOf } from "./admin.shared";
import { applicationStatusWhere, effectiveApplicationStatus, type ApplicationStatus } from "./merchant-application";
import type { MERCHANT_APPLICATION_WAITING_VIEW } from "@lynia/shared";

/** Admin console v2 §5: a queue chip — one stored state, or "waiting" (applied + in review). */
export type ApplicationQueueView = ApplicationStatus | typeof MERCHANT_APPLICATION_WAITING_VIEW;

/** A page of the directory or a queue; the last row's id is the cursor for the next page. */
const MERCHANT_PAGE_SIZE = 100;

/** D3 (2026-10-07): an admin's write-off of an open food debt, audit-logged in the same transaction. */
export const DEBT_WRITE_OFF_ACTION = "order.debt_write_off";

/** Merchant web upgrade L4: support's handover of a business, audit-logged in the same transaction. */
export const OWNER_TRANSFER_ACTION = "merchant.owner_transfer";

/** A refund the merchant paid outside the app, recorded by support so it leaves the overdue list. */
export const REFUND_RECORD_ACTION = "order.refund_record";

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
  // Admin console v2 §5: the application state (the queue's chips, the detail's application card).
  applicationStatus: true,
} as const;

/** The queue columns the checklist score needs on top of the directory's. */
const MERCHANT_QUEUE_SELECT = {
  ...MERCHANT_DIRECTORY_SELECT,
  hours: true,
  logoUrl: true,
  coverPhotoUrl: true,
  description: true,
  applicationStatusAt: true,
  applicationQueuedAt: true,
  applicationReasonCode: true,
  approvedAt: true,
  approvedBy: true,
} as const;

/** The shop front on the detail page: one hour is plenty for a reviewer's visit. */
const SHOP_FRONT_PHOTO_TTL_SECONDS = 60 * 60;

/** How many items the detail page previews (the checklist row still counts all of them). */
const SHOP_FRONT_ITEM_PREVIEW = 12;

const WEEK_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

/** `Merchant.hours` ({ mon: { open, close }, … }) as one row per day, closed days included. */
export function weeklyHours(hours: unknown): { day: (typeof WEEK_DAYS)[number]; open: string | null; close: string | null }[] {
  const h = hours && typeof hours === "object" ? (hours as Record<string, unknown>) : {};
  return WEEK_DAYS.map((day) => {
    const w = h[day] as { open?: unknown; close?: unknown } | null | undefined;
    const open = w && typeof w.open === "string" ? w.open : null;
    const close = w && typeof w.close === "string" ? w.close : null;
    return { day, open: open && close ? open : null, close: open && close ? close : null };
  });
}

/** The application states the queue keeps oldest first (they wait on ops). */
const OLDEST_FIRST: readonly ApplicationQueueView[] = ["applied", "reviewing", "approved", "waiting"];

/**
 * X1 — admin alignment for the merchant vertical (docs/archive/plans/2026-07-28-restaurants-send-joint-launch-plan.md
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
 * Admin console v2 §5: a merchant's standing is its application state (applied → reviewing → approved →
 * live, rejected, suspended), owned by AdminMerchantApplicationService; this file lists and shows it.
 *
 * Owner decision D3 (2026-10-07, MJ-RH1): a merchant's "It wasn't returned" no longer writes off the debt
 * or suspends the rider by itself. It is a flag (`debtNonReturnReportedAt`) that lands in this dispute
 * queue (`nonReturnReports`); support follows it up and an admin decides — `writeOffDebt` below closes the
 * debt, and the rider suspend console action (admin-riders.service.ts) is the only suspension path.
 */
@Injectable()
export class AdminMerchantsService {
  constructor(
    private readonly prisma: PrismaService,
    // Optional so unit tests can construct with just Prisma — its module is @Global in the app, so no
    // import wiring is needed to inject this (mirrors admin-customers.service.ts).
    @Optional() private readonly notifications?: NotificationsService,
    @Optional() private readonly applicationService?: AdminMerchantApplicationService,
    // Signs the shop front's photos for the detail page; absent in unit harnesses (photos read as null).
    @Optional() @Inject(STORAGE) private readonly storage?: StorageAdapter,
  ) {}

  /** A short-lived signed read URL for a stored photo key, or null (no photo, no storage, or signing failed). */
  private async signPhoto(key: string | null | undefined): Promise<string | null> {
    if (!key || !this.storage) return null;
    return this.storage.createReadUrl(key, SHOP_FRONT_PHOTO_TTL_SECONDS).catch(() => null);
  }

  /** The application state machine (injected in the app; built on demand in unit tests). */
  private get application(): AdminMerchantApplicationService {
    return this.applicationService ?? new AdminMerchantApplicationService(this.prisma);
  }

  /** Merchant directory: order volume + open-debt total per merchant, batched (mirrors
   *  admin-customers.service.ts's listCustomers aggregation shape). Newest first.
   *
   *  Merchant web upgrade L1 (plan 2026-09-29 D5): `filter=awaiting_go_live` is the ops queue —
   *  businesses that signed up and aren't switched on yet; `filter=shops` lists signed-up shops (live or
   *  not), which go live through the same switch (ledger D-58). */
  async listMerchants(filter?: string, status?: ApplicationQueueView, cursor?: string) {
    // Admin console v2 §5: `status` is the application queue (one chip per state). Waiting states read
    // oldest first, with the age, SLA and checklist score on each row. Pages of 100: `cursor` is the last
    // row's id from the page before.
    if (status) return this.listApplicationQueue(status, cursor);
    const where =
      filter === "awaiting_go_live"
        ? { pilotEnabled: false }
        : filter === "shops"
          ? { businessType: "shop" as const }
          : {};
    const merchants = await this.prisma.merchant.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: MERCHANT_PAGE_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
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

  private async listApplicationQueue(status: ApplicationQueueView, cursor?: string) {
    const dir = OLDEST_FIRST.includes(status) ? "asc" : "desc";
    const merchants = await this.prisma.merchant.findMany({
      where: applicationStatusWhere(status),
      orderBy: [{ createdAt: dir }, { id: dir }],
      take: MERCHANT_PAGE_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: MERCHANT_QUEUE_SELECT,
    });
    const ids = merchants.map((m) => m.id);
    const [orderCounts, openDebt, queue] = await Promise.all([
      this.prisma.order.groupBy({ by: ["merchantId"], where: { merchantId: { in: ids } }, _count: { _all: true } }),
      this.prisma.order.groupBy({
        by: ["merchantId"],
        where: { merchantId: { in: ids }, debtStatus: "open", merchantClosedAt: null },
        _sum: { debtAmount: true },
        _count: { _all: true },
      }),
      this.application.queueRows(merchants),
    ]);
    const ordersBy = new Map(orderCounts.map((r) => [r.merchantId, r._count._all]));
    const debtBy = new Map(openDebt.map((r) => [r.merchantId, { amount: r._sum.debtAmount, count: r._count._all }]));
    return merchants.map((m) => ({ ...this.toMerchant(m, ordersBy.get(m.id) ?? 0, debtBy.get(m.id)), ...queue.get(m.id) }));
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
        ...MERCHANT_DIRECTORY_SELECT,
        description: true,
        priceLevel: true,
        autoAccept: true,
        showPhoneToCustomers: true,
        freeDelivery: true,
        // The shop front ops reviews before approving (owner, 2026-10-18).
        logoUrl: true,
        logoThumbKey: true,
        coverPhotoUrl: true,
        hours: true,
      },
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
        select: {
          id: true,
          orderId: true,
          riderId: true,
          // The biker's name, so the ledger reads as a person, not an id.
          rider: { select: { profile: { select: { firstName: true, lastName: true } } } },
          type: true,
          amount: true,
          note: true,
          actor: true,
          createdAt: true,
        },
      }),
      // Merchant web upgrade L2 (R2-5): the business's booking account. Holding it (the existing
      // customer hold, on its own page) pauses every booking the business makes. Null before its first.
      this.prisma.profile.findUnique({ where: { phone: businessBookingAccountPhone(id) }, select: { id: true, onHold: true } }),
    ]);
    const shopFront = await this.shopFront(merchant);

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
      shopFront,
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
        riderName: l.rider ? `${l.rider.profile.firstName} ${l.rider.profile.lastName}`.trim() || null : null,
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
   * What customers will see, for the reviewer: the logo and cover (signed), the "about", the week's hours
   * and the first items as listed (category order, then item order), drafts included and marked.
   */
  private async shopFront(m: {
    id: string;
    logoUrl: string | null;
    logoThumbKey: string | null;
    coverPhotoUrl: string | null;
    description: string | null;
    cuisineTags: string[];
    priceLevel: number | null;
    hours: Prisma.JsonValue;
  }) {
    const [items, itemCount] = await Promise.all([
      this.prisma.merchantDish.findMany({
        where: { merchantId: m.id },
        orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }, { createdAt: "asc" }],
        take: SHOP_FRONT_ITEM_PREVIEW,
        select: { id: true, name: true, priceUsd: true, photoUrl: true, photoThumbKey: true, isDraft: true, category: { select: { name: true } } },
      }),
      this.prisma.merchantDish.count({ where: { merchantId: m.id } }),
    ]);
    const [logoUrl, coverPhotoUrl, photos] = await Promise.all([
      this.signPhoto(currentThumbKey(m.logoUrl, m.logoThumbKey) ?? m.logoUrl),
      this.signPhoto(m.coverPhotoUrl),
      Promise.all(items.map((d) => this.signPhoto(currentThumbKey(d.photoUrl, d.photoThumbKey) ?? d.photoUrl))),
    ]);
    return {
      logoUrl,
      coverPhotoUrl,
      hasLogo: !!m.logoUrl,
      hasCover: !!m.coverPhotoUrl,
      about: m.description?.trim() || null,
      tags: m.cuisineTags,
      priceLevel: m.priceLevel,
      hours: weeklyHours(m.hours),
      itemCount,
      items: items.map((d, i) => ({
        id: d.id,
        name: d.name,
        category: d.category.name,
        priceUsd: d.priceUsd.toString(),
        photoUrl: photos[i] ?? null,
        hasPhoto: !!d.photoUrl,
        draft: d.isDraft,
      })),
    };
  }

  /**
   * The support dispute queue: R-05 frozen doorstep handshakes (needs the resolveHandshake action
   * below) and N-12 refund-overdue orders (visibility only — LyniaGo never holds the money, Q6's
   * mocked default is escalate-to-support-no-penalty, so nothing here moves money automatically).
   */
  async listDisputes() {
    const [frozen, refundCandidates, nonReturned] = await Promise.all([
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
      // D3 (MJ-RH1): the merchant flagged goods / cash as not returned. The debt is still open (the
      // merchant's "I got the food back" or a cash count clears it from here), and the rider is not
      // suspended — support follows it up, an admin decides (writeOffDebt / the rider suspend action).
      this.prisma.order.findMany({
        where: { orderType: "merchant", debtStatus: "open", merchantClosedAt: null, debtNonReturnReportedAt: { not: null } },
        orderBy: { debtNonReturnReportedAt: "asc" },
        take: 100,
        select: {
          id: true,
          status: true,
          debtAmount: true,
          debtNonReturnReportedAt: true,
          riderId: true,
          merchant: { select: { name: true } },
          rider: { select: { profile: { select: { firstName: true, lastName: true } } } },
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
    const nonReturnReports = nonReturned.map((o) => ({
      orderId: o.id,
      merchant: o.merchant?.name ?? "—",
      riderId: o.riderId,
      rider: o.rider ? `${o.rider.profile.firstName} ${o.rider.profile.lastName}`.trim() : null,
      amount: o.debtAmount?.toString() ?? null,
      orderStatus: o.status,
      reportedAt: o.debtNonReturnReportedAt!.toISOString(),
    }));
    return { handshakeDisputes, refundsOverdue, nonReturnReports };
  }

  /**
   * Owner decision D3 (2026-10-07, MJ-RH1): the only way a food debt is written off — an admin, after
   * support followed up a merchant's non-return report (or any other open debt that will never come back).
   * Mirrors resolveHandshake's shape: reason required, CAS on `debtStatus: "open"`, the settle + its
   * append-only ledger row + the audit row in ONE transaction. It writes off only — the merchant eats the
   * loss by their own cashRule choice (R-07) and the rider's job lock lifts with the debt. Suspending the
   * rider stays the separate, existing rider console action: deciding the money and deciding the rider's
   * standing are two decisions. 404 when not a merchant order; 409 when nothing is open (settled or
   * already written off), so a stale queue row can't be double-actioned.
   */
  async writeOffDebt(actor: string, orderId: string, input: { reason: string; note?: string | null }) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: { orderType: true, debtStatus: true, debtAmount: true, merchantId: true, riderId: true },
      });
      if (!order || order.orderType !== "merchant") throw new NotFoundException("Order not found");
      if (order.debtStatus !== "open" || !order.merchantId || !order.riderId) throw new ConflictException("This order has no open debt to write off");
      const claimed = await tx.order.updateMany({
        where: { id: orderId, debtStatus: "open" },
        data: { debtStatus: "written_off", debtSettledAt: new Date() },
      });
      if (claimed.count === 0) throw new ConflictException("Order changed — refresh and try again");
      const amount = Number(order.debtAmount ?? 0);
      await tx.merchantDebtLedger.create({
        data: { orderId, merchantId: order.merchantId, riderId: order.riderId, type: "written_off", amount: -amount, note: input.note ?? input.reason, actor },
      });
      const audit = await tx.auditLog.create({
        data: { ...auditData(actor, DEBT_WRITE_OFF_ACTION, orderId, input.reason, input.note), targetType: "order", before: { debtStatus: "open" }, after: { debtStatus: "written_off" } },
        select: { id: true },
      });
      return { id: orderId, debtStatus: "written_off" as const, auditId: audit.id };
    });
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
        data: { ...auditData(actor, "order.handshake_resolve", orderId, input.reason, input.note), targetType: "order" },
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
   * "Refunds past SLA" (N-12): the merchant refunded the customer outside the app (LyniaGo never holds the
   * money) and support checked it, so the order leaves the overdue list. Records `refundedAt` only — no money
   * moves. Reason required, CAS on `refundedAt: null`, audit row in the same transaction. 404 when it isn't a
   * merchant order; 409 when it isn't a failed wallet-paid order or a refund is already on record.
   */
  async recordRefund(actor: string, orderId: string, input: { reason: string; note?: string | null }) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: { orderType: true, merchantPaymentMethod: true, merchantPaymentConfirmedAt: true, status: true, refundedAt: true },
      });
      if (!order || order.orderType !== "merchant") throw new NotFoundException("Order not found");
      if (order.merchantPaymentMethod !== "wallet" || !order.merchantPaymentConfirmedAt || !(order.status === "cancelled" || order.status === "undelivered")) {
        throw new ConflictException({ reason: "not_refundable", message: "This order has no paid wallet amount to refund." });
      }
      if (order.refundedAt) throw new ConflictException({ reason: "already_refunded", message: "A refund is already on record for this order." });
      const now = new Date();
      const claimed = await tx.order.updateMany({ where: { id: orderId, refundedAt: null }, data: { refundedAt: now } });
      if (claimed.count === 0) throw new ConflictException({ reason: "changed", message: "Order changed — refresh and try again" });
      const audit = await tx.auditLog.create({
        data: { ...auditData(actor, REFUND_RECORD_ACTION, orderId, input.reason, input.note), targetType: "order", before: { refundedAt: null }, after: { refundedAt: now.toISOString() } },
        select: { id: true },
      });
      return { id: orderId, refundedAt: now.toISOString(), auditId: audit.id };
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
      const res = await this.transferOwnerTx(actor, id, phone, input.note);
      this.notifyHandover(res);
      return { id: res.id, ownerProfileId: res.ownerProfileId, previousOwnerProfileId: res.previousOwnerProfileId, auditId: res.auditId };
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
      // Already the owner: on the team as owner, or the owner of record whose owner row was never backfilled.
      if (nextMember?.role === "owner" || (!currentOwner && merchant.ownerProfileId === next.id)) {
        throw new ConflictException({ reason: "already_owner", message: "That number already owns this business." });
      }

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
      const audit = await tx.auditLog.create({
        data: {
          ...auditData(actor, OWNER_TRANSFER_ACTION, id, null, note),
          targetType: "merchant",
          before: { ownerProfileId: previousOwnerProfileId ?? null },
          after: { ownerProfileId: next.id },
        },
        select: { id: true },
      });
      return { id, name: merchant.name, ownerProfileId: next.id, previousOwnerProfileId: previousOwnerProfileId ?? null, auditId: audit.id };
    });
  }

  /** Best effort, after the commit: both people hear about a handover (an unexpected one is a takeover). */
  private notifyHandover(r: { id: string; name: string; ownerProfileId: string; previousOwnerProfileId: string | null }): void {
    if (!this.notifications) return;
    void this.notifications.notifyProfiles([r.ownerProfileId], {
      title: `You now own ${r.name}`,
      body: "LyniaGo handed the business to you. Sign in to LyniaGo Merchant to run it.",
      data: { kind: "merchant_owner_transfer", merchantId: r.id },
    });
    if (r.previousOwnerProfileId && r.previousOwnerProfileId !== r.ownerProfileId) {
      void this.notifications.notifyProfiles([r.previousOwnerProfileId], {
        title: `${r.name} has a new owner`,
        body: "LyniaGo handed the business over. You stay on the team as Staff. If you didn't ask for this, message LyniaGo on WhatsApp now.",
        data: { kind: "merchant_owner_transfer", merchantId: r.id },
      });
    }
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
      applicationStatus?: ApplicationStatus;
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
      ...(m.applicationStatus ? { applicationStatus: effectiveApplicationStatus({ applicationStatus: m.applicationStatus, pilotEnabled: m.pilotEnabled }) } : {}),
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
