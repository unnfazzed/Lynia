import { COMMISSION, isCommissionActive, perRideCommission, resolveCommissionRatePct } from "@lynia/shared";
import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import type { Env } from "../config/env";
import type { NotificationsService } from "../notifications/notifications.service";
import type { PrismaService } from "../prisma/prisma.service";
import { WalletService } from "./wallet.service";

describe("admin console v2 §3 — wallet recording", () => {
  it("the rider-facing ledger never lists a free_job receipt (not a shared WalletEntryType)", async () => {
    const findMany = vi.fn(async () => []);
    const svc = build({}, { commissionLedger: { findMany } });
    await svc.getLedger("r1");
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { riderId: "r1", type: { not: "free_job" } } }));
  });

  function creditTx(confirmedCount: number) {
    const events: Array<Record<string, unknown>> = [];
    const tx = {
      topUp: {
        updateMany: vi.fn(async () => ({ count: 1 })),
        findUnique: async () => ({ id: "t1", riderId: "r1", amount: new Prisma.Decimal(5), rail: "ecocash", initiatedAt: new Date(), resolvedAt: new Date() }),
        count: vi.fn(async () => confirmedCount),
      },
      $executeRaw: async () => 0,
      $queryRaw: async () => [{ balance: "0" }],
      commissionLedger: { create: async () => ({}) },
      commissionAccount: { update: async () => ({}) },
      domainEvent: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          events.push(data);
          return {};
        },
      },
    };
    const prisma = { $transaction: async (fn: (t: unknown) => unknown) => fn(tx) };
    return { svc: build({}, prisma), tx, events };
  }

  it("records the biker funnel's first_topup inside the confirming transaction, and clears declineReason", async () => {
    const { svc, tx, events } = creditTx(1);
    await svc.creditFromTopup("t1");
    expect(tx.topUp.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "confirmed", declineReason: null }) }));
    expect(tx.topUp.count).toHaveBeenCalledWith({ where: { riderId: "r1", status: "confirmed" } });
    expect(events).toEqual([
      expect.objectContaining({ type: "rider.onboarding_step", subjectId: "r1", actorRole: "system", data: { step: "first_topup", topUpId: "t1", rail: "ecocash" } }),
    ]);
  });

  it("a second confirmed top-up is not a first_topup", async () => {
    const { svc, events } = creditTx(2);
    await svc.creditFromTopup("t1");
    expect(events).toEqual([]);
  });
});

/** A tx `rider` stub for a rider past their D-70 commission-free first jobs (the debit applies). */
const PAST_FREE_JOBS = { findUnique: async () => ({ tripsCount: COMMISSION.freeFirstJobs + 7 }) };

/** A WalletService over a stub prisma + the given env overrides. Only the fields a test touches exist. */
function build(env: Partial<Env> = {}, prisma: Record<string, unknown> = {}, notifications?: NotificationsService) {
  const fullEnv = { COMMISSION_SHADOW_RATE_PCT: 10, WALLET_MANUAL_CREDIT_CAP_USD: 50, ...env } as unknown as Env;
  return new WalletService(fullEnv, prisma as unknown as PrismaService, notifications);
}

describe("resolveCommissionRatePct (the flip is one server value, never hardcoded)", () => {
  it("defaults to 10% (owner 2026-10-12) when the env override is unset/blank", () => {
    expect(COMMISSION.ratePct).toBe(10);
    expect(resolveCommissionRatePct(undefined)).toBe(10);
    expect(resolveCommissionRatePct("")).toBe(10);
    expect(resolveCommissionRatePct(null)).toBe(10);
  });
  it("an explicit 0 switches commission off", () => {
    expect(resolveCommissionRatePct("0")).toBe(0);
  });
  it("applies a valid override (the flip to 10)", () => {
    expect(resolveCommissionRatePct("10")).toBe(10);
    expect(resolveCommissionRatePct(10)).toBe(10);
  });
  it("clamps to [0,100] and falls back to the default on garbage", () => {
    expect(resolveCommissionRatePct("999")).toBe(100);
    expect(resolveCommissionRatePct("-5")).toBe(COMMISSION.ratePct);
    expect(resolveCommissionRatePct("abc")).toBe(COMMISSION.ratePct);
  });

  it("WD-010: rounds to 2dp — CommissionLedger.ratePct is Decimal(5,2), so an over-precise ops override can't diverge from what's stamped on the ride's receipt row", () => {
    expect(resolveCommissionRatePct("12.345")).toBe(12.35);
    expect(resolveCommissionRatePct("10.001")).toBe(10);
    expect(resolveCommissionRatePct(7.999)).toBe(8);
  });
});

