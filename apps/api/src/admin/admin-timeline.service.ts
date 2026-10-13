import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { auditActionLabel, resolveAuditActors } from "./admin-audit-read.service";
import { type Cursor, byNewest, decodeCursor, encodeCursor, humanize, isAfterCursor, money } from "./admin-read.shared";

/**
 * Admin console v2 §4 (docs/plans/2026-10-13-admin-console-v2.md): one merged, newest-first timeline per person
 * (biker or customer) and per merchant. It merges what the database already records — order milestones, the
 * `domain_events` rows about them, the audit rows targeting them, KYC attempts and (bikers) top-ups and ledger
 * rows — into short lines ops can scan.
 *
 * Paging is exact keyset paging over a union: every source is read newest-first up to the cursor and capped at
 * one page (+ tie slack), the union is sorted, and the first page of it is returned. The top N of a union is the
 * top N of the union of each source's top N, so nothing is skipped or repeated across pages.
 */

export type TimelineKind = "order" | "event" | "kyc" | "audit" | "topup" | "wallet";
export type TimelineTone = "good" | "bad" | "mut" | "";

export interface TimelineRowView {
  key: string;
  at: string;
  kind: TimelineKind;
  /** One short line. */
  line: string;
  tone: TimelineTone;
  /** The record the line is about (an order), or null. */
  ref: { label: string; href: string } | null;
  /** Who did it, for audit rows. */
  by: string | null;
}

export interface TimelineView {
  rows: TimelineRowView[];
  nextCursor: string | null;
}

/** Internal row: the view plus its sort position and an optional duplicate-group tag. */
interface Row extends TimelineRowView {
  atDate: Date;
  /** Same tag on an audit row and an event/top-up row means one action recorded twice; the audit row wins. */
  dupe?: string;
}

const PAGE = 30;
/** Extra rows read per source so rows sharing the cursor's exact timestamp can't stall paging. */
const TIE_SLACK = 10;
/** An audit row and its twin event are written in the same transaction: well inside this window. */
const DUPE_WINDOW_MS = 5_000;

const orderRef = (id: string) => ({ label: `#${id.replace(/-/g, "").slice(0, 6)}`, href: `/orders/${id}` });

const ROLE_LABEL: Record<string, string> = { customer: "customer", rider: "biker", merchant: "venue", admin: "ops", system: "system" };

const OFFLINE_REASON: Record<string, string> = {
  cancel_strike_cooldown: "cancel cooldown",
  dispute_strike_cooldown: "dispute cooldown",
  reliability_hold: "reliability hold",
  admin_suspend: "suspended",
  admin_ban: "banned",
  kyc_change: "ID check changed",
  id_expired: "ID expired",
};

const STEP_LABEL: Record<string, string> = {
  become: "Signed up as a biker",
  didit_started: "Started the ID check",
  plate_set: "Added a bike plate",
  plate_verified: "Plate verified",
  first_online: "First time online",
  first_job: "First job done",
  job_10: "10th job done",
  first_topup: "First top-up",
};

const PHASE_LABEL: Record<string, { line: string; tone: TimelineTone }> = {
  accept: { line: "Accepted the order", tone: "good" },
  accept_partial: { line: "Accepted part of the order", tone: "" },
  kitchen_confirmed: { line: "Kitchen confirmed", tone: "good" },
  reject: { line: "Rejected the order", tone: "bad" },
  payment_confirmed: { line: "Confirmed payment", tone: "" },
  ready: { line: "Marked the order ready", tone: "" },
  cancel: { line: "Cancelled the order", tone: "mut" },
};

const RAIL_LABEL: Record<string, string> = { ecocash: "EcoCash", innbucks: "InnBucks", omari: "O'mari", manual: "manual" };

const LEDGER_LABEL: Record<string, string> = {
  ride_commission: "Commission",
  grace: "Starting credit",
  adjustment: "Adjustment",
  reversal: "Reversal",
  free_job: "Free job",
};

