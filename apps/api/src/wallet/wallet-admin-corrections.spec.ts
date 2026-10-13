import { describe, expect, it, vi } from "vitest";
import type { Env } from "../config/env";
import type { PrismaService } from "../prisma/prisma.service";
import { netOfTopupFee, REVERSAL_CAP_USD, WalletService } from "./wallet.service";

/**
 * Admin console v2 §6: the two admin money writes — crediting what Paynow reported paid on a short-paid /
 * paid-on-declined top-up, and a reversal (a capped debit). Both must be exactly-once, keep
 * balance == sum(ledger), write the audit row with before / after balance in the same transaction, and roll
 * everything back on a refusal. The harness is a stateful prisma whose `$transaction` snapshots and restores,
 * like the real database.
 */

type Ledger = {
  id: string;
  riderId: string;
  type: string;
  amount: number;
  balanceAfter: number;
  topUpId?: string | null;
  idemKey?: string | null;
  orderId?: string | null;
  reversesId?: string | null;
  note?: string | null;
  actor?: string | null;
};
type TopUp = { id: string; riderId: string; status: string; amount: number; rail: string; charged?: number | null; declineReason?: string | null };

const R = "11111111-1111-4111-8111-111111111111";

function harness(opts: { balance?: number; topUp?: TopUp; anomaly?: Record<string, unknown> | null; ledger?: Ledger[]; feePct?: number }) {
  const state = {
    balance: opts.balance ?? 0,
    topUp: opts.topUp ? { ...opts.topUp } : null,
    ledger: [...(opts.ledger ?? [])] as Ledger[],
    audits: [] as Array<Record<string, unknown>>,
  };
  const notify = vi.fn(async () => undefined);
  let n = state.ledger.length;
  const tx = {
    $executeRaw: async () => 0,
    // Two raw reads: the top-up row lock (SELECT … FROM top_ups) and the account row lock.
    $queryRaw: async (strings: TemplateStringsArray) => {
      if (strings.join("?").includes("FROM top_ups")) {
        return state.topUp
          ? [{ status: state.topUp.status, rider_id: state.topUp.riderId, amount: String(state.topUp.amount), rail: state.topUp.rail }]
          : [];
      }
      return [{ balance: String(state.balance) }];
    },
    topUp: {
      update: async ({ data }: { data: Partial<TopUp> }) => {
        state.topUp = { ...state.topUp!, ...data };
        return state.topUp;
      },
      count: async () => (state.topUp?.status === "confirmed" ? 1 : 0),
    },
    commissionLedger: {
      findUnique: async ({ where }: { where: { topUpId?: string; idemKey?: string; id?: string } }) =>
        state.ledger.find(
          (l) => (where.topUpId && l.topUpId === where.topUpId) || (where.idemKey && l.idemKey === where.idemKey) || (where.id && l.id === where.id),
        ) ?? null,
      create: async ({ data }: { data: Omit<Ledger, "id"> }) => {
        if (data.topUpId && state.ledger.some((l) => l.topUpId === data.topUpId)) throw Object.assign(new Error("unique"), { code: "P2002" });
        const row = { ...data, id: `l${++n}`, amount: Number(data.amount), balanceAfter: Number(data.balanceAfter) };
        state.ledger.push(row);
        return row;
      },
      aggregate: async ({ where }: { where: { reversesId: string } }) => ({
        _sum: { amount: state.ledger.filter((l) => l.type === "reversal" && l.reversesId === where.reversesId).reduce((s, l) => s + l.amount, 0) || null },
      }),
    },
    commissionAccount: {
      update: async ({ data }: { data: { balance: number } }) => {
        state.balance = data.balance;
        return {};
      },
      findUnique: async () => ({ balance: state.balance }),
    },
    auditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.audits.push(data);
        return {};
      },
    },
    domainEvent: { create: async () => ({}) },
    rider: { findUnique: async () => ({ profileId: R }) },
  };
  const prisma = {
    ...tx,
    domainEvent: {
      create: async () => ({}),
      findFirst: async () => (opts.anomaly === null ? null : { data: opts.anomaly ?? { kind: "short_paid", paid: 3.08 } }),
    },
    $transaction: async (fn: (t: unknown) => unknown) => {
      const snap = { balance: state.balance, topUp: state.topUp ? { ...state.topUp } : null, ledger: [...state.ledger], audits: [...state.audits] };
      try {
        return await fn(tx);
      } catch (e) {
        Object.assign(state, snap);
        throw e;
      }
    },
  } as unknown as PrismaService;
  const env = { COMMISSION_SHADOW_RATE_PCT: 10, TOPUP_FEE_PCT: opts.feePct ?? 2.5 } as unknown as Env;
  const svc = new WalletService(env, prisma, { notifyProfiles: notify } as never);
  const ledgerSum = () => Math.round(state.ledger.reduce((s, l) => s + l.amount * 100, 0)) / 100;
  return { svc, state, notify, ledgerSum };
}

