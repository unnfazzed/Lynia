import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { type Cursor, clampLimit, decodeCursor, encodeCursor, humanize, isUuid, parseHarareBound, shortId } from "./admin-read.shared";

/**
 * Admin console v2 §8 (docs/plans/2026-10-13-admin-console-v2.md): the READ side of the audit trail. The API has
 * written ~45 audited actions for months with no way to read them back; this is the viewer's endpoint
 * (`GET /admin/audit`) and the per-record Audit sections on the biker / customer / order / merchant pages.
 *
 * `audit_logs.target` is a free string (a profile, order, merchant, issue or SOS id; a few early console rows
 * carry a name), and `targetType` is only set by writers moved since migration 0091. So each row's target is
 * resolved here: the stored type, else the action's family (`rider.*` → biker…), confirmed against the tables.
 */

export type AuditTargetType = "rider" | "customer" | "order" | "merchant" | "issue" | "sos" | "topup" | "other";

export interface AuditTargetView {
  type: AuditTargetType;
  id: string;
  /** What ops reads: a name, or a short id ("#a1b2c3") for an order / issue / SOS / top-up. */
  label: string;
  /** The console page for it, or null when there isn't one. */
  href: string | null;
}

export interface AuditActorView {
  id: string;
  /** A person's name, an operator's email, or "System · <job>". */
  name: string;
  href: string | null;
}

export interface AuditRowView {
  id: string;
  at: string;
  actor: AuditActorView;
  action: string;
  actionLabel: string;
  target: AuditTargetView;
  reasonCode: string | null;
  note: string | null;
  amount: string | null;
  before: Prisma.JsonValue | null;
  after: Prisma.JsonValue | null;
}

export interface AuditListView {
  rows: AuditRowView[];
  nextCursor: string | null;
}

export interface AuditListQuery {
  target?: string;
  targetType?: string;
  actor?: string;
  action?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: string | number;
}

/** Which action prefixes belong to a target type, for rows written before `targetType` existed. */
const TYPE_ACTION_PREFIXES: Record<Exclude<AuditTargetType, "other" | "topup">, string[]> = {
  rider: ["rider.", "wallet."],
  customer: ["customer."],
  order: ["order."],
  merchant: ["merchant."],
  issue: ["issue."],
  sos: ["sos."],
};

const TARGET_TYPES = new Set<string>([...Object.keys(TYPE_ACTION_PREFIXES), "topup", "other"]);

/** The type an action string implies (`rider.suspend` → rider), or null for an unknown family. */
export function actionFamily(action: string): AuditTargetType | null {
  for (const [type, prefixes] of Object.entries(TYPE_ACTION_PREFIXES)) {
    if (prefixes.some((p) => action.startsWith(p))) return type as AuditTargetType;
  }
  return null;
}

/** Short past-tense labels for the actions the API writes. Unknown actions fall back to a humanized string. */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  "rider.suspend": "Suspended",
  "rider.lift": "Suspension lifted",
  "rider.ban": "Banned",
  "rider.clear_hold": "Hold cleared",
  "rider.kyc_approve": "ID check approved",
  "rider.kyc_decline": "ID check declined",
  "rider.kyc_expire": "ID expired",
  "rider.kyc_reset": "ID check reset",
  "rider.kyc_review_required": "ID check held for review",
  "rider.kyc_session_minted": "ID check opened",
  "rider.become": "Signed up as a biker",
  "rider.free_jobs_one_left": "One free job left",
  "rider.free_jobs_used_up": "Free jobs used up",
  "rider.profile_update": "Profile changed",
  "rider.plate_verify": "Plate verified",
  "rider.suspend_food_debt": "Suspended for a food debt",
  "wallet.credit": "Wallet credited",
  "customer.hold": "Put on hold",
  "customer.lift": "Hold lifted",
  "customer.cash_ban_lift": "Cash ban lifted",
  "customer.riders_available_notify": "Told bikers are back",
  "order.cancel": "Cancelled by ops",
  "order.fare_adjust": "Fare changed",
  "order.adjudicate_delivered": "Marked delivered by ops",
  "order.rider_standing_notice": "Customer told about the biker",
  "order.rider_standing_resolved": "Customer told the review is over",
  "order.riders_available_notify": "Told bikers are back",
  "order.debt_write_off": "Debt written off",
  "order.handshake_resolve": "Cash handover resolved",
  "order.kitchen_confirm": "Kitchen confirmed",
  "order.kitchen_no_answer": "Kitchen didn't answer",
  "order.items_edit": "Items changed",
  "order.nudge_rider": "Follow-up logged",
  "order.handover_link": "Handover link sent",
  "order.handover_link_used": "Handover link used",
  "issue.resolve": "Issue resolved",
  "sos.acknowledge": "SOS acknowledged",
  "merchant.go_live": "Went live",
  "merchant.go_dormant": "Switched off",
  "merchant.application_call": "Call logged",
  "merchant.application_review": "Review started",
  "merchant.application_approve": "Approved",
  "merchant.application_reject": "Rejected",
  "merchant.licence_record": "Licence recorded",
  "merchant.licence_verify": "Licence verified",
  "merchant.suspend": "Suspended",
  "merchant.resume": "Resumed",
  "merchant.order_settings": "Order settings changed",
  "merchant.owner_transfer": "Owner changed",
  "merchant.report_non_return": "Reported goods not returned",
  "merchant.rider.add": "Biker added",
  "merchant.rider.remove": "Biker removed",
  "merchant.team.invite": "Team invite sent",
  "merchant.team.invite_cancel": "Team invite cancelled",
  "merchant.team.remove": "Team member removed",
  "merchant.team.leave": "Left the team",
  "merchant.team.join": "Joined the team",
  "merchant.team.decline": "Team invite declined",
  "merchant.branch.create": "Branch added",
  "merchant.branch.switch": "Switched branch",
};

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? humanize(action);
}

