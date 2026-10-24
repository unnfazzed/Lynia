import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import type { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { RESERVED_AUDIT_ACTIONS } from "./admin-audit.service";
import { AdminMerchantApplicationService, MERCHANT_APPLICATION_AUDIT } from "./admin-merchant-application.service";

const dec = (s: string) => ({ toString: () => s });
const PIN = { point: { lat: -17.83, lng: 31.05 }, landmark: "Next to the rank", contactPhone: "+263771234567" };
const HOURS = { mon: { open: "08:00", close: "20:00" } };

interface Doc {
  id: string;
  merchantId: string;
  kind: string;
  licenceNumber: string | null;
  pharmacistName: string | null;
  reference: string | null;
  recordedBy: string;
  verifiedAt: Date | null;
  verifiedBy: string | null;
  updatedAt: Date;
}

/**
 * A stateful fake of the slice of Prisma the service uses. `$transaction(cb)` runs on the same fake; the
 * merchant row, the licence, audit rows and events are recorded so each test reads what was written.
 */
function harness(
  merchantOver: Record<string, unknown> = {},
  opts: {
    liveDishes?: number;
    called?: boolean;
    calledAt?: Date;
    rejectedAt?: Date;
    termsAccepted?: boolean;
    doc?: Partial<Doc> | null;
    openOrders?: number;
    scheduledOrders?: number;
    pharmacyOff?: boolean;
  } = {},
) {
  const merchant: Record<string, unknown> | null = {
    id: "m1",
    name: "Sadza Republic",
    businessType: "restaurant",
    shopKind: null,
    location: PIN,
    hours: HOURS,
    pilotEnabled: false,
    applicationStatus: "reviewing",
    applicationStatusAt: null,
    applicationReasonCode: null,
    approvedAt: null,
    approvedBy: null,
    createdAt: new Date("2026-10-10T08:00:00Z"),
    foodRatingAvg: 0,
    foodRatingCount: 0,
    ...merchantOver,
  };
  const liveDishes = opts.liveDishes ?? 3;
  let doc: Doc | null = opts.doc
    ? {
        id: "doc1",
        merchantId: "m1",
        kind: "pharmacy_licence",
        licenceNumber: null,
        pharmacistName: null,
        reference: null,
        recordedBy: "ops",
        verifiedAt: null,
        verifiedBy: null,
        updatedAt: new Date("2026-10-12T08:00:00Z"),
        ...opts.doc,
      }
    : null;
  const audits: Record<string, unknown>[] = [];
  const events: Record<string, unknown>[] = [];
  const dishCountWheres: Record<string, unknown>[] = [];
  const pushes: { profileIds: string[]; title: string; body: string; data?: Record<string, string> }[] = [];
  let casFails = false;
  const prisma: Record<string, unknown> = {
    merchant: {
      findUnique: async () => merchant,
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const differs = (k: string) => k in where && where[k] !== merchant![k];
        if (casFails || differs("applicationStatus") || differs("pilotEnabled") || differs("shopKind")) return { count: 0 };
        Object.assign(merchant!, data);
        return { count: 1 };
      },
    },
    merchantCategory: { groupBy: async () => [{ merchantId: "m1", _count: { _all: 1 } }] },
    merchantDish: {
      count: async (args: { where: Record<string, unknown> }) => (dishCountWheres.push(args.where), liveDishes),
      groupBy: async (args: { by: string[] }) =>
        args.by.includes("isDraft")
          ? [{ merchantId: "m1", isDraft: false, _count: { _all: liveDishes }, _min: { priceUsd: dec("2.00") }, _max: { priceUsd: dec("9.00") } }]
          : [{ merchantId: "m1", _count: { _all: liveDishes } }],
    },
    merchantMember: {
      findMany: async () => [
        { merchantId: "m1", profileId: "owner-1", role: "owner", displayName: "Tendai Moyo", termsAcceptedAt: opts.termsAccepted === false ? null : new Date(), isPharmacist: false, profile: { phoneVerifiedAt: new Date() } },
      ],
    },
    merchantInvite: { groupBy: async () => [] },
    merchantDocument: {
      findMany: async () => (doc ? [doc] : []),
      findUnique: async () => doc,
      upsert: async ({ create, update }: { create: Doc; update: Partial<Doc> }) => {
        doc = doc ? { ...doc, ...update, updatedAt: new Date() } : { ...create, id: "doc1", verifiedAt: null, verifiedBy: null, updatedAt: new Date() } as Doc;
        return doc;
      },
      updateMany: async ({ data }: { data: Partial<Doc> }) => {
        doc = { ...doc!, ...data };
        return { count: 1 };
      },
      create: async ({ data }: { data: Partial<Doc> }) => {
        doc = { id: "doc1", licenceNumber: null, pharmacistName: null, reference: null, verifiedAt: null, verifiedBy: null, updatedAt: new Date(), ...data } as Doc;
        return doc;
      },
    },
    domainEvent: {
      findMany: async () => (opts.called === false ? [] : [{ subjectId: "m1", data: { step: "called", outcome: "reached" }, createdAt: new Date("2026-10-12T09:00:00Z") }]),
      findFirst: async () => null,
      create: async ({ data }: { data: Record<string, unknown> }) => events.push(data),
    },
    auditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        audits.push(data);
        return { id: `audit-${audits.length}` };
      },
      // The ops calls: one that reached the business, unless the test says no call was logged.
      findMany: async ({ where }: { where: { action?: string } }) =>
        where.action === MERCHANT_APPLICATION_AUDIT.call && opts.called !== false
          ? [{ id: "call-1", target: "m1", reasonCode: "reached", note: null, createdAt: opts.calledAt ?? new Date("2026-10-12T09:00:00Z") }]
          : [],
      // Each business's latest rejection.
      groupBy: async () => (opts.rejectedAt ? [{ target: "m1", _max: { createdAt: opts.rejectedAt } }] : []),
    },
    order: { count: async () => opts.openOrders ?? 0 },
    orderSchedule: { count: async () => opts.scheduledOrders ?? 0 },
  };
  prisma.$transaction = async (cb: (tx: unknown) => unknown) => cb(prisma);
  const notifications = {
    notifyProfiles: async (profileIds: string[], msg: { title: string; body: string; data?: Record<string, string> }) => (pushes.push({ profileIds, ...msg }), new Set<string>()),
  };
  const env = { RX_ENABLED: "false", RESTAURANTS_ENABLED: "true", SHOPS_ENABLED: "true", PHARMACY_ENABLED: opts.pharmacyOff ? "false" : "true" };
  const svc = new AdminMerchantApplicationService(prisma as unknown as PrismaService, env as never, notifications as unknown as NotificationsService);
  return {
    svc,
    dishCountWheres,
    pushes,
    prisma,
    merchant: merchant!,
    audits,
    events,
    get doc() {
      return doc;
    },
    failCas() {
      casFails = true;
    },
  };
}

