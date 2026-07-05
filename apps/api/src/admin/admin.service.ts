import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import {
  ACTIVE_RIDE_STATUSES,
  type KycStatus,
  type OrderStatus,
  PHONE_REVEAL_STATUSES,
  RiderAccountStatus,
  TERMINAL_STATUSES,
} from "@lynia/shared";
import { maskPhone } from "../common/phone-mask";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Landmark out of a stored Waypoint JSON — the human label ops reads on a trip row. Never the point
 *  or contactPhone (no PII in a listing route string). Falls back to "—" for malformed/empty. */
function landmark(w: unknown): string {
  const o = (w ?? {}) as { landmark?: unknown };
  return typeof o.landmark === "string" && o.landmark.trim() ? o.landmark : "—";
}

/** `pickup → dropoff` route label from the two stored waypoints. */
function routeOf(pickup: unknown, dropoff: unknown): string {
  return `${landmark(pickup)} → ${landmark(dropoff)}`;
}

/** Calendar date (YYYY-MM-DD) for the joined/when columns — stable + testable, no locale/timezone drift. */
function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Compact remaining-time label for a cooldown ("2h 15m" / "40m" / "0m" once elapsed). */
export function fmtUntil(until: Date, now: number = Date.now()): string {
  const mins = Math.round((until.getTime() - now) / 60000);
  if (mins <= 0) return "0m";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// 8-step delivery timeline (mirrors the admin order-detail kit). Each step maps to the OrderStatus
// values that mean "this step is reached". `offer_selected` / `at_pickup` are UI-only steps with no
// backing status in the enum — they render pending/now purely from progress, never from an event.
const ORDER_TIMELINE: { label: string; statuses: OrderStatus[] }[] = [
  { label: "Broadcast — customer named a price", statuses: ["requested", "open_for_offers"] },
  { label: "Offer selected", statuses: ["assigned", "confirmed"] },
  { label: "En route to pickup", statuses: ["en_route_pickup"] },
  { label: "At pickup", statuses: [] },
  { label: "Picked up", statuses: ["picked_up"] },
  { label: "En route to drop-off", statuses: ["en_route_dropoff"] },
  { label: "Delivered — code entered", statuses: ["delivered"] },
  { label: "Completed", statuses: ["completed"] },
];

// Step index a status has reached (the furthest-right step whose status set contains it). -1 for the
// terminal-off-path statuses (cancelled/expired/undelivered) — those get a closed timeline, no "now".
const STATUS_STEP: Record<string, number> = {
  requested: 0,
  open_for_offers: 0,
  assigned: 1,
  confirmed: 1,
  en_route_pickup: 2,
  picked_up: 4,
  en_route_dropoff: 5,
  delivered: 6,
  completed: 7,
};

// A live order with no OrderEvent for this long is flagged as possibly stuck (the kit's stuck-order
// edge case). Heuristic only — the customer hasn't necessarily reported a problem.
const STUCK_AFTER_MS = 20 * 60 * 1000;

/** Pilot funnel (CONCEPT §8) from raw counts. Pure, so it's unit-tested. */
export function computeFunnel(i: {
  totalBroadcasts: number;
  totalOffers: number;
  ordersWithOffer: number;
  expired: number;
}) {
  const b = i.totalBroadcasts || 0;
  return {
    totalBroadcasts: b,
    offersPerBroadcast: b ? round(i.totalOffers / b) : 0,
    pctBroadcastsWithOffer: b ? round((i.ordersWithOffer / b) * 100) : 0,
    expiryRatePct: b ? round((i.expired / b) * 100) : 0,
  };
}

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  /** Single read for the monitor dashboard: status counts, rider stats, pilot funnel, recent orders. */
  async overview() {
    const [byStatus, totalOrders, totalOffers, expired, ridersTotal, ridersOnline, ridersVerified, recent, withOffer] =
      await Promise.all([
        this.prisma.order.groupBy({ by: ["status"], _count: { _all: true } }),
        this.prisma.order.count(),
        this.prisma.offer.count(),
        this.prisma.order.count({ where: { status: "expired" } }),
        this.prisma.rider.count(),
        this.prisma.rider.count({ where: { isOnline: true } }),
        this.prisma.rider.count({ where: { kycStatus: "verified" } }),
        this.prisma.order.findMany({
          take: 20,
          orderBy: { createdAt: "desc" },
          select: { id: true, status: true, proposedFare: true, agreedFare: true, createdAt: true },
        }),
        this.prisma.offer.findMany({ distinct: ["orderId"], select: { orderId: true } }),
      ]);

    return {
      ordersByStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count._all])),
      riders: { total: ridersTotal, online: ridersOnline, verified: ridersVerified },
      metrics: computeFunnel({
        totalBroadcasts: totalOrders,
        totalOffers,
        ordersWithOffer: withOffer.length,
        expired,
      }),
      recentOrders: recent.map((o) => ({
        id: o.id,
        status: o.status,
        proposedFare: o.proposedFare.toString(),
        agreedFare: o.agreedFare?.toString() ?? null,
        createdAt: o.createdAt.toISOString(),
      })),
    };
  }

  /** Rider roster for ops — the KYC review queue when filtered to `pending`. */
  async listRiders(kyc?: KycStatus) {
    const riders = await this.prisma.rider.findMany({
      where: kyc ? { kycStatus: kyc } : {},
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: {
        profileId: true,
        bikeReg: true,
        kycStatus: true,
        kycRef: true,
        idVerified: true,
        isOnline: true,
        ratingAvg: true,
        ratingCount: true,
        tripsCount: true,
        cancelStrikes: true,
        cooldownUntil: true,
        profile: { select: { firstName: true, lastName: true, phone: true } },
      },
    });

    // A-03 (P0): mask each rider's phone UNLESS they're on a LIVE order right now. The reveal set is
    // ACTIVE_RIDE_STATUSES (mid-delivery) — NOT PHONE_REVEAL_STATUSES, which includes the permanent
    // terminal states (delivered/completed/undelivered): using those would leave any rider who ever
    // finished one order unmasked forever, defeating the roster-scrape protection. The per-order
    // reveal window (getSnapshot) still uses PHONE_REVEAL_STATUSES — that's scoped to one live order.
    const revealingRiderIds = new Set(
      (
        await this.prisma.order.findMany({
          where: { riderId: { in: riders.map((r) => r.profileId) }, status: { in: ACTIVE_RIDE_STATUSES } },
          select: { riderId: true },
          distinct: ["riderId"],
        })
      ).flatMap((o) => (o.riderId ? [o.riderId] : [])),
    );

    return riders.map((r) => ({
      profileId: r.profileId,
      name: `${r.profile.firstName} ${r.profile.lastName}`.trim(),
      phone: revealingRiderIds.has(r.profileId) ? r.profile.phone : maskPhone(r.profile.phone),
      bikeReg: r.bikeReg,
      kycStatus: r.kycStatus,
      kycRef: r.kycRef,
      idVerified: r.idVerified,
      isOnline: r.isOnline,
      ratingAvg: r.ratingAvg,
      ratingCount: r.ratingCount,
      tripsCount: r.tripsCount,
      cancelStrikes: r.cancelStrikes,
      cooldownUntil: r.cooldownUntil?.toISOString() ?? null,
    }));
  }

  /**
   * Single-rider KYC review detail (admin A-02) — the doc-review screen behind the KYC queue. Returns
   * the real, persisted KYC state: status, the resubmission counter + derived lock/attempt, the last
   * decline reason, and the applicant fields ops compare against the documents. Phone is masked (A-03)
   * — the reviewer matches the ID number, not the phone.
   *
   * Didit's granular scores (face-match, doc authenticity, liveness) are NOT persisted in the pilot —
   * only the overall verdict flows through the webhook into `kycStatus`. Those fields are therefore
   * omitted here; the console renders the checks panel from `kycStatus` + the reviewer's own compare.
   */
  async getKycReview(profileId: string) {
    const rider = await this.prisma.rider.findUnique({
      where: { profileId },
      select: {
        profileId: true,
        bikeReg: true,
        kycStatus: true,
        kycRef: true,
        kycAttempts: true,
        kycDeclineReason: true,
        idVerified: true,
        updatedAt: true,
        profile: { select: { firstName: true, lastName: true, phone: true, idNumber: true } },
      },
    });
    if (!rider) return null;

    // kycAttempts counts declines. The current attempt number is declines + 1 (1 on first review, 2 on
    // the single allowed resubmit). >= 2 declines = locked → support, no further attempts.
    const locked = rider.kycAttempts >= 2;
    return {
      id: rider.profileId,
      name: `${rider.profile.firstName} ${rider.profile.lastName}`.trim(),
      phone: maskPhone(rider.profile.phone),
      idNumber: rider.profile.idNumber,
      bike: rider.bikeReg,
      status: rider.kycStatus,
      kycRef: rider.kycRef,
      kycAttempts: rider.kycAttempts,
      attempt: Math.min(rider.kycAttempts + 1, 2),
      locked,
      declineReason: rider.kycDeclineReason,
      submittedAt: rider.updatedAt.toISOString(),
    };
  }

  /** Order monitor for ops — filter by status to watch live orders, cancellations, etc. */
  async listOrders(status?: OrderStatus) {
    const orders = await this.prisma.order.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        status: true,
        proposedFare: true,
        agreedFare: true,
        distanceKm: true,
        customerId: true,
        riderId: true,
        cancelledBy: true,
        cancelReason: true,
        createdAt: true,
      },
    });
    return orders.map((o) => ({
      id: o.id,
      status: o.status,
      proposedFare: o.proposedFare.toString(),
      agreedFare: o.agreedFare?.toString() ?? null,
      distanceKm: o.distanceKm,
      riderId: o.riderId,
      // Authoritative role of who cancelled — don't make the UI re-derive it from raw ids.
      cancelledByRole: o.cancelledBy === o.riderId ? "rider" : o.cancelledBy === o.customerId ? "customer" : null,
      cancelReason: o.cancelReason,
      createdAt: o.createdAt.toISOString(),
    }));
  }

  /**
   * A-01 audit trail. Persists one row for a destructive console action so the intent is recorded
   * server-side and queryable — this is the write path behind every ConfirmModal (submitAdminAction).
   *
   * The plan's ideal is mutation + audit in ONE transaction where a real mutation endpoint exists
   * (e.g. the KYC decision in RiderService.adminSetKyc, or a future rider-suspend / order-cancel /
   * fare-adjust). Those state-machine mutations mostly need new schema and are deferred; when one
   * lands, wrap it and THIS create in a single `this.prisma.$transaction([...])` so the action and its
   * audit row commit atomically. Until then the audit row is written on its own and always persists.
   */
  async recordAuditAction(
    actor: string,
    input: { action: string; target: string; reasonCode?: string | null; note?: string | null },
  ): Promise<{ id: string }> {
    const row = await this.prisma.auditLog.create({
      data: {
        actor,
        action: input.action,
        target: input.target,
        reasonCode: input.reasonCode ?? null,
        note: input.note ?? null,
      },
      select: { id: true },
    });
    return { id: row.id };
  }

  /**
   * Build the AuditLog `data` for a server-driven admin mutation. Same shape recordAuditAction writes,
   * but created with a transaction client so the audit row commits atomically with the state change it
   * describes (A-01: the mutation and its audit row are one `$transaction` — never one without the other).
   */
  private auditData(
    actor: string,
    action: string,
    target: string,
    reasonCode?: string | null,
    note?: string | null,
  ): Prisma.AuditLogCreateInput {
    return { actor, action, target, reasonCode: reasonCode ?? null, note: note ?? null };
  }

  /**
   * A-04 rider suspend. Sets `accountStatus=suspended` + the admin reason (only `active` riders may go
   * online, so this pulls them offline-eligible) AND writes the audit row in ONE transaction. Reason is
   * required (enforced by the controller's zod body). 404s when the id isn't a rider.
   */
  async suspendRider(actor: string, profileId: string, input: { reason: string; note?: string | null }) {
    return this.prisma.$transaction(async (tx) => {
      const rider = await tx.rider.findUnique({ where: { profileId }, select: { profileId: true } });
      if (!rider) throw new NotFoundException("Rider not found");
      await tx.rider.update({
        where: { profileId },
        data: { accountStatus: RiderAccountStatus.SUSPENDED, suspendReason: input.reason },
      });
      const audit = await tx.auditLog.create({
        data: this.auditData(actor, "rider.suspend", profileId, input.reason, input.note),
        select: { id: true },
      });
      return { id: profileId, accountStatus: RiderAccountStatus.SUSPENDED, auditId: audit.id };
    });
  }

  /**
   * A-04 lift a suspension → back to `active`, clearing the suspend reason (including a
   * `settlement_overdue` auto-pause). Reason is optional. Mutation + audit in one transaction.
   */
  async liftRider(actor: string, profileId: string, input: { reason?: string | null; note?: string | null }) {
    return this.prisma.$transaction(async (tx) => {
      const rider = await tx.rider.findUnique({ where: { profileId }, select: { profileId: true } });
      if (!rider) throw new NotFoundException("Rider not found");
      await tx.rider.update({
        where: { profileId },
        data: { accountStatus: RiderAccountStatus.ACTIVE, suspendReason: null },
      });
      const audit = await tx.auditLog.create({
        data: this.auditData(actor, "rider.lift", profileId, input.reason, input.note),
        select: { id: true },
      });
      return { id: profileId, accountStatus: RiderAccountStatus.ACTIVE, auditId: audit.id };
    });
  }

  /**
   * A-04 permanent ban → `accountStatus=banned` with the reason recorded in `suspendReason`. Reason is
   * required. Mutation + audit in one transaction.
   */
  async banRider(actor: string, profileId: string, input: { reason: string; note?: string | null }) {
    return this.prisma.$transaction(async (tx) => {
      const rider = await tx.rider.findUnique({ where: { profileId }, select: { profileId: true } });
      if (!rider) throw new NotFoundException("Rider not found");
      await tx.rider.update({
        where: { profileId },
        data: { accountStatus: RiderAccountStatus.BANNED, suspendReason: input.reason },
      });
      const audit = await tx.auditLog.create({
        data: this.auditData(actor, "rider.ban", profileId, input.reason, input.note),
        select: { id: true },
      });
      return { id: profileId, accountStatus: RiderAccountStatus.BANNED, auditId: audit.id };
    });
  }

  /**
   * Admin order cancel → terminal `cancelled`. Records `cancelledBy` = the acting admin's id and the
   * reason, appends an OrderEvent for the timeline, and writes the audit row — all in one transaction.
   * Rejects an order already in a terminal state (nothing to cancel). Reason required.
   */
  async cancelOrder(actor: string, orderId: string, input: { reason: string; note?: string | null }) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId }, select: { status: true } });
      if (!order) throw new NotFoundException("Order not found");
      if (TERMINAL_STATUSES.includes(order.status)) {
        throw new ConflictException("Order is already in a terminal state");
      }
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: "cancelled",
          cancelledBy: actor,
          cancelReason: input.reason,
          cancelledAt: new Date(),
        },
      });
      await tx.orderEvent.create({ data: { orderId, status: "cancelled" } });
      const audit = await tx.auditLog.create({
        data: this.auditData(actor, "order.cancel", orderId, input.reason, input.note),
        select: { id: true },
      });
      return { id: orderId, status: "cancelled" as const, auditId: audit.id };
    });
  }

  /**
   * Admin fare adjustment → overwrites `agreedFare` (a manual correction / dispute resolution). The new
   * fare, the reason and the audit row commit in one transaction. Reason required. 404s when not found.
   */
  async adjustFare(actor: string, orderId: string, input: { agreedFare: number; reason: string; note?: string | null }) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId }, select: { id: true } });
      if (!order) throw new NotFoundException("Order not found");
      await tx.order.update({ where: { id: orderId }, data: { agreedFare: input.agreedFare } });
      const audit = await tx.auditLog.create({
        data: this.auditData(actor, "order.fare_adjust", orderId, input.reason, input.note),
        select: { id: true },
      });
      return { id: orderId, agreedFare: input.agreedFare.toFixed(2), auditId: audit.id };
    });
  }

  /**
   * Order detail (admin monitor drill-in). Builds the 8-step delivery timeline from OrderEvent
   * (done/now/stall), the parcel line-items, proposed/agreed fares as strings, and the masked people.
   *
   * A-03: the customer's and rider's full phone is revealed ONLY while this specific order is inside
   * its reveal window (PHONE_REVEAL_STATUSES — the same per-order rule orders.service.getSnapshot
   * uses, scoped to this one live order); otherwise both are masked. Returns null when not found.
   */
  async getOrderDetail(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        proposedFare: true,
        agreedFare: true,
        distanceKm: true,
        pickup: true,
        dropoff: true,
        itemDesc: true,
        items: true,
        cancelledBy: true,
        cancelReason: true,
        customerId: true,
        riderId: true,
        createdAt: true,
        updatedAt: true,
        customer: { select: { firstName: true, lastName: true, phone: true } },
        rider: { select: { bikeReg: true, profile: { select: { firstName: true, lastName: true, phone: true } } } },
        events: { select: { status: true, createdAt: true }, orderBy: { createdAt: "asc" } },
      },
    });
    if (!order) return null;

    const revealed = PHONE_REVEAL_STATUSES.includes(order.status);
    const now = Date.now();

    // First event timestamp per step, so a "done" step carries the real time it was reached.
    const tsForStep = (idx: number): string | undefined => {
      const statuses = ORDER_TIMELINE[idx]!.statuses;
      const ev = order.events.find((e) => statuses.includes(e.status));
      return ev ? ev.createdAt.toISOString() : undefined;
    };

    const current = STATUS_STEP[order.status] ?? -1;
    const lastEventAt = order.events.length ? order.events[order.events.length - 1]!.createdAt : order.createdAt;
    const active = ACTIVE_RIDE_STATUSES.includes(order.status);
    const stuck = active && now - lastEventAt.getTime() > STUCK_AFTER_MS;
    const stuckMins = Math.round((now - lastEventAt.getTime()) / 60000);

    const timeline = ORDER_TIMELINE.map((step, i) => {
      let state: "done" | "now" | "stall" | undefined;
      if (current === -1) state = i === 0 ? "done" : undefined; // off-path terminal: only the broadcast happened
      else if (i < current) state = "done";
      else if (i === current) state = stuck ? "stall" : "now";
      return {
        label: step.label,
        state,
        ts: state === "done" ? tsForStep(i) : state === "now" ? "now" : undefined,
        note: state === "stall" ? `No status update for ${stuckMins} min.` : undefined,
      };
    });

    const items = this.deriveItems(order.items, order.itemDesc);
    const riderName = order.rider
      ? `${order.rider.profile.firstName} ${order.rider.profile.lastName}`.trim()
      : null;

    return {
      id: order.id,
      route: routeOf(order.pickup, order.dropoff),
      status: order.status,
      stuck,
      stuckNote: stuck ? `No GPS/status update from the rider for ${stuckMins} minutes.` : undefined,
      rider: riderName,
      // Both phones masked unless this order is live in its reveal window — never leak PII on a
      // terminal/closed order. Provide the (masked) string either way so the UI shows the redaction.
      riderPhone: order.rider ? (revealed ? order.rider.profile.phone : maskPhone(order.rider.profile.phone)) : undefined,
      bike: order.rider?.bikeReg,
      customer: `${order.customer.firstName} ${order.customer.lastName}`.trim(),
      customerPhone: revealed ? order.customer.phone : maskPhone(order.customer.phone),
      proposed: order.proposedFare.toString(),
      agreed: order.agreedFare?.toString() ?? null,
      km: order.distanceKm ?? 0,
      items,
      timeline,
    };
  }

  /**
   * Rider detail (roster drill-in). Real stats (trips, rating, cancel strikes, cooldown), bike/docs,
   * and the recent-trips table. Phone is masked UNLESS the rider is on a LIVE order right now
   * (ACTIVE_RIDE_STATUSES — live-only, not the terminal-inclusive set, so a rider who once finished an
   * order isn't unmasked forever; same rule as listRiders). Returns null when the id isn't a rider.
   *
   * TODO(A-04): `suspended`/`suspendReason` need a rider ban/suspend state machine + schema fields
   * (deferred — see plan "out of scope"); status here is derived from cooldownUntil + isOnline only.
   * TODO(A-06): cashOwed needs the settlement/commission model (deferred) — returned as "0.00".
   */
  async getRiderDetail(id: string) {
    const rider = await this.prisma.rider.findUnique({
      where: { profileId: id },
      select: {
        profileId: true,
        bikeReg: true,
        kycStatus: true,
        isOnline: true,
        ratingAvg: true,
        ratingCount: true,
        tripsCount: true,
        cancelStrikes: true,
        cooldownUntil: true,
        profile: { select: { firstName: true, lastName: true, phone: true, createdAt: true } },
      },
    });
    if (!rider) return null;

    const now = Date.now();
    const [liveOrders, statusCounts, recent] = await Promise.all([
      this.prisma.order.count({ where: { riderId: id, status: { in: ACTIVE_RIDE_STATUSES } } }),
      this.prisma.order.groupBy({ by: ["status"], where: { riderId: id }, _count: { _all: true } }),
      this.prisma.order.findMany({
        where: { riderId: id },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          status: true,
          proposedFare: true,
          agreedFare: true,
          pickup: true,
          dropoff: true,
          createdAt: true,
        },
      }),
    ]);

    const onCooldown = !!rider.cooldownUntil && rider.cooldownUntil.getTime() > now;
    const status: "online" | "offline" | "cooldown" = onCooldown ? "cooldown" : rider.isOnline ? "online" : "offline";

    // Completion = delivered-or-completed over every order ever assigned to this rider. Approximate
    // (a customer-side cancel still counts in the denominator) but real, schema-backed data.
    const totalAssigned = statusCounts.reduce((n, r) => n + r._count._all, 0);
    const succeeded = statusCounts
      .filter((r) => r.status === "completed" || r.status === "delivered")
      .reduce((n, r) => n + r._count._all, 0);
    const completion = totalAssigned ? `${round((succeeded / totalAssigned) * 100)}%` : "—";

    return {
      id: rider.profileId,
      name: `${rider.profile.firstName} ${rider.profile.lastName}`.trim(),
      phone: liveOrders > 0 ? rider.profile.phone : maskPhone(rider.profile.phone),
      bike: rider.bikeReg,
      kyc: rider.kycStatus,
      status,
      cooldown: onCooldown ? fmtUntil(rider.cooldownUntil!, now) : undefined,
      suspendReason: undefined, // TODO(A-04): no suspend state machine yet
      trips: rider.tripsCount,
      rating: rider.ratingCount > 0 ? rider.ratingAvg.toFixed(1) : null,
      ratingCount: rider.ratingCount,
      completion,
      strikes: rider.cancelStrikes,
      cashOwed: "0.00", // TODO(A-06): settlement/commission model deferred
      joined: fmtDate(rider.profile.createdAt),
      trail: recent.map((o) => this.toTripRow(o)),
    };
  }

  /**
   * Customers directory. A customer is a Profile with role `customer`. Aggregates real data the schema
   * supports: order count, spend (sum of agreedFare on completed orders), cancel ratio, joined date;
   * phone is masked (A-03 — a bulk directory is never a reveal context).
   *
   * `filter` narrows by derived status. Since there is no ban/flag model yet every customer is
   * `active`, so `?filter=flagged` legitimately returns none.
   *
   * TODO(A-05): flags/reports need the Issue model (deferred) — returned as 0.
   */
  async listCustomers(filter?: "active" | "flagged" | "banned") {
    const profiles = await this.prisma.profile.findMany({
      where: { role: "customer" },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, firstName: true, lastName: true, phone: true, createdAt: true },
    });
    const ids = profiles.map((p) => p.id);

    const [totals, cancelled, spend] = await Promise.all([
      this.prisma.order.groupBy({ by: ["customerId"], where: { customerId: { in: ids } }, _count: { _all: true } }),
      this.prisma.order.groupBy({
        by: ["customerId"],
        where: { customerId: { in: ids }, status: "cancelled" },
        _count: { _all: true },
      }),
      this.prisma.order.groupBy({
        by: ["customerId"],
        where: { customerId: { in: ids }, status: "completed" },
        _sum: { agreedFare: true },
      }),
    ]);
    const totalBy = new Map(totals.map((r) => [r.customerId, r._count._all]));
    const cancelledBy = new Map(cancelled.map((r) => [r.customerId, r._count._all]));
    const spendBy = new Map(spend.map((r) => [r.customerId, r._sum.agreedFare]));

    const rows = profiles.map((p) => this.toCustomer(p, totalBy.get(p.id) ?? 0, cancelledBy.get(p.id) ?? 0, spendBy.get(p.id) ?? null));
    // Every customer is `active` today (no ban/flag model), so a flagged/banned filter yields none.
    return filter && filter !== "active" ? rows.filter((c) => (c.status as string) === filter) : rows;
  }

  /**
   * Single customer detail. All the directory fields for one customer plus the recent-orders trail and
   * the (empty) flag log. Returns null when the id isn't a customer profile.
   *
   * TODO(A-05): reports/flags need the Issue model (deferred) — flagLog is []; warn/status stay clear.
   */
  async getCustomerDetail(id: string) {
    const profile = await this.prisma.profile.findFirst({
      where: { id, role: "customer" },
      select: { id: true, firstName: true, lastName: true, phone: true, createdAt: true },
    });
    if (!profile) return null;

    const [total, cancelled, spend, recent] = await Promise.all([
      this.prisma.order.count({ where: { customerId: id } }),
      this.prisma.order.count({ where: { customerId: id, status: "cancelled" } }),
      this.prisma.order.aggregate({ where: { customerId: id, status: "completed" }, _sum: { agreedFare: true } }),
      this.prisma.order.findMany({
        where: { customerId: id },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          status: true,
          proposedFare: true,
          agreedFare: true,
          pickup: true,
          dropoff: true,
          createdAt: true,
        },
      }),
    ]);

    const base = this.toCustomer(profile, total, cancelled, spend._sum.agreedFare);
    return {
      ...base,
      publicName: profile.firstName, // what riders see — first name only (§5d contact minimization)
      warn: undefined,
      flagLog: [] as Array<{ date: string; text: string; issueId?: string }>, // TODO(A-05): Issue model
      trail: recent.map((o) => this.toTripRow(o)),
    };
  }

  /** Shared Customer projection for the directory + detail — aggregates in, masked row out. */
  private toCustomer(
    p: { id: string; firstName: string; lastName: string; phone: string; createdAt: Date },
    total: number,
    cancelled: number,
    spend: { toFixed: (n: number) => string } | null,
  ) {
    return {
      id: p.id,
      name: `${p.firstName} ${p.lastName}`.trim(),
      phoneMasked: maskPhone(p.phone), // A-03: directory is never a reveal context
      orders: total,
      spend: spend ? spend.toFixed(2) : "0.00",
      cancelRatePct: total ? round((cancelled / total) * 100) : 0,
      flags: 0, // TODO(A-05): reports/flags need the Issue model
      joined: fmtDate(p.createdAt),
      status: "active" as const, // TODO(A-05): no ban/flag state on Profile yet
    };
  }

  /** Compact TripRow for the rider/customer recent-trips tables. Fare is agreed if settled, else proposed. */
  private toTripRow(o: {
    id: string;
    status: string;
    proposedFare: { toString: () => string };
    agreedFare: { toString: () => string } | null;
    pickup: unknown;
    dropoff: unknown;
    createdAt: Date;
  }) {
    return {
      id: o.id,
      route: routeOf(o.pickup, o.dropoff),
      status: o.status,
      fare: (o.agreedFare ?? o.proposedFare).toString(),
      when: fmtDate(o.createdAt),
    };
  }

  /** Order line-items → the admin `{desc, qty}` shape. Falls back to the compact itemDesc summary for
   *  pre-0008 rows that never carried structured items. */
  private deriveItems(items: unknown, itemDesc: string): Array<{ desc: string; qty: number }> {
    if (Array.isArray(items)) {
      return (items as Array<{ description?: unknown; quantity?: unknown }>).map((it) => ({
        desc: typeof it.description === "string" ? it.description : "Item",
        qty: typeof it.quantity === "number" ? it.quantity : 1,
      }));
    }
    return itemDesc ? [{ desc: itemDesc, qty: 1 }] : [];
  }
}
