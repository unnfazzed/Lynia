import { type OrderStatus, REPORT_REASON_LABELS, type ReportReason, STUCK_AFTER_MINUTES } from "@lynia/shared";
import type { Prisma } from "@prisma/client";
import type { PrismaService } from "../prisma/prisma.service";

export function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Landmark out of a stored Waypoint JSON — the human label ops reads on a trip row. Never the point
 *  or contactPhone (no PII in a listing route string). Falls back to "—" for malformed/empty. */
function landmark(w: unknown): string {
  const o = (w ?? {}) as { landmark?: unknown };
  return typeof o.landmark === "string" && o.landmark.trim() ? o.landmark : "—";
}

/** `pickup → dropoff` route label from the two stored waypoints. */
export function routeOf(pickup: unknown, dropoff: unknown): string {
  return `${landmark(pickup)} → ${landmark(dropoff)}`;
}

/** Calendar date (YYYY-MM-DD) for the joined/when columns — stable + testable, no locale/timezone drift. */
export function fmtDate(d: Date): string {
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
export const ORDER_TIMELINE: { label: string; statuses: OrderStatus[] }[] = [
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
export const STATUS_STEP: Record<string, number> = {
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

// DS20-01: THE single stuck-order threshold — the one source of truth both the ops dashboard
// aggregate (admin.service.overview) and the per-order detail badge (admin-orders.service) import,
// so the two can never drift to different minute values (they did: 25 vs 20). 20 min matches the
// A-04 design spec ("Threshold ~15–20 min", DESIGN-SYSTEM-3-IMPLEMENTATION-PLAN.md). Heuristic only —
// the customer hasn't necessarily reported a problem. NB the two call sites measure elapsed time from
// DIFFERENT data sources on purpose (documented at each usage): the dashboard uses `order.updatedAt`
// (one cheap aggregate query, no per-order OrderEvent join) while the detail page uses the last
// `OrderEvent.createdAt` (already-loaded events, more precise). Same threshold, different clock.
export const STUCK_AFTER_MS = STUCK_AFTER_MINUTES * 60 * 1000;

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

/**
 * Build the AuditLog `data` for a server-driven admin mutation. Same shape recordAuditAction writes,
 * but created with a transaction client so the audit row commits atomically with the state change it
 * describes (A-01: the mutation and its audit row are one `$transaction` — never one without the other).
 */
export function auditData(
  actor: string,
  action: string,
  target: string,
  reasonCode?: string | null,
  note?: string | null,
): Prisma.AuditLogCreateInput {
  return { actor, action, target, reasonCode: reasonCode ?? null, note: note ?? null };
}

/** Compact TripRow for the rider/customer recent-trips tables. Fare is agreed if settled, else proposed. */
export function toTripRow(o: {
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
export function deriveItems(items: unknown, itemDesc: string): Array<{ desc: string; qty: number }> {
  if (Array.isArray(items)) {
    return (items as Array<{ description?: unknown; quantity?: unknown }>).map((it) => ({
      desc: typeof it.description === "string" ? it.description : "Item",
      qty: typeof it.quantity === "number" ? it.quantity : 1,
    }));
  }
  return itemDesc ? [{ desc: itemDesc, qty: 1 }] : [];
}

/**
 * How many times a profile (rider or customer) has been reported by the other party, plus a short
 * recent list. `subjectProfileId` is indexed for exactly this count (see the Report model). Feeds the
 * detail screens so ops can see a repeat-offender pattern at a glance.
 */
export async function reportsFor(
  prisma: PrismaService,
  profileId: string,
): Promise<{ count: number; recent: Array<{ date: string; text: string; issueId?: string }> }> {
  const [count, recent] = await Promise.all([
    prisma.report.count({ where: { subjectProfileId: profileId } }),
    prisma.report.findMany({
      where: { subjectProfileId: profileId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, reason: true, note: true, createdAt: true },
    }),
  ]);
  return {
    count,
    recent: recent.map((r) => ({
      date: fmtDate(r.createdAt),
      // Human label for the reason + the free-text note when present (e.g. "No-show — never arrived").
      text: r.note ? `${REPORT_REASON_LABELS[r.reason as ReportReason]} — ${r.note}` : REPORT_REASON_LABELS[r.reason as ReportReason],
      issueId: r.id,
    })),
  };
}
