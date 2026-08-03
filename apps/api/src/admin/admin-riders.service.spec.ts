import { ACTIVE_RIDE_STATUSES } from "@lynia/shared";
import { describe, expect, it } from "vitest";
import type { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { AdminRidersService } from "./admin-riders.service";

/** Suspend/lift/clear-hold fire a best-effort standing-change push; a no-op stub keeps tests off it. */
const noNotifications = { notifyProfiles: async () => {} } as unknown as NotificationsService;
/** KB-BOARD-REVOKE + DS15-05: suspend/ban kick the now-ineligible rider off the board rooms AND evict
 *  them from the `rider:geo` Redis index (both best-effort); a no-op gateway stub keeps these unit tests
 *  off the socket/Redis path. Dedicated tests spy on both. */
const noGateway = {
  kickRiderFromBoard: async () => {},
  evictRiderFromGeo: async () => {},
  evictRiderFromSupply: async () => {},
} as unknown as import("../tracking/tracking.gateway").TrackingGateway;

/** Decimal-like stub — Prisma returns Decimal objects whose `.toString()`/`.toFixed()` we serialize. */
const dec = (s: string) => ({ toString: () => s, toFixed: (_n: number) => s });

describe("AdminRidersService.listRiders", () => {
  const riderRow = (over: Record<string, unknown> = {}) => ({
    profileId: "r1",
    bikeReg: "ABZ 1",
    kycStatus: "pending",
    kycRef: "sess_1",
    idVerified: false,
    isOnline: false,
    accountStatus: "active",
    ratingAvg: 0,
    ratingCount: 0,
    tripsCount: 0,
    cancelStrikes: 0,
    cooldownUntil: null,
    profile: { firstName: "Tendai", lastName: "M", phone: "+263782000001" },
    ...over,
  });

  it("filters by kyc status and MASKS the phone when the rider isn't on a live order (A-03)", async () => {
    let where: unknown;
    const prisma = {
      rider: {
        findMany: async (args: { where: unknown }) => {
          where = args.where;
          return [riderRow()];
        },
      },
      // No order in a reveal-status window ⇒ the phone must be masked.
      order: { findMany: async () => [] },
    };
    const svc = new AdminRidersService(prisma as unknown as PrismaService, noNotifications, noGateway);
    const rows = await svc.listRiders("pending");
    expect(where).toEqual({ kycStatus: "pending" });
    expect(rows[0]).toMatchObject({ profileId: "r1", name: "Tendai M", kycStatus: "pending" });
    // Account standing is surfaced so the directory can flag suspended/banned/held riders (A-04).
    expect(rows[0]!.accountStatus).toBe("active");
    // Masked: country code + last 4 kept, middle bulleted — never the full number.
    expect(rows[0]!.phone).toBe("+263•••••0001");
    expect(rows[0]!.phone).not.toContain("78200");
  });

  it("REVEALS the full phone when the rider is a party on a LIVE order right now", async () => {
    let orderWhere: { status?: { in: string[] } } = {};
    const prisma = {
      rider: { findMany: async () => [riderRow()] },
      // The rider is currently on a live order → reveal the real number for ops to call them.
      order: {
        findMany: async (args: { where: { status?: { in: string[] } } }) => {
          orderWhere = args.where;
          return [{ riderId: "r1" }];
        },
      },
    };
    const svc = new AdminRidersService(prisma as unknown as PrismaService, noNotifications, noGateway);
    const rows = await svc.listRiders();
    expect(rows[0]!.phone).toBe("+263782000001");
    // The reveal set MUST be live-only (ACTIVE_RIDE_STATUSES) — NOT the terminal-inclusive
    // PHONE_REVEAL_STATUSES, which would unmask any rider who ever completed one order forever (A-03).
    expect(orderWhere.status?.in).toEqual(ACTIVE_RIDE_STATUSES);
    for (const terminal of ["completed", "delivered", "undelivered"]) {
      expect(orderWhere.status?.in).not.toContain(terminal);
    }
  });

  it("returns all riders when no filter is given", async () => {
    let where: unknown = "unset";
    const prisma = {
      rider: { findMany: async (args: { where: unknown }) => { where = args.where; return []; } },
      order: { findMany: async () => [] },
    };
    const svc = new AdminRidersService(prisma as unknown as PrismaService, noNotifications, noGateway);
    await svc.listRiders();
    expect(where).toEqual({});
  });
});

describe("AdminRidersService.getRiderDetail (D-2)", () => {
  const riderRow = (over: Record<string, unknown> = {}) => ({
    profileId: "r1",
    bikeReg: "ABZ 1",
    kycStatus: "verified",
    isOnline: true,
    ratingAvg: 4.75,
    ratingCount: 12,
    tripsCount: 30,
    cancelStrikes: 1,
    cooldownUntil: null,
    accountStatus: "active",
    suspendReason: null,
    onHold: false,
    reliabilityScore: 82,
    profile: { firstName: "Tendai", lastName: "M", phone: "+263782000001", createdAt: new Date("2026-01-15T00:00:00Z") },
    ...over,
  });
  const prismaFor = (
    rider: unknown,
    liveCount: number,
    reports: Array<Record<string, unknown>> = [],
    // NEW-2: the CommissionAccount row backing the rider-detail "Commission owed" figure. `undefined` (the
    // default) models the common case — no wallet row yet, i.e. nothing owed.
    account: { balance: unknown } | null = null,
  ) => ({
    rider: { findUnique: async () => rider },
    report: {
      count: async () => reports.length,
      findMany: async () => reports,
    },
    commissionAccount: { findUnique: async () => account },
    order: {
      count: async () => liveCount,
      groupBy: async () => [
        { status: "completed", _count: { _all: 24 } },
        { status: "cancelled", _count: { _all: 6 } },
      ],
      findMany: async () => [
        {
          id: "o9",
          status: "completed",
          proposedFare: dec("4.00"),
          agreedFare: dec("4.50"),
          pickup: { landmark: "CBD" },
          dropoff: { landmark: "Mount Pleasant" },
          createdAt: new Date("2026-06-20T00:00:00Z"),
        },
      ],
    },
  });

  it("returns null when the id isn't a rider", async () => {
    const svc = new AdminRidersService({ rider: { findUnique: async () => null } } as unknown as PrismaService, noNotifications, noGateway);
    expect(await svc.getRiderDetail("nope")).toBeNull();
  });

  it("MASKS the phone off a live order and projects stats + trail (A-03)", async () => {
    const svc = new AdminRidersService(prismaFor(riderRow(), 0) as unknown as PrismaService, noNotifications, noGateway);
    const r = (await svc.getRiderDetail("r1"))!;
    expect(r.phone).toBe("+263•••••0001");
    expect(r.rating).toBe("4.8");
    expect(r.trips).toBe(30);
    expect(r.strikes).toBe(1);
    expect(r.status).toBe("online");
    expect(r.completion).toBe("80%"); // 24 completed / 30 total
    expect(r.trail[0]).toMatchObject({ id: "o9", route: "CBD → Mount Pleasant", fare: "4.50", when: "2026-06-20" });
  });

  it("REVEALS the phone when the rider is on a live order, and reports cooldown", async () => {
    const cooldownUntil = new Date(Date.now() + 90 * 60 * 1000);
    const svc = new AdminRidersService(prismaFor(riderRow({ isOnline: false, cooldownUntil }), 1) as unknown as PrismaService, noNotifications, noGateway);
    const r = (await svc.getRiderDetail("r1"))!;
    expect(r.phone).toBe("+263782000001");
    expect(r.status).toBe("cooldown");
    expect(r.cooldown).toMatch(/h .*m|m$/);
    expect(r.activeOrders).toBe(1);
  });

  it("activeOrders surfaces the live-order count so ops sees a live delivery under a suspended/banned rider", async () => {
    const svc = new AdminRidersService(prismaFor(riderRow(), 0) as unknown as PrismaService, noNotifications, noGateway);
    const r = (await svc.getRiderDetail("r1"))!;
    expect(r.activeOrders).toBe(0);
  });

  it("reports the A-04 account state over the activity derivation, with the stored reason", async () => {
    // A suspended rider who happens to be flagged online in the stale row: account state wins.
    const suspended = riderRow({ accountStatus: "suspended", suspendReason: "safety report", isOnline: true });
    const svc = new AdminRidersService(prismaFor(suspended, 0) as unknown as PrismaService, noNotifications, noGateway);
    const r = (await svc.getRiderDetail("r1"))!;
    expect(r.status).toBe("suspended");
    expect(r.suspendReason).toBe("safety report");

    const banned = riderRow({ accountStatus: "banned", suspendReason: "fraud", isOnline: false });
    const svc2 = new AdminRidersService(prismaFor(banned, 0) as unknown as PrismaService, noNotifications, noGateway);
    const r2 = (await svc2.getRiderDetail("r1"))!;
    expect(r2.status).toBe("banned");
    expect(r2.suspendReason).toBe("fraud");
  });

  it("NEW-2: commission owed reads the REAL CommissionAccount balance, not a hardcoded 0.00", async () => {
    // A negative balance (ride debits pushed it below zero) is what "owed" means — shown as its magnitude.
    const svc = new AdminRidersService(
      prismaFor(riderRow(), 0, [], { balance: dec("-3.25") }) as unknown as PrismaService,
      noNotifications,
      noGateway,
    );
    const r = (await svc.getRiderDetail("r1"))!;
    expect(r.commission).toBe("3.25");
  });

  it("NEW-2: a credit (positive/zero balance) or no account row yet is never shown as owed", async () => {
    const svcNoRow = new AdminRidersService(prismaFor(riderRow(), 0) as unknown as PrismaService, noNotifications, noGateway);
    expect((await svcNoRow.getRiderDetail("r1"))!.commission).toBe("0.00");

    const svcCredit = new AdminRidersService(
      prismaFor(riderRow(), 0, [], { balance: dec("5.00") }) as unknown as PrismaService,
      noNotifications,
      noGateway,
    );
    expect((await svcCredit.getRiderDetail("r1"))!.commission).toBe("0.00");
  });

  it("reports on_hold for an active rider the reliability engine has locked out, with the score", async () => {
    // Distinct from suspended/banned (an admin action) — accountStatus stays "active" while onHold=true.
    const held = riderRow({ onHold: true, reliabilityScore: 42, isOnline: true });
    const svc = new AdminRidersService(prismaFor(held, 0) as unknown as PrismaService, noNotifications, noGateway);
    const r = (await svc.getRiderDetail("r1"))!;
    expect(r.status).toBe("on_hold");
    expect(r.reliabilityScore).toBe(42);
  });

  it("omits reliabilityScore when the rider isn't on_hold", async () => {
    const svc = new AdminRidersService(prismaFor(riderRow(), 0) as unknown as PrismaService, noNotifications, noGateway);
    const r = (await svc.getRiderDetail("r1"))!;
    expect(r.reliabilityScore).toBeUndefined();
  });

  it("counts the rider's Report rows and lists the recent ones (repeat-offender signal)", async () => {
    const reports = [
      { id: "rep1", reason: "unsafe", note: "cut me off", createdAt: new Date("2026-06-25T00:00:00Z") },
      { id: "rep2", reason: "rude", note: null, createdAt: new Date("2026-06-24T00:00:00Z") },
    ];
    const svc = new AdminRidersService(prismaFor(riderRow(), 0, reports) as unknown as PrismaService, noNotifications, noGateway);
    const r = (await svc.getRiderDetail("r1"))! as unknown as {
      reports: number;
      reportLog: Array<{ date: string; text: string; issueId?: string }>;
    };
    expect(r.reports).toBe(2);
    // Reason label + free-text note when present; label only otherwise.
    expect(r.reportLog[0]).toEqual({ date: "2026-06-25", text: "Unsafe behaviour — cut me off", issueId: "rep1" });
    expect(r.reportLog[1]).toEqual({ date: "2026-06-24", text: "Rude or hostile", issueId: "rep2" });
  });
});

describe("AdminRidersService mutations (Item 1 — mutation + audit in ONE $transaction, A-01)", () => {
  interface Calls {
    riderUpdate: { where: unknown; data: Record<string, unknown> } | null;
    audit: { data: Record<string, unknown> } | null;
    sessionRevoke: { where: Record<string, unknown>; data: Record<string, unknown> } | null;
  }
  // A tx whose writes are recorded; $transaction runs the service callback against THIS object, so a
  // recorded riderUpdate AND a recorded audit prove both landed inside the same transaction. DS13-04: the
  // standing mutations now CAS via `updateMany` (guarded on the observed status/onHold/score) and reject
  // on a 0-row result; default to 1 row (success) and let a test force 0 to exercise the conflict path.
  function makeTx(over: { rider?: unknown; updateCount?: number } = {}) {
    const calls: Calls = { riderUpdate: null, audit: null, sessionRevoke: null };
    const count = over.updateCount ?? 1;
    const tx = {
      rider: {
        findUnique: async () => ("rider" in over ? over.rider : { profileId: "r1" }),
        updateMany: async (args: Calls["riderUpdate"]) => { calls.riderUpdate = args; return { count }; },
      },
      auditLog: { create: async (args: Calls["audit"]) => { calls.audit = args; return { id: "audit-9" }; } },
      // FRAUD P2-3: suspend/ban revoke every live session in the same tx. Record the call so tests can
      // prove the revocation landed inside the transaction alongside the standing write + audit.
      session: { updateMany: async (args: Calls["sessionRevoke"]) => { calls.sessionRevoke = args; return { count: 3 }; } },
    };
    const prisma = { $transaction: async (fn: (t: unknown) => unknown) => fn(tx) };
    return { prisma, calls };
  }

  it("suspendRider sets accountStatus=suspended + reason AND writes the audit row atomically", async () => {
    const { prisma, calls } = makeTx();
    const svc = new AdminRidersService(prisma as unknown as PrismaService, noNotifications, noGateway);
    const res = await svc.suspendRider("admin-1", "r1", { reason: "safety report", note: "incident #7" });
    expect(calls.riderUpdate!.data).toEqual({ accountStatus: "suspended", suspendReason: "safety report", isOnline: false });
    // The audit row committed in the SAME transaction as the state change (both non-null here).
    expect(calls.audit!.data).toMatchObject({ actor: "admin-1", action: "rider.suspend", target: "r1", reasonCode: "safety report", note: "incident #7" });
    // FRAUD P2-3: every live refresh session was revoked in the same transaction (else a suspended rider
    // keeps renewing access tokens via /auth/refresh indefinitely).
    expect(calls.sessionRevoke).not.toBeNull();
    expect(calls.sessionRevoke!.where).toMatchObject({ profileId: "r1", revokedAt: null });
    expect(res).toEqual({ id: "r1", accountStatus: "suspended", auditId: "audit-9" });
  });

  it("suspendRider refuses a BANNED rider — ban permanence can't be laundered via ban→suspend→lift", async () => {
    // Without the guard, an ops `suspend` silently downgrades banned→suspended, and a later `lift` (whose
    // ban-permanence check only fires on accountStatus===BANNED) reinstates the rider to active — defeating
    // the invariant liftRider exists to protect. suspendRider must reject a banned rider outright.
    const { prisma, calls } = makeTx({ rider: { accountStatus: "banned" } });
    const svc = new AdminRidersService(prisma as unknown as PrismaService, noNotifications, noGateway);
    await expect(svc.suspendRider("admin-1", "r1", { reason: "x" })).rejects.toThrow(/banned/i);
    // The ban stands: no standing write and no downgrade audit committed.
    expect(calls.riderUpdate).toBeNull();
    expect(calls.audit).toBeNull();
  });

  it("banRider sets accountStatus=banned + reason and audits", async () => {
    const { prisma, calls } = makeTx();
    const svc = new AdminRidersService(prisma as unknown as PrismaService, noNotifications, noGateway);
    await svc.banRider("admin-1", "r1", { reason: "fraud" });
    expect(calls.riderUpdate!.data).toEqual({ accountStatus: "banned", suspendReason: "fraud", isOnline: false });
    expect(calls.audit!.data).toMatchObject({ action: "rider.ban", reasonCode: "fraud", note: null });
    // FRAUD P2-3: a ban revokes live sessions in the same tx.
    expect(calls.sessionRevoke!.where).toMatchObject({ profileId: "r1", revokedAt: null });
  });

  it("KB-BOARD-REVOKE + DS15-05: suspend AND ban evict the rider from BOTH supply planes via the funnel", async () => {
    // suspend/ban route both board-kick and geo-eviction through the single evictRiderFromSupply funnel
    // (so a new standing path can't half-apply the eviction set). Spy on the funnel method itself.
    const evicted: string[] = [];
    const gateway = {
      evictRiderFromSupply: async (id: string) => { evicted.push(id); },
    } as unknown as import("../tracking/tracking.gateway").TrackingGateway;

    const s1 = makeTx();
    const svc1 = new AdminRidersService(s1.prisma as unknown as PrismaService, noNotifications, gateway);
    await svc1.suspendRider("admin-1", "r1", { reason: "safety" });

    const s2 = makeTx();
    const svc2 = new AdminRidersService(s2.prisma as unknown as PrismaService, noNotifications, gateway);
    await svc2.banRider("admin-1", "r2", { reason: "fraud" });

    // Both standing revocations pull the rider out of the board rooms + rider:geo Redis index at once.
    expect(evicted).toEqual(["r1", "r2"]);
  });

  it("a suspend that 409s (CAS 0 rows) does NOT evict from supply — the rider's standing never changed", async () => {
    const evicted: string[] = [];
    const gateway = {
      evictRiderFromSupply: async (id: string) => { evicted.push(id); },
    } as unknown as import("../tracking/tracking.gateway").TrackingGateway;
    const { prisma } = makeTx({ rider: { accountStatus: "active" }, updateCount: 0 });
    const svc = new AdminRidersService(prisma as unknown as PrismaService, noNotifications, gateway);
    await expect(svc.suspendRider("admin-1", "r1", { reason: "x" })).rejects.toThrow(/refresh and try again/i);
    // The 409 threw before the post-commit eviction, so no spurious supply removal of a still-active rider.
    expect(evicted).toEqual([]);
  });

  it("liftRider returns to active, CLEARS the suspend reason + reliability hold, audits", async () => {
    // A suspended, reliability-held rider (score 55 < clear-at 70).
    const { prisma, calls } = makeTx({ rider: { accountStatus: "suspended", reliabilityScore: 55 } });
    const svc = new AdminRidersService(prisma as unknown as PrismaService, noNotifications, noGateway);
    await svc.liftRider("admin-1", "r1", {});
    // Clears the suspension AND the on_hold lockout, raising the score to the clear threshold (the
    // only escape for on_hold, which otherwise needs online completions the hold itself blocks).
    expect(calls.riderUpdate!.data).toEqual({
      accountStatus: "active",
      suspendReason: null,
      onHold: false,
      // RH-01: a lift releases ANY hold, so heldReason is reset to null in the same CAS write.
      heldReason: null,
      reliabilityScore: 70,
    });
    expect(calls.audit!.data).toMatchObject({ action: "rider.lift", reasonCode: null });
  });

  it("liftRider refuses to un-ban a banned rider", async () => {
    const { prisma } = makeTx({ rider: { accountStatus: "banned", reliabilityScore: 100 } });
    const svc = new AdminRidersService(prisma as unknown as PrismaService, noNotifications, noGateway);
    await expect(svc.liftRider("admin-1", "r1", {})).rejects.toThrow(/banned/i);
  });

  it("liftRider refuses an active (not-suspended) rider — won't erase an auto reliability hold", async () => {
    // active-but-on_hold: a lift here would silently clear the reliability penalty and reset the score.
    const { prisma, calls } = makeTx({ rider: { accountStatus: "active", reliabilityScore: 55 } });
    const svc = new AdminRidersService(prisma as unknown as PrismaService, noNotifications, noGateway);
    await expect(svc.liftRider("admin-1", "r1", {})).rejects.toThrow(/not suspended/i);
    expect(calls.riderUpdate).toBeNull();
    expect(calls.audit).toBeNull();
  });

  it("clearHold clears onHold + raises the score to the clear threshold, audits — the only escape for an active on_hold rider", async () => {
    const { prisma, calls } = makeTx({ rider: { accountStatus: "active", onHold: true, reliabilityScore: 42 } });
    const svc = new AdminRidersService(prisma as unknown as PrismaService, noNotifications, noGateway);
    const res = await svc.clearHold("admin-1", "r1", { reason: "reliability recovered" });
    expect(calls.riderUpdate!.data).toEqual({ onHold: false, heldReason: null, reliabilityScore: 70 });
    expect(calls.audit!.data).toMatchObject({ action: "rider.clear_hold", reasonCode: "reliability recovered" });
    expect(res).toEqual({ id: "r1", onHold: false, auditId: "audit-9" });
  });

  it("clearHold doesn't lower a score already above the clear threshold", async () => {
    const { prisma, calls } = makeTx({ rider: { accountStatus: "active", onHold: true, reliabilityScore: 95 } });
    const svc = new AdminRidersService(prisma as unknown as PrismaService, noNotifications, noGateway);
    await svc.clearHold("admin-1", "r1", {});
    expect(calls.riderUpdate!.data).toEqual({ onHold: false, heldReason: null, reliabilityScore: 95 });
  });

  it("RH-01: clearHold on a VELOCITY-held rider releases the fraud hold — onHold=false, heldReason=null", async () => {
    // The FRAUD P0-3 velocity hold (score untouched ~100, heldReason="velocity") never self-clears via the
    // score hysteresis — an explicit admin clear-hold is the only release, and it must drop heldReason too.
    const { prisma, calls } = makeTx({ rider: { accountStatus: "active", onHold: true, reliabilityScore: 100, heldReason: "velocity" } });
    const svc = new AdminRidersService(prisma as unknown as PrismaService, noNotifications, noGateway);
    const res = await svc.clearHold("admin-1", "r1", { reason: "reviewed — not fraud" });
    expect(calls.riderUpdate!.data).toEqual({ onHold: false, heldReason: null, reliabilityScore: 100 });
    expect(res).toEqual({ id: "r1", onHold: false, auditId: "audit-9" });
  });

  it("clearHold refuses a rider who isn't on hold", async () => {
    const { prisma, calls } = makeTx({ rider: { accountStatus: "active", onHold: false, reliabilityScore: 90 } });
    const svc = new AdminRidersService(prisma as unknown as PrismaService, noNotifications, noGateway);
    await expect(svc.clearHold("admin-1", "r1", {})).rejects.toThrow(/not on hold/i);
    expect(calls.riderUpdate).toBeNull();
    expect(calls.audit).toBeNull();
  });

  it("clearHold refuses a suspended/banned rider — those use lift/ban instead", async () => {
    const { prisma, calls } = makeTx({ rider: { accountStatus: "suspended", onHold: true, reliabilityScore: 40 } });
    const svc = new AdminRidersService(prisma as unknown as PrismaService, noNotifications, noGateway);
    await expect(svc.clearHold("admin-1", "r1", {})).rejects.toThrow(/active/i);
    expect(calls.riderUpdate).toBeNull();
    expect(calls.audit).toBeNull();
  });

  it("clearHold 404s when the id isn't a rider and writes NOTHING", async () => {
    const { prisma, calls } = makeTx({ rider: null });
    const svc = new AdminRidersService(prisma as unknown as PrismaService, noNotifications, noGateway);
    await expect(svc.clearHold("admin-1", "nope", {})).rejects.toThrow("Rider not found");
    expect(calls.riderUpdate).toBeNull();
    expect(calls.audit).toBeNull();
  });

  it("suspendRider 404s when the id isn't a rider and writes NOTHING", async () => {
    const { prisma, calls } = makeTx({ rider: null });
    const svc = new AdminRidersService(prisma as unknown as PrismaService, noNotifications, noGateway);
    await expect(svc.suspendRider("admin-1", "nope", { reason: "x" })).rejects.toThrow("Rider not found");
    expect(calls.riderUpdate).toBeNull();
    expect(calls.audit).toBeNull();
  });

  /* ── DS13-04: CAS on the observed standing — a race that moved the row 409s, never clobbers ────── */

  it("suspendRider CAS: a concurrent standing change (0 rows) → 409, no audit committed", async () => {
    // op B's ban committed between our read and this write → the status-guarded updateMany matches 0 rows.
    const { prisma, calls } = makeTx({ rider: { accountStatus: "active" }, updateCount: 0 });
    const svc = new AdminRidersService(prisma as unknown as PrismaService, noNotifications, noGateway);
    await expect(svc.suspendRider("admin-1", "r1", { reason: "x" })).rejects.toThrow(/refresh and try again/i);
    expect(calls.audit).toBeNull();
  });

  it("banRider CAS: a concurrent standing change (0 rows) → 409, no audit committed", async () => {
    const { prisma, calls } = makeTx({ rider: { accountStatus: "active" }, updateCount: 0 });
    const svc = new AdminRidersService(prisma as unknown as PrismaService, noNotifications, noGateway);
    await expect(svc.banRider("admin-1", "r1", { reason: "fraud" })).rejects.toThrow(/refresh and try again/i);
    expect(calls.audit).toBeNull();
  });

  it("liftRider CAS: a ban committing mid-transaction (0 rows) → 409, does NOT un-ban and writes no audit", async () => {
    // The rider read as SUSPENDED (passes the not-banned guard), but op B's ban lands before our write →
    // the CAS on the observed accountStatus/onHold/score matches 0 rows → we reject instead of un-banning.
    const { prisma, calls } = makeTx({ rider: { accountStatus: "suspended", onHold: false, reliabilityScore: 55 }, updateCount: 0 });
    const svc = new AdminRidersService(prisma as unknown as PrismaService, noNotifications, noGateway);
    await expect(svc.liftRider("admin-1", "r1", {})).rejects.toThrow(/refresh and try again/i);
    expect(calls.audit).toBeNull();
  });

  it("clearHold CAS: a velocity auto-hold committing mid-transaction (0 rows) → 409, no clobber, no audit", async () => {
    // The rider read as active+onHold, but markUndelivered's velocity hold (which takes lockRiderRow)
    // re-committed the hold under us → the CAS on the observed onHold/score matches 0 rows → reject.
    const { prisma, calls } = makeTx({ rider: { accountStatus: "active", onHold: true, reliabilityScore: 42 }, updateCount: 0 });
    const svc = new AdminRidersService(prisma as unknown as PrismaService, noNotifications, noGateway);
    await expect(svc.clearHold("admin-1", "r1", {})).rejects.toThrow(/refresh and try again/i);
    expect(calls.audit).toBeNull();
  });
});

// A banned/suspended rider's already-assigned order isn't touched by the standing change (the
// lifecycle mutations only check order.riderId, not standing) — so the customer on that live order
// previously heard nothing. suspendRider/banRider now fire a best-effort post-commit notify to every
// customer with an ACTIVE_RIDE_STATUSES order under this rider.
describe("AdminRidersService standing-change customer notification", () => {
  function makeTxWithOrders(
    activeOrders: Array<{ id: string; customerId: string }>,
    rider: Record<string, unknown> = { accountStatus: "active" },
  ) {
    const tx = {
      rider: {
        findUnique: async () => rider,
        updateMany: async () => ({ count: 1 }),
      },
      auditLog: { create: async () => ({ id: "audit-9" }) },
      // FRAUD P2-3: suspend/ban revoke live sessions in the same tx.
      session: { updateMany: async () => ({ count: 0 }) },
    };
    const notified: Array<{ profileIds: string[]; msg: unknown }> = [];
    // UX17-02: notifyCustomersOfRiderStandingChange now also writes an `order.rider_standing_notice`
    // AuditLog row (targeted at the ORDER id) per active order, as the customer-facing feed fallback for a
    // missed push. Record these prisma-level creates so a test can prove they land per active order.
    const standingAudits: Array<Record<string, unknown>> = [];
    const prisma = {
      $transaction: async (fn: (t: unknown) => unknown) => fn(tx),
      order: { findMany: async () => activeOrders },
      auditLog: {
        create: async (args: { data: Record<string, unknown> }) => {
          standingAudits.push(args.data);
          return { id: `standing-audit-${standingAudits.length}` };
        },
      },
    };
    const notifications = {
      notifyProfiles: async (profileIds: string[], msg: unknown) => {
        notified.push({ profileIds, msg });
      },
    } as unknown as NotificationsService;
    const svc = new AdminRidersService(prisma as unknown as PrismaService, notifications, noGateway);
    return { svc, notified, standingAudits };
  }

  /** Fire-and-forget post-commit work isn't awaited by suspendRider/banRider — flush the microtask
   *  queue (findMany's promise + the Promise.all chain) before asserting. */
  const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

  /** suspendRider ALSO fires its pre-existing "your own account paused" push to the rider themself
   *  (profileIds: [riderId], no `orderId` in data) — isolate just the new customer-facing notify. */
  const customerNotifies = (notified: Array<{ profileIds: string[]; msg: unknown }>) =>
    notified.filter((n) => (n.msg as { data?: { orderId?: string } }).data?.orderId != null);

  it("suspendRider notifies the customer on the rider's active order", async () => {
    const { svc, notified } = makeTxWithOrders([{ id: "order-1", customerId: "cust-1" }]);
    await svc.suspendRider("admin-1", "r1", { reason: "safety report" });
    await flush();
    const toCustomers = customerNotifies(notified);
    expect(toCustomers).toHaveLength(1);
    expect(toCustomers[0]!.profileIds).toEqual(["cust-1"]);
    expect(toCustomers[0]!.msg).toMatchObject({ data: { orderId: "order-1", kind: "account" } });
  });

  it("banRider notifies every customer when the rider has multiple active orders", async () => {
    const { svc, notified } = makeTxWithOrders([
      { id: "order-1", customerId: "cust-1" },
      { id: "order-2", customerId: "cust-2" },
    ]);
    await svc.banRider("admin-1", "r1", { reason: "fraud" });
    await flush();
    const toCustomers = customerNotifies(notified);
    expect(toCustomers).toHaveLength(2);
    expect(toCustomers.map((n) => n.profileIds[0])).toEqual(["cust-1", "cust-2"]);
  });

  it("suspendRider/banRider notify no customer when the rider has no active order", async () => {
    const { svc, notified } = makeTxWithOrders([]);
    await svc.suspendRider("admin-1", "r1", { reason: "x" });
    await flush();
    expect(customerNotifies(notified)).toHaveLength(0);
  });

  it("UX17-02: suspendRider ALSO writes an order.rider_standing_notice audit row (target=orderId) per active order — the customer feed fallback", async () => {
    const { svc, standingAudits } = makeTxWithOrders([
      { id: "order-1", customerId: "cust-1" },
      { id: "order-2", customerId: "cust-2" },
    ]);
    await svc.suspendRider("admin-1", "r1", { reason: "safety report" });
    await flush();
    // One durable audit row per active order, targeted at the ORDER id (so feedForUser can match it against
    // the customer's own orders), with the rider's profileId carried in `note` for traceability.
    expect(standingAudits).toHaveLength(2);
    expect(standingAudits).toEqual([
      { actor: "system:rider-standing-notice", action: "order.rider_standing_notice", target: "order-1", note: "r1" },
      { actor: "system:rider-standing-notice", action: "order.rider_standing_notice", target: "order-2", note: "r1" },
    ]);
  });

  it("UX17-02: banRider writes the standing-notice audit row too, and none when the rider has no active order", async () => {
    const withOrders = makeTxWithOrders([{ id: "order-9", customerId: "cust-9" }]);
    await withOrders.svc.banRider("admin-1", "r1", { reason: "fraud" });
    await flush();
    expect(withOrders.standingAudits).toEqual([
      { actor: "system:rider-standing-notice", action: "order.rider_standing_notice", target: "order-9", note: "r1" },
    ]);

    const noOrders = makeTxWithOrders([]);
    await noOrders.svc.banRider("admin-1", "r1", { reason: "fraud" });
    await flush();
    expect(noOrders.standingAudits).toHaveLength(0);
  });

  /** banRider ALSO now pushes the banned rider themselves (UX18-04 sibling fix — every OTHER standing
   *  action in this file already pushed the rider directly, banRider was the one gap). Isolate it from
   *  the customer-facing notify by profileIds targeting the rider, not a customer. */
  const riderOwnNotify = (notified: Array<{ profileIds: string[]; msg: unknown }>) =>
    notified.filter((n) => n.profileIds[0] === "r1" && (n.msg as { data?: { orderId?: string } }).data?.orderId == null);

  it("UX18-04: banRider now also pushes the banned rider themselves an 'Account blocked' notice", async () => {
    const { svc, notified } = makeTxWithOrders([]);
    await svc.banRider("admin-1", "r1", { reason: "fraud" });
    await flush();
    const own = riderOwnNotify(notified);
    expect(own).toHaveLength(1);
    expect(own[0]!.msg).toMatchObject({ title: "Account blocked" });
  });

  it("UX18-05: liftRider resolves the standing notice for the customer on the rider's active order", async () => {
    const { svc, notified, standingAudits } = makeTxWithOrders(
      [{ id: "order-1", customerId: "cust-1" }],
      { accountStatus: "suspended", onHold: false, reliabilityScore: 100 },
    );
    await svc.liftRider("admin-1", "r1", {});
    await flush();
    // The resolution audit is targeted at the ORDER id (mirrors order.rider_standing_notice) so
    // feedForUser's durable fallback can match it against the customer's own orders.
    expect(standingAudits).toEqual([
      { actor: "system:rider-standing-notice", action: "order.rider_standing_resolved", target: "order-1", note: "r1" },
    ]);
    const toCustomer = notified.find((n) => n.profileIds[0] === "cust-1");
    expect(toCustomer).toBeDefined();
    expect(toCustomer!.msg).toMatchObject({ title: "Your delivery is back on track", data: { orderId: "order-1", kind: "account" } });
  });

  it("UX18-05: liftRider is a no-op resolution notice when the rider has no active order", async () => {
    const { svc, notified, standingAudits } = makeTxWithOrders([], { accountStatus: "suspended", onHold: false, reliabilityScore: 100 });
    await svc.liftRider("admin-1", "r1", {});
    await flush();
    expect(standingAudits).toHaveLength(0);
    expect(notified.some((n) => n.profileIds[0] === "cust-1")).toBe(false);
  });
});

describe("AdminRidersService.walletView", () => {
  /** One ledger row builder, newest-first ids (l1 = newest). */
  function row(id: string, at: string) {
    return {
      id,
      type: "topup" as const,
      amount: dec("10.00"),
      balanceAfter: dec("12.50"),
      note: "launch grace",
      actor: "admin-1",
      orderId: null,
      createdAt: new Date(at),
    };
  }

  it("returns the prepaid balance + recent ledger, newest-first (DOC-16-03)", async () => {
    const prisma = {
      commissionAccount: { findUnique: async () => ({ balance: dec("12.50") }) },
      commissionLedger: {
        findMany: async (args: { orderBy: unknown; take: number; cursor?: unknown }) => {
          expect(args.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
          // LC-D07: fetches PAGE_SIZE+1 to detect `hasMore` without a separate count query.
          expect(args.take).toBe(21);
          expect(args.cursor).toBeUndefined();
          return [row("l1", "2026-07-18T10:00:00Z")];
        },
      },
    };
    const svc = new AdminRidersService(prisma as unknown as PrismaService, noNotifications, noGateway);
    const out = await svc.walletView("r1");
    expect(out.balance).toBe("12.50");
    expect(out.ledger).toHaveLength(1);
    expect(out.ledger[0]).toMatchObject({ type: "topup", amount: "10.00", balanceAfter: "12.50", actor: "admin-1" });
    expect(out.ledger[0]!.at).toBe("2026-07-18T10:00:00.000Z");
    expect(out.nextCursor).toBeNull();
  });

  it("degrades to a zero balance + empty ledger when the rider has no wallet row yet", async () => {
    const prisma = {
      commissionAccount: { findUnique: async () => null },
      commissionLedger: { findMany: async () => [] },
    };
    const svc = new AdminRidersService(prisma as unknown as PrismaService, noNotifications, noGateway);
    const out = await svc.walletView("r1");
    expect(out.balance).toBe("0.00");
    expect(out.ledger).toEqual([]);
    expect(out.nextCursor).toBeNull();
  });

  it("LC-D07: a rider with more than 20 entries gets a nextCursor instead of silently truncating", async () => {
    const rows = Array.from({ length: 21 }, (_, i) =>
      row(`l${i + 1}`, new Date(new Date("2026-07-18T10:00:00Z").getTime() - i * 86_400_000).toISOString()),
    );
    const prisma = {
      commissionAccount: { findUnique: async () => ({ balance: dec("12.50") }) },
      commissionLedger: { findMany: async () => rows },
    };
    const svc = new AdminRidersService(prisma as unknown as PrismaService, noNotifications, noGateway);
    const out = await svc.walletView("r1");
    // Only the first 20 of the 21 fetched rows are returned — the 21st was fetched purely to detect
    // hasMore and must not leak into the page.
    expect(out.ledger).toHaveLength(20);
    expect(out.ledger[19]!.id).toBe("l20");
    expect(out.nextCursor).toBe("l20");
  });

  it("LC-D07: a cursor pages past the first 20 entries instead of always returning the newest page", async () => {
    const prisma = {
      commissionAccount: { findUnique: async () => ({ balance: dec("12.50") }) },
      commissionLedger: {
        findMany: async (args: { cursor?: { id: string }; skip?: number }) => {
          expect(args.cursor).toEqual({ id: "l20" });
          expect(args.skip).toBe(1);
          return [row("l21", "2026-06-28T10:00:00Z")];
        },
      },
    };
    const svc = new AdminRidersService(prisma as unknown as PrismaService, noNotifications, noGateway);
    const out = await svc.walletView("r1", "l20");
    expect(out.ledger).toHaveLength(1);
    expect(out.ledger[0]!.id).toBe("l21");
    expect(out.nextCursor).toBeNull();
  });
});
