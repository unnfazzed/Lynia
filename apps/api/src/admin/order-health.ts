import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  breachOf,
  compareLive,
  LIVE_ORDER_STATUSES,
  LIVE_STAGE_LABELS,
  type LiveBreach,
  type LiveOrderExtras,
  type LiveOrderFacts,
  type LiveStage,
  stageOf,
} from "./live-ops";

/**
 * QA-B02/B03 (2026-10-20): the ONE place the admin console decides that an order is late and how many orders are
 * active. Before this, the Overview's Needs-attention card used a flat 20-minute `updatedAt` rule over in-flight
 * statuses only, while the alert strip and the Live page used the per-step SLA monitor (live-ops.ts) — so a food
 * order with no biker was "past the time limit" in the banner and invisible on the card.
 *
 *   alert strip ─ /admin/alerts ─┐
 *   Overview    ─ /admin/overview ┼─► OrderHealthService.liveOrders() ─► live-ops stageOf + LIVE_SLA_MS
 *   Live page   ─ /admin/live ────┘
 *   order detail ──────────────────► lateCheck() (same stageOf, one order)
 *
 * "Active" means not ended (`ENDED_ORDER_STATUSES`), on every screen. The monitor only times the orders it has a
 * stage for, so `counts.untimed` is the active orders the Live list can't put a clock on.
 */

/** The statuses that end an order. Everything else counts as active. */
export const ENDED_ORDER_STATUSES = ["completed", "cancelled", "expired", "undelivered"] as const;

/** The monitor's read cap. A pilot has a handful of live orders; this only bounds a flood (the counts can truncate above it). */
export const LIVE_ORDER_CAP = 300;

/** Active (not-ended) orders from an `orderBy status` count map. */
export function activeOrderCount(byStatus: Readonly<Record<string, number>>): number {
  const ended = new Set<string>(ENDED_ORDER_STATUSES);
  return Object.entries(byStatus).reduce((sum, [status, n]) => (ended.has(status) ? sum : sum + n), 0);
}

export interface LateCheck {
  stage: LiveStage;
  stageLabel: string;
  startedAt: Date;
  limitMs: number;
  elapsedMs: number;
  breach: LiveBreach;
  late: boolean;
}

/** One order's stage clock. Null when the monitor doesn't time it (ended, scheduled and not rung, or no stage). */
export function lateCheck(o: LiveOrderFacts, x: LiveOrderExtras, now: number = Date.now()): LateCheck | null {
  const s = stageOf(o, x);
  if (!s) return null;
  const elapsedMs = Math.max(0, now - s.startedAt.getTime());
  const breach = breachOf(elapsedMs, s.limitMs);
  return { stage: s.stage, stageLabel: LIVE_STAGE_LABELS[s.stage], startedAt: s.startedAt, limitMs: s.limitMs, elapsedMs, breach, late: breach === "breach" };
}

/** The order columns {@link stageOf} reads, as a Prisma select. */
export const LIVE_FACTS_SELECT = {
  orderType: true,
  status: true,
  merchantPhase: true,
  createdAt: true,
  riderId: true,
  assignedAt: true,
  merchantAcceptedAt: true,
  acceptDeadlineAt: true,
  autoAccepted: true,
  kitchenConfirmedAt: true,
  prepStartedAt: true,
  prepMinutes: true,
  dispatchStartedAt: true,
  readyAt: true,
  collectedAt: true,
} as const;

export interface LiveOrderRow {
  id: string;
  orderType: string;
  status: string;
  merchantPhase: string | null;
  stage: LiveStage;
  stageLabel: string;
  stageStartedAt: string;
  limitMs: number;
  elapsedMs: number;
  breach: LiveBreach;
  createdAt: string;
  customer: { id: string; name: string };
  rider: { id: string; name: string } | null;
  merchant: { id: string; name: string } | null;
}

export interface LiveOrders {
  generatedAt: string;
  /** `total` = timed rows; `active` = every not-ended order; `untimed` = active orders with no stage clock. */
  counts: { total: number; breach: number; warn: number; active: number; untimed: number };
  rows: LiveOrderRow[];
}

const nameOf = (p: { firstName: string; lastName: string } | null | undefined, fallback: string): string =>
  `${p?.firstName ?? ""} ${p?.lastName ?? ""}`.trim() || fallback;

