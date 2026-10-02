import { ConflictException, Inject, Injectable, Logger, NotFoundException, type OnModuleDestroy, type OnModuleInit, Optional } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  BUSY_MODE_EXTRA_MIN,
  deliveryMinutesForKm,
  effectiveMerchantHours,
  haversineKm,
  isMerchantOpenNow,
  type LatLng,
  type MerchantHours,
  ORDER_SCHEDULE,
  RESTAURANTS_AUTO_ACCEPT,
  RESTAURANTS_TIMING,
  type ScheduleSlotsResponse,
  type Waypoint,
} from "@lynia/shared";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { makingWord, pushCopy, PUSH_C, pushTime } from "../notifications/merchant-order-push";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { TrackingGateway } from "../tracking/tracking.gateway";
import { harareWallClock } from "./harare-clock";
import { CUSTOMER_VISIBLE_RESTAURANT, customerVisibleShop, notifyFoodQueueChanged } from "./merchant-lookup.util";
import { computeSlotDays, findSlot, type ComputedSlot, toWireSlot } from "./order-schedule";

/** Statuses a scheduled order still counts toward its slot's "Full" in. */
const LIVE_STATUSES = ["requested", "open_for_offers", "assigned", "confirmed", "en_route_pickup", "picked_up", "en_route_dropoff"] as const;

/** The venue fields the slot math reads. */
export interface ScheduleVenue {
  id: string;
  hours: Prisma.JsonValue | null;
  closedUntil: Date | null;
  prepBaselineMinutes: number | null;
  location: Prisma.JsonValue | null;
}

/** Fallback when no env is injected (unit tests that construct services by hand): every switch off. */
const ALL_OFF = { SHOPS_ENABLED: "false", PHARMACY_ENABLED: "false" } as const;

/**
 * Order flow v2 (ledger D-59, BRIEF §12) — scheduled orders for restaurants, shops and pharmacies.
 *
 * Model (chosen so installed apps keep working): a scheduled order is an ordinary merchant order in
 * `merchantPhase = awaiting_accept` with NO accept deadline, plus an `order_schedules` row. No new enum
 * value: `MerchantPhase` is a strict zod enum, and an old app shown an unknown phase would fall to its
 * safety-net screen. No accept window runs (the N-03 sweep only matches a deadline in the past), and the
 * merchant's live queue hides it until it rings. The customer may cancel free all along (awaiting_accept
 * is in the free-cancel set). At `ringsAt` this service's sweep rings it exactly like a new order: an
 * auto-accept restaurant's cash order goes straight to cooking (kitchen to confirm), anything else gets
 * the normal 3-minute accept window.
 */
