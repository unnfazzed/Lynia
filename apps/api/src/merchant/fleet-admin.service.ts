import { ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  ACTIVE_RIDE_STATUSES,
  type AdminFleetDetail,
  type AdminFleetRide,
  type AdminFleetRow,
  type AdminFleetStatus,
  addMoney,
  type EnableFleetRequest,
  type FleetAdjustRequest,
  type FleetAdminActionRequest,
  type FleetBikerState,
  orderShortId,
} from "@lynia/shared";
import { cancelAttribution } from "../common/cancel-attribution";
import { liveCommissionRatePct } from "../common/commission-cover";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { TrackingGateway } from "../tracking/tracking.gateway";
import { FleetDispatchService } from "./fleet-dispatch.service";
import { FleetLedgerService } from "./fleet-ledger.service";
import { overdueDays, ownerBills, ownerThisWeek } from "./fleet-bills";
import { harareDayKey, harareWeekStart } from "./harare-clock";
import { notifyFoodQueueChanged } from "./merchant-lookup.util";

/** How far back Adjust's ride picker looks (OB-A2). */
const RECENT_RIDES_MS = 35 * 24 * 60 * 60 * 1000;

/** Audit actions (admin). */
export const FLEET_ENABLE_ACTION = "merchant.fleet.enable";
export const FLEET_PAUSE_ACTION = "merchant.fleet.pause";
export const FLEET_UNPAUSE_ACTION = "merchant.fleet.unpause";
export const FLEET_DISABLE_ACTION = "merchant.fleet.disable";
export const FLEET_DISSOLVE_ACTION = "merchant.fleet.dissolve";
export const FLEET_BILL_PAID_ACTION = "merchant.fleet.bill_paid";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Own bikers T7 (docs/designs/own-bikers.md "Pause" / "Disable", OV-F4, E7; handoff OB-A1–A3): the console's side.
 * A fleet belongs to an owner (OwnerFleet), so every switch here is per owner, for all their branches.
 *  - Enable needs a ride fee (it is snapshotted onto every booking).
 *  - Pause (usually non-payment): "My bikers" is refused, unaccepted fleet bookings are cancelled and their booker
 *    told, rides already under way finish and are billed. Bikers stay linked and exclusive.
 *  - Disable (the business leaves): everything pause does, open invites end, and every biker's link is dissolved as
 *    soon as they have no fleet ride under way (now, or by the fleet sweep when their ride ends); each is told.
 * Every action writes an audit row with the operator, a reason code and a note.
 */
@Injectable()
export class FleetAdminService {
  private readonly logger = new Logger(FleetAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly gateway: TrackingGateway,
    private readonly dispatch: FleetDispatchService,
    private readonly ledger: FleetLedgerService,
  ) {}

  /** The owner's row, made (on) when a business they own has none yet; null when they own no business. */
  private async ensureRow(db: Prisma.TransactionClient | PrismaService, ownerProfileId: string) {
    if ((await db.merchant.count({ where: { ownerProfileId } })) === 0) return null;
    return db.ownerFleet.upsert({ where: { ownerProfileId }, create: { ownerProfileId }, update: {} });
  }

  // ── Reads (OB-A1 table, OB-A2 side panel) ─────────────────────────────────────────────────────────────────