/** Audit actions whose twin is recorded as an event or top-up row (same transaction), keyed to that twin's tag. */
const AUDIT_DUPE: Record<string, string> = {
  "rider.become": "step:become",
  "rider.plate_verify": "step:plate_verified",
  "rider.kyc_approve": "kyc",
  "rider.kyc_decline": "kyc",
  "rider.kyc_expire": "kyc",
  "rider.kyc_reset": "kyc",
  "rider.kyc_review_required": "kyc",
  "rider.suspend": "offline:admin_suspend",
  "rider.ban": "offline:admin_ban",
  "wallet.credit": "topup:manual",
};

type Json = Prisma.JsonValue;
function field(data: Json | null | undefined, k: string): unknown {
  return data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>)[k] : undefined;
}
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** One `domain_events` row → a timeline line (exported for the spec). Null for a type the timeline doesn't show. */
export function eventLine(e: { type: string; data: Json | null; orderId: string | null; dishName?: string | null }): Pick<Row, "kind" | "line" | "tone" | "ref" | "dupe"> | null {
  const ref = e.orderId ? orderRef(e.orderId) : null;
  switch (e.type) {
    case "rider.online":
      return { kind: "event", line: "Went online", tone: "good", ref: null };
    case "rider.offline": {
      const reason = str(field(e.data, "reason"));
      const why = reason && reason !== "manual" ? OFFLINE_REASON[reason] ?? humanize(reason).toLowerCase() : null;
      return { kind: "event", line: why ? `Went offline · ${why}` : "Went offline", tone: why ? "bad" : "mut", ref: null, dupe: reason ? `offline:${reason}` : undefined };
    }
    case "rider.onboarding_step": {
      const step = str(field(e.data, "step")) ?? "";
      return { kind: "event", line: STEP_LABEL[step] ?? humanize(step), tone: "good", ref, dupe: `step:${step}` };
    }
    case "kyc.attempt": {
      const decision = str(field(e.data, "decision")) ?? "";
      const reason = str(field(e.data, "reason"));
      const byOps = field(e.data, "resolvedBy") === "admin" ? " · by ops" : "";
      const base =
        decision === "verified"
          ? "ID check passed"
          : decision === "failed"
            ? "ID check failed"
            : decision === "expired"
              ? "ID expired"
              : decision === "held_for_review"
                ? "ID check held for review"
                : decision === "reset"
                  ? "ID check reset"
                  : `ID check: ${humanize(decision).toLowerCase() || "update"}`;
      const tone: TimelineTone = decision === "verified" ? "good" : decision === "failed" || decision === "expired" ? "bad" : "";
      return { kind: "kyc", line: `${base}${reason && decision !== "expired" ? ` · ${humanize(reason).toLowerCase()}` : ""}${byOps}`, tone, ref: null, dupe: "kyc" };
    }
    case "order.fare_raise": {
      const from = num(field(e.data, "from"));
      const to = num(field(e.data, "to"));
      return { kind: "event", line: from != null && to != null ? `Raised the fare ${money(from)} → ${money(to)}` : "Raised the fare", tone: "", ref };
    }
    case "merchant.phase": {
      const phase = str(field(e.data, "phase")) ?? "";
      const p = PHASE_LABEL[phase] ?? { line: humanize(phase), tone: "" as TimelineTone };
      return { kind: "event", line: p.line, tone: p.tone, ref };
    }
    case "merchant.availability": {
      const change = str(field(e.data, "change")) ?? "";
      const line =
        change === "open" ? "Opened" : change === "close" ? "Closed" : change === "hours" ? "Changed opening hours" : change === "busy_on" ? "Turned on busy" : change === "busy_off" ? "Turned off busy" : humanize(change);
      return { kind: "event", line, tone: change === "close" || change === "busy_on" ? "mut" : "", ref: null };
    }
    case "menu.stock": {
      const out = field(e.data, "outOfStock") === true;
      const dish = e.dishName ?? "A dish";
      return { kind: "event", line: out ? `${dish} out of stock` : `${dish} back in stock`, tone: out ? "mut" : "", ref: null };
    }
    default:
      return null;
  }
}

