import { COMMISSION, TOPUP } from "@lynia/shared";
import { describe, expect, it, vi } from "vitest";
import type { PaymentRail, PaymentRailResult } from "../adapters/payments/payment-rail.interface";
import type { Env } from "../config/env";
import type { PrismaService } from "../prisma/prisma.service";
import { WalletService } from "./wallet.service";

/**
 * Paynow top-ups (docs/plans/2026-10-paynow-biker-wallet.md): the wallet's side of the rail — charging on
 * create, the first writer of `declined`, the short-payment guard, the sweep's expiry, and the fee.
 */
type Row = {
  id: string;
  riderId: string;
  status: "pending" | "expired" | "confirmed" | "declined";
  amount: number;
  charged?: number | null;
  rail: string;
  phone: string;
  providerRef?: string | null;
  pollUrl?: string | null;
  expiresAt: Date;
  initiatedAt: Date;
};

const PAYNOW_ENV = { PAYMENT_RAIL: "paynow", PAYNOW_FEE_MODE: "paynow", TOPUP_FEE_PCT: 2.5, TOPUP_RAILS: ["ecocash"] } as Partial<Env>;

/** A stateful topUp table + the bits of prisma the top-up path touches. */
function world(env: Partial<Env>, rail?: Partial<PaymentRail>, seed?: Partial<Row>) {
  const rows = new Map<string, Row>();
  if (seed) rows.set(seed.id ?? "t1", { id: "t1", riderId: "r1", status: "pending", amount: 5, rail: "ecocash", phone: "0771111111", expiresAt: new Date(Date.now() + 60_000), initiatedAt: new Date(), ...seed } as Row);
  const credit = vi.fn();
  const events: Array<Record<string, unknown>> = [];
  const prisma = {
    domainEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        events.push(data);
        return {};
      },
      // The anomaly dedupe read: same subject, type and data.kind.
      findFirst: async ({ where }: { where: { subjectId: string; type: string; data: { equals: string } } }) =>
        events.find((e) => e.subjectId === where.subjectId && e.type === where.type && (e.data as { kind?: string }).kind === where.data.equals) ?? null,
    },
    rider: { findUnique: async () => ({ profileId: "r1", kycStatus: "verified" }) },
    topUp: {
      findFirst: async () => null,
      findUnique: async ({ where }: { where: { id: string } }) => (rows.has(where.id) ? { ...rows.get(where.id)! } : null),
      create: async ({ data }: { data: Omit<Row, "id" | "initiatedAt"> }) => {
        const row = { ...data, id: "t1", initiatedAt: new Date() } as Row;
        rows.set(row.id, row);
        return { ...row };
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
        const row = { ...rows.get(where.id)!, ...data };
        rows.set(where.id, row);
        return { ...row };
      },
      updateMany: async ({ where, data }: { where: { id: string; status: string | { in: string[] } }; data: Partial<Row> }) => {
        const row = rows.get(where.id);
        const allowed = typeof where.status === "string" ? [where.status] : where.status.in;
        if (!row || !allowed.includes(row.status)) return { count: 0 };
        rows.set(where.id, { ...row, ...data });
        return { count: 1 };
      },
    },
  };
  const fullEnv = { COMMISSION_SHADOW_RATE_PCT: 10, WALLET_MANUAL_CREDIT_CAP_USD: 50, ...env } as unknown as Env;
  const svc = new WalletService(fullEnv, prisma as unknown as PrismaService, undefined, undefined, rail as PaymentRail | undefined);
  // creditFromTopup's own exactly-once path is covered by wallet-topup-faults.spec; here it is the seam.
  vi.spyOn(svc, "creditFromTopup").mockImplementation(async (id: string) => {
    credit(id);
    const row = rows.get(id)!;
    if (row.status !== "pending" && row.status !== "expired") return null;
    rows.set(id, { ...row, status: "confirmed" });
    return { balance: row.amount };
  });
  return { svc, rows, credit, events };
}

const railReturning = (result: PaymentRailResult | Error) => {
  const initiate = vi.fn(async () => {
    if (result instanceof Error) throw result;
    return result;
  });
  return { initiate, confirm: vi.fn(), reconcile: vi.fn() };
};