describe("AdminMerchantApplicationService — moving an application (admin console v2 §5)", () => {
  it("every audit action it writes is reserved (the free-text audit path can't forge one)", () => {
    for (const action of Object.values(MERCHANT_APPLICATION_AUDIT)) expect(RESERVED_AUDIT_ACTIONS.has(action)).toBe(true);
  });

  it("start review: applied → reviewing, audited with before/after and a merchant.application event", async () => {
    const h = harness({ applicationStatus: "applied" });
    const res = await h.svc.transition("ops", "m1", "review", { reason: "Called — details look right", note: null });
    expect(res).toMatchObject({ status: "reviewing", pilotEnabled: false });
    expect(h.merchant.applicationStatus).toBe("reviewing");
    expect(h.audits[0]).toMatchObject({
      action: "merchant.application_review",
      target: "m1",
      targetType: "merchant",
      reasonCode: "Called — details look right",
      before: { applicationStatus: "applied", pilotEnabled: false },
      after: { applicationStatus: "reviewing", pilotEnabled: false },
    });
    expect(h.events[0]).toMatchObject({ type: "merchant.application", subjectType: "merchant", subjectId: "m1", actorRole: "admin", data: { step: "reviewing", from: "applied" } });
  });

  it("approve is refused unless every required check passes, naming what fails", async () => {
    const h = harness({}, { called: false, termsAccepted: false });
    await expect(h.svc.transition("ops", "m1", "approve", { reason: "ok" })).rejects.toMatchObject({
      status: 409,
      response: { reason: "checklist_incomplete", message: "Not every check passes yet: Owner, Ops call." },
    });
    expect(h.merchant.applicationStatus).toBe("reviewing");
    expect(h.audits).toHaveLength(0);
  });

  it("approve stamps the first approval and leaves customers unaffected (pilotEnabled stays off)", async () => {
    const h = harness();
    await h.svc.transition("ops@lyniago", "m1", "approve", { reason: "Every check passed" });
    expect(h.merchant).toMatchObject({ applicationStatus: "approved", pilotEnabled: false, approvedBy: "ops@lyniago" });
    expect(h.merchant.approvedAt).toBeInstanceOf(Date);
    expect(h.events[0]).toMatchObject({ data: { step: "approved" } });
  });

  it("reject needs a merchant-readable code and stores it; reopening clears it", async () => {
    const h = harness();
    await expect(h.svc.transition("ops", "m1", "reject", { reason: "they were rude" })).rejects.toMatchObject({ response: { reason: "bad_reject_reason" } });
    await h.svc.transition("ops", "m1", "reject", { reason: "outside_area", note: "Chitungwiza" });
    expect(h.merchant).toMatchObject({ applicationStatus: "rejected", applicationReasonCode: "outside_area" });
    expect(h.audits[0]).toMatchObject({ action: "merchant.application_reject", after: { applicationStatus: "rejected", reasonCode: "outside_area" } });
    expect(h.events[0]).toMatchObject({ data: { step: "rejected", reason: "outside_area" } });
    // No note reaches the event (codes only).
    expect(JSON.stringify(h.events[0])).not.toContain("Chitungwiza");
    await h.svc.transition("ops", "m1", "review", { reason: "They moved into the area" });
    expect(h.merchant).toMatchObject({ applicationStatus: "reviewing", applicationReasonCode: null });
  });

  it("go live only from approved: turns pilotEnabled on in the same update", async () => {
    const early = harness({ applicationStatus: "reviewing" });
    await expect(early.svc.transition("ops", "m1", "go_live", { reason: "x" })).rejects.toMatchObject({ status: 409, response: { reason: "wrong_state" } });
    const h = harness({ applicationStatus: "approved" });
    await h.svc.transition("ops", "m1", "go_live", { reason: "Ops call done" });
    expect(h.merchant).toMatchObject({ applicationStatus: "live", pilotEnabled: true });
    expect(h.audits[0]).toMatchObject({ action: "merchant.go_live", before: { pilotEnabled: false }, after: { pilotEnabled: true, applicationStatus: "live" } });
  });

  it("go live keeps the old checks: a pin and a live dish", async () => {
    const noPin = harness({ applicationStatus: "approved", location: null });
    await expect(noPin.svc.transition("ops", "m1", "go_live", { reason: "x" })).rejects.toMatchObject({ response: { reason: "no_location" } });
    const noDish = harness({ applicationStatus: "approved" }, { liveDishes: 0 });
    await expect(noDish.svc.transition("ops", "m1", "go_live", { reason: "x" })).rejects.toMatchObject({ response: { reason: "no_live_dishes" } });
    expect(noDish.merchant.pilotEnabled).toBe(false);
  });

  it("a pharmacy goes live only with a verified licence (owner decision 5)", async () => {
    const pharmacy = { applicationStatus: "approved", businessType: "shop", shopKind: "pharmacy" };
    const unverified = harness(pharmacy, { doc: { licenceNumber: "PCZ-1", pharmacistName: "R. Dube" } });
    await expect(unverified.svc.transition("ops", "m1", "go_live", { reason: "x" })).rejects.toMatchObject({ response: { reason: "licence_not_verified" } });
    const verified = harness(pharmacy, { doc: { licenceNumber: "PCZ-1", pharmacistName: "R. Dube", verifiedAt: new Date() } });
    await expect(verified.svc.transition("ops", "m1", "go_live", { reason: "x" })).resolves.toMatchObject({ status: "live" });
  });

  it("suspend takes a live business off (pilotEnabled off); resume brings it back", async () => {
    const h = harness({ applicationStatus: "live", pilotEnabled: true });
    await h.svc.transition("ops", "m1", "suspend", { reason: "Quality or safety concern" });
    expect(h.merchant).toMatchObject({ applicationStatus: "suspended", pilotEnabled: false });
    expect(h.audits[0]).toMatchObject({ action: "merchant.suspend", before: { applicationStatus: "live", pilotEnabled: true }, after: { applicationStatus: "suspended", pilotEnabled: false } });
    await h.svc.transition("ops", "m1", "resume", { reason: "Sorted out" });
    expect(h.merchant).toMatchObject({ applicationStatus: "live", pilotEnabled: true });
    expect(h.events.map((e) => (e.data as { step: string }).step)).toEqual(["suspended", "resumed"]);
  });

  it("a grandfathered live pharmacy (no licence) can be suspended and resumed without one", async () => {
    const h = harness({ applicationStatus: "live", pilotEnabled: true, businessType: "shop", shopKind: "pharmacy" });
    await h.svc.transition("ops", "m1", "suspend", { reason: "The owner asked to pause" });
    await expect(h.svc.transition("ops", "m1", "resume", { reason: "Back" })).resolves.toMatchObject({ status: "live", pilotEnabled: true });
  });

  it("a business switched off by an older revision reads as suspended and can be resumed", async () => {
    const h = harness({ applicationStatus: "live", pilotEnabled: false });
    await h.svc.transition("ops", "m1", "resume", { reason: "Back" });
    expect(h.merchant).toMatchObject({ applicationStatus: "live", pilotEnabled: true });
  });

  it("a concurrent change is a clean 409, with nothing written", async () => {
    const h = harness();
    h.failCas();
    await expect(h.svc.transition("ops", "m1", "reject", { reason: "duplicate" })).rejects.toMatchObject({ status: 409, response: { reason: "changed" } });
    expect(h.audits).toHaveLength(0);
    expect(h.events).toHaveLength(0);
  });

  it("404s an unknown merchant", async () => {
    const h = harness();
    (h.prisma.merchant as { findUnique: () => Promise<null> }).findUnique = async () => null;
    await expect(h.svc.transition("ops", "nope", "review", { reason: "x" })).rejects.toThrow(/not found/i);
  });
});