describe("perRideCommission (reads the resolved rate, not a constant)", () => {
  it("is 0 at the launch rate — nothing is deducted", () => {
    expect(perRideCommission(3, 0)).toBe(0);
    expect(perRideCommission(50, 0)).toBe(0);
  });
  it("takes the given percentage of the fare, 2dp", () => {
    expect(perRideCommission(3, 10)).toBe(0.3);
    expect(perRideCommission(2.5, 10)).toBe(0.25);
    expect(perRideCommission(3.33, 10)).toBe(0.33);
  });
  it("isCommissionActive tracks a strictly-positive rate", () => {
    expect(isCommissionActive(0)).toBe(false);
    expect(isCommissionActive(10)).toBe(true);
  });
});

describe("WalletService.getConfig (server-authoritative)", () => {
  it("serves 10% with no env override, and no minimum balance (floor 0)", () => {
    const cfg = build({ COMMISSION_RATE_PCT: undefined } as Partial<Env>).getConfig();
    expect(cfg.ratePct).toBe(10);
    expect(cfg.floor).toBe(0);
    expect(cfg.floor).toBe(COMMISSION.lowBalanceBlockBelow);
    expect(cfg.minTopUp).toBe(COMMISSION.minTopUp);
    expect(cfg.maxTopUp).toBe(COMMISSION.maxTopUp);
  });
  it("serves the resolved rate once the flip happens", () => {
    const cfg = build({ COMMISSION_RATE_PCT: 10 } as Partial<Env>).getConfig();
    expect(cfg.ratePct).toBe(10);
  });
  it("returns exactly the rate/policy fields — no stray `enabled` (or any other) field survives a future regression", () => {
    const cfg = build().getConfig();
    expect(Object.keys(cfg).sort()).toEqual(["floor", "freeFirstJobs", "graceCredit", "maxTopUp", "minTopUp", "ratePct", "topupFeePct", "topupRails"]);
  });
});

describe("WalletService.createTopup (server-side clamp)", () => {
  it("clamps the amount to [minTopUp, maxTopUp] and creates a pending intent", async () => {
    const created: Record<string, unknown>[] = [];
    const svc = build(
      {},
      {
        rider: { findUnique: async () => ({ profileId: "r1", kycStatus: "verified" }) },
        topUp: {
          create: async ({ data }: { data: Record<string, unknown> }) => {
            created.push(data);
            return { id: "t1", status: "pending", amount: data.amount, rail: data.rail, phone: data.phone, expiresAt: data.expiresAt, initiatedAt: new Date() };
          },
        },
      },
    );
    const over = await svc.createTopup("r1", { amount: 500, rail: "ecocash", phone: "0770000000" });
    expect(over.amount).toBe(COMMISSION.maxTopUp);
    const under = await svc.createTopup("r1", { amount: 1, rail: "ecocash", phone: "0770000000" });
    expect(under.amount).toBe(COMMISSION.minTopUp);
    expect(created).toHaveLength(2);
    expect(created[0]!.status).toBe("pending");
  });

  it("rejects a top-up from a non-rider", async () => {
    const svc = build({}, { rider: { findUnique: async () => null } });
    await expect(svc.createTopup("x", { amount: 10, rail: "ecocash", phone: "0770000000" })).rejects.toThrow(/not a biker/i);
  });

  it.each(["pending", "failed", "expired"])("refuses to START a top-up for a %s (unverified) rider — 403 { reason: kyc }, no intent", async (kycStatus) => {
    const create = vi.fn();
    const findFirst = vi.fn();
    const svc = build({}, { rider: { findUnique: async () => ({ profileId: "r1", kycStatus }) }, topUp: { create, findFirst } });
    let threw: unknown;
    try {
      await svc.createTopup("r1", { amount: 10, rail: "ecocash", phone: "0770000000", idempotencyKey: "k" });
    } catch (e) {
      threw = e;
    }
    expect((threw as { getStatus: () => number }).getStatus()).toBe(403);
    expect((threw as { getResponse: () => unknown }).getResponse()).toMatchObject({ reason: "kyc", message: expect.any(String) });
    expect(create).not.toHaveBeenCalled();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("still lets an unverified rider read their wallet and ledger (only initiation is gated)", async () => {
    const svc = build(
      {},
      {
        rider: { findUnique: async () => ({ profileId: "r1", kycStatus: "pending" }) },
        commissionAccount: { findUnique: async () => null },
        commissionLedger: { findMany: async () => [] },
      },
    );
    await expect(svc.getWallet("r1")).resolves.toBeDefined();
    await expect(svc.getLedger("r1")).resolves.toBeDefined();
  });

  it("BH-09: a retry with the same idempotency key returns the original pending intent, not a second one", async () => {
    const create = vi.fn();
    const existing = { id: "t1", status: "pending", amount: 10, rail: "ecocash", phone: "0770000000", expiresAt: new Date(), initiatedAt: new Date() };
    const svc = build(
      {},
      {
        rider: { findUnique: async () => ({ profileId: "r1", kycStatus: "verified" }) },
        topUp: { findFirst: async () => existing, create },
      },
    );
    const result = await svc.createTopup("r1", { amount: 10, rail: "ecocash", phone: "0770000000", idempotencyKey: "key-1" });
    expect(result.id).toBe("t1");
    expect(create).not.toHaveBeenCalled();
  });

  it("BH-09: a concurrent replay that races the pre-check (P2002) still returns the winner's intent, not a 500", async () => {
    const winner = { id: "t2", status: "pending", amount: 10, rail: "ecocash", phone: "0770000000", expiresAt: new Date(), initiatedAt: new Date() };
    let findFirstCalls = 0;
    const svc = build(
      {},
      {
        rider: { findUnique: async () => ({ profileId: "r1", kycStatus: "verified" }) },
        topUp: {
          findFirst: async () => {
            findFirstCalls += 1;
            return findFirstCalls === 1 ? null : winner; // no existing row on the pre-check, then the racing winner
          },
          create: async () => {
            throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed on the fields: (`rider_id`,`idempotency_key`)", {
              code: "P2002",
              clientVersion: "5.22.0",
            });
          },
        },
      },
    );
    const result = await svc.createTopup("r1", { amount: 10, rail: "ecocash", phone: "0770000000", idempotencyKey: "key-2" });
    expect(result.id).toBe("t2");
  });

  it("BH-09: two different keys (or no key) each create their own intent — no false-positive dedup", async () => {
    const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "fresh", status: "pending", amount: data.amount, rail: data.rail, phone: data.phone, expiresAt: data.expiresAt, initiatedAt: new Date(),
    }));
    const svc = build(
      {},
      { rider: { findUnique: async () => ({ profileId: "r1", kycStatus: "verified" }) }, topUp: { findFirst: async () => null, create } },
    );
    await svc.createTopup("r1", { amount: 10, rail: "ecocash", phone: "0770000000" });
    await svc.createTopup("r1", { amount: 10, rail: "ecocash", phone: "0770000000", idempotencyKey: "key-3" });
    expect(create).toHaveBeenCalledTimes(2);
  });
});