describe("createTopup with Paynow live", () => {
  it("charges the credit plus the 2.5% fee, sends Paynow the bare amount (its 'add fees on top' adds the fee), and stores the reference", async () => {
    const rail = railReturning({ status: "pending", providerRef: "1234567", pollUrl: "https://www.paynow.co.zw/poll", raw: { status: "Ok" } });
    const { svc, rows } = world(PAYNOW_ENV, rail);
    const t = await svc.createTopup("r1", { amount: 5, rail: "ecocash", phone: "0771111111" });
    expect(t).toMatchObject({ status: "pending", amount: 5, charged: 5.13 });
    expect(rail.initiate).toHaveBeenCalledWith(expect.objectContaining({ topUpId: "t1", rail: "ecocash", amount: 5 }));
    expect(rows.get("t1")).toMatchObject({ providerRef: "1234567", pollUrl: "https://www.paynow.co.zw/poll" });
  });

  it("PAYNOW_FEE_MODE=server sends the fee-inclusive charge itself (the fallback when Paynow doesn't add it)", async () => {
    const rail = railReturning({ status: "pending", providerRef: "1" });
    const { svc } = world({ ...PAYNOW_ENV, PAYNOW_FEE_MODE: "server" }, rail);
    await svc.createTopup("r1", { amount: 50, rail: "ecocash", phone: "0771111111" });
    expect(rail.initiate).toHaveBeenCalledWith(expect.objectContaining({ amount: 51.25 }));
  });

  it("an immediate refusal (insufficient balance) comes back DECLINED, so the app goes straight to 'didn't go through'", async () => {
    const { svc, rows } = world(PAYNOW_ENV, railReturning({ status: "failed", reason: "Insufficient balance" }));
    const t = await svc.createTopup("r1", { amount: 5, rail: "ecocash", phone: "0774444444" });
    expect(t.status).toBe("declined");
    expect(rows.get("t1")!.status).toBe("declined");
  });

  it("a transport failure leaves the intent pending (the sweep traces it), never a 500 after the charge may have gone out", async () => {
    const { svc } = world(PAYNOW_ENV, railReturning(new Error("timeout")));
    await expect(svc.createTopup("r1", { amount: 5, rail: "ecocash", phone: "0771111111" })).resolves.toMatchObject({ status: "pending" });
  });

  it.each(["innbucks", "omari"] as const)("refuses %s while it is 'Coming soon' — 403 { reason: topup_rail_unavailable }, no intent, no charge", async (r) => {
    const rail = railReturning({ status: "pending" });
    const { svc, rows } = world(PAYNOW_ENV, rail);
    let threw: unknown;
    try {
      await svc.createTopup("r1", { amount: 5, rail: r, phone: "0771111111" });
    } catch (e) {
      threw = e;
    }
    expect((threw as { getStatus: () => number }).getStatus()).toBe(403);
    expect((threw as { getResponse: () => unknown }).getResponse()).toMatchObject({ reason: "topup_rail_unavailable", message: expect.stringMatching(/coming soon/i) });
    expect(rows.size).toBe(0);
    expect(rail.initiate).not.toHaveBeenCalled();
  });

  it("with PAYMENT_RAIL=stub no rail is ever called (the pre-Paynow behaviour)", async () => {
    const rail = railReturning({ status: "pending" });
    const { svc } = world({ ...PAYNOW_ENV, PAYMENT_RAIL: "stub" }, rail);
    await expect(svc.createTopup("r1", { amount: 5, rail: "ecocash", phone: "0771111111" })).resolves.toMatchObject({ status: "pending", charged: 5.13 });
    expect(rail.initiate).not.toHaveBeenCalled();
  });
});