describe("AdminMerchantApplicationService — calls and the pharmacy licence", () => {
  it("log call: an audit row with the note, and a `called` event with the outcome only", async () => {
    const h = harness();
    const res = await h.svc.logCall("ops", "m1", { outcome: "reached", note: "Spoke to Tendai, pin is right" });
    expect(res).toEqual({ id: "m1", auditId: "audit-1" });
    expect(h.audits[0]).toMatchObject({ action: "merchant.application_call", reasonCode: "reached", note: "Spoke to Tendai, pin is right", targetType: "merchant" });
    expect(h.events[0]).toMatchObject({ type: "merchant.application", data: { step: "called", outcome: "reached" } });
    expect(JSON.stringify(h.events[0])).not.toContain("Tendai");
  });

  it("only a pharmacy has a licence to record", async () => {
    const h = harness();
    await expect(h.svc.recordLicence("ops", "m1", { licenceNumber: "X", pharmacistName: "Y" })).rejects.toMatchObject({ response: { reason: "not_a_pharmacy" } });
  });

  it("record → verify; changing the number afterwards clears the verification", async () => {
    const h = harness({ businessType: "shop", shopKind: "pharmacy" });
    await expect(h.svc.verifyLicence("ops", "m1", { reason: "Seen" })).rejects.toMatchObject({ response: { reason: "no_licence" } });
    await h.svc.recordLicence("ops", "m1", { licenceNumber: " PCZ-123 ", pharmacistName: "R. Dube", reference: "WhatsApp photo, 13 Oct" });
    expect(h.doc).toMatchObject({ licenceNumber: "PCZ-123", pharmacistName: "R. Dube", reference: "WhatsApp photo, 13 Oct", verifiedAt: null });
    expect(h.audits[0]).toMatchObject({ action: "merchant.licence_record", after: { licenceNumber: "PCZ-123", verified: false } });
    await h.svc.verifyLicence("ops2", "m1", { reason: "Licence seen and matches" });
    expect(h.doc).toMatchObject({ verifiedBy: "ops2" });
    expect(h.doc?.verifiedAt).toBeInstanceOf(Date);
    expect(h.events.at(-1)).toMatchObject({ data: { step: "docs_ok", kind: "pharmacy_licence" } });
    // Same number + pharmacist: still verified.
    await h.svc.recordLicence("ops", "m1", { licenceNumber: "PCZ-123", pharmacistName: "R. Dube", reference: "Photo in Drive" });
    expect(h.doc?.verifiedAt).toBeInstanceOf(Date);
    // A different number: verification cleared.
    await h.svc.recordLicence("ops", "m1", { licenceNumber: "PCZ-999", pharmacistName: "R. Dube" });
    expect(h.doc).toMatchObject({ verifiedAt: null, verifiedBy: null });
  });
});