/** The console page for a target of a known type. */
export function targetHref(type: AuditTargetType, id: string, extra?: { riderId?: string | null }): string | null {
  switch (type) {
    case "rider":
      return `/riders/${id}`;
    case "customer":
      return `/customers/${id}`;
    case "order":
      return `/orders/${id}`;
    case "merchant":
      return `/merchants/${id}`;
    case "issue":
      return `/issues/${id}`;
    case "sos":
      return "/sos";
    case "topup":
      return extra?.riderId ? `/riders/${extra.riderId}` : null;
    default:
      return null;
  }
}

function personName(p: { firstName: string; lastName: string }): string {
  return `${p.firstName} ${p.lastName}`.trim() || "Unnamed";
}

type ResolveDb = Pick<PrismaService, "profile" | "order" | "merchant" | "issue" | "sosEvent" | "topUp">;

/**
 * Resolve every row's target in at most six batched lookups (one per table, uuids only). A uuid that matches
 * nothing keeps its hinted type with a short-id label and no link, so a purged record still reads sensibly.
 */
export async function resolveAuditTargets(
  db: ResolveDb,
  rows: Array<{ target: string; targetType: string | null; action: string }>,
): Promise<Map<string, AuditTargetView>> {
  const ids = [...new Set(rows.map((r) => r.target).filter(isUuid))];
  const none = Promise.resolve([] as never[]);
  const [profiles, orders, merchants, issues, sos, topups] = ids.length
    ? await Promise.all([
        db.profile.findMany({
          where: { id: { in: ids } },
          select: { id: true, firstName: true, lastName: true, rider: { select: { profileId: true } } },
        }),
        db.order.findMany({ where: { id: { in: ids } }, select: { id: true } }),
        db.merchant.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
        db.issue.findMany({ where: { id: { in: ids } }, select: { id: true } }),
        db.sosEvent.findMany({ where: { id: { in: ids } }, select: { id: true } }),
        db.topUp.findMany({ where: { id: { in: ids } }, select: { id: true, riderId: true } }),
      ])
    : await Promise.all([none, none, none, none, none, none]);
  const profileBy = new Map(profiles.map((p) => [p.id, p]));
  const orderIds = new Set(orders.map((o) => o.id));
  const merchantBy = new Map(merchants.map((m) => [m.id, m]));
  const issueIds = new Set(issues.map((i) => i.id));
  const sosIds = new Set(sos.map((s) => s.id));
  const topupBy = new Map(topups.map((t) => [t.id, t]));

  const out = new Map<string, AuditTargetView>();
  for (const r of rows) {
    const key = `${r.targetType ?? ""}|${r.action}|${r.target}`;
    if (out.has(key)) continue;
    const hinted = (r.targetType && TARGET_TYPES.has(r.targetType) ? r.targetType : actionFamily(r.action)) as AuditTargetType | null;
    const id = r.target;
    const p = profileBy.get(id);
    let view: AuditTargetView;
    if (p) {
      // A biker's customer side (hold, cash ban) opens the customer page; everything else on a biker, the biker's.
      const type: AuditTargetType = hinted === "customer" || !p.rider ? "customer" : "rider";
      view = { type, id, label: personName(p), href: targetHref(type, id) };
    } else if (orderIds.has(id)) {
      view = { type: "order", id, label: shortId(id), href: targetHref("order", id) };
    } else if (merchantBy.has(id)) {
      view = { type: "merchant", id, label: merchantBy.get(id)!.name, href: targetHref("merchant", id) };
    } else if (issueIds.has(id)) {
      view = { type: "issue", id, label: `Issue ${shortId(id)}`, href: targetHref("issue", id) };
    } else if (sosIds.has(id)) {
      view = { type: "sos", id, label: `SOS ${shortId(id)}`, href: targetHref("sos", id) };
    } else if (topupBy.has(id)) {
      view = { type: "topup", id, label: `Top-up ${shortId(id)}`, href: targetHref("topup", id, { riderId: topupBy.get(id)!.riderId }) };
    } else {
      view = { type: hinted ?? "other", id, label: isUuid(id) ? shortId(id) : id.slice(0, 80), href: null };
    }
    out.set(key, view);
  }
  return out;
}