describe("netOfTopupFee", () => {
  it("is the largest credit whose credit + fee fits in what was paid", () => {
    expect(netOfTopupFee(5.13, 2.5)).toBe(5);
    expect(netOfTopupFee(51.25, 2.5)).toBe(50);
    // $3.08 paid: $3.00 + 8c fee fits; $3.01 + 8c doesn't.
    expect(netOfTopupFee(3.08, 2.5)).toBe(3);
    expect(netOfTopupFee(3.07, 2.5)).toBe(2.99);
  });
  it("with no fee, the whole payment counts; nothing paid is worth nothing", () => {
    expect(netOfTopupFee(4.2, 0)).toBe(4.2);
    expect(netOfTopupFee(0, 2.5)).toBe(0);
    expect(netOfTopupFee(-1, 2.5)).toBe(0);
  });
  it("never credits more than the payment covers, across many amounts", () => {
    for (let cents = 1; cents <= 20_000; cents += 37) {
      const paid = cents / 100;
      const n = netOfTopupFee(paid, 2.5);
      const fee = Math.ceil((Math.round(n * 100) * 2.5) / 100 - 1e-9) / 100;
      expect(Math.round((n + fee) * 100)).toBeLessThanOrEqual(cents);
      const next = n + 0.01;
      const nextFee = Math.ceil((Math.round(next * 100) * 2.5) / 100 - 1e-9) / 100;
      expect(Math.round((next + nextFee) * 100)).toBeGreaterThan(cents);
    }
  });
});

