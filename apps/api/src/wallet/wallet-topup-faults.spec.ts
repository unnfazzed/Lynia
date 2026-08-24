import { describe, expect, it, vi } from "vitest";
import type { Env } from "../config/env";
import type { MetricsService } from "../observability/metrics.service";
import type { PrismaService } from "../prisma/prisma.service";
import { WalletService } from "./wallet.service";

/**
 * Fault-injection pack for the top-up confirmation seam (roadmap 2.3). `creditFromTopup` is the method
 * the future EcoCash rail poller (wallet PR2) and the sandbox harness both drive, so it MUST stay
 * exactly-once and atomic under the ways a money rail actually fails: a webhook delivered twice, a
 * confirmation that arrives late (after the intent expired), a decline, and a process that dies
 * mid-write. Each test asserts the ledger-completeness invariants the nightly integrity job (1.3)
 * checks still hold after the fault: balance == credited amount, exactly one credit per confirmed
 * top-up, no orphan/partial rows.
 *
 * The harness is a compact STATEFUL prisma with a snapshot/restore `$transaction` so a throw inside a
 * transaction rolls the modelled state back — the property the real Postgres transaction guarantees and
 * the reason the money path is safe to retry.
 */
type Row = { riderId: string; amount: number; balanceAfter: number; type: string; topUpId?: string };
type TopUp = {
  id: string;
  riderId: string;
  amount: number;
  status: "pending" | "expired" | "confirmed" | "declined";
  // Optional lag-metric fields (topup_confirm_lag_ms): tests that assert the metric model them;
  // every other test omits them and creditFromTopup's guarded record skips silently.
  rail?: string;
  initiatedAt?: Date;
};

function harness(topUp: TopUp, startBalance = 0, metrics?: MetricsService) {
  // Seed the opening balance as a prior credit row so the balance == sum(ledger) invariant holds from
  // the start (a real account's balance is always reconstructable from its ledger).
  const seed: Row[] = startBalance === 0 ? [] : [{ riderId: topUp.riderId, amount: startBalance, balanceAfter: startBalance, type: "topup" }];
  const state = { topUp: { ...topUp }, balance: startBalance, ledger: seed };
  let failLedgerCreate = false;

  const tx = {
    topUp: {
      updateMany: async (args: { where: { id: string; status?: { in: string[] } }; data: { status: TopUp["status"] } }) => {
        const allowed = args.where.status?.in ?? [];
        if (state.topUp.id !== args.where.id || !allowed.includes(state.topUp.status)) return { count: 0 };
        state.topUp.status = args.data.status;
        return { count: 1 };
      },
      findUnique: async () => ({ ...state.topUp }),
    },
    $executeRaw: async () => 0,
    $queryRaw: async () => [{ balance: String(state.balance) }],
    commissionLedger: {
      create: async (args: { data: Row }) => {
        if (failLedgerCreate) throw new Error("simulated DB write failure (process died mid-credit)");
        // Model the unique topUpId constraint: a second credit for the same top-up is impossible.
        if (args.data.topUpId && state.ledger.some((r) => r.topUpId === args.data.topUpId)) {
          throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
        }
        state.ledger.push(args.data);
        return { id: `l${state.ledger.length}` };
      },
    },
    commissionAccount: { update: async (args: { data: { balance: number } }) => { state.balance = args.data.balance; return {}; } },
  };

  const prisma = {
    // Snapshot → run → restore-on-throw: models the atomic transaction the real DB provides.
    $transaction: async (fn: (t: unknown) => unknown) => {
      const snap = { topUp: { ...state.topUp }, balance: state.balance, ledger: [...state.ledger] };
      try {
        return await fn(tx);
      } catch (e) {
        state.topUp = snap.topUp;
        state.balance = snap.balance;
        state.ledger = snap.ledger;
        throw e;
      }
    },
  } as unknown as PrismaService;

  const svc = new WalletService({ COMMISSION_SHADOW_RATE_PCT: 10 } as unknown as Env, prisma, undefined, metrics);
  return { svc, state, setFailLedgerCreate: (v: boolean) => { failLedgerCreate = v; } };
}

/** The 1.3 invariant: cached balance equals the sum of ledger credits, and each top-up is credited once. */
function assertInvariants(state: { balance: number; ledger: Row[]; topUp: TopUp }) {
  const sum = state.ledger.reduce((c, r) => c + Math.round(r.amount * 100), 0) / 100;
  expect(state.balance).toBe(sum);
  const creditsForTopUp = state.ledger.filter((r) => r.topUpId === state.topUp.id).length;
  expect(creditsForTopUp).toBeLessThanOrEqual(1);
}

