import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  MERCHANT_APPLICATION_WAITING,
  MERCHANT_REJECT_REASONS,
  type MerchantHours,
  isMerchantOpenNow,
  merchantApplicationSla,
} from "@lynia/shared";
import { domainEvents, type MerchantApplicationStep } from "../common/domain-events";
import { harareWallClock } from "../merchant/harare-clock";
import { PrismaService } from "../prisma/prisma.service";
import { auditData } from "./admin.shared";
import {
  ACTION_FROM,
  ACTION_TO,
  allowedActions,
  buildChecklist,
  checklistPasses,
  checklistScore,
  effectiveApplicationStatus,
  isPharmacy,
  median,
  type ApplicationAction,
  type ApplicationStatus,
  type ChecklistInput,
} from "./merchant-application";

/** Audit actions this service writes, each in the same transaction as its change (reserved in admin-audit). */
export const MERCHANT_APPLICATION_AUDIT = {
  call: "merchant.application_call",
  review: "merchant.application_review",
  approve: "merchant.application_approve",
  reject: "merchant.application_reject",
  go_live: "merchant.go_live",
  suspend: "merchant.suspend",
  resume: "merchant.resume",
  licenceRecord: "merchant.licence_record",
  licenceVerify: "merchant.licence_verify",
} as const;

const STEP_FOR: Readonly<Record<ApplicationAction, MerchantApplicationStep>> = {
  review: "reviewing",
  approve: "approved",
  reject: "rejected",
  go_live: "live",
  suspend: "suspended",
  resume: "resumed",
};

/** Ops call outcomes: only a call that reached someone ticks the checklist. */
export const CALL_OUTCOMES = ["reached", "no_answer"] as const;
export type CallOutcome = (typeof CALL_OUTCOMES)[number];

const APPLICATION_SELECT = {
  id: true,
  name: true,
  businessType: true,
  shopKind: true,
  location: true,
  hours: true,
  pilotEnabled: true,
  applicationStatus: true,
  applicationStatusAt: true,
  applicationReasonCode: true,
  approvedAt: true,
  approvedBy: true,
  createdAt: true,
} as const;

type ApplicationRow = Prisma.MerchantGetPayload<{ select: typeof APPLICATION_SELECT }>;

/** The slice of Prisma the checklist loader reads — the service's client or a transaction's. */
type Db = Pick<
  Prisma.TransactionClient,
  "merchantCategory" | "merchantDish" | "merchantMember" | "merchantInvite" | "merchantDocument" | "domainEvent"
>;

const METRICS_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const SLOT_MS = 15 * 60 * 1000;

function num(d: { toString(): string } | null | undefined): number | null {
  return d == null ? null : Number(d.toString());
}

function eventStep(data: unknown): { step?: string; outcome?: string } {
  return data && typeof data === "object" ? (data as { step?: string; outcome?: string }) : {};
}

/**
 * Admin console v2 §5 — merchant registration → approval. The application state lives on
 * `Merchant.applicationStatus`; `pilotEnabled` stays the switch the customer paths read and is written in
 * the same update whenever the state crosses `live` (go live, suspend, resume), so a customer path never
 * needs to know about applications. Every action takes a reason, CAS-guards on the state it read, and writes
 * its audit row (targetType + before/after) and its `merchant.application` event in one transaction.
 */
@Injectable()
export class AdminMerchantApplicationService {
  constructor(private readonly prisma: PrismaService) {}

  /* ── Reads ──────────────────────────────────────────────────────────────────────────────────── */