@Injectable()
export class OrderHealthService {
  constructor(private readonly prisma: PrismaService) {}

  /** Every timed active order with its stage, clock, limit and breach. Breach first, then age. */
  async liveOrders(): Promise<LiveOrders> {
    const now = Date.now();
    const [orders, active] = await Promise.all([
      this.prisma.order.findMany({
        where: { status: { in: [...LIVE_ORDER_STATUSES] } },
        orderBy: { createdAt: "desc" },
        take: LIVE_ORDER_CAP,
        select: {
          id: true,
          ...LIVE_FACTS_SELECT,
          customerId: true,
          customer: { select: { firstName: true, lastName: true } },
          rider: { select: { profile: { select: { firstName: true, lastName: true } } } },
          merchant: { select: { id: true, name: true } },
        },
      }),
      this.prisma.order.count({ where: { status: { notIn: [...ENDED_ORDER_STATUSES] } } }),
    ]);
    const ids = orders.map((o) => o.id);
    const parcelOpen = orders.filter((o) => o.orderType === "parcel" && o.status === "open_for_offers").map((o) => o.id);
    const [bids, lastEvents, assignedEvents] = ids.length
      ? await Promise.all([
          parcelOpen.length
            ? this.prisma.offer.groupBy({
                by: ["orderId"],
                where: { orderId: { in: parcelOpen }, status: "pending" },
                _count: { _all: true },
                _min: { createdAt: true },
              })
            : Promise.resolve([]),
          this.prisma.orderEvent.groupBy({ by: ["orderId"], where: { orderId: { in: ids } }, _max: { createdAt: true } }),
          this.prisma.orderEvent.groupBy({
            by: ["orderId"],
            where: { orderId: { in: ids }, status: "assigned" },
            _max: { createdAt: true },
          }),
        ])
      : [[], [], []];
    const bidsBy = new Map(bids.map((b) => [b.orderId, { n: b._count._all, first: b._min.createdAt }]));
    const lastBy = new Map(lastEvents.map((e) => [e.orderId, e._max.createdAt]));
    const assignedBy = new Map(assignedEvents.map((e) => [e.orderId, e._max.createdAt]));

    const rows: LiveOrderRow[] = [];
    for (const o of orders) {
      const b = bidsBy.get(o.id);
      const c = lateCheck(
        o,
        { bids: b?.n ?? 0, firstBidAt: b?.first ?? null, lastEventAt: lastBy.get(o.id) ?? null, assignedEventAt: assignedBy.get(o.id) ?? null },
        now,
      );
      if (!c) continue;
      rows.push({
        id: o.id,
        orderType: o.orderType,
        status: o.status,
        merchantPhase: o.merchantPhase,
        stage: c.stage,
        stageLabel: c.stageLabel,
        stageStartedAt: c.startedAt.toISOString(),
        limitMs: c.limitMs,
        elapsedMs: c.elapsedMs,
        breach: c.breach,
        createdAt: o.createdAt.toISOString(),
        customer: { id: o.customerId, name: nameOf(o.customer, "Customer") },
        rider: o.riderId ? { id: o.riderId, name: nameOf(o.rider?.profile, "Biker") } : null,
        merchant: o.merchant ? { id: o.merchant.id, name: o.merchant.name } : null,
      });
    }
    rows.sort(compareLive);
    return {
      generatedAt: new Date(now).toISOString(),
      counts: {
        total: rows.length,
        breach: rows.filter((r) => r.breach === "breach").length,
        warn: rows.filter((r) => r.breach === "warn").length,
        active,
        untimed: Math.max(0, active - rows.length),
      },
      rows,
    };
  }

  /** The late orders for the Overview's Needs-attention card: how many, and the one longest past its limit. */
  async lateSummary(): Promise<{ count: number; oldest: { id: string; stageLabel: string; limitMs: number } | null }> {
    const { rows } = await this.liveOrders();
    const late = rows.filter((r) => r.breach === "breach");
    // rows are sorted breach-first, longest in its stage first, so late[0] is the oldest breach.
    const first = late[0];
    return { count: late.length, oldest: first ? { id: first.id, stageLabel: first.stageLabel, limitMs: first.limitMs } : null };
  }
}
