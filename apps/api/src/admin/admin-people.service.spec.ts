import { afterEach, describe, expect, it, vi } from "vitest";
import type { NotificationsService } from "../notifications/notifications.service";
import type { PrismaService } from "../prisma/prisma.service";
import { AdminPeopleService, LIST_LIMIT, NUDGE_AUDIT_ACTION } from "./admin-people.service";

/** Admin console v2 §4: the funnels, the stuck lists and Nudge. */

const NOW = new Date("2026-10-13T10:00:00Z"); // 12:00 in Harare
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const B1 = "11111111-1111-4111-8111-111111111111";
const B2 = "22222222-2222-4222-8222-222222222222";
const C1 = "33333333-3333-4333-8333-333333333333";
const ADMIN = "99999999-9999-4999-8999-999999999999";
const person = (first: string, phone = "+263771234567") => ({ firstName: first, lastName: "Moyo", phone });

type AnyFn = (...args: never[]) => unknown;
/** A Prisma double: every delegate method defaults to an empty result; pass overrides per delegate. */
function prismaWith(over: Record<string, Record<string, AnyFn>> = {}) {
  const empty = async () => [];
  const base: Record<string, Record<string, AnyFn>> = {
    profile: { findMany: empty, findUnique: async () => null },
    rider: { findMany: empty },
    merchant: { findMany: empty, count: async () => 0 },
    merchantDish: { groupBy: empty },
    order: { findMany: empty, groupBy: empty },
    rating: { groupBy: empty },
    domainEvent: { findMany: empty, create: vi.fn(async () => ({})) },
    auditLog: { findMany: empty, findFirst: async () => null, create: vi.fn(async () => ({ createdAt: NOW })) },
    commissionLedger: { findMany: empty, groupBy: empty },
    deviceToken: { groupBy: empty, count: async () => 1 },
  };
  const db: Record<string, unknown> = {};
  for (const k of new Set([...Object.keys(base), ...Object.keys(over)])) db[k] = { ...base[k], ...over[k] };
  db.$executeRaw = vi.fn(async () => 0);
  db.$transaction = vi.fn(async (fn: (tx: unknown) => unknown) => fn(db));
  return db as unknown as PrismaService & Record<string, Record<string, ReturnType<typeof vi.fn>>>;
}

function notificationsStub(delivered = true) {
  return { notifyProfiles: vi.fn(async (ids: string[]) => new Set(delivered ? ids : [])) } as unknown as NotificationsService & {
    notifyProfiles: ReturnType<typeof vi.fn>;
  };
}

afterEach(() => {
  delete process.env.COMMISSION_RATE_PCT;
});

