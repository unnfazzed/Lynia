import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { COMMISSION, isCommissionActive, KYC_DECLINE_REASON_LABELS, type KycDeclineReason, kycDeclineClass } from "@lynia/shared";
import type { Prisma } from "@prisma/client";
import { liveCommissionRatePct } from "../common/commission-cover";
import { domainEvents } from "../common/domain-events";
import { mapDiditPendingState } from "../kyc/didit";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { auditData, fmtDate, harareDayStart } from "./admin.shared";
import { humanize, money, shortId } from "./admin-read.shared";
import {
  buildFunnel,
  DAYS,
  dialable,
  earliest,
  FUNNEL_STEPS,
  type FunnelKind,
  type FunnelRange,
  type FunnelStepView,
  HOURS,
  nudgeCopy,
  type PersonSteps,
  rangeWindow,
  reached,
  STUCK_LISTS,
  type StuckListKey,
  stuckListMeta,
} from "./people-funnels";

/**
 * Admin console v2 §4 (docs/plans/2026-10-13-admin-console-v2.md): "find them". The biker, customer and merchant
 * funnels, the stuck lists and Nudge.
 *
 * Every read is bounded: a cohort stops at {@link COHORT_LIMIT} people (the view says so), each stuck list at
 * {@link LIST_LIMIT} rows from at most {@link SCAN_LIMIT} candidates, and every lookup is keyed by an indexed
 * column (profiles.created_at — migration 0103 —, orders (status, created_at) / (customer_id, created_at) /
 * (rider_id, created_at) / (merchant_id, created_at), audit_logs (target, action), domain_events (subject_id,
 * created_at)). The riders and merchants tables are small at pilot scale and filtered directly.
 *
 * The one write is {@link nudge}: one push per person per list per Harare day, enforced here (an advisory lock and
 * the day's `person.nudge` audit row), never trusted to the client.
 */

export const COHORT_LIMIT = 5000;
export const LIST_LIMIT = 200;
const SCAN_LIMIT = 1000;
/** Bounds on the per-cohort child reads (orders, events, audit rows). */
const CHILD_LIMIT = 50_000;
/** How far back a stuck row looks for its last nudge. */
const NUDGE_LOOKBACK_MS = 30 * DAYS;
export const NUDGE_AUDIT_ACTION = "person.nudge";

export interface FunnelView {
  kind: FunnelKind;
  range: FunnelRange;
  from: string;
  to: string;
  cohort: number;
  /** True when the cohort hit {@link COHORT_LIMIT} and the oldest sign-ups in range were left out. */
  truncated: boolean;
  steps: FunnelStepView[];
}

export interface StuckRow {
  /** The record the row is about: a profile id (biker, customer) or a merchant id. */
  id: string;
  name: string;
  href: string;
  /** Who a Nudge reaches (the merchant's owner for a merchant); null when nobody can be pushed. */
  profileId: string | null;
  /** E.164, for tel: and WhatsApp links. Null for a booking account or an erased profile. */
  phone: string | null;
  /** When the clock started (the row's age is now − since). Rows are sorted oldest first. */
  since: string;
  detail: string | null;
  link: { href: string; label: string } | null;
  hasPush: boolean;
  /** The last Nudge for THIS list, in the last 30 days. */
  lastNudgeAt: string | null;
  nudgedToday: boolean;
}

export interface StuckListView {
  key: StuckListKey;
  kind: FunnelKind;
  title: string;
  line: string;
  nudge: boolean;
  /** The push a Nudge sends from this list (shown before sending); null when the list has none. */
  copy: { title: string; body: string } | null;
  rows: StuckRow[];
  count: number;
  /** True when more matched than {@link LIST_LIMIT}. */
  capped: boolean;
  /** A list that lives on another page (the merchant application queue): its link and count. */
  queue: { href: string; label: string; count: number } | null;
  note: string | null;
}

export interface StuckSummary {
  kind: FunnelKind;
  lists: Array<Omit<StuckListView, "rows">>;
}

export type NudgeResult =
  | { result: "sent"; at: string }
  | { result: "not_delivered"; at: string }
  | { result: "already_sent"; at: string }
  | { result: "no_push" };

export interface NudgeInput {
  profileId: string;
  step: StuckListKey;
  reason: string;
  note?: string | null;
}

type Person = { firstName: string; lastName: string; phone: string };

const nameOf = (p: { firstName: string; lastName: string } | null | undefined, fallback: string): string =>
  (p ? `${p.firstName} ${p.lastName}`.trim() : "") || fallback;

const notBookingOrErased: Prisma.ProfileWhereInput[] = [{ phone: { startsWith: "business:" } }, { phone: { startsWith: "erased:" } }];

function field(data: Prisma.JsonValue | null | undefined, k: string): unknown {
  return data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>)[k] : undefined;
}

/** "2 Nov" for a calendar date (a `@db.Date` arrives as UTC midnight). */
function dayMonth(d: Date): string {
  return d.toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short" });
}