describe("AdminMerchantApplicationService — the application read", () => {
  it("returns the checklist, score, open actions and licence for a pharmacy in review", async () => {
    const h = harness({ businessType: "shop", shopKind: "pharmacy" }, { doc: { licenceNumber: "PCZ-1", pharmacistName: "R. Dube" } });
    const now = new Date("2026-10-12T09:00:00Z"); // 49h after sign-up
    const app = await h.svc.getApplication("m1", now);
    expect(app).toMatchObject({ status: "reviewing", isPharmacy: true, sla: "red", canApprove: false, score: { passed: 5, total: 6 } });
    expect(app.actions).toEqual(["reject"]);
    expect(app.licence).toMatchObject({ licenceNumber: "PCZ-1", verifiedAt: null });
    expect(app.checklist.find((r) => r.key === "licence")).toMatchObject({ ok: false, detail: "No. PCZ-1 · R. Dube · not verified" });
  });

  it("offers approve once everything passes, and no SLA once it is out of the waiting states", async () => {
    const ready = await harness().svc.getApplication("m1");
    expect(ready.actions).toEqual(["approve", "reject"]);
    const live = await harness({ applicationStatus: "live", pilotEnabled: true }).svc.getApplication("m1");
    expect(live).toMatchObject({ status: "live", sla: null, actions: ["suspend"] });
  });

  it("queue rows carry age, SLA and the checklist score", async () => {
    const h = harness({ applicationStatus: "applied" });
    const rows = await h.svc.queueRows([h.merchant as never], new Date("2026-10-11T10:00:00Z"));
    expect(rows.get("m1")).toMatchObject({ applicationStatus: "applied", sla: "amber", score: { passed: 5, total: 5 } });
  });
});