describe("WalletService.chargeCommission (0% is a no-op; shadow accrual still fires)", () => {
  it("writes NO ledger row at a 0% rate but logs the shadow accrual", async () => {
    const create = vi.fn();
    const tx = {
      // The job ordinal is read for the biker funnel (admin console v2 §3) at every rate.
      rider: { findUnique: async () => ({ tripsCount: 50 }) },
      commissionLedger: { create, findFirst: async () => null },
      commissionAccount: { update: vi.fn() },
      $executeRaw: vi.fn(),
      $queryRaw: vi.fn(async () => [{ balance: "0" }]),
    };
    const svc = build({ COMMISSION_RATE_PCT: 0 });
    await svc.chargeCommission(tx as never, { fleetMerchantId: null, orderId: "o1", riderId: "r1", agreedFare: 3 });
    expect(create).not.toHaveBeenCalled();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it("charges the correct amount at a positive rate, under the row lock, with balanceAfter derived from the locked balance", async () => {
    const create = vi.fn();
    const update = vi.fn();
    const tx = {
      commissionLedger: { create, findFirst: async () => null },
      // D-70: past the commission-free first jobs, so the debit applies.
      rider: PAST_FREE_JOBS,
      commissionAccount: { update },
      $executeRaw: vi.fn(),
      $queryRaw: vi.fn(async () => [{ balance: "20" }]),
    };
    const svc = build({ COMMISSION_RATE_PCT: 10 });
    await svc.chargeCommission(tx as never, { fleetMerchantId: null, orderId: "o1", riderId: "r1", agreedFare: 8 });
    expect(create).toHaveBeenCalledWith({
      data: { riderId: "r1", orderId: "o1", type: "ride_commission", amount: -0.8, balanceAfter: 19.2, ratePct: 10, fare: 8, actor: "system" },
    });
    expect(update).toHaveBeenCalledWith({ where: { riderId: "r1" }, data: { balance: 19.2 } });
  });

  it("Own bikers (D-117): a fleet job is never charged — no ride_commission, no free_job row, no account touched", async () => {
    const create = vi.fn();
    const update = vi.fn();
    const executeRaw = vi.fn();
    const tx = {
      commissionLedger: { create, findFirst: async () => null },
      rider: PAST_FREE_JOBS,
      commissionAccount: { update },
      $executeRaw: executeRaw,
      $queryRaw: vi.fn(async () => [{ balance: "20" }]),
    };
    const svc = build({ COMMISSION_RATE_PCT: 10 });
    await svc.chargeCommission(tx as never, { fleetMerchantId: "branch-1", orderId: "o1", riderId: "r1", agreedFare: 0, suggestedFare: 3 });
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it("is idempotent under a replayed completion — a second call for the same order is a no-op (design 1A)", async () => {
    const create = vi.fn();
    const tx = {
      commissionLedger: { create, findFirst: async () => ({ id: "existing-row" }) },
      // D-70: past the commission-free first jobs, so the debit applies.
      rider: PAST_FREE_JOBS,
      commissionAccount: { update: vi.fn() },
      $executeRaw: vi.fn(),
      $queryRaw: vi.fn(async () => [{ balance: "20" }]),
    };
    const svc = build({ COMMISSION_RATE_PCT: 10 });
    await svc.chargeCommission(tx as never, { fleetMerchantId: null, orderId: "o1", riderId: "r1", agreedFare: 8 });
    expect(create).not.toHaveBeenCalled();
  });
});

describe("WalletService.chargeCommission — WD-012 commission-basis floor (DOC-16-04 / FRAUD-REVIEW P0-2)", () => {
  it("bills on max(agreedFare, basisFloorPct × suggestedFare) when the agreed fare undercuts the floor", async () => {
    const create = vi.fn();
    const tx = {
      commissionLedger: { create, findFirst: async () => null },
      // D-70: past the commission-free first jobs, so the debit applies.
      rider: PAST_FREE_JOBS,
      commissionAccount: { update: vi.fn() },
      $executeRaw: vi.fn(),
      $queryRaw: vi.fn(async () => [{ balance: "0" }]),
    };
    const svc = build({ COMMISSION_RATE_PCT: 10 });
    // agreedFare $1 vs suggestedFare $10 → floor = 0.5 × 10 = $5; commission is 10% of $5 = $0.50, not of $1
    // — a colluding pair lowballing offeredFare to $1 can't evade commission down to $0.10.
    await svc.chargeCommission(tx as never, { fleetMerchantId: null, orderId: "o1", riderId: "r1", agreedFare: 1, suggestedFare: 10 });
    expect(create).toHaveBeenCalledWith({
      // LC-B-SIB-3: `fare` stores the $5 basis actually billed, not the raw $1 — it is the receipt's math.
      data: { riderId: "r1", orderId: "o1", type: "ride_commission", amount: -0.5, balanceAfter: -0.5, ratePct: 10, fare: 5, actor: "system" },
    });
  });

  it("LC-B-SIB-3: the biker's receipt math matches the debit when the floor bites — \"10% of $5.00\" beside −$0.50, not \"10% of $1.00\"", async () => {
    const create = vi.fn();
    const tx = {
      commissionLedger: { create, findFirst: async () => null },
      rider: PAST_FREE_JOBS,
      commissionAccount: { update: vi.fn() },
      $executeRaw: vi.fn(),
      $queryRaw: vi.fn(async () => [{ balance: "0" }]),
    };
    const svc = build({ COMMISSION_RATE_PCT: 10 });
    await svc.chargeCommission(tx as never, { fleetMerchantId: null, orderId: "o1", riderId: "r1", agreedFare: 1, suggestedFare: 10 });
    // Round-trip the written row through getLedger → toEntry exactly as the DB would hand it back.
    const data = create.mock.calls[0]![0].data as Record<string, unknown>;
    const row = {
      id: "l1",
      type: data.type,
      amount: new Prisma.Decimal(data.amount as number),
      balanceAfter: new Prisma.Decimal(data.balanceAfter as number),
      orderId: data.orderId,
      ratePct: new Prisma.Decimal(data.ratePct as number),
      fare: new Prisma.Decimal(data.fare as number),
      note: null,
      createdAt: new Date("2026-10-07T00:00:00.000Z"),
      topUp: null,
    };
    const reader = build({ COMMISSION_RATE_PCT: 10 }, { commissionLedger: { findMany: async () => [row] } });
    const [entry] = (await reader.getLedger("r1")).entries;
    expect(entry).toMatchObject({ type: "commission", amount: -0.5, ratePct: 10, fare: 5, meta: "10% of $5.00" });
  });

  it("never floors ABOVE the real agreedFare — a fare that already clears the floor is charged unchanged, and the receipt `fare` field shows the real agreedFare (it IS the basis)", async () => {
    const create = vi.fn();
    const tx = {
      commissionLedger: { create, findFirst: async () => null },
      // D-70: past the commission-free first jobs, so the debit applies.
      rider: PAST_FREE_JOBS,
      commissionAccount: { update: vi.fn() },
      $executeRaw: vi.fn(),
      $queryRaw: vi.fn(async () => [{ balance: "0" }]),
    };
    const svc = build({ COMMISSION_RATE_PCT: 10 });
    await svc.chargeCommission(tx as never, { fleetMerchantId: null, orderId: "o1", riderId: "r1", agreedFare: 8, suggestedFare: 10 });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ amount: -0.8, fare: 8 }) }));
  });

  it("falls back to the raw, unfloored agreedFare when suggestedFare is missing/null (legacy orders predating the field)", async () => {
    const create = vi.fn();
    const tx = {
      commissionLedger: { create, findFirst: async () => null },
      // D-70: past the commission-free first jobs, so the debit applies.
      rider: PAST_FREE_JOBS,
      commissionAccount: { update: vi.fn() },
      $executeRaw: vi.fn(),
      $queryRaw: vi.fn(async () => [{ balance: "0" }]),
    };
    const svc = build({ COMMISSION_RATE_PCT: 10 });
    await svc.chargeCommission(tx as never, { fleetMerchantId: null, orderId: "o1", riderId: "r1", agreedFare: 1, suggestedFare: null });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ amount: -0.1 }) }));
  });
});