  /** Checklist inputs for a batch of merchants (queue rows or one detail), in seven grouped queries. */
  async loadChecklistInputs(db: Db, merchants: ApplicationRow[], now = new Date()): Promise<Map<string, ChecklistInput>> {
    const ids = merchants.map((m) => m.id);
    const out = new Map<string, ChecklistInput>();
    if (ids.length === 0) return out;
    const [categories, dishes, photos, members, invites, documents, events] = await Promise.all([
      db.merchantCategory.groupBy({ by: ["merchantId"], where: { merchantId: { in: ids } }, _count: { _all: true } }),
      db.merchantDish.groupBy({
        by: ["merchantId", "isDraft"],
        where: { merchantId: { in: ids } },
        _count: { _all: true },
        _min: { priceUsd: true },
        _max: { priceUsd: true },
      }),
      db.merchantDish.groupBy({ by: ["merchantId"], where: { merchantId: { in: ids }, photoUrl: { not: null } }, _count: { _all: true } }),
      db.merchantMember.findMany({
        where: { merchantId: { in: ids } },
        select: { merchantId: true, role: true, displayName: true, termsAcceptedAt: true, isPharmacist: true, profile: { select: { phoneVerifiedAt: true } } },
      }),
      db.merchantInvite.groupBy({ by: ["merchantId"], where: { merchantId: { in: ids }, expiresAt: { gt: now } }, _count: { _all: true } }),
      db.merchantDocument.findMany({
        where: { merchantId: { in: ids }, kind: "pharmacy_licence" },
        select: { merchantId: true, licenceNumber: true, pharmacistName: true, verifiedAt: true },
      }),
      db.domainEvent.findMany({
        where: { type: "merchant.application", subjectId: { in: ids } },
        orderBy: { createdAt: "desc" },
        take: 500,
        select: { subjectId: true, data: true, createdAt: true },
      }),
    ]);
    for (const m of merchants) {
      const dishRows = dishes.filter((d) => d.merchantId === m.id);
      const total = dishRows.reduce((n, d) => n + d._count._all, 0);
      const drafts = dishRows.filter((d) => d.isDraft).reduce((n, d) => n + d._count._all, 0);
      const mins = dishRows.map((d) => num(d._min.priceUsd)).filter((v): v is number => v != null);
      const maxs = dishRows.map((d) => num(d._max.priceUsd)).filter((v): v is number => v != null);
      const team = members.filter((t) => t.merchantId === m.id);
      const owner = team.find((t) => t.role === "owner");
      const doc = documents.find((d) => d.merchantId === m.id);
      const call = events.find((e) => e.subjectId === m.id && eventStep(e.data).step === "called" && eventStep(e.data).outcome === "reached");
      out.set(m.id, {
        businessType: m.businessType,
        shopKind: m.shopKind,
        status: effectiveApplicationStatus(m),
        location: m.location,
        hours: m.hours,
        owner: owner ? { name: owner.displayName, phoneVerified: owner.profile?.phoneVerifiedAt != null, termsAccepted: owner.termsAcceptedAt != null } : null,
        menu: {
          categories: categories.find((c) => c.merchantId === m.id)?._count._all ?? 0,
          dishes: total,
          liveDishes: total - drafts,
          withPhoto: photos.find((p) => p.merchantId === m.id)?._count._all ?? 0,
          drafts,
          minPrice: mins.length ? Math.min(...mins) : null,
          maxPrice: maxs.length ? Math.max(...maxs) : null,
        },
        team: {
          members: team.length,
          staff: team.filter((t) => t.role === "staff").length,
          openInvites: invites.find((i) => i.merchantId === m.id)?._count._all ?? 0,
          pharmacists: team.filter((t) => t.isPharmacist).length,
        },
        licence: doc ? { licenceNumber: doc.licenceNumber, pharmacistName: doc.pharmacistName, verifiedAt: doc.verifiedAt } : null,
        lastCallAt: call?.createdAt ?? null,
      });
    }
    return out;
  }

  /** Queue rows: the effective status, age, SLA and checklist score for a page of merchants. */
  async queueRows(merchants: ApplicationRow[], now = new Date()) {
    const inputs = await this.loadChecklistInputs(this.prisma, merchants, now);
    return new Map(
      merchants.map((m) => {
        const status = effectiveApplicationStatus(m);
        const ageMs = now.getTime() - m.createdAt.getTime();
        const waiting = MERCHANT_APPLICATION_WAITING.includes(status);
        const rows = buildChecklist(inputs.get(m.id)!);
        return [
          m.id,
          {
            applicationStatus: status,
            appliedAt: m.createdAt.toISOString(),
            ageMs,
            sla: waiting ? merchantApplicationSla(ageMs) : null,
            score: checklistScore(rows),
          },
        ] as const;
      }),
    );
  }