describe("AdminMerchantApplicationService — metrics", () => {
  const now = new Date("2026-10-13T12:00:00Z");

  function metricsHarness(orders: Record<string, unknown>[], firstEventAt: Date | null, availability: { data: unknown; createdAt: Date }[] = []) {
    const h = harness({ createdAt: new Date("2026-08-01T00:00:00Z"), foodRatingAvg: 4.5, foodRatingCount: 12 });
    h.prisma.order = {
      findMany: async () => orders,
      aggregate: async () => ({ _sum: { debtAmount: dec("6.00") }, _count: { _all: 2 } }),
    };
    h.prisma.domainEvent = {
      findFirst: async () => (firstEventAt ? { createdAt: firstEventAt } : null),
      findMany: async () => availability,
    };
    return h;
  }

  it("computes accept time, missed %, prep vs promised and out-of-stock from the orders", async () => {
    const t = (min: number) => new Date(now.getTime() - 60 * 60 * 1000 + min * 60 * 1000);
    const orders = [
      { createdAt: t(0), merchantAcceptedAt: t(1), status: "completed", cancelStage: null, cancelledByRole: null, prepMinutes: 15, prepStartedAt: t(1), readyAt: t(13), merchantItems: [{ available: true }, { available: false }] },
      { createdAt: t(0), merchantAcceptedAt: t(3), status: "completed", cancelStage: null, cancelledByRole: null, prepMinutes: 20, prepStartedAt: t(3), readyAt: t(25), merchantItems: [{ available: null }] },
      { createdAt: t(0), merchantAcceptedAt: null, status: "cancelled", cancelStage: "awaiting_accept", cancelledByRole: "system", prepMinutes: null, prepStartedAt: null, readyAt: null, merchantItems: [{ available: null }] },
      { createdAt: t(0), merchantAcceptedAt: null, status: "cancelled", cancelStage: "requested", cancelledByRole: "customer", prepMinutes: null, prepStartedAt: null, readyAt: null, merchantItems: [] },
    ];
    const m = await metricsHarness(orders, new Date("2026-10-13T00:00:00Z")).svc.getMetrics("m1", now);
    expect(m).toMatchObject({
      orders: 4,
      acceptMedianSeconds: 120,
      acceptSample: 2,
      missed: 1,
      missedPct: 25,
      prepMedianMinutes: 17,
      promisedMedianMinutes: 17.5,
      prepSample: 2,
      outOfStockLines: 1,
      lines: 4,
      outOfStockPct: 25,
      rating: { avg: 4.5, count: 12 },
      openDebtAmount: "6.00",
      openDebtCount: 2,
    });
    // Recording began today, so the window is short: the page says "since <date>".
    expect(m.short).toBe(true);
    expect(m.since).toBe("2026-10-13T00:00:00.000Z");
  });

  it("shows nothing (null) where there is no data, and the full 30 days once history is long", async () => {
    const m = await metricsHarness([], new Date("2026-01-01T00:00:00Z")).svc.getMetrics("m1", now);
    expect(m).toMatchObject({ orders: 0, acceptMedianSeconds: null, missedPct: null, prepMedianMinutes: null, outOfStockPct: null, short: false });
  });

  it("hours open vs scheduled: a close-by-hand takes its hours off until the next open", () => {
    const svc = harness().svc;
    // Tue 13 Oct 2026, hours 08:00–20:00 Harare (06:00–18:00 UTC). Window 06:00–12:00 UTC = 6h scheduled.
    const hours = { tue: { open: "08:00", close: "20:00" } };
    const since = new Date("2026-10-13T06:00:00Z");
    const events = [
      { data: { change: "close", closedUntil: "2026-10-13T22:00:00.000Z" }, createdAt: new Date("2026-10-13T08:00:00Z") },
      { data: { change: "open", closedUntil: null }, createdAt: new Date("2026-10-13T09:30:00Z") },
    ];
    expect(svc.hoursOpenVsScheduled(hours, events, since, now)).toEqual({ open: 4.5, scheduled: 6 });
    expect(svc.hoursOpenVsScheduled(null, events, since, now)).toBeNull();
  });
});