describe("AdminPeopleService.funnel — biker", () => {
  it("rebuilds each step from rider state, audit rows, orders, the ledger and PR 2's events", async () => {
    const rider = (over: Record<string, unknown>) => ({
      createdAt: ago(5 * DAY),
      kycStatus: "pending",
      kycRef: null,
      kycAttempts: 0,
      kycResolvedAt: null,
      plateStatus: "none",
      lastHeartbeatAt: null,
      tripsCount: 0,
      ...over,
    });
    const profiles = [
      // Became a biker an hour after signing up, verified 2h later, did 10 jobs, topped up.
      {
        id: B1,
        createdAt: ago(6 * DAY),
        firstName: "Tendai",
        rider: rider({
          createdAt: ago(6 * DAY - HOUR),
          kycStatus: "verified",
          kycRef: "sess-1",
          kycResolvedAt: ago(6 * DAY - 3 * HOUR),
          plateStatus: "verified",
          lastHeartbeatAt: ago(HOUR),
          tripsCount: 10,
        }),
      },
      // Signed up and named, never became a biker.
      { id: B2, createdAt: ago(2 * DAY), firstName: "Rudo", rider: null },
      // Signed up, no name.
      { id: C1, createdAt: ago(DAY), firstName: " ", rider: null },
    ];
    const jobs = Array.from({ length: 10 }, (_, i) => ({ riderId: B1, completedAt: ago(5 * DAY - i * HOUR) }));
    const prisma = prismaWith({
      profile: { findMany: async () => profiles },
      domainEvent: {
        findMany: async () => [
          { subjectId: B1, type: "rider.onboarding_step", data: { step: "first_online" }, createdAt: ago(5 * DAY + 2 * HOUR) },
          { subjectId: B1, type: "rider.onboarding_step", data: { step: "plate_verified" }, createdAt: ago(5 * DAY + 3 * HOUR) },
        ],
      },
      auditLog: { findMany: async () => [{ target: B1, createdAt: ago(6 * DAY - 2 * HOUR) }] },
      order: { findMany: async () => jobs },
      commissionLedger: { groupBy: async () => [{ riderId: B1, _min: { createdAt: ago(4 * DAY) } }] },
    });
    const out = await new AdminPeopleService(prisma, notificationsStub()).funnel("biker", "7d", NOW);
    expect(out).toMatchObject({ kind: "biker", range: "7d", cohort: 3, truncated: false });
    const by = Object.fromEntries(out.steps.map((s) => [s.key, s]));
    expect(by.signed_up.count).toBe(3);
    expect(by.profile.count).toBe(2);
    expect(by.become).toMatchObject({ count: 1, medianMs: HOUR, conversionPct: 50 });
    expect(by.didit_started).toMatchObject({ count: 1, medianMs: HOUR });
    expect(by.verified).toMatchObject({ count: 1, medianMs: HOUR });
    expect(by.job_10).toMatchObject({ count: 1 });
    expect(by.first_topup.count).toBe(1);
    expect(by.active_week.count).toBe(1);
  });

  it("asks only for real people who signed up in the window, newest first, capped", async () => {
    const findMany = vi.fn(async () => []);
    const prisma = prismaWith({ profile: { findMany } });
    const out = await new AdminPeopleService(prisma, notificationsStub()).funnel("biker", "today", NOW);
    const arg = (findMany.mock.calls[0] as unknown as [{ where: Record<string, unknown>; take: number }])[0];
    expect(arg.where).toMatchObject({
      createdAt: { gte: new Date("2026-10-12T22:00:00Z"), lte: NOW },
      role: { in: ["customer", "rider"] },
      NOT: [{ phone: { startsWith: "business:" } }, { phone: { startsWith: "erased:" } }],
    });
    expect(arg.take).toBe(5001);
    expect(out.cohort).toBe(0);
    expect(out.steps.every((s) => s.count === 0)).toBe(true);
  });
});

describe("AdminPeopleService.funnel — customer and merchant", () => {
  it("customer: a second order counts only within 14 days of the first", async () => {
    const prisma = prismaWith({
      profile: { findMany: async () => [{ id: B1, createdAt: ago(20 * DAY) }, { id: B2, createdAt: ago(20 * DAY) }] },
      order: {
        findMany: async () => [
          { customerId: B1, createdAt: ago(19 * DAY), status: "completed", deliveredAt: ago(19 * DAY - HOUR), completedAt: ago(19 * DAY - 2 * HOUR) },
          { customerId: B1, createdAt: ago(10 * DAY), status: "cancelled", deliveredAt: null, completedAt: null },
          { customerId: B2, createdAt: ago(19 * DAY), status: "expired", deliveredAt: null, completedAt: null },
          { customerId: B2, createdAt: ago(1 * DAY), status: "requested", deliveredAt: null, completedAt: null },
        ],
      },
      rating: { groupBy: async () => [{ byProfileId: B1, _min: { createdAt: ago(18 * DAY) } }] },
    });
    const out = await new AdminPeopleService(prisma, notificationsStub()).funnel("customer", "30d", NOW);
    const by = Object.fromEntries(out.steps.map((s) => [s.key, s.count]));
    expect(by).toEqual({ signed_up: 2, first_order: 2, delivered: 1, rated: 1, second_order: 1 });
    expect(out.steps.find((s) => s.key === "delivered")!.medianMs).toBe(HOUR);
  });

  it("merchant: ops called comes only from the application event, and says since when", async () => {
    const M = "44444444-4444-4444-8444-444444444444";
    const prisma = prismaWith({
      merchant: {
        findMany: async () => [
          { id: M, createdAt: ago(5 * DAY), location: { point: {} }, hours: { mon: {} }, applicationStatus: "live", approvedAt: ago(3 * DAY), pilotEnabled: true },
          { id: B2, createdAt: ago(4 * DAY), location: null, hours: null, applicationStatus: "applied", approvedAt: null, pilotEnabled: false },
        ],
      },
      merchantDish: { groupBy: async () => [{ merchantId: M, _min: { createdAt: ago(4 * DAY) } }] },
      domainEvent: { findMany: async () => [{ subjectId: M, data: { step: "called" }, createdAt: ago(3.5 * DAY) }] },
      order: { findMany: async () => [{ merchantId: M, createdAt: ago(2 * DAY), status: "completed", completedAt: ago(2 * DAY - HOUR) }] },
    });
    const out = await new AdminPeopleService(prisma, notificationsStub()).funnel("merchant", "7d", NOW);
    const by = Object.fromEntries(out.steps.map((s) => [s.key, s]));
    expect(by.pin_hours.count).toBe(1);
    expect(by.called).toMatchObject({ count: 1, since: "2026-10-13", medianMs: 12 * HOUR });
    expect(by.approved.count).toBe(1);
    expect(by.live.count).toBe(1);
    expect(by.first_completed.count).toBe(1);
    expect(by.ten_orders.count).toBe(0);
  });
});