  /** `GET /admin/merchants/:id/application`: the checklist, the licence, the calls and the open actions. */
  async getApplication(id: string, now = new Date()) {
    const m = await this.prisma.merchant.findUnique({ where: { id }, select: APPLICATION_SELECT });
    if (!m) throw new NotFoundException("Merchant not found");
    const [inputs, licence, calls, events] = await Promise.all([
      this.loadChecklistInputs(this.prisma, [m], now),
      this.prisma.merchantDocument.findUnique({ where: { merchantId_kind: { merchantId: id, kind: "pharmacy_licence" } } }),
      this.prisma.auditLog.findMany({
        where: { target: id, action: MERCHANT_APPLICATION_AUDIT.call },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, reasonCode: true, note: true, createdAt: true },
      }),
      this.prisma.domainEvent.findMany({
        where: { type: "merchant.application", subjectId: id },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { data: true, createdAt: true },
      }),
    ]);
    const status = effectiveApplicationStatus(m);
    const checklist = buildChecklist(inputs.get(id)!);
    const passes = checklistPasses(checklist);
    const ageMs = now.getTime() - m.createdAt.getTime();
    return {
      merchantId: id,
      status,
      statusAt: m.applicationStatusAt?.toISOString() ?? null,
      rejectReason: status === "rejected" ? m.applicationReasonCode : null,
      appliedAt: m.createdAt.toISOString(),
      approvedAt: m.approvedAt?.toISOString() ?? null,
      sla: MERCHANT_APPLICATION_WAITING.includes(status) ? merchantApplicationSla(ageMs) : null,
      ageMs,
      isPharmacy: isPharmacy(m),
      checklist,
      score: checklistScore(checklist),
      canApprove: passes,
      // Approve shows only once the checklist passes; the server refuses it otherwise anyway.
      actions: allowedActions(status).filter((a) => a !== "approve" || passes),
      licence: licence
        ? {
            licenceNumber: licence.licenceNumber,
            pharmacistName: licence.pharmacistName,
            reference: licence.reference,
            recordedBy: licence.recordedBy,
            recordedAt: licence.updatedAt.toISOString(),
            verifiedAt: licence.verifiedAt?.toISOString() ?? null,
            verifiedBy: licence.verifiedBy,
          }
        : null,
      calls: calls.map((c) => ({ id: c.id, outcome: c.reasonCode, note: c.note, at: c.createdAt.toISOString() })),
      history: events.map((e) => ({ step: eventStep(e.data).step ?? "unknown", at: e.createdAt.toISOString() })),
    };
  }

  /* ── Actions ────────────────────────────────────────────────────────────────────────────────── */

  /** Log an ops call. Doesn't move the state; a call that reached someone ticks the checklist. */
  async logCall(actor: string, id: string, input: { outcome: CallOutcome; note?: string | null }) {
    return this.prisma.$transaction(async (tx) => {
      const m = await tx.merchant.findUnique({ where: { id }, select: { id: true } });
      if (!m) throw new NotFoundException("Merchant not found");
      const audit = await tx.auditLog.create({
        data: { ...auditData(actor, MERCHANT_APPLICATION_AUDIT.call, id, input.outcome, input.note), targetType: "merchant" },
        select: { id: true },
      });
      await domainEvents.merchantApplication(tx, id, "called", { actorId: actor, data: { outcome: input.outcome } });
      return { id, auditId: audit.id };
    });
  }

  /**
   * Move an application. `go_live` and `resume` turn `pilotEnabled` on in the same update, `suspend` turns it
   * off (customers stop seeing the business and it takes no new orders; history and orders already placed
   * carry on). Approve is refused unless every required check passes; go-live needs a pin, a live dish or item,
   * and for a pharmacy a verified licence. Resume re-checks the pin and the menu only: a pharmacy that went
   * live before licences were checked is not taken offline for it.
   */
  async transition(actor: string, id: string, action: ApplicationAction, input: { reason: string; note?: string | null }) {
    if (action === "reject" && !(MERCHANT_REJECT_REASONS as readonly string[]).includes(input.reason)) {
      throw new ConflictException({ reason: "bad_reject_reason", message: "Pick a reason the business can read." });
    }
    return this.prisma.$transaction(async (tx) => {
      const m = await tx.merchant.findUnique({ where: { id }, select: APPLICATION_SELECT });
      if (!m) throw new NotFoundException("Merchant not found");
      const from = effectiveApplicationStatus(m);
      const to = ACTION_TO[action];
      if (!ACTION_FROM[action].includes(from)) {
        throw new ConflictException({ reason: "wrong_state", message: `Can't do that while the business is ${from}.` });
      }
      const noun = m.businessType === "shop" ? (isPharmacy(m) ? "pharmacy" : "shop") : "restaurant";

      if (action === "approve") {
        const inputs = await this.loadChecklistInputs(tx, [m]);
        const failing = buildChecklist(inputs.get(id)!).filter((r) => r.required && !r.ok);
        if (failing.length) {
          throw new ConflictException({ reason: "checklist_incomplete", message: `Not every check passes yet: ${failing.map((r) => r.label).join(", ")}.` });
        }
      }
      if (action === "go_live" || action === "resume") {
        if (!m.location) throw new ConflictException({ reason: "no_location", message: `This ${noun} has no pickup pin yet.` });
        const liveDishes = await tx.merchantDish.count({ where: { merchantId: id, isDraft: false } });
        if (liveDishes === 0) {
          throw new ConflictException({
            reason: "no_live_dishes",
            message: noun === "restaurant" ? "This restaurant has no dish with a photo yet — its menu would be empty." : `This ${noun} has no item with a photo yet — its shop would be empty.`,
          });
        }
      }
      if (action === "go_live" && isPharmacy(m)) {
        const doc = await tx.merchantDocument.findUnique({ where: { merchantId_kind: { merchantId: id, kind: "pharmacy_licence" } }, select: { verifiedAt: true } });
        if (!doc?.verifiedAt) throw new ConflictException({ reason: "licence_not_verified", message: "Record and verify the pharmacy licence first." });
      }

      const before = { applicationStatus: from, pilotEnabled: m.pilotEnabled };
      const pilotEnabled = to === "live" ? true : action === "suspend" ? false : m.pilotEnabled;
      const firstApproval = action === "approve" && m.approvedAt == null;
      const now = new Date();
      // CAS on what we read: a concurrent action (or an old revision's switch) makes this a clean 409.
      const claimed = await tx.merchant.updateMany({
        where: { id, applicationStatus: m.applicationStatus, pilotEnabled: before.pilotEnabled },
        data: {
          applicationStatus: to,
          applicationStatusAt: now,
          pilotEnabled,
          ...(action === "reject" ? { applicationReasonCode: input.reason } : action === "review" ? { applicationReasonCode: null } : {}),
          ...(firstApproval ? { approvedAt: now, approvedBy: actor } : {}),
        },
      });
      if (claimed.count === 0) throw new ConflictException({ reason: "changed", message: "This business changed — refresh and try again." });
      const audit = await tx.auditLog.create({
        data: {
          ...auditData(actor, MERCHANT_APPLICATION_AUDIT[action], id, input.reason, input.note),
          targetType: "merchant",
          before,
          after: { applicationStatus: to, pilotEnabled, ...(action === "reject" ? { reasonCode: input.reason } : {}) },
        },
        select: { id: true },
      });
      await domainEvents.merchantApplication(tx, id, STEP_FOR[action], {
        actorId: actor,
        data: { from, ...(action === "reject" || action === "suspend" ? { reason: input.reason } : {}) },
      });
      return { id, status: to, pilotEnabled, auditId: audit.id };
    });
  }

  /**
   * Owner decision 5: record a pharmacy's licence after the ops call (number, the pharmacist named on it, and
   * where the copy is). A changed number or pharmacist clears the verification; verify is a separate action.
   */
  async recordLicence(
    actor: string,
    id: string,
    input: { licenceNumber: string; pharmacistName: string; reference?: string | null; note?: string | null },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const m = await tx.merchant.findUnique({ where: { id }, select: { id: true, businessType: true, shopKind: true } });
      if (!m) throw new NotFoundException("Merchant not found");
      if (!isPharmacy(m)) throw new ConflictException({ reason: "not_a_pharmacy", message: "Only a pharmacy has a licence to record." });
      const key = { merchantId_kind: { merchantId: id, kind: "pharmacy_licence" as const } };
      const prev = await tx.merchantDocument.findUnique({ where: key });
      const licenceNumber = input.licenceNumber.trim();
      const pharmacistName = input.pharmacistName.trim();
      const reference = input.reference?.trim() || null;
      const same = !!prev && prev.licenceNumber === licenceNumber && prev.pharmacistName === pharmacistName;
      const doc = await tx.merchantDocument.upsert({
        where: key,
        create: { merchantId: id, kind: "pharmacy_licence", licenceNumber, pharmacistName, reference, recordedBy: actor },
        update: { licenceNumber, pharmacistName, reference, recordedBy: actor, ...(same ? {} : { verifiedAt: null, verifiedBy: null }) },
      });
      const audit = await tx.auditLog.create({
        data: {
          ...auditData(actor, MERCHANT_APPLICATION_AUDIT.licenceRecord, id, null, input.note),
          targetType: "merchant",
          before: prev ? { licenceNumber: prev.licenceNumber, pharmacistName: prev.pharmacistName, reference: prev.reference, verified: prev.verifiedAt != null } : Prisma.DbNull,
          after: { licenceNumber, pharmacistName, reference, verified: doc.verifiedAt != null },
        },
        select: { id: true },
      });
      return { id, verified: doc.verifiedAt != null, auditId: audit.id };
    });
  }

  /** Mark the recorded licence verified (ops saw it and it matches). */
  async verifyLicence(actor: string, id: string, input: { reason: string; note?: string | null }) {
    return this.prisma.$transaction(async (tx) => {
      const key = { merchantId_kind: { merchantId: id, kind: "pharmacy_licence" as const } };
      const doc = await tx.merchantDocument.findUnique({ where: key });
      if (!doc) throw new NotFoundException({ reason: "no_licence", message: "Record the licence first." });
      if (!doc.licenceNumber?.trim() || !doc.pharmacistName?.trim()) {
        throw new ConflictException({ reason: "licence_incomplete", message: "The licence needs a number and a pharmacist's name." });
      }
      if (doc.verifiedAt) return { id, verified: true, auditId: null };
      const claimed = await tx.merchantDocument.updateMany({ where: { id: doc.id, verifiedAt: null, updatedAt: doc.updatedAt }, data: { verifiedAt: new Date(), verifiedBy: actor } });
      if (claimed.count === 0) throw new ConflictException({ reason: "changed", message: "The licence changed — refresh and try again." });
      const audit = await tx.auditLog.create({
        data: {
          ...auditData(actor, MERCHANT_APPLICATION_AUDIT.licenceVerify, id, input.reason, input.note),
          targetType: "merchant",
          before: { verified: false },
          after: { verified: true, licenceNumber: doc.licenceNumber },
        },
        select: { id: true },
      });
      await domainEvents.merchantApplication(tx, id, "docs_ok", { actorId: actor, data: { kind: "pharmacy_licence" } });
      return { id, verified: true, auditId: audit.id };
    });
  }

  /* ── Metrics ────────────────────────────────────────────────────────────────────────────────── */

  /**
   * `GET /admin/merchants/:id/metrics`: the last 30 days, or since recording began (admin console v2 §3) when
   * that is later — then `short` is true and the page says "since <date>". Every value is null when there is
   * no data for it, and the page shows "—".
   */
  async getMetrics(id: string, now = new Date()) {
    const m = await this.prisma.merchant.findUnique({
      where: { id },
      select: { id: true, createdAt: true, hours: true, foodRatingAvg: true, foodRatingCount: true },
    });
    if (!m) throw new NotFoundException("Merchant not found");
    const windowStart = new Date(now.getTime() - METRICS_WINDOW_DAYS * DAY_MS);
    // When recording began: the first venue event of any merchant (both lookups ride the (type, created_at) index).
    const [firstPhase, firstAvailability] = await Promise.all([
      this.prisma.domainEvent.findFirst({ where: { type: "merchant.phase" }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
      this.prisma.domainEvent.findFirst({ where: { type: "merchant.availability" }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    ]);
    const recordingStart = [firstPhase?.createdAt, firstAvailability?.createdAt].filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime())[0] ?? now;
    const since = new Date(Math.max(windowStart.getTime(), recordingStart.getTime(), m.createdAt.getTime()));

    const [orders, availability, openDebt] = await Promise.all([
      this.prisma.order.findMany({
        where: { merchantId: id, orderType: "merchant", createdAt: { gte: since } },
        take: 2000,
        select: {
          createdAt: true,
          merchantAcceptedAt: true,
          status: true,
          cancelStage: true,
          cancelledByRole: true,
          prepMinutes: true,
          prepStartedAt: true,
          readyAt: true,
          merchantItems: { select: { available: true } },
        },
      }),
      this.prisma.domainEvent.findMany({
        where: { type: "merchant.availability", subjectId: id, createdAt: { gte: new Date(since.getTime() - 2 * DAY_MS), lte: now } },
        orderBy: { createdAt: "asc" },
        take: 1000,
        select: { data: true, createdAt: true },
      }),
      this.prisma.order.aggregate({ where: { merchantId: id, debtStatus: "open", merchantClosedAt: null }, _sum: { debtAmount: true }, _count: { _all: true } }),
    ]);

    const acceptSecs = orders.filter((o) => o.merchantAcceptedAt).map((o) => (o.merchantAcceptedAt!.getTime() - o.createdAt.getTime()) / 1000);
    const missed = orders.filter(
      (o) => o.status === "cancelled" && o.cancelStage === "awaiting_accept" && (o.cancelledByRole === "merchant" || o.cancelledByRole === "system"),
    ).length;
    const prepped = orders.filter((o) => o.prepStartedAt && o.readyAt && o.prepMinutes != null);
    const lines = orders.flatMap((o) => o.merchantItems);
    const outLines = lines.filter((l) => l.available === false).length;
    const hours = this.hoursOpenVsScheduled((m.hours as MerchantHours | null) ?? null, availability, since, now);

    return {
      since: since.toISOString(),
      short: since.getTime() > windowStart.getTime() + 60_000,
      windowDays: METRICS_WINDOW_DAYS,
      orders: orders.length,
      acceptMedianSeconds: median(acceptSecs),
      acceptSample: acceptSecs.length,
      missedPct: orders.length ? (missed / orders.length) * 100 : null,
      missed,
      prepMedianMinutes: median(prepped.map((o) => (o.readyAt!.getTime() - o.prepStartedAt!.getTime()) / 60000)),
      promisedMedianMinutes: median(prepped.map((o) => o.prepMinutes!)),
      prepSample: prepped.length,
      outOfStockPct: lines.length ? (outLines / lines.length) * 100 : null,
      outOfStockLines: outLines,
      lines: lines.length,
      hoursOpen: hours?.open ?? null,
      hoursScheduled: hours?.scheduled ?? null,
      rating: m.foodRatingCount > 0 ? { avg: m.foodRatingAvg, count: m.foodRatingCount } : null,
      openDebtAmount: openDebt._sum.debtAmount?.toString() ?? "0.00",
      openDebtCount: openDebt._count._all,
    };
  }

  /**
   * Hours the business was open by hand vs the hours it said it would be, from `merchant.availability`
   * close/open events, in 15-minute steps (Harare wall clock). Null when it has no hours set.
   */
  hoursOpenVsScheduled(hours: MerchantHours | null, events: { data: unknown; createdAt: Date }[], since: Date, now: Date): { open: number; scheduled: number } | null {
    if (!hours || Object.keys(hours).length === 0) return null;
    // Closed-by-hand intervals: a close holds until its closedUntil or the next open, whichever is first.
    const closed: [number, number][] = [];
    for (let i = 0; i < events.length; i++) {
      const d = (events[i]!.data ?? {}) as { change?: string; closedUntil?: string | null };
      if (d.change !== "close") continue;
      const start = events[i]!.createdAt.getTime();
      let end = d.closedUntil ? Date.parse(d.closedUntil) : now.getTime();
      const reopen = events.slice(i + 1).find((e) => ((e.data ?? {}) as { change?: string }).change === "open");
      if (reopen) end = Math.min(end, reopen.createdAt.getTime());
      if (Number.isFinite(end) && end > start) closed.push([start, end]);
    }
    let scheduled = 0;
    let open = 0;
    for (let t = since.getTime(); t + SLOT_MS <= now.getTime(); t += SLOT_MS) {
      if (!isMerchantOpenNow(hours, harareWallClock(new Date(t)))) continue;
      scheduled++;
      if (!closed.some(([a, b]) => t >= a && t < b)) open++;
    }
    return { open: (open * SLOT_MS) / 3_600_000, scheduled: (scheduled * SLOT_MS) / 3_600_000 };
  }
}

export type { ApplicationAction, ApplicationStatus };