describe("WalletService.chargeCommission — D-70 commission-free first jobs", () => {
  /** A tx whose rider has `tripsCount` completed jobs (post-increment: this job's ordinal). */
  function txFor(tripsCount: number | null) {
    return {
      rider: { findUnique: vi.fn(async () => (tripsCount == null ? null : { tripsCount })) },
      commissionLedger: { create: vi.fn(), findFirst: async () => null },
      commissionAccount: { update: vi.fn() },
      $executeRaw: vi.fn(),
      $queryRaw: vi.fn(async () => [{ balance: "0" }]),
    };
  }

  it("serves the allowance on /wallet/config", () => {
    expect(build().getConfig().freeFirstJobs).toBe(COMMISSION.freeFirstJobs);
    expect(COMMISSION.freeFirstJobs).toBe(10); // owner 2026-10-12 (was the handoff's drawn "5 of 5 left")
  });

  it("a new biker's 1st…10th completed jobs carry no debit — only a $0 free_job receipt — even at a live rate and a $0 balance", async () => {
    const svc = build({ COMMISSION_RATE_PCT: 10 });
    for (let job = 1; job <= COMMISSION.freeFirstJobs; job++) {
      const tx = txFor(job);
      await svc.chargeCommission(tx as never, { fleetMerchantId: null, orderId: `o${job}`, riderId: "r1", agreedFare: 8 });
      // Admin console v2 §3: the receipt records the waived charge (rate% of fare) and moves nothing.
      expect(tx.commissionLedger.create).toHaveBeenCalledOnce();
      expect(tx.commissionLedger.create).toHaveBeenCalledWith({
        data: {
          riderId: "r1",
          orderId: `o${job}`,
          type: "free_job",
          amount: 0,
          balanceAfter: 0,
          ratePct: 10,
          fare: 8,
          note: `Free job ${job} of ${COMMISSION.freeFirstJobs}`,
          actor: "system",
        },
      });
      // The balance is never written for a free job.
      expect(tx.commissionAccount.update).not.toHaveBeenCalled();
    }
  });

  it("the free_job receipt carries the locked balance through unchanged (a biker who already topped up)", async () => {
    const svc = build({ COMMISSION_RATE_PCT: 10 });
    const tx = { ...txFor(3), $queryRaw: vi.fn(async () => [{ balance: "12.50" }]) };
    await svc.chargeCommission(tx as never, { fleetMerchantId: null, orderId: "o3", riderId: "r1", agreedFare: 8 });
    expect(tx.commissionLedger.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "free_job", amount: 0, balanceAfter: 12.5 }) }),
    );
    expect(tx.commissionAccount.update).not.toHaveBeenCalled();
  });

  it("a replayed completion writes no second free_job receipt (check-then-insert on its own type)", async () => {
    const svc = build({ COMMISSION_RATE_PCT: 10 });
    const findFirst = vi.fn(async () => ({ id: "existing" }));
    const tx = { ...txFor(2), commissionLedger: { create: vi.fn(), findFirst } };
    await svc.chargeCommission(tx as never, { fleetMerchantId: null, orderId: "o2", riderId: "r1", agreedFare: 8 });
    expect(findFirst).toHaveBeenCalledWith({ where: { riderId: "r1", orderId: "o2", type: "free_job" }, select: { id: true } });
    expect(tx.commissionLedger.create).not.toHaveBeenCalled();
  });

  it("records the biker funnel's first_job and job_10 steps in the completion transaction", async () => {
    const svc = build({ COMMISSION_RATE_PCT: 0 });
    for (const [job, step] of [
      [1, "first_job"],
      [10, "job_10"],
    ] as const) {
      const domainEvent = { create: vi.fn() };
      const tx = { ...txFor(job), domainEvent };
      await svc.chargeCommission(tx as never, { fleetMerchantId: null, orderId: `o${job}`, riderId: "r1", agreedFare: 3 });
      expect(domainEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ type: "rider.onboarding_step", subjectId: "r1", orderId: `o${job}`, data: { step, orderType: "parcel" } }),
      });
    }
    const domainEvent = { create: vi.fn() };
    await svc.chargeCommission({ ...txFor(2), domainEvent } as never, { fleetMerchantId: null, orderId: "o2", riderId: "r1", agreedFare: 3 });
    expect(domainEvent.create).not.toHaveBeenCalled();
  });

  it("the 11th completed job is charged normally — the allowance is spent", async () => {
    const svc = build({ COMMISSION_RATE_PCT: 10 });
    const tx = txFor(COMMISSION.freeFirstJobs + 1);
    await svc.chargeCommission(tx as never, { fleetMerchantId: null, orderId: "o11", riderId: "r1", agreedFare: 8 });
    expect(tx.commissionLedger.create).toHaveBeenCalledWith({
      data: { riderId: "r1", orderId: "o11", type: "ride_commission", amount: -0.8, balanceAfter: -0.8, ratePct: 10, fare: 8, actor: "system" },
    });
  });

  it("an existing biker past the allowance is unaffected — charged exactly as before", async () => {
    const svc = build({ COMMISSION_RATE_PCT: 10 });
    const tx = txFor(240);
    await svc.chargeCommission(tx as never, { fleetMerchantId: null, orderId: "o1", riderId: "r1", agreedFare: 3 });
    expect(tx.commissionLedger.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ amount: -0.3 }) }));
  });

  it("a missing biker row falls back to the pre-D-70 charge (never silently free)", async () => {
    const svc = build({ COMMISSION_RATE_PCT: 10 });
    const tx = txFor(null);
    await svc.chargeCommission(tx as never, { fleetMerchantId: null, orderId: "o1", riderId: "r1", agreedFare: 3 });
    expect(tx.commissionLedger.create).toHaveBeenCalled();
  });

  it("at a 0% rate nothing changes — no ledger row, not even a free_job receipt (the job ordinal is still read, for the funnel)", async () => {
    const svc = build({ COMMISSION_RATE_PCT: 0 });
    const tx = txFor(1);
    await svc.chargeCommission(tx as never, { fleetMerchantId: null, orderId: "o1", riderId: "r1", agreedFare: 3 });
    expect(tx.rider.findUnique).toHaveBeenCalledOnce();
    expect(tx.commissionLedger.create).not.toHaveBeenCalled();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
});