describe("WalletService.creditTopupShortfall (admin console v2 §6)", () => {
  const short: TopUp = { id: "t1", riderId: R, status: "pending", amount: 10, rail: "ecocash" };

  it("credits what the payment is worth after the fee, confirms the top-up, and audits before / after", async () => {
    const { svc, state, notify, ledgerSum } = harness({ balance: 1, topUp: short, ledger: [{ id: "l0", riderId: R, type: "grace", amount: 1, balanceAfter: 1 }] });
    const out = await svc.creditTopupShortfall({ topUpId: "t1", actorProfileId: "ops@lynia", reasonCode: "Paynow shows a part payment" });
    expect(out).toEqual({ balance: 4, credited: 3, alreadyCredited: false });
    expect(state.topUp).toMatchObject({ status: "confirmed", charged: 3.08, declineReason: null });
    expect(state.ledger.at(-1)).toMatchObject({ type: "topup", amount: 3, balanceAfter: 4, topUpId: "t1", actor: "ops@lynia" });
    expect(state.balance).toBe(ledgerSum());
    expect(state.audits).toHaveLength(1);
    expect(state.audits[0]).toMatchObject({
      action: "wallet.topup_credit",
      target: R,
      targetType: "rider",
      amount: 3,
      balanceAfter: 4,
      before: { balance: 1, topUpStatus: "pending" },
      after: { balance: 4, topUpStatus: "confirmed", paid: 3.08, credited: 3 },
    });
    expect(notify).toHaveBeenCalledOnce();
  });

  it("is exactly once: a second call credits nothing and says so", async () => {
    const { svc, state, ledgerSum } = harness({ topUp: short });
    await svc.creditTopupShortfall({ topUpId: "t1", actorProfileId: "a", reasonCode: "r" });
    const again = await svc.creditTopupShortfall({ topUpId: "t1", actorProfileId: "a", reasonCode: "r" });
    expect(again).toEqual({ balance: 3, credited: 3, alreadyCredited: true });
    expect(state.ledger).toHaveLength(1);
    expect(state.audits).toHaveLength(1);
    expect(state.balance).toBe(ledgerSum());
  });

  it("never credits more than the biker asked for, even if Paynow reports more", async () => {
    const { svc, state } = harness({ topUp: { ...short, status: "declined", amount: 5 }, anomaly: { kind: "paid_on_declined", paid: 9.99 } });
    const out = await svc.creditTopupShortfall({ topUpId: "t1", actorProfileId: "a", reasonCode: "r" });
    expect(out.credited).toBe(5);
    expect(state.topUp!.status).toBe("confirmed");
  });

  it("refuses when Paynow reported no payment, and writes nothing", async () => {
    const { svc, state } = harness({ topUp: short, anomaly: { kind: "paid_on_declined", paid: null } });
    await expect(svc.creditTopupShortfall({ topUpId: "t1", actorProfileId: "a", reasonCode: "r" })).rejects.toThrow(/nothing to credit/);
    const none = harness({ topUp: short, anomaly: null });
    await expect(none.svc.creditTopupShortfall({ topUpId: "t1", actorProfileId: "a", reasonCode: "r" })).rejects.toThrow(/nothing to credit/);
    expect(state.ledger).toHaveLength(0);
    expect(state.topUp!.status).toBe("pending");
  });

  it("an already-confirmed top-up (the rail credited it after all) is left alone", async () => {
    const { svc, state } = harness({ topUp: { ...short, status: "confirmed" }, ledger: [{ id: "l0", riderId: R, type: "topup", amount: 10, balanceAfter: 10, topUpId: "t1" }], balance: 10 });
    const out = await svc.creditTopupShortfall({ topUpId: "t1", actorProfileId: "a", reasonCode: "r" });
    expect(out).toEqual({ balance: 10, credited: 10, alreadyCredited: true });
    expect(state.ledger).toHaveLength(1);
    expect(state.audits).toHaveLength(0);
  });

  it("404s an unknown top-up", async () => {
    const { svc } = harness({});
    await expect(svc.creditTopupShortfall({ topUpId: "nope", actorProfileId: "a", reasonCode: "r" })).rejects.toThrow(/not found/);
  });
});