type OrderRow = {
  id: string;
  orderType: string;
  status: string;
  proposedFare: Prisma.Decimal;
  agreedFare: Prisma.Decimal | null;
  createdAt: Date;
  assignedAt: Date | null;
  deliveredAt: Date | null;
  cancelledAt: Date | null;
  cancelledByRole: string | null;
  cancelStage: string | null;
  undeliveredAt: Date | null;
  undeliveredReason: string | null;
  updatedAt: Date;
  merchant: { name: string } | null;
};

const ORDER_SELECT = {
  id: true,
  orderType: true,
  status: true,
  proposedFare: true,
  agreedFare: true,
  createdAt: true,
  assignedAt: true,
  deliveredAt: true,
  cancelledAt: true,
  cancelledByRole: true,
  cancelStage: true,
  undeliveredAt: true,
  undeliveredReason: true,
  updatedAt: true,
  merchant: { select: { name: true } },
} as const;

type Milestone = "created" | "assigned" | "delivered" | "cancelled" | "undelivered" | "expired";

/** One order milestone → a line, from the person's side (exported for the spec). */
export function orderLine(o: OrderRow, m: Milestone, side: "customer" | "rider"): Pick<Row, "kind" | "line" | "tone" | "ref"> {
  const ref = orderRef(o.id);
  switch (m) {
    case "created":
      return {
        kind: "order",
        line: o.orderType === "merchant" ? `Ordered from ${o.merchant?.name ?? "a venue"}` : `Sent a parcel · ${money(o.proposedFare)}`,
        tone: "",
        ref,
      };
    case "assigned":
      return {
        kind: "order",
        line: side === "rider" ? `Took the job · ${money(o.agreedFare ?? o.proposedFare)}` : "A biker took the order",
        tone: "",
        ref,
      };
    case "delivered":
      return { kind: "order", line: "Delivered", tone: "good", ref };
    case "cancelled": {
      const by = o.cancelledByRole ? ROLE_LABEL[o.cancelledByRole] ?? humanize(o.cancelledByRole).toLowerCase() : null;
      const stage = o.cancelStage ? humanize(o.cancelStage).toLowerCase() : null;
      return { kind: "order", line: ["Cancelled", by ? `by ${by}` : null, stage].filter(Boolean).join(" · "), tone: "mut", ref };
    }
    case "undelivered":
      return { kind: "order", line: o.undeliveredReason ? `Not delivered · ${humanize(o.undeliveredReason).toLowerCase()}` : "Not delivered", tone: "bad", ref };
    case "expired":
      return { kind: "order", line: "Expired, no biker took it", tone: "bad", ref };
  }
}