describe("WalletService.chargeCommission — every job type (owner 2026-10-12)", () => {
  function txPast() {
    return {
      commissionLedger: { create: vi.fn(), findFirst: async () => null },
      rider: PAST_FREE_JOBS,
      commissionAccount: { update: vi.fn() },
      $executeRaw: vi.fn(),
      $queryRaw: vi.fn(async () => [{ balance: "5" }]),
    };
  }
  it("charges a restaurant/shop/pharmacy job 10% of its delivery fee, never its goods+delivery agreedFare", async () => {
    const tx = txPast();
    await build().chargeCommission(tx as never, { fleetMerchantId: null, orderId: "m1", riderId: "r1", orderType: "merchant", agreedFare: 23.5, deliveryFee: 3.5 });
    expect(tx.commissionLedger.create).toHaveBeenCalledWith({
      data: { riderId: "r1", orderId: "m1", type: "ride_commission", amount: -0.35, balanceAfter: 4.65, ratePct: 10, fare: 3.5, actor: "system" },
    });
  });
  it("skips (never throws) a merchant job with no delivery fee", async () => {
    const tx = txPast();
    await build().chargeCommission(tx as never, { fleetMerchantId: null, orderId: "m1", riderId: "r1", orderType: "merchant", agreedFare: 23.5, deliveryFee: null });
    expect(tx.commissionLedger.create).not.toHaveBeenCalled();
  });
});