describe("AdminPeopleService.stuck — bikers", () => {
  const riderRow = (id: string, over: Record<string, unknown> = {}) => ({
    profileId: id,
    createdAt: ago(3 * DAY),
    updatedAt: ago(2 * DAY),
    kycRef: "sess",
    kycVendorStatus: null,
    kycVendorStatusAt: null,
    kycDeclineReason: null,
    kycResolvedAt: null,
    kycIdExpiresOn: null,
    bikeReg: null,
    profile: person("Tendai"),
    ...over,
  });

  it("Didit unfinished keeps the rider's move (In Progress, Abandoned), not In Review or Not Started", async () => {
    const prisma = prismaWith({
      rider: {
        findMany: async () => [
          riderRow(B1, { kycVendorStatus: "In Progress", kycVendorStatusAt: ago(3 * HOUR) }),
          riderRow(B2, { kycVendorStatus: "In Review", kycVendorStatusAt: ago(3 * HOUR) }),
          riderRow(C1, { kycVendorStatus: "Not Started", kycVendorStatusAt: ago(3 * HOUR) }),
        ],
      },
    });
    const out = await new AdminPeopleService(prisma, notificationsStub()).stuck("biker_didit_unfinished", NOW);
    expect(out.rows.map((r) => r.id)).toEqual([B1]);
    expect(out.rows[0]).toMatchObject({ name: "Tendai Moyo", href: `/riders/${B1}`, phone: "+263771234567", detail: "ID check: In Progress" });
    expect(out.nudge).toBe(true);
  });

  it("never started: no session, or one never opened; oldest first", async () => {
    const prisma = prismaWith({
      rider: {
        findMany: async () => [
          riderRow(B1, { kycRef: null, createdAt: ago(2 * DAY) }),
          riderRow(B2, { kycVendorStatus: "Not Started", createdAt: ago(5 * DAY) }),
          riderRow(C1, { kycVendorStatus: "In Progress" }),
        ],
      },
    });
    const out = await new AdminPeopleService(prisma, notificationsStub()).stuck("biker_no_didit", NOW);
    expect(out.rows.map((r) => r.id)).toEqual([B2, B1]);
    expect(out.rows[1].detail).toBe("No check yet");
  });

  it("declined but fixable leaves out strikes", async () => {
    const prisma = prismaWith({
      rider: {
        findMany: async () => [riderRow(B1, { kycDeclineReason: "id_unreadable", kycResolvedAt: ago(DAY) }), riderRow(B2, { kycDeclineReason: "doc_tampered" })],
      },
    });
    const out = await new AdminPeopleService(prisma, notificationsStub()).stuck("biker_declined_fixable", NOW);
    expect(out.rows.map((r) => r.id)).toEqual([B1]);
  });

  it("plate waiting links to the plate queue and has no nudge", async () => {
    const prisma = prismaWith({ rider: { findMany: async () => [riderRow(B1, { bikeReg: "ABC 1234" })] } });
    const out = await new AdminPeopleService(prisma, notificationsStub()).stuck("biker_plate_waiting", NOW);
    expect(out.nudge).toBe(false);
    expect(out.rows[0]).toMatchObject({ detail: "Plate ABC 1234", link: { href: "/riders?plate=checking" } });
  });

  it("ID expiring: soonest first, with the date", async () => {
    const prisma = prismaWith({
      rider: {
        findMany: async () => [
          riderRow(B1, { kycIdExpiresOn: new Date("2026-11-02T00:00:00Z") }),
          riderRow(B2, { kycIdExpiresOn: new Date("2026-10-20T00:00:00Z") }),
        ],
      },
    });
    const out = await new AdminPeopleService(prisma, notificationsStub()).stuck("biker_id_expiring", NOW);
    expect(out.rows.map((r) => r.detail)).toEqual(["Expires 20 Oct", "Expires 2 Nov"]);
  });

  it("idle: online in 3 days with no order then", async () => {
    const prisma = prismaWith({
      rider: { findMany: async () => [riderRow(B1, { kycResolvedAt: ago(9 * DAY) }), riderRow(B2)] },
      order: {
        groupBy: async (args: { where: { createdAt?: unknown } }) =>
          args.where.createdAt ? [{ riderId: B2, _count: { _all: 1 } }] : [{ riderId: B1, _max: { completedAt: ago(5 * DAY) } }],
      },
    });
    const out = await new AdminPeopleService(prisma, notificationsStub()).stuck("biker_idle", NOW);
    expect(out.rows.map((r) => r.id)).toEqual([B1]);
    expect(out.rows[0].detail).toBe("Last job 2026-10-08");
  });

  it("low balance: with commission at 0% nobody is listed, and the page says why", async () => {
    process.env.COMMISSION_RATE_PCT = "0";
    const out = await new AdminPeopleService(prismaWith(), notificationsStub()).stuck("biker_low_balance", NOW);
    expect(out.rows).toEqual([]);
    expect(out.note).toMatch(/0%/);
  });

  it("low balance: below a typical job's commission, negatives link to Money owed", async () => {
    const riderFind = vi.fn(async () => [
      { profileId: B1, createdAt: ago(9 * DAY), commissionAccount: { balance: -3 }, profile: person("Tendai") },
      { profileId: B2, createdAt: ago(9 * DAY), commissionAccount: null, profile: person("Rudo") },
    ]);
    const prisma = prismaWith({
      rider: { findMany: riderFind },
      commissionLedger: { findMany: async () => [{ amount: -0.4 }, { amount: -0.5 }, { amount: -0.6 }], groupBy: async () => [] },
    });
    const out = await new AdminPeopleService(prisma, notificationsStub()).stuck("biker_low_balance", NOW);
    const where = (riderFind.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0].where;
    expect(where).toMatchObject({ tripsCount: { gte: 10 }, OR: [{ commissionAccount: { balance: { lt: 0.5 } } }, { commissionAccount: null }] });
    expect(out.rows.find((r) => r.id === B1)).toMatchObject({ detail: "Balance −$3.00", link: { href: "/cash/owed" } });
    expect(out.rows.find((r) => r.id === B2)).toMatchObject({ detail: "Balance $0.00", link: null });
    expect(out.note).toContain("$0.50");
  });
});

