import { COMMISSION, isCommissionActive, perRideCommission, resolveCommissionRatePct } from "@lynia/shared";
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
});