describe("WalletService.adjustCommissionInTx (WD-001 — fare-adjust ledger reconciliation)", () => {
  it("writes a signed adjustment row and updates the balance under the row lock", async () => {
    const create = vi.fn();
    const update = vi.fn();
    const tx = {
      commissionLedger: { create },
      commissionAccount: { update },
      $executeRaw: vi.fn(),
      $queryRaw: vi.fn(async () => [{ balance: "5" }]),
    };
    const svc = build();
    await svc.adjustCommissionInTx(tx as never, { riderId: "r1", orderId: "o1", amount: 0.3, ratePct: 10, fare: -3, note: "Fare correction for order o1: $10.00 → $7.00", actor: "admin-1" });
    expect(create).toHaveBeenCalledWith({
      data: {
        riderId: "r1",
        orderId: "o1",
        type: "adjustment",
        amount: 0.3,
        balanceAfter: 5.3,
        ratePct: 10,
        fare: -3,
        note: "Fare correction for order o1: $10.00 → $7.00",
        actor: "admin-1",
      },
    });
    expect(update).toHaveBeenCalledWith({ where: { riderId: "r1" }, data: { balance: 5.3 } });
  });

  it("no-ops on a zero delta — nothing to record", async () => {
    const create = vi.fn();
    const tx = { commissionLedger: { create }, commissionAccount: { update: vi.fn() }, $executeRaw: vi.fn(), $queryRaw: vi.fn() };
    const svc = build();
    await svc.adjustCommissionInTx(tx as never, { riderId: "r1", orderId: "o1", amount: 0, ratePct: 10, fare: 0, note: "", actor: "admin-1" });
    expect(create).not.toHaveBeenCalled();
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });

  it("WD-015: writes the REAL orderId (not null) so settlements.service's per-order reconciliation query can see the correction — a second correction on the same order no longer collides, because the unique index is now PARTIAL (scoped to type='ride_commission' only, migration 0031)", async () => {
    const create = vi.fn();
    const tx = {
      commissionLedger: { create },
      commissionAccount: { update: vi.fn() },
      $executeRaw: vi.fn(),
      $queryRaw: vi.fn(async () => [{ balance: "0" }]),
    };
    const svc = build();
    await svc.adjustCommissionInTx(tx as never, { riderId: "r1", orderId: "o1", amount: -0.1, ratePct: 10, fare: 1, note: "n", actor: "a" });
    expect(create.mock.calls[0]![0].data).toMatchObject({ orderId: "o1" });
  });
});