describe("AdminPeopleService.stuck — customers and merchants", () => {
  it("expired with no biker: only when it is still their last order", async () => {
    const order = (id: string, customerId: string, createdAt: Date) => ({
      id,
      createdAt,
      customerId,
      orderType: "parcel",
      undeliveredReason: null,
      customer: { id: customerId, ...person("Rudo") },
    });
    const prisma = prismaWith({
      order: {
        findMany: async () => [order("o2", B1, ago(DAY)), order("o1", B1, ago(3 * DAY)), order("o3", B2, ago(2 * DAY))],
        groupBy: async () => [
          { customerId: B1, _max: { createdAt: ago(DAY) } },
          { customerId: B2, _max: { createdAt: ago(HOUR) } }, // ordered again since
        ],
      },
    });
    const out = await new AdminPeopleService(prisma, notificationsStub()).stuck("customer_expired", NOW);
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0]).toMatchObject({ id: B1, href: `/customers/${B1}`, detail: "Parcel, no biker took it", link: { href: "/orders/o2" } });
  });

  it("cancelled first order: only customers with exactly one order", async () => {
    const prisma = prismaWith({
      order: {
        findMany: async () => [
          { id: "o1", createdAt: ago(DAY), cancelledAt: ago(DAY), customerId: B1, cancelledByRole: "rider", customer: { id: B1, ...person("A") } },
          { id: "o2", createdAt: ago(DAY), cancelledAt: ago(DAY), customerId: B2, cancelledByRole: "customer", customer: { id: B2, ...person("B") } },
        ],
        groupBy: async () => [
          { customerId: B1, _count: { _all: 1 } },
          { customerId: B2, _count: { _all: 4 } },
        ],
      },
    });
    const out = await new AdminPeopleService(prisma, notificationsStub()).stuck("customer_cancelled_first", NOW);
    expect(out.rows.map((r) => [r.id, r.detail])).toEqual([[B1, "Cancelled by biker"]]);
  });

  it("caps a list at LIST_LIMIT and says so", async () => {
    const many = Array.from({ length: LIST_LIMIT + 1 }, (_, i) => ({ id: `p${i}`, ...person("X"), createdAt: ago(10 * DAY - i * 1000) }));
    const prisma = prismaWith({ profile: { findMany: async () => many } });
    const out = await new AdminPeopleService(prisma, notificationsStub()).stuck("customer_no_order", NOW);
    expect(out.rows).toHaveLength(LIST_LIMIT);
    expect(out).toMatchObject({ capped: true, count: LIST_LIMIT + 1 });
  });

  it("merchant applications link to PR 4's queue instead of repeating it", async () => {
    const prisma = prismaWith({ merchant: { count: async () => 3 } });
    const out = await new AdminPeopleService(prisma, notificationsStub()).stuck("merchant_applications", NOW);
    expect(out).toMatchObject({ rows: [], count: 3, queue: { href: "/merchants?status=waiting", count: 3 } });
  });

  it("live, no order in 7 days: the owner is who a nudge reaches", async () => {
    const M = "44444444-4444-4444-8444-444444444444";
    const prisma = prismaWith({
      merchant: {
        findMany: async () => [
          { id: M, name: "Gava's Kitchen", createdAt: ago(40 * DAY), approvedAt: ago(30 * DAY), applicationStatusAt: null, ownerProfile: { id: B1, ...person("Gava") } },
          { id: B2, name: "Busy", createdAt: ago(40 * DAY), approvedAt: null, applicationStatusAt: null, ownerProfile: null },
        ],
      },
      order: { groupBy: async () => [{ merchantId: M, _max: { createdAt: ago(9 * DAY) } }, { merchantId: B2, _max: { createdAt: ago(DAY) } }] },
    });
    const out = await new AdminPeopleService(prisma, notificationsStub()).stuck("merchant_live_idle", NOW);
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0]).toMatchObject({ id: M, profileId: B1, href: `/merchants/${M}`, detail: "Last order 2026-10-04" });
  });

  it("every row says whether it can be pushed and when this list last nudged them", async () => {
    const prisma = prismaWith({
      profile: { findMany: async () => [{ id: B1, ...person("A"), createdAt: ago(10 * DAY) }, { id: B2, ...person("B"), createdAt: ago(9 * DAY) }] },
      deviceToken: { groupBy: async () => [{ profileId: B1, _count: { _all: 2 } }] },
      auditLog: {
        findMany: async () => [
          { target: B1, after: { step: "customer_no_order" }, createdAt: ago(HOUR) },
          { target: B2, after: { step: "customer_expired" }, createdAt: ago(HOUR) },
          { target: B2, after: { step: "customer_no_order" }, createdAt: ago(2 * DAY) },
        ],
      },
    });
    const out = await new AdminPeopleService(prisma, notificationsStub()).stuck("customer_no_order", NOW);
    expect(out.rows[0]).toMatchObject({ id: B1, hasPush: true, nudgedToday: true, lastNudgeAt: ago(HOUR).toISOString() });
    expect(out.rows[1]).toMatchObject({ id: B2, hasPush: false, nudgedToday: false, lastNudgeAt: ago(2 * DAY).toISOString() });
  });

  it("the summary counts every list of a side without rows", async () => {
    const out = await new AdminPeopleService(prismaWith(), notificationsStub()).stuckSummary("customer", NOW);
    expect(out.lists.map((l) => l.key)).toEqual(["customer_expired", "customer_cancelled_first", "customer_undelivered", "customer_no_order"]);
    expect(out.lists.every((l) => !("rows" in l) && l.count === 0)).toBe(true);
  });
});