describe("WalletService.reverseEntry (admin console v2 §6)", () => {
  const key = "22222222-2222-4222-8222-222222222222";
  const credit: Ledger = { id: "c1", riderId: R, type: "topup", amount: 10, balanceAfter: 10, orderId: null };

  it("takes the amount off, may go below zero (money owed), and audits before / after", async () => {
    const { svc, state, notify, ledgerSum } = harness({ balance: 10, ledger: [credit] });
    const out = await svc.reverseEntry({ riderId: R, amount: 12.5, reasonCode: "Duplicate credit", note: "Credited twice", idemKey: key, actorProfileId: "ops" });
    expect(out).toEqual({ balance: -2.5, balanceBefore: 10, alreadyApplied: false });
    expect(state.ledger.at(-1)).toMatchObject({ type: "reversal", amount: -12.5, balanceAfter: -2.5, idemKey: `reversal:${key}`, note: "Credited twice", reversesId: null });
    expect(state.balance).toBe(ledgerSum());
    expect(state.audits[0]).toMatchObject({ action: "wallet.reversal", target: R, targetType: "rider", reasonCode: "Duplicate credit", amount: -12.5, before: { balance: 10 }, after: { balance: -2.5 } });
    expect(notify).toHaveBeenCalledOnce();
  });

  it("is idempotent by the form key", async () => {
    const { svc, state } = harness({ balance: 10, ledger: [credit] });
    await svc.reverseEntry({ riderId: R, amount: 2, reasonCode: "r", note: "n", idemKey: key, actorProfileId: "ops" });
    const again = await svc.reverseEntry({ riderId: R, amount: 2, reasonCode: "r", note: "n", idemKey: key, actorProfileId: "ops" });
    expect(again).toMatchObject({ balance: 8, alreadyApplied: true });
    expect(state.ledger.filter((l) => l.type === "reversal")).toHaveLength(1);
    expect(state.audits).toHaveLength(1);
  });

  it(`is capped at $${REVERSAL_CAP_USD} per action and needs a note`, async () => {
    const { svc, state } = harness({ balance: 100 });
    await expect(svc.reverseEntry({ riderId: R, amount: REVERSAL_CAP_USD + 0.01, reasonCode: "r", note: "n", idemKey: key, actorProfileId: "ops" })).rejects.toThrow(/between/);
    await expect(svc.reverseEntry({ riderId: R, amount: 0, reasonCode: "r", note: "n", idemKey: key, actorProfileId: "ops" })).rejects.toThrow(/between/);
    await expect(svc.reverseEntry({ riderId: R, amount: 1, reasonCode: "r", note: "  ", idemKey: key, actorProfileId: "ops" })).rejects.toThrow(/note/);
    expect(state.ledger).toHaveLength(0);
  });

  it("naming an entry: never more than it added, across several reversals", async () => {
    const { svc, state, ledgerSum } = harness({ balance: 10, ledger: [credit] });
    await svc.reverseEntry({ riderId: R, amount: 6, reasonCode: "r", note: "n", entryId: "c1", idemKey: key, actorProfileId: "ops" });
    expect(state.ledger.at(-1)).toMatchObject({ reversesId: "c1" });
    await expect(
      svc.reverseEntry({ riderId: R, amount: 4.01, reasonCode: "r", note: "n", entryId: "c1", idemKey: "33333333-3333-4333-8333-333333333333", actorProfileId: "ops" }),
    ).rejects.toThrow(/Only \$4\.00 of that entry is left/);
    await svc.reverseEntry({ riderId: R, amount: 4, reasonCode: "r", note: "n", entryId: "c1", idemKey: "44444444-4444-4444-8444-444444444444", actorProfileId: "ops" });
    await expect(
      svc.reverseEntry({ riderId: R, amount: 0.01, reasonCode: "r", note: "n", entryId: "c1", idemKey: "55555555-5555-4555-8555-555555555555", actorProfileId: "ops" }),
    ).rejects.toThrow(/reversed in full/);
    expect(state.balance).toBe(0);
    expect(state.balance).toBe(ledgerSum());
    expect(state.audits).toHaveLength(2);
  });

  it("refuses an entry on another biker's wallet, or one that isn't a credit", async () => {
    const { svc, state } = harness({
      balance: 10,
      ledger: [
        { ...credit, id: "other", riderId: "someone-else" },
        { id: "debit", riderId: R, type: "ride_commission", amount: -1, balanceAfter: 9 },
        { id: "free", riderId: R, type: "free_job", amount: 0, balanceAfter: 9 },
      ],
    });
    await expect(svc.reverseEntry({ riderId: R, amount: 1, reasonCode: "r", note: "n", entryId: "other", idemKey: key, actorProfileId: "ops" })).rejects.toThrow(/isn't on this biker/);
    await expect(svc.reverseEntry({ riderId: R, amount: 1, reasonCode: "r", note: "n", entryId: "debit", idemKey: key, actorProfileId: "ops" })).rejects.toThrow(/Only a credit/);
    await expect(svc.reverseEntry({ riderId: R, amount: 1, reasonCode: "r", note: "n", entryId: "free", idemKey: key, actorProfileId: "ops" })).rejects.toThrow(/Only a credit/);
    expect(state.balance).toBe(10);
    expect(state.audits).toHaveLength(0);
  });
});