export function targetKey(r: { target: string; targetType: string | null; action: string }): string {
  return `${r.targetType ?? ""}|${r.action}|${r.target}`;
}

/** Resolve actors: a profile id → that person's name; `system:<job>` → "System · <job>"; anything else as is. */
export async function resolveAuditActors(db: Pick<PrismaService, "profile">, actors: string[]): Promise<Map<string, AuditActorView>> {
  const ids = [...new Set(actors.filter(isUuid))];
  const profiles = ids.length
    ? await db.profile.findMany({
        where: { id: { in: ids } },
        select: { id: true, firstName: true, lastName: true, role: true, rider: { select: { profileId: true } } },
      })
    : [];
  const by = new Map(profiles.map((p) => [p.id, p]));
  const out = new Map<string, AuditActorView>();
  for (const a of new Set(actors)) {
    const p = by.get(a);
    if (p) {
      const href = p.role === "admin" ? null : p.rider ? `/riders/${p.id}` : p.role === "customer" ? `/customers/${p.id}` : null;
      out.set(a, { id: a, name: personName(p), href });
    } else if (a.startsWith("system:")) {
      out.set(a, { id: a, name: `System · ${a.slice("system:".length) || "job"}`, href: null });
    } else if (a === "system") {
      out.set(a, { id: a, name: "System", href: null });
    } else {
      out.set(a, { id: a, name: isUuid(a) ? shortId(a) : a, href: null });
    }
  }
  return out;
}

const PAGE = 50;
const MAX_PAGE = 100;

@Injectable()
export class AdminAuditReadService {
  constructor(private readonly prisma: PrismaService) {}

  /** The Prisma `where` for the viewer's filters (exported shape tested in the spec). */
  buildWhere(q: AuditListQuery, cursor: Cursor | null): Prisma.AuditLogWhereInput {
    const and: Prisma.AuditLogWhereInput[] = [];
    const target = q.target?.trim();
    if (target) and.push({ target });
    const type = q.targetType?.trim();
    if (type && type in TYPE_ACTION_PREFIXES) {
      const prefixes = TYPE_ACTION_PREFIXES[type as keyof typeof TYPE_ACTION_PREFIXES];
      and.push({ OR: [{ targetType: type }, { targetType: null, OR: prefixes.map((p) => ({ action: { startsWith: p } })) }] });
    }
    const actor = q.actor?.trim();
    if (actor) and.push({ actor });
    const action = q.action?.trim();
    // "rider." (a trailing dot) is a whole family; anything else is one exact action.
    if (action) and.push(action.endsWith(".") ? { action: { startsWith: action } } : { action });
    const from = parseHarareBound(q.from, "from");
    const to = parseHarareBound(q.to, "to");
    if (from) and.push({ createdAt: { gte: from } });
    if (to) and.push({ createdAt: { lt: to } });
    if (cursor) and.push({ OR: [{ createdAt: { lt: cursor.at } }, { createdAt: cursor.at, id: { lt: cursor.key } }] });
    return and.length ? { AND: and } : {};
  }

  /** `GET /admin/audit` — newest first, keyset-paged, every row's actor and target resolved for display. */
  async list(q: AuditListQuery): Promise<AuditListView> {
    const limit = clampLimit(q.limit, PAGE, MAX_PAGE);
    const cursor = decodeCursor(q.cursor);
    const rows = await this.prisma.auditLog.findMany({
      where: this.buildWhere(q, cursor && isUuid(cursor.key) ? cursor : null),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    const [targets, actors] = await Promise.all([
      resolveAuditTargets(this.prisma, page),
      resolveAuditActors(this.prisma, page.map((r) => r.actor)),
    ]);
    const last = page[page.length - 1];
    return {
      rows: page.map((r) => ({
        id: r.id,
        at: r.createdAt.toISOString(),
        actor: actors.get(r.actor) ?? { id: r.actor, name: r.actor, href: null },
        action: r.action,
        actionLabel: auditActionLabel(r.action),
        target: targets.get(targetKey(r)) ?? { type: "other", id: r.target, label: r.target, href: null },
        reasonCode: r.reasonCode,
        note: r.note,
        amount: r.amount != null ? r.amount.toString() : null,
        before: r.before ?? null,
        after: r.after ?? null,
      })),
      nextCursor: rows.length > limit && last ? encodeCursor({ at: last.createdAt, key: last.id }) : null,
    };
  }
}
