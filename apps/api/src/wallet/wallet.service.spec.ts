import { COMMISSION, isCommissionActive, perRideCommission, resolveCommissionRatePct } from "@lynia/shared";
import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import type { Env } from "../config/env";
import type { PrismaService } from "../prisma/prisma.service";
import { WalletService } from "./wallet.service";

/** A WalletService over a stub prisma + the given env overrides. Only the fields a test touches exist. */
function build(env: Partial<Env> = {}, prisma: Record<string, unknown> = {}) {
  const fullEnv = { COMMISSION_SHADOW_RATE_PCT: 10, WALLET_REVEAL: "false", WALLET_MANUAL_CREDIT_CAP_USD: 50, ...env } as unknown as Env;
  return new WalletService(fullEnv, prisma as unknown as PrismaService);
}

describe("resolveCommissionRatePct (the flip is one server value, never hardcoded)", () => {
  it("defaults to the launch rate (0) when the env override is unset/blank", () => {
    expect(resolveCommissionRatePct(undefined)).toBe(COMMISSION.ratePct);
    expect(resolveCommissionRatePct("")).toBe(0);
    expect(resolveCommissionRatePct(null)).toBe(0);
  });
  it("applies a valid override (the flip to 10)", () => {
    expect(resolveCommissionRatePct("10")).toBe(10);
    expect(resolveCommissionRatePct(10)).toBe(10);
  });
  it("clamps to [0,100] and fails safe to the default on garbage (never over-charges)", () => {
    expect(resolveCommissionRatePct("999")).toBe(100);
    expect(resolveCommissionRatePct("-5")).toBe(0);
    expect(resolveCommissionRatePct("abc")).toBe(0);
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
  it("is disabled at 0% with the reveal flag off (pre-flip riders see no commission)", () => {
    const cfg = build({ COMMISSION_RATE_PCT: undefined, WALLET_REVEAL: "false" } as Partial<Env>).getConfig();
    expect(cfg.enabled).toBe(false);
    expect(cfg.ratePct).toBe(0);
    expect(cfg.floor).toBe(COMMISSION.lowBalanceBlockBelow);
    expect(cfg.minTopUp).toBe(COMMISSION.minTopUp);
    expect(cfg.maxTopUp).toBe(COMMISSION.maxTopUp);
  });
  it("reveals early for internal/test riders via the reveal flag, still at 0%", () => {
    const cfg = build({ WALLET_REVEAL: "true" } as Partial<Env>).getConfig();
    expect(cfg.enabled).toBe(true);
    expect(cfg.ratePct).toBe(0);
  });
  it("auto-reveals and serves the resolved rate once the flip happens", () => {
    const cfg = build({ COMMISSION_RATE_PCT: 10 } as Partial<Env>).getConfig();
    expect(cfg.enabled).toBe(true);
    expect(cfg.ratePct).toBe(10);
  });
});

describe("WalletService.createTopup (server-side clamp)", () => {
  it("clamps the amount to [minTopUp, maxTopUp] and creates a pending intent", async () => {
    const created: Record<string, unknown>[] = [];
    const svc = build(
      {},
      {
        rider: { findUnique: async () => ({ profileId: "r1" }) },
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
    await expect(svc.createTopup("x", { amount: 10, rail: "ecocash", phone: "0770000000" })).rejects.toThrow(/not a rider/i);
  });

  it("BH-09: a retry with the same idempotency key returns the original pending intent, not a second one", async () => {
    const create = vi.fn();
    const existing = { id: "t1", status: "pending", amount: 10, rail: "ecocash", phone: "0770000000", expiresAt: new Date(), initiatedAt: new Date() };
    const svc = build(
      {},
      {
        rider: { findUnique: async () => ({ profileId: "r1" }) },
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
        rider: { findUnique: async () => ({ profileId: "r1" }) },
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
      { rider: { findUnique: async () => ({ profileId: "r1" }) }, topUp: { findFirst: async () => null, create } },
    );
    await svc.createTopup("r1", { amount: 10, rail: "ecocash", phone: "0770000000" });
    await svc.createTopup("r1", { amount: 10, rail: "ecocash", phone: "0770000000", idempotencyKey: "key-3" });
    expect(create).toHaveBeenCalledTimes(2);
  });
});

describe("WalletService.chargeCommission (0% is a no-op; shadow accrual still fires)", () => {
  it("writes NO ledger row at the launch rate but logs the shadow accrual", async () => {
    const create = vi.fn();
    const tx = {
      commissionLedger: { create, findFirst: async () => null },
      commissionAccount: { update: vi.fn() },
      $executeRaw: vi.fn(),
      $queryRaw: vi.fn(async () => [{ balance: "0" }]),
    };
    const svc = build({ COMMISSION_RATE_PCT: undefined });
    await svc.chargeCommission(tx as never, { orderId: "o1", riderId: "r1", agreedFare: 3 });
    expect(create).not.toHaveBeenCalled();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it("charges the correct amount at a positive rate, under the row lock, with balanceAfter derived from the locked balance", async () => {
    const create = vi.fn();
    const update = vi.fn();
    const tx = {
      commissionLedger: { create, findFirst: async () => null },
      commissionAccount: { update },
      $executeRaw: vi.fn(),
      $queryRaw: vi.fn(async () => [{ balance: "20" }]),
    };
    const svc = build({ COMMISSION_RATE_PCT: 10 });
    await svc.chargeCommission(tx as never, { orderId: "o1", riderId: "r1", agreedFare: 8 });
    expect(create).toHaveBeenCalledWith({
      data: { riderId: "r1", orderId: "o1", type: "ride_commission", amount: -0.8, balanceAfter: 19.2, ratePct: 10, fare: 8, actor: "system" },
    });
    expect(update).toHaveBeenCalledWith({ where: { riderId: "r1" }, data: { balance: 19.2 } });
  });

  it("is idempotent under a replayed completion — a second call for the same order is a no-op (design 1A)", async () => {
    const create = vi.fn();
    const tx = {
      commissionLedger: { create, findFirst: async () => ({ id: "existing-row" }) },
      commissionAccount: { update: vi.fn() },
      $executeRaw: vi.fn(),
      $queryRaw: vi.fn(async () => [{ balance: "20" }]),
    };
    const svc = build({ COMMISSION_RATE_PCT: 10 });
    await svc.chargeCommission(tx as never, { orderId: "o1", riderId: "r1", agreedFare: 8 });
    expect(create).not.toHaveBeenCalled();
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
    await svc.adjustCommissionInTx(tx as never, { riderId: "r1", amount: 0.3, ratePct: 10, fare: -3, note: "Fare correction for order o1: $10.00 → $7.00", actor: "admin-1" });
    expect(create).toHaveBeenCalledWith({
      data: {
        riderId: "r1",
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
    await svc.adjustCommissionInTx(tx as never, { riderId: "r1", amount: 0, ratePct: 10, fare: 0, note: "", actor: "admin-1" });
    expect(create).not.toHaveBeenCalled();
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });

  it("omits orderId (NULL) so a second correction on the same order never collides with the (riderId, orderId, type) unique index", async () => {
    const create = vi.fn();
    const tx = {
      commissionLedger: { create },
      commissionAccount: { update: vi.fn() },
      $executeRaw: vi.fn(),
      $queryRaw: vi.fn(async () => [{ balance: "0" }]),
    };
    const svc = build();
    await svc.adjustCommissionInTx(tx as never, { riderId: "r1", amount: -0.1, ratePct: 10, fare: 1, note: "n", actor: "a" });
    expect(create.mock.calls[0]![0].data).not.toHaveProperty("orderId");
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
  function makeTx() {
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
      },
      $executeRaw: vi.fn(),
      $queryRaw: vi.fn(async () => [{ balance: "0" }]),
    };
    return { calls, tx };
  }

  it("credits the balance and writes the AuditLog row in the SAME transaction (WD-002)", async () => {
    const { calls, tx } = makeTx();
    const prisma = { rider: { findUnique: async () => ({ profileId: "r1" }) }, $transaction: async (fn: (t: unknown) => unknown) => fn(tx) };
    const svc = build({}, prisma);
    const result = await svc.creditManual({ riderId: "r1", amount: 10, rail: "manual", idemKey: "key-1", actorProfileId: "admin-1" });
    expect(result.balance).toBe(10);
    expect(calls.ledger).toMatchObject({ riderId: "r1", type: "topup", amount: 10, actor: "admin-1" });
    expect(calls.audit).toMatchObject({ actor: "admin-1", action: "wallet.credit", target: "r1" });
  });

  it("a retry with the same idempotency key returns the current balance instead of a 500 (WD-003)", async () => {
    const prisma = {
      rider: { findUnique: async () => ({ profileId: "r1" }) },
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
    const svc = build({ WALLET_MANUAL_CREDIT_CAP_USD: 50 }, { rider: { findUnique: async () => ({ profileId: "r1" }) } });
    await expect(svc.creditManual({ riderId: "r1", amount: 999, rail: "manual", idemKey: "key-1", actorProfileId: "admin-1" })).rejects.toThrow(/between/i);
  });
});