describe("WalletService.getTopup (WD-007 — no stale status after a failed expiry CAS)", () => {
  it("returns the fresh row when a concurrent write already moved it off pending (expiry CAS count=0)", async () => {
    const staleRow = { id: "t1", riderId: "r1", status: "pending", expiresAt: new Date(Date.now() - 1000), amount: { toString: () => "10" }, rail: "ecocash", phone: "0770000000", initiatedAt: new Date() };
    const confirmedRow = { ...staleRow, status: "confirmed" };
    let findCount = 0;
    const prisma = {
      topUp: {
        findUnique: async () => {
          findCount += 1;
          return findCount === 1 ? staleRow : confirmedRow;
        },
        updateMany: async () => ({ count: 0 }), // a concurrent confirm already claimed it
      },
    };
    const svc = build({}, prisma);
    const result = await svc.getTopup("r1", "t1");
    expect(result.status).toBe("succeeded"); // NOT the stale "pending"
  });

  it("marks the row expired locally when it wins the CAS", async () => {
    const pendingRow = { id: "t1", riderId: "r1", status: "pending", expiresAt: new Date(Date.now() - 1000), amount: { toString: () => "10" }, rail: "ecocash", phone: "0770000000", initiatedAt: new Date() };
    const prisma = {
      topUp: {
        findUnique: async () => pendingRow,
        updateMany: async () => ({ count: 1 }),
      },
    };
    const svc = build({}, prisma);
    const result = await svc.getTopup("r1", "t1");
    expect(result.status).toBe("expired");
  });
});