/** Group rows by a key into arrays, preserving order. */
function groupBy<T>(rows: T[], key: (r: T) => string | null): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    if (k == null) continue;
    const list = out.get(k);
    if (list) list.push(r);
    else out.set(k, [r]);
  }
  return out;
}

/** The earliest event per subject matching `pick`. */
function firstEventBy<E extends { subjectId: string; createdAt: Date }>(events: E[], pick: (e: E) => boolean): Map<string, Date> {
  const out = new Map<string, Date>();
  for (const e of events) {
    if (!pick(e)) continue;
    const prev = out.get(e.subjectId);
    if (!prev || e.createdAt < prev) out.set(e.subjectId, e.createdAt);
  }
  return out;
}

@Injectable()
export class AdminPeopleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Funnels ─────────────────────────────────────────────────────────────────────────────────────────────

  async funnel(kind: FunnelKind, range: FunnelRange, now: Date = new Date()): Promise<FunnelView> {
    const { from, to } = rangeWindow(range, now);
    const { people, truncated } =
      kind === "biker" ? await this.bikerSteps(from, to, now) : kind === "customer" ? await this.customerSteps(from, to) : await this.merchantSteps(from, to);
    return {
      kind,
      range,
      from: from.toISOString(),
      to: to.toISOString(),
      cohort: people.length,
      truncated,
      steps: buildFunnel(FUNNEL_STEPS[kind], people),
    };
  }

  /** Everyone who signed up in the window (not admins, merchants, booking accounts or erased profiles). */
  private async bikerSteps(from: Date, to: Date, now: Date): Promise<{ people: PersonSteps[]; truncated: boolean }> {
    const profiles = await this.prisma.profile.findMany({
      where: { createdAt: { gte: from, lte: to }, role: { in: ["customer", "rider"] }, NOT: notBookingOrErased },
      orderBy: { createdAt: "desc" },
      take: COHORT_LIMIT + 1,
      select: {
        id: true,
        createdAt: true,
        firstName: true,
        rider: {
          select: {
            createdAt: true,
            kycStatus: true,
            kycRef: true,
            kycAttempts: true,
            kycResolvedAt: true,
            plateStatus: true,
            lastHeartbeatAt: true,
            tripsCount: true,
          },
        },
      },
    });
    const truncated = profiles.length > COHORT_LIMIT;
    const cohort = profiles.slice(0, COHORT_LIMIT);
    const riderIds = cohort.filter((p) => p.rider).map((p) => p.id);
    const none = Promise.resolve([] as never[]);
    const [events, minted, completed, topups] = riderIds.length
      ? await Promise.all([
          this.prisma.domainEvent.findMany({
            where: { subjectId: { in: riderIds }, type: { in: ["rider.onboarding_step", "rider.online", "kyc.attempt"] } },
            orderBy: { createdAt: "asc" },
            take: CHILD_LIMIT,
            select: { subjectId: true, type: true, data: true, createdAt: true },
          }),
          this.prisma.auditLog.findMany({
            where: { action: "rider.kyc_session_minted", target: { in: riderIds } },
            orderBy: { createdAt: "asc" },
            take: CHILD_LIMIT,
            select: { target: true, createdAt: true },
          }),
          this.prisma.order.findMany({
            where: { riderId: { in: riderIds }, status: "completed" },
            orderBy: { completedAt: "asc" },
            take: CHILD_LIMIT,
            select: { riderId: true, completedAt: true },
          }),
          this.prisma.commissionLedger.groupBy({
            by: ["riderId"],
            where: { riderId: { in: riderIds }, type: "topup" },
            _min: { createdAt: true },
          }),
        ])
      : await Promise.all([none, none, none, none]);

    const stepEvent = (step: string) => firstEventBy(events, (e) => e.type === "rider.onboarding_step" && field(e.data, "step") === step);
    const diditEv = stepEvent("didit_started");
    const plateEv = stepEvent("plate_verified");
    const firstOnlineEv = stepEvent("first_online");
    const job10Ev = stepEvent("job_10");
    const topupEv = stepEvent("first_topup");
    const onlineEv = firstEventBy(events, (e) => e.type === "rider.online");
    const verifiedEv = firstEventBy(events, (e) => e.type === "kyc.attempt" && field(e.data, "decision") === "verified");
    const mintedBy = new Map<string, Date>();
    for (const m of minted) if (!mintedBy.has(m.target)) mintedBy.set(m.target, m.createdAt);
    const jobsBy = groupBy(
      completed.filter((o) => o.completedAt),
      (o) => o.riderId,
    );
    const topupBy = new Map(topups.map((t) => [t.riderId, t._min.createdAt]));
    const weekAgo = now.getTime() - 7 * DAYS;

    const people = cohort.map((p): PersonSteps => {
      const r = p.rider;
      const s: PersonSteps = { signed_up: p.createdAt, profile: reached(p.firstName.trim() !== "" || r != null, null) };
      if (!r) return s;
      const jobs = (jobsBy.get(p.id) ?? []).map((o) => o.completedAt!);
      const diditAt = earliest(mintedBy.get(p.id), diditEv.get(p.id));
      s.become = r.createdAt;
      s.didit_started = reached(r.kycRef != null || r.kycStatus !== "pending" || r.kycAttempts > 0 || diditAt != null, diditAt);
      s.verified = reached(
        r.kycStatus === "verified" || r.kycStatus === "expired" || verifiedEv.has(p.id),
        earliest(verifiedEv.get(p.id), r.kycStatus === "verified" ? r.kycResolvedAt : null),
      );
      s.plate_verified = reached(r.plateStatus === "verified", r.plateStatus === "verified" ? plateEv.get(p.id) : null);
      s.first_online = reached(r.lastHeartbeatAt != null, earliest(firstOnlineEv.get(p.id), onlineEv.get(p.id)));
      s.first_job = reached(r.tripsCount >= 1, jobs[0]);
      s.job_10 = reached(r.tripsCount >= 10, jobs[9] ?? (r.tripsCount >= 10 ? job10Ev.get(p.id) : null));
      const topupAt = earliest(topupBy.get(p.id), topupEv.get(p.id));
      s.first_topup = reached(topupAt != null, topupAt);
      const last = jobs[jobs.length - 1];
      s.active_week = reached(last != null && last.getTime() >= weekAgo, null);
      return s;
    });
    return { people, truncated };
  }

  /** Customers who signed up in the window (not bikers, merchants, booking accounts or erased profiles). */
  private async customerSteps(from: Date, to: Date): Promise<{ people: PersonSteps[]; truncated: boolean }> {
    const profiles = await this.prisma.profile.findMany({
      where: { createdAt: { gte: from, lte: to }, role: "customer", rider: null, NOT: notBookingOrErased },
      orderBy: { createdAt: "desc" },
      take: COHORT_LIMIT + 1,
      select: { id: true, createdAt: true },
    });
    const truncated = profiles.length > COHORT_LIMIT;
    const cohort = profiles.slice(0, COHORT_LIMIT);
    const ids = cohort.map((p) => p.id);
    const none = Promise.resolve([] as never[]);
    const [orders, ratings] = ids.length
      ? await Promise.all([
          // A re-broadcast clone is the same request again, not a new order.
          this.prisma.order.findMany({
            where: { customerId: { in: ids }, rebroadcastOfId: null },
            orderBy: { createdAt: "asc" },
            take: CHILD_LIMIT,
            select: { customerId: true, createdAt: true, status: true, deliveredAt: true, completedAt: true },
          }),
          this.prisma.rating.groupBy({ by: ["byProfileId"], where: { byProfileId: { in: ids } }, _min: { createdAt: true } }),
        ])
      : await Promise.all([none, none]);
    const ordersBy = groupBy(orders, (o) => o.customerId);
    const ratedBy = new Map(ratings.map((r) => [r.byProfileId, r._min.createdAt]));

    const people = cohort.map((p): PersonSteps => {
      const mine = ordersBy.get(p.id) ?? [];
      const s: PersonSteps = { signed_up: p.createdAt };
      if (mine.length === 0) return s;
      s.first_order = mine[0].createdAt;
      const done = mine.filter((o) => o.status === "delivered" || o.status === "completed");
      s.delivered = reached(done.length > 0, earliest(...done.map((o) => o.deliveredAt ?? o.completedAt)));
      const ratedAt = ratedBy.get(p.id);
      s.rated = reached(ratedAt != null, ratedAt);
      const second = mine[1];
      if (second && second.createdAt.getTime() - mine[0].createdAt.getTime() <= 14 * DAYS) s.second_order = second.createdAt;
      return s;
    });
    return { people, truncated };
  }

  /** Businesses that signed up in the window. */
  private async merchantSteps(from: Date, to: Date): Promise<{ people: PersonSteps[]; truncated: boolean }> {
    const merchants = await this.prisma.merchant.findMany({
      where: { createdAt: { gte: from, lte: to } },
      orderBy: { createdAt: "desc" },
      take: COHORT_LIMIT + 1,
      select: { id: true, createdAt: true, location: true, hours: true, applicationStatus: true, approvedAt: true, pilotEnabled: true },
    });
    const truncated = merchants.length > COHORT_LIMIT;
    const cohort = merchants.slice(0, COHORT_LIMIT);
    const ids = cohort.map((m) => m.id);
    const none = Promise.resolve([] as never[]);
    const [dishes, events, orders] = ids.length
      ? await Promise.all([
          this.prisma.merchantDish.groupBy({
            by: ["merchantId"],
            where: { merchantId: { in: ids }, isDraft: false, photoUrl: { not: null } },
            _min: { createdAt: true },
          }),
          this.prisma.domainEvent.findMany({
            where: { subjectId: { in: ids }, type: "merchant.application" },
            orderBy: { createdAt: "asc" },
            take: CHILD_LIMIT,
            select: { subjectId: true, data: true, createdAt: true },
          }),
          this.prisma.order.findMany({
            where: { merchantId: { in: ids } },
            orderBy: { createdAt: "asc" },
            take: CHILD_LIMIT,
            select: { merchantId: true, createdAt: true, status: true, completedAt: true },
          }),
        ])
      : await Promise.all([none, none, none]);
    const dishBy = new Map(dishes.map((d) => [d.merchantId, d._min.createdAt]));
    const appEv = (stepKey: string) => firstEventBy(events, (e) => field(e.data, "step") === stepKey);
    const calledEv = appEv("called");
    const approvedEv = appEv("approved");
    const liveEv = appEv("live");
    const ordersBy = groupBy(orders, (o) => o.merchantId);

    const people = cohort.map((m): PersonSteps => {
      const mine = ordersBy.get(m.id) ?? [];
      const done = mine
        .filter((o) => o.status === "completed" && o.completedAt)
        .map((o) => o.completedAt!)
        .sort((a, b) => a.getTime() - b.getTime());
      const isApproved = m.applicationStatus === "approved" || m.applicationStatus === "live" || m.applicationStatus === "suspended" || m.approvedAt != null;
      const isLive = m.applicationStatus === "live" || m.applicationStatus === "suspended" || m.pilotEnabled || liveEv.has(m.id);
      const dishAt = dishBy.get(m.id);
      return {
        signed_up: m.createdAt,
        pin_hours: reached(m.location != null && m.hours != null, null),
        menu_photos: reached(dishAt != null, dishAt),
        called: calledEv.get(m.id),
        approved: reached(isApproved, earliest(approvedEv.get(m.id), m.approvedAt)),
        live: reached(isLive, isLive ? (liveEv.get(m.id) ?? m.approvedAt) : null),
        first_order: mine[0]?.createdAt,
        first_completed: done[0],
        ten_orders: done[9],
      };
    });
    return { people, truncated };
  }

  // ── Stuck lists ─────────────────────────────────────────────────────────────────────────────────────────

  async stuckSummary(kind: FunnelKind, now: Date = new Date()): Promise<StuckSummary> {
    const keys = STUCK_LISTS.filter((l) => l.kind === kind).map((l) => l.key);
    const lists = await Promise.all(keys.map((k) => this.stuck(k, now)));
    return { kind, lists: lists.map(({ rows: _rows, ...rest }) => rest) };
  }

  async stuck(key: StuckListKey, now: Date = new Date()): Promise<StuckListView> {
    const meta = stuckListMeta(key);
    const copy = nudgeCopy(key);
    const base: StuckListView = {
      ...meta,
      copy: copy ? { title: copy.title, body: copy.body } : null,
      rows: [],
      count: 0,
      capped: false,
      queue: null,
      note: null,
    };
    let draft: Omit<StuckRow, "hasPush" | "lastNudgeAt" | "nudgedToday">[] = [];
    switch (key) {
      case "biker_no_didit":
      case "biker_didit_unfinished":
      case "biker_declined_fixable":
      case "biker_plate_waiting":
      case "biker_never_online":
      case "biker_id_expiring":
        draft = await this.bikerKycLists(key, now);
        break;
      case "biker_idle":
        draft = await this.bikerIdle(now);
        break;
      case "biker_low_balance": {
        const out = await this.bikerLowBalance();
        draft = out.rows;
        base.note = out.note;
        break;
      }
      case "customer_expired":
      case "customer_undelivered":
        draft = await this.customerLastOrder(key === "customer_expired" ? "expired" : "undelivered", now);
        break;
      case "customer_cancelled_first":
        draft = await this.customerCancelledFirst(now);
        break;
      case "customer_no_order":
        draft = await this.customerNoOrder(now);
        break;
      case "merchant_applications":
        base.queue = await this.applicationQueue(now);
        base.count = base.queue.count;
        return base;
      case "merchant_live_idle":
        draft = await this.merchantLiveIdle(now);
        break;
    }
    draft.sort((a, b) => a.since.localeCompare(b.since));
    const capped = draft.length > LIST_LIMIT;
    const rows = await this.enrich(key, draft.slice(0, LIST_LIMIT), now);
    return { ...base, rows, count: draft.length, capped };
  }

  private bikerRow(
    r: { profileId: string; profile: Person },
    since: Date,
    detail: string | null,
    link: StuckRow["link"] = null,
  ): Omit<StuckRow, "hasPush" | "lastNudgeAt" | "nudgedToday"> {
    return {
      id: r.profileId,
      name: nameOf(r.profile, "Unnamed biker"),
      href: `/riders/${r.profileId}`,
      profileId: r.profileId,
      phone: dialable(r.profile.phone),
      since: since.toISOString(),
      detail,
      link,
    };
  }

  /** The lists read straight off the rider row (KYC, plate, first online, ID expiry). */
  private async bikerKycLists(key: StuckListKey, now: Date) {
    const select = {
      profileId: true,
      createdAt: true,
      updatedAt: true,
      kycRef: true,
      kycVendorStatus: true,
      kycVendorStatusAt: true,
      kycDeclineReason: true,
      kycResolvedAt: true,
      kycIdExpiresOn: true,
      bikeReg: true,
      profile: { select: { firstName: true, lastName: true, phone: true } },
    } as const;
    const live: Prisma.RiderWhereInput = { accountStatus: { not: "banned" } };
    const norm = (s: string | null) => (s ?? "").trim().toLowerCase().replace(/[\s_-]+/g, " ");

    if (key === "biker_no_didit") {
      const rows = await this.prisma.rider.findMany({
        where: { ...live, kycStatus: "pending", createdAt: { lt: new Date(now.getTime() - 24 * HOURS) } },
        orderBy: { createdAt: "asc" },
        take: SCAN_LIMIT,
        select,
      });
      return rows
        .filter((r) => !r.kycRef || r.kycVendorStatus == null || norm(r.kycVendorStatus) === "not started")
        .map((r) => this.bikerRow(r, r.createdAt, r.kycRef ? "Check made, never opened" : "No check yet"));
    }
    if (key === "biker_didit_unfinished") {
      const rows = await this.prisma.rider.findMany({
        where: { ...live, kycStatus: "pending", kycRef: { not: null }, kycVendorStatus: { not: null }, kycVendorStatusAt: { lt: new Date(now.getTime() - HOURS) } },
        orderBy: { kycVendorStatusAt: "asc" },
        take: SCAN_LIMIT,
        select,
      });
      return rows
        .filter((r) => norm(r.kycVendorStatus) !== "not started" && mapDiditPendingState(r.kycVendorStatus ?? "") === "unfinished")
        .map((r) => this.bikerRow(r, r.kycVendorStatusAt ?? r.createdAt, `ID check: ${r.kycVendorStatus}`));
    }
    if (key === "biker_declined_fixable") {
      // Two strikes lock the check (A-02); a locked biker needs support, not a nudge.
      const rows = await this.prisma.rider.findMany({
        where: { ...live, kycStatus: "failed", kycAttempts: { lt: 2 } },
        orderBy: { kycResolvedAt: "asc" },
        take: SCAN_LIMIT,
        select,
      });
      return rows
        .filter((r) => kycDeclineClass(r.kycDeclineReason) === "fixable")
        .map((r) =>
          this.bikerRow(
            r,
            r.kycResolvedAt ?? r.createdAt,
            r.kycDeclineReason ? (KYC_DECLINE_REASON_LABELS[r.kycDeclineReason as KycDeclineReason] ?? humanize(r.kycDeclineReason)) : "No reason given",
          ),
        );
    }
    if (key === "biker_plate_waiting") {
      const rows = await this.prisma.rider.findMany({
        where: { ...live, plateStatus: "checking" },
        orderBy: { updatedAt: "asc" },
        take: SCAN_LIMIT,
        select,
      });
      // When the plate was saved: the latest plate_set event (PR 2); the row's last change before that.
      const ids = rows.map((r) => r.profileId);
      const events = ids.length
        ? await this.prisma.domainEvent.findMany({
            where: { subjectId: { in: ids }, type: "rider.onboarding_step" },
            orderBy: { createdAt: "desc" },
            take: SCAN_LIMIT * 4,
            select: { subjectId: true, data: true, createdAt: true },
          })
        : [];
      const setAt = new Map<string, Date>();
      for (const e of events) if (field(e.data, "step") === "plate_set" && !setAt.has(e.subjectId)) setAt.set(e.subjectId, e.createdAt);
      return rows.map((r) =>
        this.bikerRow(r, setAt.get(r.profileId) ?? r.updatedAt, r.bikeReg ? `Plate ${r.bikeReg}` : null, { href: "/riders?plate=checking", label: "Plate queue" }),
      );
    }
    if (key === "biker_never_online") {
      const rows = await this.prisma.rider.findMany({
        where: { kycStatus: "verified", accountStatus: "active", lastHeartbeatAt: null },
        orderBy: { kycResolvedAt: "asc" },
        take: SCAN_LIMIT,
        select,
      });
      return rows.map((r) => this.bikerRow(r, r.kycResolvedAt ?? r.createdAt, "Verified, never online"));
    }
    // biker_id_expiring: soonest first (the clock starts when the ID enters its last 30 days).
    const todayStr = fmtDate(now);
    const today = new Date(`${todayStr}T00:00:00Z`);
    const rows = await this.prisma.rider.findMany({
      where: { kycStatus: "verified", kycIdExpiresOn: { gte: today, lte: new Date(today.getTime() + 30 * DAYS) } },
      orderBy: { kycIdExpiresOn: "asc" },
      take: SCAN_LIMIT,
      select,
    });
    return rows.map((r) => this.bikerRow(r, new Date(r.kycIdExpiresOn!.getTime() - 30 * DAYS), `Expires ${dayMonth(r.kycIdExpiresOn!)}`));
  }

  /** Verified bikers who went online in the last 3 days and had no order in that time. */
  private async bikerIdle(now: Date) {
    const cut = new Date(now.getTime() - 3 * DAYS);
    const riders = await this.prisma.rider.findMany({
      where: { kycStatus: "verified", accountStatus: "active", lastHeartbeatAt: { gte: cut } },
      orderBy: { lastHeartbeatAt: "asc" },
      take: SCAN_LIMIT,
      select: { profileId: true, createdAt: true, kycResolvedAt: true, profile: { select: { firstName: true, lastName: true, phone: true } } },
    });
    const ids = riders.map((r) => r.profileId);
    if (ids.length === 0) return [];
    const [recent, lastDone] = await Promise.all([
      this.prisma.order.groupBy({ by: ["riderId"], where: { riderId: { in: ids }, createdAt: { gte: cut } }, _count: { _all: true } }),
      this.prisma.order.groupBy({ by: ["riderId"], where: { riderId: { in: ids }, status: "completed" }, _max: { completedAt: true } }),
    ]);
    const busy = new Set(recent.map((r) => r.riderId));
    const lastBy = new Map(lastDone.map((r) => [r.riderId, r._max.completedAt]));
    return riders
      .filter((r) => !busy.has(r.profileId))
      .map((r) => {
        const last = lastBy.get(r.profileId) ?? null;
        return this.bikerRow(r, last ?? r.kycResolvedAt ?? r.createdAt, last ? `Last job ${fmtDate(last)}` : "No job yet");
      });
  }

  /**
   * Bikers past their free jobs whose balance doesn't cover a typical job's commission (the median of the last 100
   * charged), the per-job rule (D-102 / D-104: there is no balance floor). A negative balance links to Money owed.
   */
  private async bikerLowBalance(): Promise<{ rows: Omit<StuckRow, "hasPush" | "lastNudgeAt" | "nudgedToday">[]; note: string | null }> {
    const rate = liveCommissionRatePct();
    if (!isCommissionActive(rate)) return { rows: [], note: "Commission is 0%, so no job needs a balance." };
    const recent = await this.prisma.commissionLedger.findMany({
      where: { type: "ride_commission", amount: { lt: 0 } },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { amount: true },
    });
    const amounts = recent.map((r) => Math.abs(Number(r.amount))).sort((a, b) => a - b);
    const typical = amounts.length ? amounts[Math.floor(amounts.length / 2)] : 0;
    const below: Prisma.RiderWhereInput[] = [{ commissionAccount: { balance: { lt: typical } } }];
    if (typical > 0) below.push({ commissionAccount: null });
    const riders = await this.prisma.rider.findMany({
      where: { kycStatus: "verified", accountStatus: "active", tripsCount: { gte: COMMISSION.freeFirstJobs }, OR: below },
      take: SCAN_LIMIT,
      select: {
        profileId: true,
        createdAt: true,
        commissionAccount: { select: { balance: true } },
        profile: { select: { firstName: true, lastName: true, phone: true } },
      },
    });
    const ids = riders.map((r) => r.profileId);
    const lastLedger = ids.length
      ? await this.prisma.commissionLedger.groupBy({ by: ["riderId"], where: { riderId: { in: ids } }, _max: { createdAt: true } })
      : [];
    const lastBy = new Map(lastLedger.map((l) => [l.riderId, l._max.createdAt]));
    const rows = riders.map((r) => {
      const balance = r.commissionAccount ? Number(r.commissionAccount.balance) : 0;
      return this.bikerRow(r, lastBy.get(r.profileId) ?? r.createdAt, `Balance ${money(balance)}`, balance < 0 ? { href: "/cash/owed", label: "Money owed" } : null);
    });
    const note = typical > 0 ? `A typical job's commission is ${money(typical)} (the median of the last ${amounts.length}).` : "No commission charged yet, so only balances below $0 are listed.";
    return { rows, note };
  }

  private customerRow(
    p: { id: string } & Person,
    since: Date,
    detail: string | null,
    link: StuckRow["link"] = null,
  ): Omit<StuckRow, "hasPush" | "lastNudgeAt" | "nudgedToday"> {
    return {
      id: p.id,
      name: nameOf(p, "Unnamed customer"),
      href: `/customers/${p.id}`,
      profileId: p.id,
      phone: dialable(p.phone),
      since: since.toISOString(),
      detail,
      link,
    };
  }

  private readonly customerSelect = { id: true, firstName: true, lastName: true, phone: true } as const;

  /** Customers whose LAST order ended `status` recently (expired with no biker: 14 days; undelivered: 30). */
  private async customerLastOrder(status: "expired" | "undelivered", now: Date) {
    const windowDays = status === "expired" ? 14 : 30;
    const orders = await this.prisma.order.findMany({
      where: { status, createdAt: { gte: new Date(now.getTime() - windowDays * DAYS) }, customer: { NOT: notBookingOrErased } },
      orderBy: { createdAt: "desc" },
      take: SCAN_LIMIT,
      select: { id: true, createdAt: true, customerId: true, orderType: true, undeliveredReason: true, customer: { select: this.customerSelect } },
    });
    const latest = new Map<string, (typeof orders)[number]>();
    for (const o of orders) if (!latest.has(o.customerId)) latest.set(o.customerId, o);
    const ids = [...latest.keys()];
    if (ids.length === 0) return [];
    const newest = await this.prisma.order.groupBy({ by: ["customerId"], where: { customerId: { in: ids } }, _max: { createdAt: true } });
    const newestBy = new Map(newest.map((n) => [n.customerId, n._max.createdAt]));
    return [...latest.values()]
      .filter((o) => (newestBy.get(o.customerId)?.getTime() ?? 0) <= o.createdAt.getTime())
      .map((o) => {
        const what = o.orderType === "merchant" ? "Shop or food order" : "Parcel";
        const detail = status === "expired" ? `${what}, no biker took it` : `${what}${o.undeliveredReason ? ` · ${humanize(o.undeliveredReason).toLowerCase()}` : ""}`;
        return this.customerRow(o.customer, o.createdAt, detail, { href: `/orders/${o.id}`, label: shortId(o.id) });
      });
  }

  /** Customers whose only order (re-broadcasts aside) was cancelled in the last 30 days. */
  private async customerCancelledFirst(now: Date) {
    const orders = await this.prisma.order.findMany({
      where: { status: "cancelled", rebroadcastOfId: null, createdAt: { gte: new Date(now.getTime() - 30 * DAYS) }, customer: { NOT: notBookingOrErased } },
      orderBy: { createdAt: "desc" },
      take: SCAN_LIMIT,
      select: { id: true, createdAt: true, cancelledAt: true, customerId: true, cancelledByRole: true, customer: { select: this.customerSelect } },
    });
    const ids = [...new Set(orders.map((o) => o.customerId))];
    if (ids.length === 0) return [];
    const counts = await this.prisma.order.groupBy({ by: ["customerId"], where: { customerId: { in: ids }, rebroadcastOfId: null }, _count: { _all: true } });
    const only = new Set(counts.filter((c) => c._count._all === 1).map((c) => c.customerId));
    return orders
      .filter((o) => only.has(o.customerId))
      .map((o) =>
        this.customerRow(o.customer, o.cancelledAt ?? o.createdAt, o.cancelledByRole ? `Cancelled by ${humanize(o.cancelledByRole).toLowerCase()}` : "Cancelled", {
          href: `/orders/${o.id}`,
          label: shortId(o.id),
        }),
      );
  }

  /** Customers who signed up 7–60 days ago and never ordered. */
  private async customerNoOrder(now: Date) {
    const profiles = await this.prisma.profile.findMany({
      where: {
        role: "customer",
        rider: null,
        createdAt: { gte: new Date(now.getTime() - 60 * DAYS), lt: new Date(now.getTime() - 7 * DAYS) },
        customerOrders: { none: {} },
        NOT: notBookingOrErased,
      },
      orderBy: { createdAt: "asc" },
      take: LIST_LIMIT + 1,
      select: { ...this.customerSelect, createdAt: true },
    });
    return profiles.map((p) => this.customerRow(p, p.createdAt, `Signed up ${fmtDate(p.createdAt)}`));
  }

  /** PR 4's application queue owns this list: only its count and a link here. */
  private async applicationQueue(now: Date): Promise<NonNullable<StuckListView["queue"]>> {
    const cut = new Date(now.getTime() - 24 * HOURS);
    const count = await this.prisma.merchant.count({
      where: {
        applicationStatus: { in: ["applied", "reviewing"] },
        OR: [{ applicationStatusAt: { lt: cut } }, { applicationStatusAt: null, createdAt: { lt: cut } }],
      },
    });
    return { href: "/merchants?status=applied", label: "Open the application queue", count };
  }

  /** Live businesses with no order in the last 7 days. */
  private async merchantLiveIdle(now: Date) {
    const merchants = await this.prisma.merchant.findMany({
      where: { applicationStatus: "live" },
      take: SCAN_LIMIT,
      select: {
        id: true,
        name: true,
        createdAt: true,
        approvedAt: true,
        applicationStatusAt: true,
        ownerProfile: { select: { id: true, firstName: true, lastName: true, phone: true } },
      },
    });
    const ids = merchants.map((m) => m.id);
    if (ids.length === 0) return [];
    const last = await this.prisma.order.groupBy({ by: ["merchantId"], where: { merchantId: { in: ids } }, _max: { createdAt: true } });
    const lastBy = new Map(last.map((l) => [l.merchantId, l._max.createdAt]));
    const cut = now.getTime() - 7 * DAYS;
    return merchants
      .filter((m) => (lastBy.get(m.id)?.getTime() ?? 0) < cut)
      .map((m) => {
        const lastAt = lastBy.get(m.id) ?? null;
        return {
          id: m.id,
          name: m.name || "Unnamed business",
          href: `/merchants/${m.id}`,
          profileId: m.ownerProfile?.id ?? null,
          phone: dialable(m.ownerProfile?.phone),
          since: (lastAt ?? m.applicationStatusAt ?? m.approvedAt ?? m.createdAt).toISOString(),
          detail: lastAt ? `Last order ${fmtDate(lastAt)}` : "No order yet",
          link: null,
        };
      });
  }

  /** Push reachability and the last nudge for this list, in two batched reads. */
  private async enrich(key: StuckListKey, rows: Omit<StuckRow, "hasPush" | "lastNudgeAt" | "nudgedToday">[], now: Date): Promise<StuckRow[]> {
    const ids = [...new Set(rows.map((r) => r.profileId).filter((id): id is string => id != null))];
    const [tokens, nudges] = ids.length
      ? await Promise.all([
          this.prisma.deviceToken.groupBy({ by: ["profileId"], where: { profileId: { in: ids } }, _count: { _all: true } }),
          this.prisma.auditLog.findMany({
            where: { action: NUDGE_AUDIT_ACTION, target: { in: ids }, createdAt: { gte: new Date(now.getTime() - NUDGE_LOOKBACK_MS) } },
            orderBy: { createdAt: "desc" },
            take: SCAN_LIMIT,
            select: { target: true, after: true, createdAt: true },
          }),
        ])
      : [[], []];
    const pushable = new Set(tokens.map((t) => t.profileId));
    const lastBy = new Map<string, Date>();
    for (const n of nudges) if (field(n.after, "step") === key && !lastBy.has(n.target)) lastBy.set(n.target, n.createdAt);
    const dayStart = harareDayStart(now).getTime();
    return rows.map((r) => {
      const last = r.profileId ? lastBy.get(r.profileId) : undefined;
      return {
        ...r,
        hasPush: r.profileId ? pushable.has(r.profileId) : false,
        lastNudgeAt: last ? last.toISOString() : null,
        nudgedToday: last ? last.getTime() >= dayStart : false,
      };
    });
  }

  // ── Nudge ───────────────────────────────────────────────────────────────────────────────────────────────

  /**
   * Push one person the fixed copy for one stuck list (owner decision 6: push only). At most one per person per
   * list per Harare day, enforced under an advisory lock against the day's `person.nudge` audit row, so a double
   * tap, a retry or a second tab returns `already_sent` instead of a second push. The audit row and a `nudge.sent`
   * event commit before the push goes out; a person with no registered device gets `no_push` and nothing is
   * written.
   */
  async nudge(actor: string, input: NudgeInput, now: Date = new Date()): Promise<NudgeResult> {
    const meta = stuckListMeta(input.step);
    const copy = nudgeCopy(input.step);
    if (!copy) throw new BadRequestException({ reason: "no_nudge", message: "This list has no nudge." });
    const profile = await this.prisma.profile.findUnique({
      where: { id: input.profileId },
      select: { id: true, rider: { select: { profileId: true } }, ownedMerchants: { select: { id: true }, take: 1 } },
    });
    if (!profile) throw new NotFoundException("Person not found");
    if (meta.kind === "biker" && !profile.rider) throw new ConflictException({ reason: "not_a_biker", message: "This person isn't a biker." });
    if (meta.kind === "merchant" && profile.ownedMerchants.length === 0) {
      throw new ConflictException({ reason: "not_a_merchant", message: "This person doesn't own a business." });
    }

    const devices = await this.prisma.deviceToken.count({ where: { profileId: profile.id } });
    if (devices === 0) return { result: "no_push" };

    const day = fmtDate(now);
    const dayStart = harareDayStart(now);
    const claim = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`nudge:${profile.id}:${input.step}:${day}`}))`;
      const prior = await tx.auditLog.findFirst({
        where: { action: NUDGE_AUDIT_ACTION, target: profile.id, createdAt: { gte: dayStart }, after: { path: ["step"], equals: input.step } },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      });
      if (prior) return { already: prior.createdAt };
      const row = await tx.auditLog.create({
        data: {
          ...auditData(actor, NUDGE_AUDIT_ACTION, profile.id, input.reason, input.note ?? null),
          targetType: "person",
          after: { step: input.step, title: copy.title },
        },
        select: { createdAt: true },
      });
      await domainEvents.record(tx, {
        type: "nudge.sent",
        actorId: actor,
        actorRole: "admin",
        subjectType: "person",
        subjectId: profile.id,
        data: { step: input.step, day },
      });
      return { already: null, at: row.createdAt };
    });
    if (claim.already) return { result: "already_sent", at: claim.already.toISOString() };

    const at = (claim.at ?? now).toISOString();
    const delivered = await this.notifications.notifyProfiles([profile.id], {
      title: copy.title,
      body: copy.body,
      data: { ...copy.data, nudge: input.step },
      collapseKey: `nudge:${input.step}`,
    });
    return delivered.has(profile.id) ? { result: "sent", at } : { result: "not_delivered", at };
  }
}