describe("AdminPeopleService.nudge", () => {
  const body = { profileId: B1, step: "biker_never_online" as const, reason: "Stuck on this step", note: null };
  const biker = { id: B1, rider: { profileId: B1 }, ownedMerchants: [] };

  it("sends the step's fixed push and writes the audit row and a nudge.sent event first", async () => {
    const prisma = prismaWith({ profile: { findUnique: async () => biker } });
    const notifications = notificationsStub();
    const out = await new AdminPeopleService(prisma, notifications).nudge(ADMIN, body, NOW);
    expect(out).toEqual({ result: "sent", at: NOW.toISOString() });
    expect(prisma.$executeRaw).toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ actor: ADMIN, action: NUDGE_AUDIT_ACTION, target: B1, targetType: "person", reasonCode: "Stuck on this step", after: expect.objectContaining({ step: "biker_never_online" }) }),
      }),
    );
    expect(prisma.domainEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: "nudge.sent", actorId: ADMIN, actorRole: "admin", subjectType: "person", subjectId: B1, data: { step: "biker_never_online", day: "2026-10-13" } }),
    });
    expect(notifications.notifyProfiles).toHaveBeenCalledWith([B1], {
      title: "You're ready to ride",
      body: "Your ID is verified. Go online in the app to get jobs.",
      data: { kind: "account", nudge: "biker_never_online" },
      collapseKey: "nudge:biker_never_online",
    });
  });

  it("no registered device: says so and writes nothing", async () => {
    const prisma = prismaWith({ profile: { findUnique: async () => biker }, deviceToken: { count: async () => 0 } });
    const notifications = notificationsStub();
    const out = await new AdminPeopleService(prisma, notifications).nudge(ADMIN, body, NOW);
    expect(out).toEqual({ result: "no_push" });
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
    expect(notifications.notifyProfiles).not.toHaveBeenCalled();
  });

  it("one per person per list per Harare day: a second is refused without a push", async () => {
    const findFirst = vi.fn(async () => ({ createdAt: ago(HOUR) }));
    const prisma = prismaWith({ profile: { findUnique: async () => biker }, auditLog: { findFirst } });
    const notifications = notificationsStub();
    const out = await new AdminPeopleService(prisma, notifications).nudge(ADMIN, body, NOW);
    expect(out).toEqual({ result: "already_sent", at: ago(HOUR).toISOString() });
    expect((findFirst.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0].where).toMatchObject({
      action: NUDGE_AUDIT_ACTION,
      target: B1,
      createdAt: { gte: new Date("2026-10-12T22:00:00Z") },
      after: { path: ["step"], equals: "biker_never_online" },
    });
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
    expect(notifications.notifyProfiles).not.toHaveBeenCalled();
  });

  it("a push no device accepted is reported (the nudge is still recorded)", async () => {
    const prisma = prismaWith({ profile: { findUnique: async () => biker } });
    const out = await new AdminPeopleService(prisma, notificationsStub(false)).nudge(ADMIN, body, NOW);
    expect(out.result).toBe("not_delivered");
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });

  it("refuses a list with no nudge, a biker list for a non-biker, and an unknown person", async () => {
    const svc = (p: unknown) => new AdminPeopleService(prismaWith({ profile: { findUnique: async () => p } }), notificationsStub());
    await expect(svc(biker).nudge(ADMIN, { ...body, step: "biker_plate_waiting" }, NOW)).rejects.toThrow(/no nudge/);
    await expect(svc({ id: B1, rider: null, ownedMerchants: [] }).nudge(ADMIN, body, NOW)).rejects.toThrow(/isn't a biker/);
    await expect(svc({ id: B1, rider: null, ownedMerchants: [] }).nudge(ADMIN, { ...body, step: "merchant_live_idle" }, NOW)).rejects.toThrow(/doesn't own/);
    await expect(svc(null).nudge(ADMIN, body, NOW)).rejects.toThrow(/not found/);
  });

  it("the balance nudge opens Money and makes no floor claim", async () => {
    const prisma = prismaWith({ profile: { findUnique: async () => biker } });
    const notifications = notificationsStub();
    await new AdminPeopleService(prisma, notifications).nudge(ADMIN, { ...body, step: "biker_low_balance" }, NOW);
    const msg = (notifications.notifyProfiles.mock.calls[0] as unknown as [string[], { body: string; data: Record<string, string> }])[1];
    expect(msg.data.kind).toBe("free_jobs");
    expect(msg.body).not.toMatch(/floor/i);
  });
});