@Injectable()
export class OrderScheduleService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrderScheduleService.name);
  private sweep?: ReturnType<typeof setInterval>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly gateway: TrackingGateway,
    @Optional() @Inject(ENV) private readonly env?: Env,
  ) {}

  onModuleInit(): void {
    this.sweep = setInterval(() => void this.runSweep(), RESTAURANTS_TIMING.sweepIntervalMs);
    this.sweep.unref?.();
  }

  onModuleDestroy(): void {
    if (this.sweep) clearInterval(this.sweep);
  }

  private async runSweep(): Promise<void> {
    try {
      await this.sweepDueRings();
    } catch (err) {
      this.logger.error(`sweepDueRings failed: ${(err as Error).message}`);
    }
  }

  /** The customer-visible venue rule for ordering: a live restaurant, or a live shop in a section that's on. */
  visibleVenueWhere(): Prisma.MerchantWhereInput {
    return { OR: [CUSTOMER_VISIBLE_RESTAURANT, customerVisibleShop(this.env ?? ALL_OFF)] };
  }

  /** prep + delivery minutes for this venue and (when known) this drop-off. */
  leadMinutes(venue: ScheduleVenue, distanceKm: number | null): number {
    const prep = venue.prepBaselineMinutes ?? ORDER_SCHEDULE.defaultPrepMinutes;
    return prep + deliveryMinutesForKm(distanceKm);
  }

  private slotDays(venue: ScheduleVenue, distanceKm: number | null, now: Date) {
    return computeSlotDays({
      hours: (venue.hours as MerchantHours | null) ?? null,
      closedUntil: venue.closedUntil,
      leadMinutes: this.leadMinutes(venue, distanceKm),
      now,
    });
  }

  /** How many live scheduled orders each slot start (ms) already holds at this venue. */
  private async slotCounts(merchantId: string, from: Date, to: Date): Promise<Map<number, number>> {
    const rows = await this.prisma.orderSchedule.findMany({
      where: { merchantId, scheduledFor: { gte: from, lt: to }, order: { status: { in: [...LIVE_STATUSES] } } },
      select: { scheduledFor: true },
    });
    const counts = new Map<number, number>();
    for (const r of rows) counts.set(r.scheduledFor.getTime(), (counts.get(r.scheduledFor.getTime()) ?? 0) + 1);
    return counts;
  }

  /** `GET /restaurants/:merchantId/schedule-slots` (`at` = the drop-off, when the app knows it). */
  async slotsFor(merchantId: string, at: LatLng | null, now: Date = new Date()): Promise<ScheduleSlotsResponse> {
    const venue = await this.prisma.merchant.findFirst({
      where: { id: merchantId, ...this.visibleVenueWhere() },
      select: { id: true, hours: true, closedUntil: true, prepBaselineMinutes: true, location: true },
    });
    if (!venue) throw new NotFoundException("Not found");
    const distanceKm = this.distanceKm(venue, at);
    const days = this.slotDays(venue, distanceKm, now);
    const all = [...days.today.slots, ...days.tomorrow.slots];
    const counts = all.length ? await this.slotCounts(venue.id, all[0]!.start, new Date(all[all.length - 1]!.start.getTime() + 1)) : new Map<number, number>();
    const isFull = (s: ComputedSlot) => (counts.get(s.start.getTime()) ?? 0) >= ORDER_SCHEDULE.slotCapacity;
    const first = all.find((s) => !isFull(s)) ?? null;
    const hours = effectiveMerchantHours((venue.hours as MerchantHours | null) ?? null, venue.closedUntil, now);
    const openNow = !(venue.closedUntil && venue.closedUntil.getTime() > now.getTime()) && isMerchantOpenNow(hours, harareWallClock(now));
    return {
      slotMinutes: ORDER_SCHEDULE.slotMinutes,
      openNow,
      leadMinutes: this.leadMinutes(venue, distanceKm),
      today: { date: days.today.date, slots: days.today.slots.map((s) => toWireSlot(s, isFull(s))) },
      tomorrow: { date: days.tomorrow.date, slots: days.tomorrow.slots.map((s) => toWireSlot(s, isFull(s))) },
      firstAvailable: first ? toWireSlot(first, false) : null,
    };
  }

  /**
   * The slot an order is being placed (or moved) into: it must be one the venue offers right now for
   * this drop-off, and not full. `excludeOrderId` is the order being moved (it doesn't count against
   * its own new slot).
   */
  async resolveSlot(
    venue: ScheduleVenue,
    scheduledFor: string,
    distanceKm: number | null,
    excludeOrderId?: string,
    now: Date = new Date(),
  ): Promise<{ scheduledFor: Date; ringsAt: Date }> {
    const slot = findSlot(this.slotDays(venue, distanceKm, now), scheduledFor);
    if (!slot) {
      throw new ConflictException({ reason: "slot_unavailable", message: "That time isn't available any more. Pick another slot." });
    }
    const taken = await this.prisma.orderSchedule.count({
      where: {
        merchantId: venue.id,
        scheduledFor: slot.start,
        order: { status: { in: [...LIVE_STATUSES] } },
        ...(excludeOrderId ? { orderId: { not: excludeOrderId } } : {}),
      },
    });
    if (taken >= ORDER_SCHEDULE.slotCapacity) {
      throw new ConflictException({ reason: "slot_full", message: "That slot is full. Pick another one." });
    }
    return { scheduledFor: slot.start, ringsAt: slot.ringsAt };
  }

  distanceKm(venue: Pick<ScheduleVenue, "location">, at: LatLng | null): number | null {
    const point = (venue.location as Waypoint | null)?.point;
    if (!point || !at) return null;
    return haversineKm(point, at);
  }

  /**
   * Ring every scheduled order whose start time has come, like a new order (M1c "SCHEDULED · START
   * NOW"). Claimed by CAS on `rungAt IS NULL`, so two API instances never ring one order twice. An
   * order cancelled while it waited is marked rung (nothing to do) so the sweep stops looking at it.
   */
  async sweepDueRings(now: Date = new Date()): Promise<{ rung: number }> {
    const due = await this.prisma.orderSchedule.findMany({
      where: { rungAt: null, ringsAt: { lte: now } },
      orderBy: { ringsAt: "asc" },
      take: 200,
      select: {
        orderId: true,
        scheduledFor: true,
        order: {
          select: {
            status: true,
            merchantPhase: true,
            customerId: true,
            merchantId: true,
            merchantPaymentMethod: true,
            merchant: { select: { name: true, businessType: true, autoAccept: true, busyMode: true, prepBaselineMinutes: true } },
          },
        },
      },
    });
    let rung = 0;
    for (const s of due) {
      try {
        const claimed = await this.prisma.orderSchedule.updateMany({ where: { orderId: s.orderId, rungAt: null }, data: { rungAt: now } });
        if (claimed.count === 0) continue;
        const o = s.order;
        if (o.status !== "requested" || o.merchantPhase !== "awaiting_accept") continue;
        const autoAccept = o.merchant?.businessType === "restaurant" && o.merchant.autoAccept && o.merchantPaymentMethod === "cash";
        const data: Prisma.OrderUpdateManyMutationInput = autoAccept
          ? {
              merchantPhase: "preparing",
              acceptDeadlineAt: null,
              prepMinutes: (o.merchant?.prepBaselineMinutes ?? RESTAURANTS_AUTO_ACCEPT.defaultPrepMinutes) + (o.merchant?.busyMode ? BUSY_MODE_EXTRA_MIN : 0),
              prepStartedAt: now,
              autoAccepted: true,
            }
          : { acceptDeadlineAt: new Date(now.getTime() + RESTAURANTS_TIMING.acceptWindowMs) };
        const moved = await this.prisma.order.updateMany({
          where: { id: s.orderId, status: "requested", merchantPhase: "awaiting_accept", acceptDeadlineAt: null },
          data,
        });
        if (moved.count === 0) continue;
        if (autoAccept) await this.prisma.merchantOrderItem.updateMany({ where: { orderId: s.orderId }, data: { available: true } });
        rung++;
        notifyFoodQueueChanged(this.gateway, o.merchantId, s.orderId);
        // Order flow v2 G3a (O.g.push.c[11]): "Gava’s Kitchen is cooking. Arrives 12:30–13:00." A venue
        // that still has to accept isn't cooking yet — only the slot is said then.
        const venue = o.merchant?.name?.trim() || null;
        const slotEnd = new Date(s.scheduledFor.getTime() + ORDER_SCHEDULE.slotMinutes * 60_000);
        void this.notifications.notifyProfiles([o.customerId], {
          ...pushCopy(PUSH_C.schedStarted, {
            v: autoAccept ? venue : null,
            making: makingWord(o.merchant?.businessType),
            s: `${pushTime(s.scheduledFor)}–${pushTime(slotEnd)}`,
          }),
          data: { orderId: s.orderId, status: "requested", to: "customer", orderType: "merchant", kind: "food_scheduled_started" },
        });
      } catch (err) {
        this.logger.error(`sweepDueRings failed for order ${s.orderId}: ${(err as Error).message}`);
      }
    }
    return { rung };
  }
}