describe("top-up confirmation faults (creditFromTopup — the rail seam)", () => {
  it("a webhook delivered TWICE credits exactly once (CAS + unique topUpId)", async () => {
    const { svc, state } = harness({ id: "t1", riderId: "r1", amount: 5, status: "pending" });
    const first = await svc.creditFromTopup("t1");
    const second = await svc.creditFromTopup("t1"); // duplicate delivery

    expect(first).toEqual({ balance: 5 });
    expect(second).toBeNull(); // already confirmed → no-op
    expect(state.balance).toBe(5); // credited once, not 10
    expect(state.ledger.filter((r) => r.topUpId === "t1")).toHaveLength(1);
    assertInvariants(state);
  });

  it("a LATE confirmation of an expired intent still credits (expired is re-openable)", async () => {
    const { svc, state } = harness({ id: "t2", riderId: "r1", amount: 8, status: "expired" });
    const res = await svc.creditFromTopup("t2");
    expect(res).toEqual({ balance: 8 });
    expect(state.topUp.status).toBe("confirmed");
    assertInvariants(state);
  });

  it("a confirmation for a DECLINED intent is a no-op (money never moves on a declined top-up)", async () => {
    const { svc, state } = harness({ id: "t3", riderId: "r1", amount: 5, status: "declined" });
    const res = await svc.creditFromTopup("t3");
    expect(res).toBeNull();
    expect(state.balance).toBe(0);
    expect(state.ledger).toHaveLength(0);
    assertInvariants(state);
  });

  it("a process that DIES mid-credit leaves nothing partial — the intent stays claimable for retry", async () => {
    const { svc, state, setFailLedgerCreate } = harness({ id: "t4", riderId: "r1", amount: 5, status: "pending" });
    setFailLedgerCreate(true);
    await expect(svc.creditFromTopup("t4")).rejects.toThrow(/process died mid-credit/);
    // Atomic rollback: the CAS that flipped pending→confirmed is undone, so a retry can still credit.
    expect(state.topUp.status).toBe("pending");
    expect(state.balance).toBe(0);
    expect(state.ledger).toHaveLength(0);

    // The retry (rail re-polls / reconciler picks it up) now succeeds exactly once.
    setFailLedgerCreate(false);
    const retry = await svc.creditFromTopup("t4");
    expect(retry).toEqual({ balance: 5 });
    assertInvariants(state);
  });

  it("credits accumulate exactly across two DIFFERENT confirmed top-ups (no float drift)", async () => {
    const { svc, state } = harness({ id: "t5", riderId: "r1", amount: 0.1, status: "pending" }, 0.2);
    await svc.creditFromTopup("t5");
    expect(state.balance).toBe(0.3); // 0.2 + 0.1 exactly, not 0.30000000000000004
    assertInvariants(state);
  });

  it("records topup_confirm_lag_ms exactly once — the confirming call, never the replay", async () => {
    const metrics = { recordTopupConfirmLag: vi.fn() };
    const { svc } = harness(
      { id: "t6", riderId: "r1", amount: 10, status: "pending", rail: "ecocash", initiatedAt: new Date(Date.now() - 60_000) },
      0,
      metrics as unknown as MetricsService,
    );

    await svc.creditFromTopup("t6");
    expect(metrics.recordTopupConfirmLag).toHaveBeenCalledTimes(1);
    const [ms, rail] = metrics.recordTopupConfirmLag.mock.calls[0] as [number, string];
    expect(rail).toBe("ecocash");
    expect(ms).toBeGreaterThanOrEqual(60_000); // initiated 60s ago; resolvedAt falls back to now

    // The duplicate webhook loses the CAS → no credit AND no second lag sample.
    await svc.creditFromTopup("t6");
    expect(metrics.recordTopupConfirmLag).toHaveBeenCalledTimes(1);
  });

  it("a ROLLED-BACK credit records no lag sample (metric only on commit)", async () => {
    const metrics = { recordTopupConfirmLag: vi.fn() };
    const { svc, setFailLedgerCreate } = harness(
      { id: "t7", riderId: "r1", amount: 5, status: "pending", rail: "ecocash", initiatedAt: new Date() },
      0,
      metrics as unknown as MetricsService,
    );
    setFailLedgerCreate(true);
    await expect(svc.creditFromTopup("t7")).rejects.toThrow(/process died mid-credit/);
    expect(metrics.recordTopupConfirmLag).not.toHaveBeenCalled();
  });
});