@Injectable()
export class AdminTimelineService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * `GET /admin/people/:profileId/timeline`. A biker's timeline when the profile has a Rider row (their jobs, events,
   * KYC, top-ups and ledger), otherwise a customer's (their orders and fare raises). Audit rows targeting the
   * profile are on both. Null when the profile doesn't exist.
   */
  async personTimeline(profileId: string, rawCursor?: string, side?: "customer" | "rider"): Promise<TimelineView | null> {
    const profile = await this.prisma.profile.findUnique({ where: { id: profileId }, select: { id: true, rider: { select: { profileId: true } } } });
    if (!profile) return null;
    const as: "customer" | "rider" = side ?? (profile.rider ? "rider" : "customer");
    const cursor = decodeCursor(rawCursor);
    const take = PAGE + 1 + TIE_SLACK;
    const lte = cursor ? { lte: cursor.at } : undefined;

    const sources: Promise<Row[]>[] = [this.auditRows(profileId, lte, take)];
    if (as === "rider") {
      sources.push(this.subjectEvents(profileId, lte, take));
      sources.push(this.orderRows({ riderId: profileId }, ["assigned", "delivered", "cancelled", "undelivered"], "rider", lte, take));
      sources.push(this.topupRows(profileId, lte, take));
      sources.push(this.ledgerRows(profileId, lte, take));
    } else {
      sources.push(this.orderRows({ customerId: profileId }, ["created", "assigned", "delivered", "cancelled", "undelivered", "expired"], "customer", lte, take));
      sources.push(this.customerEvents(profileId, cursor, take));
    }
    return merge(await Promise.all(sources), cursor);
  }

  /** `GET /admin/merchants/:id/timeline`: the venue's phases, open/close/busy/hours, stock changes and audit rows. */
  async merchantTimeline(merchantId: string, rawCursor?: string): Promise<TimelineView | null> {
    const merchant = await this.prisma.merchant.findUnique({ where: { id: merchantId }, select: { id: true } });
    if (!merchant) return null;
    const cursor = decodeCursor(rawCursor);
    const take = PAGE + 1 + TIE_SLACK;
    const lte = cursor ? { lte: cursor.at } : undefined;
    const sources = await Promise.all([
      this.auditRows(merchantId, lte, take),
      this.subjectEvents(merchantId, lte, take),
      this.merchantOrderEvents(merchantId, cursor, take),
      this.merchantStockEvents(merchantId, cursor, take),
    ]);
    return merge(sources, cursor);
  }

  private async auditRows(target: string, lte: { lte: Date } | undefined, take: number): Promise<Row[]> {
    const rows = await this.prisma.auditLog.findMany({
      where: { target, ...(lte ? { createdAt: lte } : {}) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
      select: { id: true, actor: true, action: true, reasonCode: true, note: true, amount: true, createdAt: true },
    });
    const actors = await resolveAuditActors(this.prisma, rows.map((r) => r.actor));
    return rows.map((r) => {
      const extra = r.amount != null ? money(r.amount) : r.reasonCode ? humanize(r.reasonCode).toLowerCase() : null;
      return {
        key: `a:${r.id}`,
        at: r.createdAt.toISOString(),
        atDate: r.createdAt,
        kind: "audit" as const,
        line: extra ? `${auditActionLabel(r.action)} · ${extra}` : auditActionLabel(r.action),
        tone: "" as const,
        ref: null,
        by: actors.get(r.actor)?.name ?? r.actor,
        dupe: AUDIT_DUPE[r.action],
      };
    });
  }

  /** Events whose subject is this id (a biker's rider.* / kyc.attempt rows; a merchant's availability rows). */
  private async subjectEvents(subjectId: string, lte: { lte: Date } | undefined, take: number): Promise<Row[]> {
    const rows = await this.prisma.domainEvent.findMany({
      where: { subjectId, ...(lte ? { createdAt: lte } : {}) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
      select: { id: true, type: true, data: true, orderId: true, createdAt: true },
    });
    return toEventRows(rows);
  }

  /** A customer's fare raises — keyed by order, so read through the customer's orders (orders.customer_id index). */
  private async customerEvents(customerId: string, cursor: Cursor | null, take: number): Promise<Row[]> {
    const rows = await this.prisma.$queryRaw<EventSqlRow[]>(Prisma.sql`
      SELECT e.id, e.type, e.data, e.order_id AS "orderId", e.created_at AS "createdAt", NULL::text AS "dishName"
      FROM domain_events e
      WHERE e.type = 'order.fare_raise'
        AND e.order_id IN (SELECT o.id FROM orders o WHERE o.customer_id = ${customerId}::uuid)
        ${cursor ? Prisma.sql`AND e.created_at <= ${cursor.at}` : Prisma.empty}
      ORDER BY e.created_at DESC, e.id DESC
      LIMIT ${take}`);
    return toEventRows(rows);
  }

  /** The venue's own steps on its orders (`merchant.phase` is keyed by order). */
  private async merchantOrderEvents(merchantId: string, cursor: Cursor | null, take: number): Promise<Row[]> {
    const rows = await this.prisma.$queryRaw<EventSqlRow[]>(Prisma.sql`
      SELECT e.id, e.type, e.data, e.order_id AS "orderId", e.created_at AS "createdAt", NULL::text AS "dishName"
      FROM domain_events e
      WHERE e.type = 'merchant.phase'
        AND e.order_id IN (SELECT o.id FROM orders o WHERE o.merchant_id = ${merchantId}::uuid)
        ${cursor ? Prisma.sql`AND e.created_at <= ${cursor.at}` : Prisma.empty}
      ORDER BY e.created_at DESC, e.id DESC
      LIMIT ${take}`);
    return toEventRows(rows);
  }

  /** Stock changes on the venue's dishes (`menu.stock` is keyed by dish), with the dish name. */
  private async merchantStockEvents(merchantId: string, cursor: Cursor | null, take: number): Promise<Row[]> {
    const rows = await this.prisma.$queryRaw<EventSqlRow[]>(Prisma.sql`
      SELECT e.id, e.type, e.data, e.order_id AS "orderId", e.created_at AS "createdAt", d.name AS "dishName"
      FROM domain_events e
      JOIN merchant_dishes d ON d.id::text = e.subject_id
      WHERE e.type = 'menu.stock' AND d.merchant_id = ${merchantId}::uuid
        ${cursor ? Prisma.sql`AND e.created_at <= ${cursor.at}` : Prisma.empty}
      ORDER BY e.created_at DESC, e.id DESC
      LIMIT ${take}`);
    return toEventRows(rows);
  }

  /** One query per milestone column, each newest-first: exact paging even when an order spans pages. */
  private async orderRows(
    who: { riderId: string } | { customerId: string },
    milestones: Milestone[],
    side: "customer" | "rider",
    lte: { lte: Date } | undefined,
    take: number,
  ): Promise<Row[]> {
    const column: Record<Milestone, "createdAt" | "assignedAt" | "deliveredAt" | "cancelledAt" | "undeliveredAt" | "updatedAt"> = {
      created: "createdAt",
      assigned: "assignedAt",
      delivered: "deliveredAt",
      cancelled: "cancelledAt",
      undelivered: "undeliveredAt",
      expired: "updatedAt",
    };
    const lists = await Promise.all(
      milestones.map(async (m) => {
        const col = column[m];
        const where: Prisma.OrderWhereInput = {
          ...who,
          ...(m === "expired" ? { status: "expired" } : {}),
          // `lte` also drops the nulls; without a cursor a nullable milestone column still has to be set.
          ...(lte ? { [col]: lte } : col === "createdAt" || col === "updatedAt" ? {} : { [col]: { not: null } }),
        };
        const rows = (await this.prisma.order.findMany({
          where,
          orderBy: [{ [col]: "desc" }, { id: "desc" }],
          take,
          select: ORDER_SELECT,
        })) as OrderRow[];
        return rows.flatMap((o): Row[] => {
          const at = o[col];
          if (!at) return [];
          return [{ key: `o:${m}:${o.id}`, at: at.toISOString(), atDate: at, by: null, ...orderLine(o, m, side) }];
        });
      }),
    );
    return lists.flat();
  }

  private async topupRows(riderId: string, lte: { lte: Date } | undefined, take: number): Promise<Row[]> {
    const rows = await this.prisma.topUp.findMany({
      where: { riderId, ...(lte ? { initiatedAt: lte } : {}) },
      orderBy: [{ initiatedAt: "desc" }, { id: "desc" }],
      take,
      select: { id: true, rail: true, amount: true, status: true, declineReason: true, initiatedAt: true },
    });
    return rows.map((t) => {
      const tone: TimelineTone = t.status === "confirmed" ? "good" : t.status === "declined" || t.status === "expired" ? "bad" : "";
      const why = t.declineReason && t.status !== "confirmed" && t.declineReason !== t.status ? ` · ${humanize(t.declineReason).toLowerCase()}` : "";
      return {
        key: `t:${t.id}`,
        at: t.initiatedAt.toISOString(),
        atDate: t.initiatedAt,
        kind: "topup" as const,
        line: `Top-up ${money(t.amount)} · ${RAIL_LABEL[t.rail] ?? t.rail} · ${t.status}${why}`,
        tone,
        ref: null,
        by: null,
        dupe: t.rail === "manual" ? "topup:manual" : undefined,
      };
    });
  }

  /** Ledger rows except `topup` credits (the top-up row above already says it, with its status). */
  private async ledgerRows(riderId: string, lte: { lte: Date } | undefined, take: number): Promise<Row[]> {
    const rows = await this.prisma.commissionLedger.findMany({
      where: { riderId, type: { not: "topup" }, ...(lte ? { createdAt: lte } : {}) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
      select: { id: true, type: true, amount: true, balanceAfter: true, orderId: true, createdAt: true },
    });
    return rows.map((l) => {
      const amt = Number(l.amount);
      const label = LEDGER_LABEL[l.type] ?? humanize(l.type);
      const line = l.type === "free_job" ? `${label} · balance ${money(l.balanceAfter)}` : `${label} ${amt > 0 ? "+" : ""}${money(amt)} · balance ${money(l.balanceAfter)}`;
      return {
        key: `l:${l.id}`,
        at: l.createdAt.toISOString(),
        atDate: l.createdAt,
        kind: "wallet" as const,
        line,
        tone: (amt < 0 ? "mut" : "") as TimelineTone,
        ref: l.orderId ? orderRef(l.orderId) : null,
        by: null,
      };
    });
  }
}

type EventSqlRow = { id: string; type: string; data: Json | null; orderId: string | null; createdAt: Date; dishName?: string | null };

function toEventRows(rows: EventSqlRow[]): Row[] {
  return rows.flatMap((e): Row[] => {
    const v = eventLine(e);
    if (!v) return [];
    const at = new Date(e.createdAt);
    return [{ key: `e:${e.id}`, at: at.toISOString(), atDate: at, by: null, ...v }];
  });
}

/**
 * Merge the sources into one page (exported for the spec). Rows at or before the cursor are dropped, the rest
 * sorted newest first and cut to a page; `nextCursor` is the last row of that page. Then, within the page, an
 * event or top-up row that duplicates an audit row written with it (same tag, within seconds) is hidden — the
 * audit row carries the actor and the reason.
 */
export function merge(sources: Row[][], cursor: Cursor | null, page: number = PAGE): TimelineView {
  const seen = new Set<string>();
  const all = sources
    .flat()
    .filter((r) => {
      if (seen.has(r.key) || !isAfterCursor({ at: r.atDate, key: r.key }, cursor)) return false;
      seen.add(r.key);
      return true;
    })
    .sort((a, b) => byNewest({ at: a.atDate, key: a.key }, { at: b.atDate, key: b.key }));
  const pageRows = all.slice(0, page);
  const last = pageRows[pageRows.length - 1];
  const nextCursor = all.length > page && last ? encodeCursor({ at: last.atDate, key: last.key }) : null;

  const audits = pageRows.filter((r) => r.kind === "audit" && r.dupe);
  const visible = pageRows.filter(
    (r) => r.kind === "audit" || !r.dupe || !audits.some((a) => a.dupe === r.dupe && Math.abs(a.atDate.getTime() - r.atDate.getTime()) <= DUPE_WINDOW_MS),
  );
  return {
    rows: visible.map(({ atDate: _atDate, dupe: _dupe, ...v }) => v),
    nextCursor,
  };
}