  async list(now: Date = new Date()): Promise<AdminFleetRow[]> {
    // Every business has Own bikers (owner, 2026-10-20): an owner added since migration 0114 has no row until its
    // first fleet read, yet it is on. Give each its row first, so the console lists it and can pause or disable it.
    await this.prisma.$executeRaw`
      INSERT INTO "owner_fleets" ("owner_profile_id", "enabled", "created_at", "updated_at")
      SELECT DISTINCT m."owner_profile_id", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM "merchants" m
      WHERE m."owner_profile_id" IS NOT NULL
      ON CONFLICT ("owner_profile_id") DO NOTHING`;
    const fleets = await this.prisma.ownerFleet.findMany({ select: { ownerProfileId: true, enabled: true, pausedAt: true, rideFee: true } });
    if (fleets.length === 0) return [];
    const owners = fleets.map((f) => f.ownerProfileId);
    const weekStart = harareWeekStart(now);
    const [profiles, branches, bikers, online, week, bills] = await Promise.all([
      this.prisma.profile.findMany({ where: { id: { in: owners } }, select: { id: true, firstName: true, lastName: true } }),
      this.prisma.merchant.findMany({ where: { ownerProfileId: { in: owners } }, select: { ownerProfileId: true, name: true }, orderBy: { name: "asc" } }),
      this.prisma.rider.groupBy({ by: ["fleetOwnerProfileId"], where: { fleetOwnerProfileId: { in: owners } }, _count: { _all: true } }),
      this.prisma.rider.groupBy({ by: ["fleetOwnerProfileId"], where: { fleetOwnerProfileId: { in: owners }, isOnline: true }, _count: { _all: true } }),
      this.prisma.merchantFleetLedger.groupBy({ by: ["ownerProfileId"], where: { ownerProfileId: { in: owners }, statementId: null, createdAt: { gte: weekStart } }, _sum: { fee: true } }),
      this.prisma.merchantFleetStatement.findMany({ where: { ownerProfileId: { in: owners }, status: { not: "paid" } }, select: { ownerProfileId: true, total: true, dueOn: true } }),
    ]);
    const nameOf = new Map(profiles.map((p) => [p.id, `${p.firstName} ${p.lastName}`.trim() || "Owner"]));
    const branchNames = new Map<string, string[]>();
    for (const b of branches) if (b.ownerProfileId) branchNames.set(b.ownerProfileId, [...(branchNames.get(b.ownerProfileId) ?? []), b.name]);
    const bikerCount = new Map(bikers.map((b) => [b.fleetOwnerProfileId, b._count._all]));
    const onlineCount = new Map(online.map((b) => [b.fleetOwnerProfileId, b._count._all]));
    const weekTotal = new Map(week.map((w) => [w.ownerProfileId, Number(w._sum.fee ?? 0)]));
    const today = harareDayKey(now);
    return fleets
      .map((f) => {
        const open = bills.filter((b) => b.ownerProfileId === f.ownerProfileId);
        const unpaid = addMoney(0, ...open.map((b) => Number(b.total)));
        const daysOverdue = Math.max(0, ...open.map((b) => overdueDays(b.dueOn, today)));
        const status: AdminFleetStatus = !f.enabled
          ? "disabled"
          : f.pausedAt
            ? "paused"
            : daysOverdue > 0
              ? "overdue"
              : unpaid > 0
                ? "unpaid"
                : "paid";
        return {
          ownerProfileId: f.ownerProfileId,
          owner: nameOf.get(f.ownerProfileId) ?? "Owner",
          branches: branchNames.get(f.ownerProfileId)?.length ?? 0,
          branchNames: branchNames.get(f.ownerProfileId) ?? [],
          bikers: bikerCount.get(f.ownerProfileId) ?? 0,
          online: onlineCount.get(f.ownerProfileId) ?? 0,
          thisWeek: (weekTotal.get(f.ownerProfileId) ?? 0).toFixed(2),
          unpaid: unpaid.toFixed(2),
          daysOverdue,
          status,
          rideFee: f.rideFee?.toFixed(2) ?? null,
        };
      })
      .sort((a, b) => b.daysOverdue - a.daysOverdue || Number(b.unpaid) - Number(a.unpaid) || a.owner.localeCompare(b.owner));
  }