describe("settleTopupFromRail", () => {
  it("credits a payment of at least the credit, recording what Paynow charged", async () => {
    const { svc, rows, credit } = world(PAYNOW_ENV, undefined, { id: "t1", amount: 5 });
    expect(await svc.settleTopupFromRail("t1", { status: "confirmed", amount: 5.13, providerRef: "1234567" })).toBe("credited");
    expect(credit).toHaveBeenCalledWith("t1");
    expect(rows.get("t1")!.charged).toBe(5.13);
  });

  it("keeps the fee-inclusive total when Paynow reports only the base amount", async () => {
    const { svc, rows } = world(PAYNOW_ENV, undefined, { id: "t1", amount: 5, charged: 5.13 });
    expect(await svc.settleTopupFromRail("t1", { status: "confirmed", amount: 5 })).toBe("credited");
    expect(rows.get("t1")!.charged).toBe(5.13);
  });

  it("NEVER credits a short payment (Paynow moved less than we'd credit) — left for ops", async () => {
    const { svc, credit, events } = world(PAYNOW_ENV, undefined, { id: "t1", amount: 5 });
    expect(await svc.settleTopupFromRail("t1", { status: "confirmed", amount: 4.99 })).toBe("short_paid");
    expect(credit).not.toHaveBeenCalled();
    // Admin console v2 §3: an ops queue row, not only a log line.
    expect(events).toEqual([
      expect.objectContaining({
        type: "topup.anomaly",
        subjectType: "topup",
        subjectId: "t1",
        data: expect.objectContaining({ kind: "short_paid", riderId: "r1", paid: 4.99, credit: 5 }),
      }),
    ]);
  });

  it("a short payment seen again (the sweep re-polls, Paynow re-delivers) stays ONE anomaly row", async () => {
    const { svc, events } = world(PAYNOW_ENV, undefined, { id: "t1", amount: 5 });
    await svc.settleTopupFromRail("t1", { status: "confirmed", amount: 4.99 });
    await svc.settleTopupFromRail("t1", { status: "confirmed", amount: 4.99 });
    expect(events).toHaveLength(1);
  });

  it("a PAID report on a declined intent is recorded as a paid_on_declined anomaly, never credited", async () => {
    const { svc, credit, events } = world(PAYNOW_ENV, undefined, { id: "t1", amount: 5, status: "declined" });
    expect(await svc.settleTopupFromRail("t1", { status: "confirmed", amount: 5, providerRef: "999" })).toBe("already_settled");
    expect(credit).not.toHaveBeenCalled();
    expect(events).toEqual([
      expect.objectContaining({ type: "topup.anomaly", subjectId: "t1", data: expect.objectContaining({ kind: "paid_on_declined", providerRef: "999" }) }),
    ]);
  });

  it("a final failure declines; a replay of it is a no-op", async () => {
    const { svc, rows } = world(PAYNOW_ENV, undefined, { id: "t1" });
    expect(await svc.settleTopupFromRail("t1", { status: "failed" })).toBe("declined");
    expect(rows.get("t1")!.status).toBe("declined");
    expect((rows.get("t1") as Record<string, unknown>).declineReason).toBe("rail_failed");
    expect(await svc.settleTopupFromRail("t1", { status: "failed" })).toBe("already_settled");
  });

  it("a late payment on an EXPIRED intent still credits (expired stays re-openable)", async () => {
    const { svc } = world(PAYNOW_ENV, undefined, { id: "t1", status: "expired" });
    expect(await svc.settleTopupFromRail("t1", { status: "confirmed", amount: 5 })).toBe("credited");
  });

  it("a duplicate paid update credits once", async () => {
    const { svc } = world(PAYNOW_ENV, undefined, { id: "t1" });
    expect(await svc.settleTopupFromRail("t1", { status: "confirmed", amount: 5 })).toBe("credited");
    expect(await svc.settleTopupFromRail("t1", { status: "confirmed", amount: 5 })).toBe("already_settled");
  });
});

describe("reconcileTopup (the sweep's step)", () => {
  it("moves a still-pending intent whose window lapsed to expired — no more 'pending forever'", async () => {
    const rail = { initiate: vi.fn(), confirm: vi.fn(async () => ({ status: "pending" }) as PaymentRailResult), reconcile: vi.fn() };
    const { svc, rows } = world(PAYNOW_ENV, rail, { id: "t1", expiresAt: new Date(Date.now() - 1000), pollUrl: "https://www.paynow.co.zw/poll" });
    expect(await svc.reconcileTopup("t1")).toBe("pending");
    expect(rows.get("t1")!.status).toBe("expired");
    expect((rows.get("t1") as Record<string, unknown>).declineReason).toBe("expired");
    expect(rail.confirm).toHaveBeenCalledWith(expect.any(String), { pollUrl: "https://www.paynow.co.zw/poll", topUpId: "t1" });
  });

  it("does nothing with the stub rail", async () => {
    const rail = { initiate: vi.fn(), confirm: vi.fn(), reconcile: vi.fn() };
    const { svc } = world({ ...PAYNOW_ENV, PAYMENT_RAIL: "stub" }, rail, { id: "t1" });
    expect(await svc.reconcileTopup("t1")).toBe("pending");
    expect(rail.confirm).not.toHaveBeenCalled();
  });
});

describe("getConfig serves the fee and the live rails", () => {
  it("defaults: 2.5% and EcoCash only", () => {
    const { svc } = world({});
    expect(svc.getConfig()).toMatchObject({ topupFeePct: TOPUP.feePct, topupRails: ["ecocash"], minTopUp: COMMISSION.minTopUp });
  });
});