describe("WalletService.creditManual (WD-002/WD-003 — atomic audit + idempotent retry)", () => {
  function makeTx(creditedLast24h = 0) {
    const calls: { topUp: unknown; ledger: unknown; audit: unknown; balanceUpdate: unknown } = {
      topUp: null,
      ledger: null,
      audit: null,
      balanceUpdate: null,
    };
    const tx = {
      topUp: {
        create: async (args: { data: Record<string, unknown> }) => {
          calls.topUp = args.data;
          return { id: "top-1", ...args.data };
        },
      },
      commissionLedger: {
        create: async (args: { data: Record<string, unknown> }) => {
          calls.ledger = args.data;
          return {};
        },
      },
      commissionAccount: {
        update: async (args: unknown) => {
          calls.balanceUpdate = args;
          return {};
        },
      },
      auditLog: {
        create: async (args: { data: Record<string, unknown> }) => {
          calls.audit = args.data;
          return { id: "audit-1" };
        },
        aggregate: vi.fn(async () => ({ _sum: { amount: creditedLast24h ? new Prisma.Decimal(creditedLast24h) : null } })),
      },
      $executeRaw: vi.fn(),
      $queryRaw: vi.fn(async () => [{ balance: "0" }]),
    };
    return { calls, tx };
  }

  it("credits the balance and writes the AuditLog row in the SAME transaction (WD-002)", async () => {
    const { calls, tx } = makeTx();
    const prisma = { rider: { findUnique: async () => ({ profileId: "r1", kycStatus: "verified" }) }, $transaction: async (fn: (t: unknown) => unknown) => fn(tx) };
    const svc = build({}, prisma);
    const result = await svc.creditManual({ riderId: "r1", amount: 10, rail: "manual", idemKey: "key-1", actorProfileId: "admin-1" });
    expect(result.balance).toBe(10);
    expect(calls.ledger).toMatchObject({ riderId: "r1", type: "topup", amount: 10, actor: "admin-1" });
    expect(calls.audit).toMatchObject({ actor: "admin-1", action: "wallet.credit", target: "r1" });
  });

  it("a retry with the same idempotency key returns the current balance instead of a 500 (WD-003)", async () => {
    const prisma = {
      rider: { findUnique: async () => ({ profileId: "r1", kycStatus: "verified" }) },
      $transaction: async () => {
        throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed on the fields: (`provider_ref`)", {
          code: "P2002",
          clientVersion: "5.22.0",
        });
      },
      commissionAccount: { findUnique: async () => ({ balance: "10" }) },
    };
    const svc = build({}, prisma);
    const result = await svc.creditManual({ riderId: "r1", amount: 10, rail: "manual", idemKey: "key-1", actorProfileId: "admin-1" });
    expect(result.balance).toBe(10); // the already-credited balance, not a thrown 500
  });

  it("rejects an amount above the manual-credit cap (unrelated to the idempotency path)", async () => {
    const svc = build({ WALLET_MANUAL_CREDIT_CAP_USD: 50 }, { rider: { findUnique: async () => ({ profileId: "r1", kycStatus: "verified" }) } });
    await expect(svc.creditManual({ riderId: "r1", amount: 999, rail: "manual", idemKey: "key-1", actorProfileId: "admin-1" })).rejects.toThrow(/between/i);
  });

  it("refuses (409) a credit that would take the biker past $100 of manual credits in 24 h, and writes nothing", async () => {
    const { calls, tx } = makeTx(95);
    const prisma = { rider: { findUnique: async () => ({ profileId: "r1", kycStatus: "verified" }) }, $transaction: async (fn: (t: unknown) => unknown) => fn(tx) };
    const svc = build({}, prisma);
    await expect(svc.creditManual({ riderId: "r1", amount: 10, rail: "manual", idemKey: "key-1", actorProfileId: "admin-1" })).rejects.toMatchObject({
      status: 409,
      message: expect.stringMatching(/\$95\.00 .*last 24 hours.*\$100\.00/),
    });
    expect(tx.auditLog.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ target: "r1", action: "wallet.credit" }), _sum: { amount: true } }),
    );
    expect(calls.ledger).toBeNull();
    expect(calls.balanceUpdate).toBeNull();
    expect(calls.audit).toBeNull();
  });

  it("allows a credit that lands exactly on the 24 h limit", async () => {
    const { calls, tx } = makeTx(90);
    const prisma = { rider: { findUnique: async () => ({ profileId: "r1", kycStatus: "verified" }) }, $transaction: async (fn: (t: unknown) => unknown) => fn(tx) };
    const svc = build({}, prisma);
    await expect(svc.creditManual({ riderId: "r1", amount: 10, rail: "manual", idemKey: "key-1", actorProfileId: "admin-1" })).resolves.toEqual({ balance: 10 });
    expect(calls.ledger).not.toBeNull();
  });

  it("UX18-04: pushes the biker a best-effort 'Wallet credited' notice — previously zero push AND zero feed row", async () => {
    const { tx } = makeTx();
    const prisma = { rider: { findUnique: async () => ({ profileId: "r1", kycStatus: "verified" }) }, $transaction: async (fn: (t: unknown) => unknown) => fn(tx) };
    const notified: Array<{ profileIds: string[]; msg: { title: string; body: string } }> = [];
    const notifications = {
      notifyProfiles: async (profileIds: string[], msg: { title: string; body: string }) => {
        notified.push({ profileIds, msg });
      },
    } as unknown as NotificationsService;
    const svc = build({}, prisma, notifications);
    await svc.creditManual({ riderId: "r1", amount: 10, rail: "manual", idemKey: "key-1", actorProfileId: "admin-1" });
    expect(notified).toHaveLength(1);
    expect(notified[0]!.profileIds).toEqual(["r1"]);
    expect(notified[0]!.msg).toMatchObject({ title: "Wallet credited" });
    expect(notified[0]!.msg.body).toContain("$10.00");
  });
});