  async detail(ownerProfileId: string, now: Date = new Date()): Promise<AdminFleetDetail> {
    const fleet = (await this.prisma.ownerFleet.findUnique({ where: { ownerProfileId } })) ?? (await this.ensureRow(this.prisma, ownerProfileId));
    if (!fleet) throw new NotFoundException("Fleet not found");
    const [owner, branches, riders, thisWeek, bills, rides] = await Promise.all([
      this.prisma.profile.findUnique({ where: { id: ownerProfileId }, select: { firstName: true, lastName: true, phone: true } }),
      this.prisma.merchant.findMany({ where: { ownerProfileId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      this.prisma.rider.findMany({
        where: { fleetOwnerProfileId: ownerProfileId },
        select: { profileId: true, isOnline: true, fleetHomeMerchant: { select: { name: true } }, profile: { select: { firstName: true, lastName: true } } },
      }),
      ownerThisWeek(this.prisma, ownerProfileId, now),
      ownerBills(this.prisma, ownerProfileId, now),
      this.recentRides(ownerProfileId, now),
    ]);
    const busy = new Set(
      (
        await this.prisma.order.findMany({ where: { riderId: { in: riders.map((r) => r.profileId) }, status: { in: ACTIVE_RIDE_STATUSES } }, select: { riderId: true } })
      ).map((o) => o.riderId),
    );
    return {
      ownerProfileId,
      owner: owner ? `${owner.firstName} ${owner.lastName}`.trim() || "Owner" : "Owner",
      phone: owner?.phone ?? null,
      enabled: fleet.enabled,
      paused: fleet.pausedAt != null,
      rideFee: fleet.rideFee?.toFixed(2) ?? null,
      branches: branches.map((b) => ({ merchantId: b.id, name: b.name })),
      bikers: riders.map((r) => ({
        riderId: r.profileId,
        name: `${r.profile.firstName} ${r.profile.lastName}`.trim(),
        homeBranch: r.fleetHomeMerchant?.name ?? "",
        state: (busy.has(r.profileId) ? "on_a_job" : r.isOnline ? "online" : "offline") as FleetBikerState,
      })),
      thisWeek,
      bills,
      recentRides: rides,
      feePct: liveCommissionRatePct(),
    };
  }

  /** OB-A2 Adjust "Which ride": the owner's billed rides over the last 5 weeks, newest first. */
  private async recentRides(ownerProfileId: string, now: Date): Promise<AdminFleetRide[]> {
    const rows = await this.prisma.merchantFleetLedger.findMany({
      where: { ownerProfileId, kind: { not: "adjustment" }, orderId: { not: null }, createdAt: { gte: new Date(now.getTime() - RECENT_RIDES_MS) } },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { orderId: true, merchantId: true, riderId: true, createdAt: true, fee: true },
    });
    const riderIds = [...new Set(rows.flatMap((r) => (r.riderId ? [r.riderId] : [])))];
    const people = riderIds.length ? await this.prisma.profile.findMany({ where: { id: { in: riderIds } }, select: { id: true, firstName: true } }) : [];
    const firstName = new Map(people.map((p) => [p.id, p.firstName.trim().split(/\s+/)[0] || null]));
    return rows.map((r) => ({
      orderId: r.orderId!,
      ref: `#${orderShortId(r.orderId!)}`,
      merchantId: r.merchantId,
      biker: r.riderId ? (firstName.get(r.riderId) ?? null) : null,
      at: r.createdAt.toISOString(),
      fee: Number(r.fee).toFixed(2),
    }));
  }

  // ── Switches ────────────────────────────────────────────────────────────────────────────────────────────

  /**
   * Turn Own bikers back on for a branch's owner (all their branches) after a Disable. Every business has it by default
   * at the commission rate (owner, 2026-10-20), so there's no fee to set. Re-enabling needs fresh invites.
   */
  async enable(actor: string, merchantId: string, body: EnableFleetRequest): Promise<AdminFleetDetail> {
    const merchant = await this.prisma.merchant.findUnique({ where: { id: merchantId }, select: { ownerProfileId: true } });
    if (!merchant?.ownerProfileId) throw new NotFoundException("Business not found");
    const owner = merchant.ownerProfileId;
    await this.prisma.$transaction(async (tx) => {
      await tx.ownerFleet.upsert({ where: { ownerProfileId: owner }, create: { ownerProfileId: owner, enabled: true }, update: { enabled: true, pausedAt: null } });
      await tx.auditLog.create({ data: { actor, action: FLEET_ENABLE_ACTION, target: owner, note: body.note ?? null } });
    });
    return this.detail(owner);
  }

  /** OB-A3 Pause. Idempotent: pausing a paused fleet changes nothing but still cancels any booking left ringing. */
  async pause(actor: string, ownerProfileId: string, body: FleetAdminActionRequest): Promise<AdminFleetDetail> {
    await this.prisma.$transaction(async (tx) => {
      const fleet = (await tx.ownerFleet.findUnique({ where: { ownerProfileId }, select: { pausedAt: true } })) ?? (await this.ensureRow(tx, ownerProfileId));
      if (!fleet) throw new NotFoundException("Fleet not found");
      if (!fleet.pausedAt) await tx.ownerFleet.update({ where: { ownerProfileId }, data: { pausedAt: new Date() } });
      await tx.auditLog.create({ data: { actor, action: FLEET_PAUSE_ACTION, target: ownerProfileId, reasonCode: body.reasonCode, note: body.note ?? null } });
    });
    await this.cancelRingingBookings(ownerProfileId, "fleet_paused");
    await this.closeAppOffers(ownerProfileId);
    return this.detail(ownerProfileId);
  }

  async unpause(actor: string, ownerProfileId: string, body: FleetAdminActionRequest): Promise<AdminFleetDetail> {
    await this.prisma.$transaction(async (tx) => {
      const fleet = (await tx.ownerFleet.findUnique({ where: { ownerProfileId }, select: { enabled: true } })) ?? (await this.ensureRow(tx, ownerProfileId));
      if (!fleet) throw new NotFoundException("Fleet not found");
      if (!fleet.enabled) throw new ConflictException({ reason: "fleet_disabled", message: "This fleet is disabled. Enable it again instead." });
      await tx.ownerFleet.update({ where: { ownerProfileId }, data: { pausedAt: null } });
      await tx.auditLog.create({ data: { actor, action: FLEET_UNPAUSE_ACTION, target: ownerProfileId, reasonCode: body.reasonCode, note: body.note ?? null } });
    });
    return this.detail(ownerProfileId);
  }

  /** OB-A3 Disable: the business leaves Own bikers. Unpaid bills stay open. */
  async disable(actor: string, ownerProfileId: string, body: FleetAdminActionRequest): Promise<AdminFleetDetail> {
    await this.prisma.$transaction(async (tx) => {
      if (!(await this.ensureRow(tx, ownerProfileId))) throw new NotFoundException("Fleet not found");
      await tx.ownerFleet.update({ where: { ownerProfileId }, data: { enabled: false } });
      // Open invite links end with it: re-enabling needs fresh invites.
      await tx.fleetInvite.updateMany({ where: { ownerProfileId, revokedAt: null, joinedAt: null }, data: { revokedAt: new Date() } });
      await tx.auditLog.create({ data: { actor, action: FLEET_DISABLE_ACTION, target: ownerProfileId, reasonCode: body.reasonCode, note: body.note ?? null } });
    });
    await this.cancelRingingBookings(ownerProfileId, "fleet_disabled");
    await this.closeAppOffers(ownerProfileId);
    await this.dispatch.dissolveDisabledFleets();
    return this.detail(ownerProfileId);
  }

  // ── Money ───────────────────────────────────────────────────────────────────────────────────────────────

  /** OB-A2 "Adjust": a correction on the open week, for one of the owner's branches. */
  async adjust(actor: string, ownerProfileId: string, body: FleetAdjustRequest): Promise<AdminFleetDetail> {
    const branch = await this.prisma.merchant.findFirst({ where: { id: body.merchantId, ownerProfileId }, select: { id: true } });
    if (!branch) throw new NotFoundException("Branch not found");
    await this.ledger.adjust(actor, { merchantId: body.merchantId, fee: body.amount, reason: body.reason, orderId: body.orderId ?? null });
    return this.detail(ownerProfileId);
  }

  /** OB-A2 "Mark paid": cash received for a closed week's bill. */
  async markBillPaid(actor: string, billId: string, note?: string): Promise<AdminFleetDetail> {
    const bill = await this.prisma.merchantFleetStatement.findUnique({ where: { id: billId }, select: { ownerProfileId: true } });
    if (!bill) throw new NotFoundException("Bill not found");
    await this.prisma.$transaction(async (tx) => {
      const paid = await tx.merchantFleetStatement.updateMany({
        where: { id: billId, status: { not: "paid" } },
        data: { status: "paid", paidAt: new Date(), recordedByProfileId: UUID_RE.test(actor) ? actor : null },
      });
      if (paid.count === 0) throw new ConflictException({ reason: "already_paid", message: "This bill is already marked paid." });
      await tx.auditLog.create({ data: { actor, action: FLEET_BILL_PAID_ACTION, target: billId, note: note ?? null } });
    });
    return this.detail(bill.ownerProfileId);
  }

  // ── Effects ─────────────────────────────────────────────────────────────────────────────────────────────

  /**
   * T9, pause/disable: the owner's bikers stop being rung for the business's app orders. Their offers still live on
   * a round are closed (the accept would refuse them now); the round carries on with any public bikers on it and the
   * next one rings only the public.
   */
  private async closeAppOffers(ownerProfileId: string): Promise<number> {
    const where = {
      outcome: "pending" as const,
      rider: { fleetOwnerProfileId: ownerProfileId },
      order: { orderType: "merchant" as const, status: "open_for_offers" as const },
    };
    const open = await this.prisma.foodDispatchAttempt.findMany({ where, select: { id: true, orderId: true, riderId: true } });
    if (open.length === 0) return 0;
    await this.prisma.foodDispatchAttempt.updateMany({ where: { id: { in: open.map((o) => o.id) }, outcome: "pending" }, data: { outcome: "expired", respondedAt: new Date() } });
    for (const o of open) void this.gateway.emitDispatchOfferClosed(o.riderId, o.orderId);
    return open.length;
  }

  /**
   * Pause/disable: every "My bikers" booking of the owner that no biker has accepted is cancelled, on the same
   * `fleet_searching AND rider_id IS NULL` guard as Send to any biker, so an accept that won first keeps its job.
   * The booker is told (handoff `m.pausedT`/`m.pausedB`).
   */
  private async cancelRingingBookings(ownerProfileId: string, reason: "fleet_paused" | "fleet_disabled"): Promise<number> {
    const ringing = await this.prisma.order.findMany({
      where: { status: "fleet_searching", riderId: null, fleetMerchant: { ownerProfileId } },
      select: { id: true, fleetMerchantId: true, merchantBooking: { select: { bookedByProfileId: true } } },
    });
    let cancelled = 0;
    for (const o of ringing) {
      const done = await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.order.updateMany({
          where: { id: o.id, status: "fleet_searching", riderId: null },
          data: {
            status: "cancelled",
            cancelledAt: new Date(),
            cancelledBy: null,
            cancelReason: reason,
            dispatchOfferExpiresAt: null,
            dispatchNextCheckAt: null,
            ...cancelAttribution({ by: "admin", status: "fleet_searching", reasonCode: reason }),
          },
        });
        if (claimed.count === 0) return false;
        await tx.orderEvent.create({ data: { orderId: o.id, status: "cancelled" } });
        return true;
      });
      if (!done) continue;
      cancelled++;
      await this.dispatch.closeOffers(o.id);
      notifyFoodQueueChanged(this.gateway, o.fleetMerchantId, o.id);
      if (o.merchantBooking) {
        void this.notifications.notifyProfiles([o.merchantBooking.bookedByProfileId], {
          title: "Own bikers paused",
          body: "Talk to LyniaGo to turn them back on.",
          data: { orderId: o.id, kind: "fleet_paused" },
        });
      }
    }
    if (cancelled > 0) this.logger.log(`fleet ${reason}: cancelled ${cancelled} ringing booking(s) for owner ${ownerProfileId}`);
    return cancelled;
  }
}