describe("AdminMerchantApplicationService — review fixes (2026-10-24)", () => {
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it("go live counts only what customers can see: a photo, a visible category, no unlisted prescription item", async () => {
    const h = harness({ applicationStatus: "approved" });
    await h.svc.transition("ops", "m1", "go_live", { reason: "Ops call done" });
    expect(h.dishCountWheres[0]).toMatchObject({ merchantId: "m1", isDraft: false, category: { hidden: false }, AND: [{ rxRequired: false }] });
  });

  it("resume refuses a pharmacy whose recorded licence isn't verified; one with no licence (grandfathered) still resumes", async () => {
    const pharmacy = { applicationStatus: "suspended", businessType: "shop", shopKind: "pharmacy" };
    const changed = harness(pharmacy, { doc: { licenceNumber: "PCZ-9", pharmacistName: "R. Dube", verifiedAt: null } });
    await expect(changed.svc.transition("ops", "m1", "resume", { reason: "Back" })).rejects.toMatchObject({ status: 409, response: { reason: "licence_not_verified" } });
    expect(changed.merchant.pilotEnabled).toBe(false);
    await expect(harness(pharmacy).svc.transition("ops", "m1", "resume", { reason: "Back" })).resolves.toMatchObject({ status: "live" });
  });

  it("reopening a rejection restarts the SLA clock (applicationQueuedAt)", async () => {
    const h = harness({ applicationStatus: "rejected", createdAt: new Date("2026-09-01T00:00:00Z") });
    await h.svc.transition("ops", "m1", "review", { reason: "Reopening after they fixed it" });
    expect(h.merchant.applicationQueuedAt).toBeInstanceOf(Date);
    const at = h.merchant.applicationQueuedAt as Date;
    const rows = await h.svc.queueRows([h.merchant as never], new Date(at.getTime() + 60 * 60 * 1000));
    expect(rows.get("m1")).toMatchObject({ applicationStatus: "reviewing", sla: "ok", waitingSince: at.toISOString() });
  });

  it("approved waits on Go live: its SLA runs from the approval", async () => {
    const approvedAt = new Date("2026-10-12T09:00:00Z");
    const h = harness({ applicationStatus: "approved", applicationStatusAt: approvedAt });
    const rows = await h.svc.queueRows([h.merchant as never], new Date("2026-10-13T10:00:00Z"));
    expect(rows.get("m1")).toMatchObject({ applicationStatus: "approved", sla: "amber", waitingSince: approvedAt.toISOString() });
  });

  it("a call made before the last rejection doesn't tick the Ops call check after a reopen", async () => {
    const h = harness({}, { calledAt: new Date("2026-10-11T09:00:00Z"), rejectedAt: new Date("2026-10-11T10:00:00Z") });
    const app = await h.svc.getApplication("m1");
    expect(app.checklist.find((r) => r.key === "call")).toMatchObject({ ok: false });
    const after = harness({}, { calledAt: new Date("2026-10-11T11:00:00Z"), rejectedAt: new Date("2026-10-11T10:00:00Z") });
    expect((await after.svc.getApplication("m1")).checklist.find((r) => r.key === "call")).toMatchObject({ ok: true });
  });

  it("tells the owner after the commit: a reject carries the reason in the business's words; review tells nobody", async () => {
    const h = harness();
    await h.svc.transition("ops", "m1", "reject", { reason: "menu_incomplete" });
    await flush();
    expect(h.pushes).toEqual([
      {
        profileIds: ["owner-1"],
        title: "Sadza Republic wasn't approved",
        body: "Add photos and prices to your menu first.",
        data: { kind: "merchant_application", merchantId: "m1", step: "rejected" },
      },
    ]);
    const r = harness({ applicationStatus: "applied" });
    await r.svc.transition("ops", "m1", "review", { reason: "Called — starting the checks" });
    await flush();
    expect(r.pushes).toEqual([]);
  });

  it("a refused move tells nobody", async () => {
    const h = harness();
    h.failCas();
    await expect(h.svc.transition("ops", "m1", "reject", { reason: "duplicate" })).rejects.toMatchObject({ status: 409 });
    await flush();
    expect(h.pushes).toEqual([]);
  });

  it("the application read carries the customer section and what a suspension leaves running", async () => {
    const h = harness({ applicationStatus: "live", pilotEnabled: true, businessType: "shop", shopKind: "pharmacy" }, { pharmacyOff: true, openOrders: 5, scheduledOrders: 2 });
    const app = await h.svc.getApplication("m1");
    expect(app.section).toEqual({ name: "Pharmacy", enabled: false });
    expect(app.orders).toEqual({ open: 3, scheduled: 2 });
  });

  it("two licence saves at once: the losing upsert is a 409, not a 500", async () => {
    const h = harness({ businessType: "shop", shopKind: "pharmacy" });
    (h.prisma.merchantDocument as { upsert: unknown }).upsert = async () => {
      throw new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "x" });
    };
    await expect(h.svc.recordLicence("ops", "m1", { licenceNumber: "PCZ-1", pharmacistName: "R. Dube" })).rejects.toMatchObject({ status: 409, response: { reason: "changed" } });
  });

  it("the audit's before keeps the stored status when an older revision left it apart from the effective one", async () => {
    const h = harness({ applicationStatus: "live", pilotEnabled: false });
    await h.svc.transition("ops", "m1", "resume", { reason: "Back" });
    expect(h.audits[0]).toMatchObject({ before: { applicationStatus: "suspended", storedStatus: "live" } });
  });

  it("a shop can be corrected to a pharmacy: an empty licence row is added, so Go live and Resume wait on a verified one", async () => {
    const h = harness({ applicationStatus: "suspended", businessType: "shop", shopKind: "other" });
    await expect(h.svc.setShopKind("ops", "m1", { kind: "pharmacy", note: "Saw the dispensary" })).resolves.toMatchObject({ shopKind: "pharmacy", auditId: "audit-1" });
    expect(h.merchant.shopKind).toBe("pharmacy");
    expect(h.doc).toMatchObject({ kind: "pharmacy_licence", licenceNumber: null, verifiedAt: null });
    expect(h.audits[0]).toMatchObject({ action: "merchant.shop_kind", before: { shopKind: "other" }, after: { shopKind: "pharmacy" } });
    await expect(h.svc.transition("ops", "m1", "resume", { reason: "Back" })).rejects.toMatchObject({ response: { reason: "licence_not_verified" } });
  });

  it("a live shop can't become a pharmacy, a restaurant has no kind, and the same kind writes nothing", async () => {
    await expect(harness({ applicationStatus: "live", pilotEnabled: true, businessType: "shop", shopKind: "grocery" }).svc.setShopKind("ops", "m1", { kind: "pharmacy" })).rejects.toMatchObject({
      response: { reason: "pharmacy_while_live" },
    });
    await expect(harness().svc.setShopKind("ops", "m1", { kind: "grocery" })).rejects.toMatchObject({ response: { reason: "not_a_shop" } });
    const same = harness({ businessType: "shop", shopKind: "grocery" });
    await expect(same.svc.setShopKind("ops", "m1", { kind: "grocery" })).resolves.toMatchObject({ auditId: null });
    expect(same.audits).toHaveLength(0);
  });
});
